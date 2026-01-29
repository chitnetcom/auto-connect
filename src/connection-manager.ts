import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import { logger } from './logger';
import { xrayManager, ConfigItem } from './xray-manager';

const CONNECTIONS_JSON_PATH = path.join(__dirname, '../configs/connections.json');
const TEMP_CONFIG_DIR = path.join(__dirname, '../configs/temp');

// Configuration from environment variables
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS || '10', 10);
const CONNECTION_START_PORT = parseInt(process.env.CONNECTION_START_PORT || '1080', 10);
const AUTO_RESTART_CONNECTIONS = process.env.AUTO_RESTART_CONNECTIONS === 'true';
const CONNECTION_STARTUP_TIMEOUT = parseInt(process.env.CONNECTION_STARTUP_TIMEOUT || '5000', 10);

export enum ConnectionStatus {
  RUNNING = 'Running',
  STOPPED = 'Stopped',
  STARTING = 'Starting',
  ERROR = 'Error'
}

export interface ConnectionInstance {
  id: string;                    // Unique identifier (config name)
  name: string;                  // Display name
  config: any;                   // Xray configuration
  port: number;                  // Assigned port
  process: ChildProcess | null;  // Xray process handle
  status: ConnectionStatus;      // Current status
  connectionStartTime: number | null;
  error?: string;                // Last error message
}

export interface ConnectionListState {
  connections: Omit<ConnectionInstance, 'config' | 'process'>[];
  lastUpdated: number;
}

class ConnectionManager {
  private connections: ConnectionInstance[] = [];
  private lastUpdated: number = Date.now();

  constructor() {
    this.ensureFilesExist();
  }

  private async ensureFilesExist(): Promise<void> {
    await fs.ensureDir(path.dirname(CONNECTIONS_JSON_PATH));
    if (!(await fs.pathExists(CONNECTIONS_JSON_PATH))) {
      await fs.writeJson(CONNECTIONS_JSON_PATH, { connections: [], lastUpdated: Date.now() }, { spaces: 2 });
    }
    await fs.ensureDir(TEMP_CONFIG_DIR);
  }

  // ==================== Connection List Management ====================

  async addConnection(name: string): Promise<void> {
    logger.log(`[ConnectionManager] Adding connection: ${name}`);

    // Check if connection already exists
    if (this.connections.find(c => c.id === name)) {
      throw new Error(`Connection "${name}" already exists in the list`);
    }

    // Check max connections limit
    if (this.connections.length >= MAX_CONNECTIONS) {
      throw new Error(`Maximum number of connections (${MAX_CONNECTIONS}) reached`);
    }

    // Get config from xrayManager
    const configs = await xrayManager.listConfigs();
    const configItem = configs.find(c => c.name === name);
    if (!configItem) {
      throw new Error(`Config "${name}" not found`);
    }

    // Create connection instance
    const connection: ConnectionInstance = {
      id: name,
      name: name,
      config: configItem.config,
      port: CONNECTION_START_PORT + this.connections.length,
      process: null,
      status: ConnectionStatus.STOPPED,
      connectionStartTime: null
    };

    this.connections.push(connection);
    await this.saveState();
    logger.log(`[ConnectionManager] Connection "${name}" added at position ${this.connections.length - 1} on port ${connection.port}`);
  }

  async removeConnection(id: string): Promise<void> {
    logger.log(`[ConnectionManager] Removing connection: ${id}`);

    const connection = this.getConnection(id);
    if (!connection) {
      throw new Error(`Connection "${id}" not found`);
    }

    // Stop connection if running
    if (connection.status === ConnectionStatus.RUNNING || connection.status === ConnectionStatus.STARTING) {
      await this.stopConnection(id);
    }

    // Remove from list
    this.connections = this.connections.filter(c => c.id !== id);
    
    // Update ports for remaining connections
    await this.updatePorts();
    await this.saveState();
    logger.log(`[ConnectionManager] Connection "${id}" removed`);
  }

