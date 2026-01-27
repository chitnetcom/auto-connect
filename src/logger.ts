import fs from 'fs-extra';
import path from 'path';

const LOG_FILE = path.join(__dirname, '../logs/xray.log');
const MAX_BUFFER_SIZE = 100;

class Logger {
  private buffer: string[] = [];

  constructor() {
    // Ensure logs directory exists
    fs.ensureDirSync(path.dirname(LOG_FILE));
    // Clear log file on start or append? The plan says "write to logs/xray.log"
    // Let's append for now but we can clear it if needed.
  }

  log(data: string) {
    const lines = data.split(/\r?\n/).filter(line => line.trim() !== '');
    lines.forEach(line => {
      const timestampedLine = `[${new Date().toISOString()}] ${line}`;
      
      // Write to file
      fs.appendFileSync(LOG_FILE, timestampedLine + '\n');

      // Update in-memory buffer
      this.buffer.push(timestampedLine);
      if (this.buffer.length > MAX_BUFFER_SIZE) {
        this.buffer.shift();
      }
    });
  }

  getLogs(): string[] {
    return this.buffer;
  }

  clearBuffer() {
    this.buffer = [];
  }
}

export const logger = new Logger();
