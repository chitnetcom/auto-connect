import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { logger } from './logger';
import fs from 'fs-extra';

const CONFIG_PATH = path.join(__dirname, '../configs/main/config.json');
const OTHERS_CONFIG_DIR = path.join(__dirname, '../configs/others');

export enum XrayStatus {
  RUNNING = 'Running',
  STOPPED = 'Stopped',
  STARTING = 'Starting',
}

class XrayManager {
  private process: ChildProcess | null = null;
  private status: XrayStatus = XrayStatus.STOPPED;

  getStatus(): XrayStatus {
    return this.status;
  }

  async start(): Promise<void> {
    if (this.status === XrayStatus.RUNNING || this.status === XrayStatus.STARTING) {
      return;
    }

    if (!fs.existsSync(CONFIG_PATH)) {
      throw new Error(`Config file not found at ${CONFIG_PATH}`);
    }

    this.status = XrayStatus.STARTING;
    logger.log('Starting Xray...');

    try {
      // Assuming 'xray' is in the PATH. 
      // The plan says: spawn xray run -c configs/main/config.json
      this.process = spawn('xray', ['run', '-c', CONFIG_PATH]);

      this.process.stdout?.on('data', (data) => {
        logger.log(data.toString());
      });

      this.process.stderr?.on('data', (data) => {
        logger.log(`[ERROR] ${data.toString()}`);
      });

      this.process.on('close', (code) => {
        logger.log(`Xray process exited with code ${code}`);
        this.status = XrayStatus.STOPPED;
        this.process = null;
      });

      this.process.on('error', (err) => {
        logger.log(`Failed to start Xray: ${err.message}`);
        this.status = XrayStatus.STOPPED;
        this.process = null;
      });

      // Give it a moment to see if it crashes immediately
      this.status = XrayStatus.RUNNING;
    } catch (error: any) {
      this.status = XrayStatus.STOPPED;
      logger.log(`Error spawning Xray: ${error.message}`);
      throw error;
    }
  }

  stop(): void {
    if (!this.process) {
      this.status = XrayStatus.STOPPED;
      return;
    }

    logger.log('Stopping Xray...');
    this.process.kill();
    this.process = null;
    this.status = XrayStatus.STOPPED;
  }

  async switchConfig(id: string): Promise<void> {
    const sourcePath = path.join(OTHERS_CONFIG_DIR, id, 'config.json');
    if (!(await fs.pathExists(sourcePath))) {
      throw new Error(`Config ${id} not found`);
    }

    logger.log(`Switching to config ${id}...`);
    
    const wasRunning = this.status === XrayStatus.RUNNING;
    if (wasRunning) {
      this.stop();
      // Wait for process to stop
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    await fs.copy(sourcePath, CONFIG_PATH);
    logger.log(`Config ${id} copied to main config.`);

    if (wasRunning) {
      await this.start();
    }
  }

  async listConfigs(): Promise<string[]> {
    if (!(await fs.pathExists(OTHERS_CONFIG_DIR))) {
      return [];
    }
    const dirs = await fs.readdir(OTHERS_CONFIG_DIR);
    const result: string[] = [];
    for (const d of dirs) {
      if ((await fs.stat(path.join(OTHERS_CONFIG_DIR, d))).isDirectory()) {
        result.push(d);
      }
    }
    return result;
  }
}

export const xrayManager = new XrayManager();