  async reorderConnections(ids: string[]): Promise<void> {
    logger.log(`[ConnectionManager] Reordering connections`);

    // Validate all IDs exist
    const existingIds = this.connections.map(c => c.id);
    const missingIds = ids.filter(id => !existingIds.includes(id));
    if (missingIds.length > 0) {
      throw new Error(`Connections not found: ${missingIds.join(', ')}`);
    }

    // Reorder connections
    const reorderedConnections: ConnectionInstance[] = [];
    for (const id of ids) {
      const connection = this.connections.find(c => c.id === id);
      if (connection) {
        reorderedConnections.push(connection);
      }
    }

    this.connections = reorderedConnections;
    
    // Update ports
    await this.updatePorts();
    await this.saveState();
    logger.log(`[ConnectionManager] Connections reordered`);
  }

  getConnections(): ConnectionInstance[] {
    return this.connections.map(c => ({
      ...c,
      process: null // Don't expose process handle
    }));
  }

  getConnection(id: string): ConnectionInstance | undefined {
    return this.connections.find(c => c.id === id);
  }

  // ==================== Individual Connection Control ====================

  async startConnection(id: string): Promise<void> {
    logger.log(`[Connection: ${id}] Starting connection...`);

    const connection = this.getConnection(id);
    if (!connection) {
      throw new Error(`Connection "${id}" not found`);
    }

    if (connection.status === ConnectionStatus.RUNNING || connection.status === ConnectionStatus.STARTING) {
      logger.log(`[Connection: ${id}] Already ${connection.status}`);
      return;
    }

    connection.status = ConnectionStatus.STARTING;
    connection.error = undefined;

    try {
      // Create temp config file with assigned port
      const tempConfigPath = await this.createTempConfig(connection);

      // Spawn Xray process
      logger.log(`[Connection: ${id}] Starting Xray on port ${connection.port}...`);
      connection.process = spawn('xray', ['run', '-c', tempConfigPath]);

      // Setup process handlers
      this.setupProcessHandlers(connection, tempConfigPath);

      // Wait for initialization
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection startup timeout'));
        }, CONNECTION_STARTUP_TIMEOUT);

        connection.process?.once('spawn', () => {
          clearTimeout(timeout);
          resolve();
        });

        connection.process?.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      // Give it a moment to initialize
      await new Promise(resolve => setTimeout(resolve, 2000));

