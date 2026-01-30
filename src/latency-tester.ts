import { spawn } from "child_process";
import path from "path";
import fs from "fs-extra";
import axios from "axios";
import { logger } from "./logger";
import { xrayManager } from "./xray-manager";

// const TEST_URL = "http://cp.cloudflere.com/generate_204";
// const TEST_URL = "http://www.google.com/generate_204";
// const TEST_URL = "http://api.myip.com";
// const TEST_URL = "http://digikala.com";
const TEST_URL = process.env.TEST_URL || 'http://google.com';
const TEST_TIMEOUT = 12000;
const START_PORT = 10000;

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
      logger.log("Starting parallel latency tests...");

      try {
         const configs = await xrayManager.listConfigs();
         
         const testPromises = configs.map(async (item, index) => {
            const id = item.name;
            const port = START_PORT + index;
            logger.log(`Testing config ${id} on port ${port}...`);
            
            const latency = await this.testConfig(item.config, port, id);
            
            const result = { id, latency };
            this.results.push(result);
            logger.log(
               `Config ${id} latency: ${latency === "FAILED" ? "FAILED" : latency + "ms"}`,
            );
            return result;
         });

         await Promise.all(testPromises);

         logger.log("Latency tests completed.");
         return this.results;
      } finally {
         this.isTesting = false;
         // Clean up any remaining temp files if needed
         const tempDir = path.join(__dirname, "../configs/temp");
         if (await fs.pathExists(tempDir)) {
            await fs.emptyDir(tempDir);
         }
      }
   }

   async runSingleTest(configName: string): Promise<TestResult> {
      logger.log(`Starting single latency test for config: ${configName}...`);

      try {
         const configs = await xrayManager.listConfigs();
         const configItem = configs.find(item => item.name === configName);
         
         if (!configItem) {
            throw new Error(`Config ${configName} not found`);
         }

         const id = configItem.name;
         const port = START_PORT + 0; // Use first available port for single test
         
         logger.log(`Testing config ${id} on port ${port}...`);
         
         const latency = await this.testConfig(configItem.config, port, id);
         
         const result = { id, latency };
         
         // Update the result in the results array
         const existingIndex = this.results.findIndex(r => r.id === id);
         if (existingIndex >= 0) {
            this.results[existingIndex] = result;
         } else {
            this.results.push(result);
         }
         
         logger.log(
            `Config ${id} latency: ${latency === "FAILED" ? "FAILED" : latency + "ms"}`,
         );
         
         return result;
      } catch (error: any) {
         logger.log(`Error testing config ${configName}: ${error.message}`);
         const result = { id: configName, latency: "FAILED" as const };
         
         // Update the result in the results array
         const existingIndex = this.results.findIndex(r => r.id === configName);
         if (existingIndex >= 0) {
            this.results[existingIndex] = result;
         } else {
            this.results.push(result);
         }
         
         return result;
      }
   }

   private async testConfig(config: any, port: number, id: string): Promise<number | "FAILED"> {
      let testProcess: any = null;
      const tempConfigPath = path.join(__dirname, `../configs/temp/test_config_${id.replace(/[^a-z0-9]/gi, '_')}.json`);
      
      try {
         // Ensure temp directory exists
         await fs.ensureDir(path.dirname(tempConfigPath));

         // 1. Modify config
         const testConfig = JSON.parse(JSON.stringify(config)); // Deep clone
         if (!testConfig.inbounds || testConfig.inbounds.length === 0) {
            throw new Error("No inbounds found in config");
         }

         // Modify the first inbound port
         testConfig.inbounds[0].port = port;

         // Set log level to debug for more info
         if (!testConfig.log) testConfig.log = {};
         testConfig.log.loglevel = "error"; // Reduced log level for parallel tests

         // 2. Write to temp file
         await fs.writeJson(tempConfigPath, testConfig);

         // 3. Spawn Xray
         testProcess = spawn("xray", ["run", "-c", tempConfigPath]);

         // 4. Wait for initialization
         await new Promise((resolve) => setTimeout(resolve, 4000));

         // 5. Measure latency
         const start = Date.now();
         try {
            await axios.get(TEST_URL, {
               proxy: {
                  host: "127.0.0.1",
                  port: port,
                  protocol: "http"
               },
               timeout: TEST_TIMEOUT, // Increased timeout for parallel tests
            });
            const duration = Date.now() - start;
            return duration;
         } catch (err: any) {
            // logger.log(`[Axios Error - ${id}] ${err.message}`);
            return "FAILED";
         }
      } catch (error: any) {
         logger.log(`Error testing config ${id}: ${error.message}`);
         return "FAILED";
      } finally {
         if (testProcess) {
            testProcess.kill();
         }
         // Clean up temp file
         if (await fs.pathExists(tempConfigPath)) {
            await fs.remove(tempConfigPath);
         }
      }
   }
}

export const latencyTester = new LatencyTester();
