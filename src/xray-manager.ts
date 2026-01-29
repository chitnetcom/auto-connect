import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { logger } from './logger';
import fs from 'fs-extra';

const CONFIG_PATH = path.join(__dirname, '../configs/main/config.json');
const OTHERS_CONFIG_DIR = path.join(__dirname, '../configs/others');
const OTHERS_JSON_PATH = path.join(__dirname, '../configs/others.json');
const STATE_JSON_PATH = path.join(__dirname, '../configs/state.json');

export enum XrayStatus {
  RUNNING = 'Running',
  STOPPED = 'Stopped',
  STARTING = 'Starting',
}

export interface ConfigItem {
  name: string;
  config: any;
}

class XrayManager {
  private process: ChildProcess | null = null;
  private status: XrayStatus = XrayStatus.STOPPED;
  private activeConfigName: string | null = null;
  private connectionStartTime: number | null = null;

  async ensureFilesExist(): Promise<void> {
    await fs.ensureDir(path.dirname(CONFIG_PATH));
    if (!(await fs.pathExists(CONFIG_PATH))) {
      await fs.writeJson(CONFIG_PATH, {});
    }
    if (!(await fs.pathExists(OTHERS_JSON_PATH))) {
      await fs.writeJson(OTHERS_JSON_PATH, []);
    }
    if (!(await fs.pathExists(STATE_JSON_PATH))) {
      await fs.writeJson(STATE_JSON_PATH, {});
    }
  }

  async migrateConfigs(): Promise<void> {
    const othersExist = await fs.pathExists(OTHERS_JSON_PATH);
    await this.ensureFilesExist();

    if (await fs.pathExists(STATE_JSON_PATH)) {
      try {
        const state = await fs.readJson(STATE_JSON_PATH);
        this.activeConfigName = state.activeConfigName || null;
        this.connectionStartTime = state.connectionStartTime || null;
      } catch (err) {
        logger.log('Failed to read state.json');
      }
    }

    if (othersExist) {
      return;
    }

    if (!(await fs.pathExists(OTHERS_CONFIG_DIR))) {
      return;
    }

    logger.log('Migrating configs to others.json...');
    const dirs = await fs.readdir(OTHERS_CONFIG_DIR);
    const configs: ConfigItem[] = [];

    for (const d of dirs) {
      const dirPath = path.join(OTHERS_CONFIG_DIR, d);
      if ((await fs.stat(dirPath)).isDirectory()) {
        const configPath = path.join(dirPath, 'config.json');
        if (await fs.pathExists(configPath)) {
          try {
            const config = await fs.readJson(configPath);
            configs.push({ name: d, config });
          } catch (err: any) {
            logger.log(`Failed to read config in ${d}: ${err.message}`);
          }
        }
      }
    }

    await fs.writeJson(OTHERS_JSON_PATH, configs, { spaces: 2 });
    logger.log(`Migrated ${configs.length} configs to ${OTHERS_JSON_PATH}`);
    
    // Rename old directory to backup
    await fs.rename(OTHERS_CONFIG_DIR, `${OTHERS_CONFIG_DIR}_backup_${Date.now()}`);
  }

  getStatus(): XrayStatus {
    return this.status;
  }

  getActiveConfigName(): string | null {
    return this.activeConfigName;
  }

  getConnectionStartTime(): number | null {
    return this.connectionStartTime;
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
      this.connectionStartTime = Date.now();
      await this.saveState();
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
    this.connectionStartTime = null;
    this.saveState().catch(err => logger.log(`Failed to save state: ${err.message}`));
  }

  async switchConfig(name: string): Promise<void> {
    const configs = await this.listConfigs();
    const item = configs.find(c => c.name === name);
    if (!item) {
      throw new Error(`Config ${name} not found`);
    }

    logger.log(`Switching to config ${name}...`);
    this.activeConfigName = name;
    await this.saveState();
    
    const wasRunning = this.status === XrayStatus.RUNNING;
    if (wasRunning) {
      this.stop();
      // Wait for process to stop
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    await fs.writeJson(CONFIG_PATH, item.config, { spaces: 2 });
    logger.log(`Config ${name} written to main config.`);

    if (wasRunning) {
      await this.start();
    }
  }

  async listConfigs(): Promise<ConfigItem[]> {
    if (!(await fs.pathExists(OTHERS_JSON_PATH))) {
      return [];
    }
    return await fs.readJson(OTHERS_JSON_PATH);
  }

  async addConfig(name: string, config: any): Promise<void> {
    const configs = await this.listConfigs();
    if (configs.find(c => c.name === name)) {
      throw new Error(`Config with name "${name}" already exists`);
    }
    configs.push({ name, config });
    await fs.writeJson(OTHERS_JSON_PATH, configs, { spaces: 2 });
    logger.log(`Added config: ${name}`);
  }

  async removeConfig(name: string): Promise<void> {
    let configs = await this.listConfigs();
    const initialLength = configs.length;
    configs = configs.filter(c => c.name !== name);
    if (configs.length === initialLength) {
      throw new Error(`Config "${name}" not found`);
    }
    await fs.writeJson(OTHERS_JSON_PATH, configs, { spaces: 2 });
    logger.log(`Removed config: ${name}`);
    if (this.activeConfigName === name) {
      this.activeConfigName = null;
      await this.saveState();
    }
  }

  async updateConfig(name: string, newConfig: any): Promise<void> {
    const configs = await this.listConfigs();
    const index = configs.findIndex(c => c.name === name);
    if (index === -1) {
      throw new Error(`Config "${name}" not found`);
    }
    configs[index].config = newConfig;
    await fs.writeJson(OTHERS_JSON_PATH, configs, { spaces: 2 });
    logger.log(`Updated config: ${name}`);
  }

  private async saveState(): Promise<void> {
    try {
      await fs.writeJson(STATE_JSON_PATH, { 
        activeConfigName: this.activeConfigName,
        connectionStartTime: this.connectionStartTime
      }, { spaces: 2 });
    } catch (err: any) {
      logger.log(`Failed to save state: ${err.message}`);
    }
  }
}

export const xrayManager = new XrayManager();