      connection.status = ConnectionStatus.RUNNING;
      connection.connectionStartTime = Date.now();
      await this.saveState();
      logger.log(`[Connection: ${id}] Started successfully on port ${connection.port}`);
    } catch (error: any) {
      connection.status = ConnectionStatus.ERROR;
      connection.error = error.message;
      connection.process = null;
      await this.saveState();
      logger.log(`[Connection: ${id}] Failed to start: ${error.message}`);
      throw error;
    }
  }

  async stopConnection(id: string): Promise<void> {
    logger.log(`[Connection: ${id}] Stopping connection...`);

    const connection = this.getConnection(id);
    if (!connection) {
      throw new Error(`Connection "${id}" not found`);
    }

    if (connection.status === ConnectionStatus.STOPPED) {
      logger.log(`[Connection: ${id}] Already stopped`);
      return;
    }

    if (connection.process) {
      connection.process.kill();
      connection.process = null;
    }

    connection.status = ConnectionStatus.STOPPED;
    connection.connectionStartTime = null;
    connection.error = undefined;
    await this.saveState();
    logger.log(`[Connection: ${id}] Stopped`);
  }

  async restartConnection(id: string): Promise<void> {
    logger.log(`[Connection: ${id}] Restarting connection...`);

    const connection = this.getConnection(id);
    if (!connection) {
      throw new Error(`Connection "${id}" not found`);
    }

    const wasRunning = connection.status === ConnectionStatus.RUNNING;
    
    await this.stopConnection(id);
    
    // Wait for process to stop
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (wasRunning) {
      await this.startConnection(id);
    }
  }

  // ==================== Bulk Operations ====================

  async startAll(): Promise<void> {
    logger.log(`[ConnectionManager] Starting all connections...`);

    const startPromises = this.connections.map(c => 
      this.startConnection(c.id).catch(err => {
        logger.log(`[Connection: ${c.id}] Failed to start: ${err.message}`);
      })
    );

    await Promise.all(startPromises);
    logger.log(`[ConnectionManager] Start all completed`);
  }

  async stopAll(): Promise<void> {
    logger.log(`[ConnectionManager] Stopping all connections...`);

    const stopPromises = this.connections.map(c => 
      this.stopConnection(c.id).catch(err => {
        logger.log(`[Connection: ${c.id}] Failed to stop: ${err.message}`);
      })
    );

    await Promise.all(stopPromises);
    logger.log(`[ConnectionManager] Stop all completed`);
  }

  // ==================== Status Monitoring ====================

  getConnectionStatus(id: string): ConnectionStatus {
    const connection = this.getConnection(id);
    return connection?.status ?? ConnectionStatus.STOPPED;
  }

  getAllStatuses(): Map<string, ConnectionStatus> {
    const statuses = new Map<string, ConnectionStatus>();
    this.connections.forEach(c => {
      statuses.set(c.id, c.status);
    });
    return statuses;
  }

  // ==================== State Persistence ====================

  async saveState(): Promise<void> {
    try {
      const state: ConnectionListState = {
        connections: this.connections.map(c => ({
          id: c.id,
          name: c.name,
          port: c.port,
          status: c.status,
          connectionStartTime: c.connectionStartTime,
          error: c.error
        })),
        lastUpdated: Date.now()
      };

      await fs.writeJson(CONNECTIONS_JSON_PATH, state, { spaces: 2 });
      this.lastUpdated = state.lastUpdated;
    } catch (err: any) {
      logger.log(`[ConnectionManager] Failed to save state: ${err.message}`);
    }
  }

  async loadState(): Promise<void> {
    try {
      if (!(await fs.pathExists(CONNECTIONS_JSON_PATH))) {
        logger.log(`[ConnectionManager] No existing state found, starting fresh`);
        return;
      }

      const state: ConnectionListState = await fs.readJson(CONNECTIONS_JSON_PATH);
      
      // Get configs from xrayManager
      const configs = await xrayManager.listConfigs();

      // Rebuild connections with full config data
      this.connections = [];
      for (const connState of state.connections) {
        const configItem = configs.find(c => c.name === connState.id);
        if (configItem) {
          this.connections.push({
            id: connState.id,
            name: connState.name,
            config: configItem.config,
            port: connState.port,
            process: null,
            status: connState.status,
            connectionStartTime: connState.connectionStartTime,
            error: connState.error
          });
        } else {
          logger.log(`[ConnectionManager] Config "${connState.id}" not found, skipping`);
        }
      }

      this.lastUpdated = state.lastUpdated;
      logger.log(`[ConnectionManager] Loaded ${this.connections.length} connections from state`);
    } catch (err: any) {
      logger.log(`[ConnectionManager] Failed to load state: ${err.message}`);
    }
  }

  // ==================== Port Management ====================

  private assignPort(index: number): number {
    return CONNECTION_START_PORT + index;
  }

  private async updatePorts(): Promise<void> {
    logger.log(`[ConnectionManager] Updating ports for ${this.connections.length} connections`);

    const runningConnections: ConnectionInstance[] = [];

    // Stop all running connections
    for (const connection of this.connections) {
      if (connection.status === ConnectionStatus.RUNNING || connection.status === ConnectionStatus.STARTING) {
        runningConnections.push(connection);
        await this.stopConnection(connection.id);
      }
    }

    // Update ports
    this.connections.forEach((connection, index) => {
      connection.port = this.assignPort(index);
    });

    // Restart previously running connections
    for (const connection of runningConnections) {
      try {
        await this.startConnection(connection.id);
      } catch (err: any) {
        logger.log(`[Connection: ${connection.id}] Failed to restart after port update: ${err.message}`);
      }
    }

    await this.saveState();
  }

  // ==================== Private Helper Methods ====================

  private async createTempConfig(connection: ConnectionInstance): Promise<string> {
    // Deep clone config
    const tempConfig = JSON.parse(JSON.stringify(connection.config));

    // Modify the first inbound port
    if (!tempConfig.inbounds || tempConfig.inbounds.length === 0) {
      throw new Error('No inbounds found in config');
    }

    tempConfig.inbounds[0].port = connection.port;

    // Set log level
    if (!tempConfig.log) tempConfig.log = {};
    tempConfig.log.loglevel = 'error';

    // Write to temp file
    const tempConfigPath = path.join(TEMP_CONFIG_DIR, `connection_${connection.id.replace(/[^a-z0-9]/gi, '_')}.json`);
    await fs.writeJson(tempConfigPath, tempConfig, { spaces: 2 });

    return tempConfigPath;
  }

  private setupProcessHandlers(connection: ConnectionInstance, tempConfigPath: string): void {
    if (!connection.process) return;

    connection.process.stdout?.on('data', (data) => {
      logger.log(`[Connection: ${connection.id}] ${data.toString()}`);
    });

    connection.process.stderr?.on('data', (data) => {
      logger.log(`[Connection: ${connection.id}] [ERROR] ${data.toString()}`);
    });

    connection.process.on('close', (code) => {
      logger.log(`[Connection: ${connection.id}] Process exited with code ${code}`);
      
      if (connection.status === ConnectionStatus.RUNNING || connection.status === ConnectionStatus.STARTING) {
        connection.status = ConnectionStatus.ERROR;
        connection.error = `Process exited with code ${code}`;
        connection.process = null;
        connection.connectionStartTime = null;
        this.saveState().catch(err => logger.log(`[ConnectionManager] Failed to save state: ${err.message}`));

        // Auto-restart if enabled
        if (AUTO_RESTART_CONNECTIONS) {
          logger.log(`[Connection: ${connection.id}] Auto-restarting...`);
          this.startConnection(connection.id).catch(err => {
            logger.log(`[Connection: ${connection.id}] Auto-restart failed: ${err.message}`);
          });
        }
      }
    });

    connection.process.on('error', (err) => {
      logger.log(`[Connection: ${connection.id}] Process error: ${err.message}`);
      
      if (connection.status === ConnectionStatus.RUNNING || connection.status === ConnectionStatus.STARTING) {
        connection.status = ConnectionStatus.ERROR;
        connection.error = err.message;
        connection.process = null;
        connection.connectionStartTime = null;
        this.saveState().catch(err => logger.log(`[ConnectionManager] Failed to save state: ${err.message}`));
      }
    });
  }

  // ==================== Migration ====================

  async migrateFromSingleConnection(): Promise<void> {
    logger.log(`[ConnectionManager] Checking for migration from single connection mode...`);

    // Skip if connections already exist
    if (this.connections.length > 0) {
      logger.log(`[ConnectionManager] Connections already exist, skipping migration`);
      return;
    }

    // Get active config from xrayManager
    const activeConfigName = xrayManager.getActiveConfigName();
    if (!activeConfigName) {
      logger.log(`[ConnectionManager] No active config found, skipping migration`);
      return;
    }

    try {
      // Add active config to connections
      await this.addConnection(activeConfigName);
      
      // Start if it was running
      if (xrayManager.getStatus() === 'Running') {
        await this.startConnection(activeConfigName);
      }
      
      logger.log(`[ConnectionManager] Migration completed: Added "${activeConfigName}" to connections`);
    } catch (err: any) {
      logger.log(`[ConnectionManager] Migration failed: ${err.message}`);
    }
  }
}

export const connectionManager = new ConnectionManager();
