import { spawn } from "child_process";
import path from "path";
import fs from "fs-extra";
import axios from "axios";
import { logger } from "./logger";

const OTHERS_CONFIG_DIR = path.join(__dirname, "../configs/others");
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
         const configDirs = await fs.readdir(OTHERS_CONFIG_DIR);

         for (const id of configDirs) {
            const configPath = path.join(OTHERS_CONFIG_DIR, id, "config.json");
            if (!(await fs.pathExists(configPath))) continue;

            logger.log(`Testing config ${id}...`);
            const latency = await this.testConfig(configPath);
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

   private async testConfig(configPath: string): Promise<number | "FAILED"> {
      let testProcess: any = null;
      try {
         // 1. Read and modify config
         const config = await fs.readJson(configPath);
         if (!config.inbounds || config.inbounds.length === 0) {
            throw new Error("No inbounds found in config");
         }

         // Modify the first inbound port to 1081
         config.inbounds[0].port = TEST_PORT;

         // Set log level to debug for more info
         if (!config.log) config.log = {};
         config.log.loglevel = "debug";

         // 2. Write to temp file
         await fs.writeJson(TEMP_CONFIG_PATH, config);

         // logger.log(`TEMP_CONFIG_PATH: ${TEMP_CONFIG_PATH}`);

         // 3. Spawn Xray
         testProcess = spawn("xray", ["run", "-c", TEMP_CONFIG_PATH]);

         // testProcess.stdout.on('data', (data: any) => {
         //   logger.log(`[Xray Test Stdout] ${data.toString()}`);
         // });

         // testProcess.stderr.on('data', (data: any) => {
         //   logger.log(`[Xray Test Stderr] ${data.toString()}`);
         // });

         // testProcess.on('error', (err: any) => {
         //   logger.log(`[Xray Test Spawn Error] ${err.message}`);
         // });

         // 4. Wait for initialization (2 seconds as per plan)
         await new Promise((resolve) => setTimeout(resolve, 500));

         // 5. Measure latency
         const start = Date.now();
         try {
            await axios.get(TEST_URL, {
               proxy: {
                  host: "127.0.0.1",
                  port: TEST_PORT,
                  protocol: "http",
                  auth: {
                     username: "saeed",
                     password: "saeed",
                  },
               },
               timeout: 5000, // 5 seconds timeout for the test
            });
            const duration = Date.now() - start;
            return duration;
         } catch (err: any) {
            logger.log(`[Axios Error] ${err.message}`);
            if (err.response) {
               logger.log(`[Axios Error Response] Status: ${err.response.status}`);
            }
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
