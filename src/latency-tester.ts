import { spawn } from "child_process";
import path from "path";
import fs from "fs-extra";
import axios from "axios";
import { logger } from "./logger";
import { xrayManager } from "./xray-manager";

const TEMP_CONFIG_PATH = path.join(__dirname, "../configs/temp_test_config.json");
const TEST_PORT = 1081;
const TEST_URL = "http://www.google.com/generate_204";

export interface TestResult {
   id: string;
   latency: number | "FAILED";
}

class LatencyTester {
   private results: TestResult[] = [];
   private isTesting: boolean = false;

   getResults(): TestResult[] {
      return this.results;
   }

   getIsTesting(): boolean {
      return this.isTesting;
   }

   async runTests(): Promise<TestResult[]> {
      if (this.isTesting) {
         throw new Error("Testing is already in progress");
      }

      this.isTesting = true;
      this.results = [];
      logger.log("Starting latency tests...");

      try {
         const configs = await xrayManager.listConfigs();

         for (const item of configs) {
            const id = item.name;
            logger.log(`Testing config ${id}...`);
            const latency = await this.testConfig(item.config);
            this.results.push({ id, latency });
            logger.log(
               `Config ${id} latency: ${latency === "FAILED" ? "FAILED" : latency + "ms"}`,
            );
         }

         logger.log("Latency tests completed.");
         return this.results;
      } finally {
         this.isTesting = false;
         if (await fs.pathExists(TEMP_CONFIG_PATH)) {
            await fs.remove(TEMP_CONFIG_PATH);
         }
      }
   }

   private async testConfig(config: any): Promise<number | "FAILED"> {
      let testProcess: any = null;
      try {
         // 1. Modify config
         const testConfig = JSON.parse(JSON.stringify(config)); // Deep clone
         if (!testConfig.inbounds || testConfig.inbounds.length === 0) {
            throw new Error("No inbounds found in config");
         }

         // Modify the first inbound port to 1081
         testConfig.inbounds[0].port = TEST_PORT;

         // Set log level to debug for more info
         if (!testConfig.log) testConfig.log = {};
         testConfig.log.loglevel = "debug";

         // 2. Write to temp file
         await fs.writeJson(TEMP_CONFIG_PATH, testConfig);

         // 3. Spawn Xray
         testProcess = spawn("xray", ["run", "-c", TEMP_CONFIG_PATH]);

         // 4. Wait for initialization
         await new Promise((resolve) => setTimeout(resolve, 1000));

         // 5. Measure latency
         const start = Date.now();
         try {
            await axios.get(TEST_URL, {
               proxy: {
                  host: "127.0.0.1",
                  port: TEST_PORT,
                  protocol: "http"
               },
               timeout: 7000, // 5 seconds timeout for the test
            });
            const duration = Date.now() - start;
            return duration;
         } catch (err: any) {
            logger.log(`[Axios Error] ${err.message}`);
            return "FAILED";
         }
      } catch (error: any) {
         logger.log(`Error testing config: ${error.message}`);
         return "FAILED";
      } finally {
         if (testProcess) {
            testProcess.kill();
            // Wait a bit for the process to actually die and release the port
            await new Promise((resolve) => setTimeout(resolve, 500));
         }
      }
   }
}

export const latencyTester = new LatencyTester();
