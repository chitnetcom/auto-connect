import axios, { AxiosProgressEvent } from 'axios';
import { logger } from './logger';
import { xrayManager } from './xray-manager';

const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 1080;
const PROXY_PROTOCOL = 'http';

// Test URLs for speed testing (using LibreSpeed servers)
const DOWNLOAD_TEST_URLS = [
  'http://speedtest.ams1.nl.leaseweb.net/10mb.bin',
  'http://proof.ovh.net/files/10Mb.dat'
];

const UPLOAD_TEST_URL = 'http://httpbin.org/post';
const PING_TEST_URL = 'http://api.myip.com';

const TEST_TIMEOUT = 30000; // 30 seconds

export interface SpeedTestResult {
  downloadSpeed: number; // in Mbps
  uploadSpeed: number; // in Mbps
  ping: number; // in ms
  jitter: number; // in ms
  status: 'idle' | 'running' | 'completed' | 'failed';
  error?: string;
  progress: number; // 0-100
  phase: string; // Current test phase
}

class SpeedTester {
  private result: SpeedTestResult = {
    downloadSpeed: 0,
    uploadSpeed: 0,
    ping: 0,
    jitter: 0,
    status: 'idle',
    progress: 0,
    phase: 'Ready'
  };

  private isTesting: boolean = false;

  getResult(): SpeedTestResult {
    return { ...this.result };
  }

  getIsTesting(): boolean {
    return this.isTesting;
  }

  private updateResult(updates: Partial<SpeedTestResult>): void {
    this.result = { ...this.result, ...updates };
  }

  private getProxyConfig() {
    return {
      host: PROXY_HOST,
      port: PROXY_PORT,
      protocol: PROXY_PROTOCOL
    };
  }

  private async checkProxyConnection(): Promise<boolean> {
    try {
      logger.log(`Checking proxy connection to ${PROXY_PROTOCOL}://${PROXY_HOST}:${PROXY_PORT}...`);
      const start = Date.now();
      await axios.get(PING_TEST_URL, {
        proxy: this.getProxyConfig(),
        timeout: 10000
      });
      const duration = Date.now() - start;
      logger.log(`Proxy connection successful! Response time: ${duration}ms`);
      return true;
    } catch (error: any) {
      logger.log(`Proxy connection check failed: ${error.message}`);
      logger.log(`Error details: ${JSON.stringify({
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText
      })}`);
      return false;
    }
  }

  private async measurePing(): Promise<{ ping: number; jitter: number }> {
    logger.log('Measuring ping...');
    logger.log(`Using proxy: ${PROXY_PROTOCOL}://${PROXY_HOST}:${PROXY_PORT}`);
    logger.log(`Ping test URL: ${PING_TEST_URL}`);
    this.updateResult({ phase: 'Measuring Ping', progress: 10 });

    const pings: number[] = [];
    const pingCount = 5;

    for (let i = 0; i < pingCount; i++) {
      try {
        const start = Date.now();
        logger.log(`Ping ${i + 1}/${pingCount}: Starting request to ${PING_TEST_URL}...`);
        await axios.get(PING_TEST_URL, {
          proxy: this.getProxyConfig(),
          timeout: 10000
        });
        const ping = Date.now() - start;
        pings.push(ping);
        logger.log(`Ping ${i + 1}/${pingCount}: ${ping}ms`);
      } catch (error: any) {
        logger.log(`Ping ${i + 1}/${pingCount} failed: ${error.message}`);
        logger.log(`Error details: ${JSON.stringify({
          code: error.code,
          status: error.response?.status,
          statusText: error.response?.statusText
        })}`);
        pings.push(9999); // Use high value for failed pings
      }
    }

    const validPings = pings.filter(p => p < 9999);
    const avgPing = validPings.length > 0 
      ? validPings.reduce((a, b) => a + b, 0) / validPings.length 
      : 9999;

    // Calculate jitter (average deviation from mean)
    const jitter = validPings.length > 1
      ? validPings.reduce((sum, ping) => sum + Math.abs(ping - avgPing), 0) / validPings.length
      : 0;

    logger.log(`Average ping: ${avgPing.toFixed(2)}ms, Jitter: ${jitter.toFixed(2)}ms`);

    return { ping: avgPing, jitter };
  }

  private async measureDownloadSpeed(): Promise<number> {
    logger.log('Measuring download speed...');
    logger.log(`Download test URLs: ${DOWNLOAD_TEST_URLS.join(', ')}`);
    this.updateResult({ phase: 'Measuring Download Speed', progress: 30 });

    let totalBytes = 0;
    let totalTime = 0;
    const testResults: number[] = [];

    for (let i = 0; i < DOWNLOAD_TEST_URLS.length; i++) {
      const url = DOWNLOAD_TEST_URLS[i];
      const progressStart = 30 + (i * 20);
      
      try {
        logger.log(`Download test ${i + 1}: Starting request to ${url}...`);
        const startTime = Date.now();
        let downloadedBytes = 0;

        const response = await axios.get(url, {
          proxy: this.getProxyConfig(),
          responseType: 'arraybuffer',
          timeout: TEST_TIMEOUT,
          onDownloadProgress: (progressEvent: AxiosProgressEvent) => {
            if (progressEvent.total) {
              const progress = progressStart + ((progressEvent.loaded / progressEvent.total) * 20);
              this.updateResult({ progress: Math.min(progress, 70) });
            }
          }
        });

        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000; // Convert to seconds
        const bytes = response.data.byteLength;
        
        totalBytes += bytes;
        totalTime += duration;
        
        // Calculate speed in Mbps
        const speedMbps = (bytes * 8) / (duration * 1000000);
        testResults.push(speedMbps);
        
        logger.log(`Download test ${i + 1}: ${speedMbps.toFixed(2)} Mbps (${bytes} bytes in ${duration.toFixed(2)}s)`);
      } catch (error: any) {
        logger.log(`Download test ${i + 1} failed: ${error.message}`);
        logger.log(`Error details: ${JSON.stringify({
          code: error.code,
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: url
        })}`);
      }
    }

    // Calculate average download speed
    const avgSpeed = testResults.length > 0
      ? testResults.reduce((a, b) => a + b, 0) / testResults.length
      : 0;

    logger.log(`Average download speed: ${avgSpeed.toFixed(2)} Mbps`);
    return avgSpeed;
  }

  private async measureUploadSpeed(): Promise<number> {
    logger.log('Measuring upload speed...');
    logger.log(`Upload test URL: ${UPLOAD_TEST_URL}`);
    this.updateResult({ phase: 'Measuring Upload Speed', progress: 70 });

    const uploadSizes = [1000000, 2000000, 5000000]; // 1MB, 2MB, 5MB
    const testResults: number[] = [];

    for (let i = 0; i < uploadSizes.length; i++) {
      const size = uploadSizes[i];
      const progressStart = 70 + (i * 10);
      
      try {
        // Generate random data
        const data = Buffer.alloc(size, Math.random().toString());
        
        logger.log(`Upload test ${i + 1}: Starting upload of ${size} bytes to ${UPLOAD_TEST_URL}...`);
        const startTime = Date.now();
        
        await axios.post(UPLOAD_TEST_URL, data, {
          proxy: this.getProxyConfig(),
          timeout: TEST_TIMEOUT,
          onUploadProgress: (progressEvent: AxiosProgressEvent) => {
            if (progressEvent.total) {
              const progress = progressStart + ((progressEvent.loaded / progressEvent.total) * 10);
              this.updateResult({ progress: Math.min(progress, 95) });
            }
          },
          headers: {
            'Content-Type': 'application/octet-stream'
          }
        });

        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000; // Convert to seconds
        
        // Calculate speed in Mbps
        const speedMbps = (size * 8) / (duration * 1000000);
        testResults.push(speedMbps);
        
        logger.log(`Upload test ${i + 1}: ${speedMbps.toFixed(2)} Mbps (${size} bytes in ${duration.toFixed(2)}s)`);
      } catch (error: any) {
        logger.log(`Upload test ${i + 1} failed: ${error.message}`);
        logger.log(`Error details: ${JSON.stringify({
          code: error.code,
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: UPLOAD_TEST_URL
        })}`);
      }
    }

    // Calculate average upload speed
    const avgSpeed = testResults.length > 0
      ? testResults.reduce((a, b) => a + b, 0) / testResults.length
      : 0;

    logger.log(`Average upload speed: ${avgSpeed.toFixed(2)} Mbps`);
    return avgSpeed;
  }

  async runSpeedTest(): Promise<SpeedTestResult> {
    if (this.isTesting) {
      throw new Error('Speed test is already in progress');
    }

    // Check if Xray is running
    if (xrayManager.getStatus() !== 'Running') {
      throw new Error('Xray is not running. Please connect first.');
    }

    logger.log('=== SPEED TEST DIAGNOSTICS ===');
    logger.log(`Xray Status: ${xrayManager.getStatus()}`);
    logger.log(`Proxy Configuration: ${PROXY_PROTOCOL}://${PROXY_HOST}:${PROXY_PORT}`);

    // Test direct connection (bypass proxy) to check if network is working
    logger.log('Testing direct network connection (bypassing proxy)...');
    try {
      const directStart = Date.now();
      await axios.get(PING_TEST_URL, { timeout: 10000 });
      const directDuration = Date.now() - directStart;
      logger.log(`Direct connection successful! Response time: ${directDuration}ms`);
    } catch (error: any) {
      logger.log(`Direct connection failed: ${error.message}`);
      logger.log(`This indicates a network connectivity issue independent of the proxy.`);
    }

    // Check if proxy is accessible
    const proxyConnected = await this.checkProxyConnection();
    if (!proxyConnected) {
      throw new Error('Cannot connect to proxy on port 1080. Please check your connection.');
    }

    this.isTesting = true;
    this.updateResult({
      status: 'running',
      progress: 0,
      phase: 'Starting...',
      downloadSpeed: 0,
      uploadSpeed: 0,
      ping: 0,
      jitter: 0,
      error: undefined
    });

    logger.log('Starting speed test...');

    try {
      // Measure ping and jitter
      const { ping, jitter } = await this.measurePing();
      this.updateResult({ ping, jitter });

      // Measure download speed
      const downloadSpeed = await this.measureDownloadSpeed();
      this.updateResult({ downloadSpeed });

      // Measure upload speed
      const uploadSpeed = await this.measureUploadSpeed();
      this.updateResult({ uploadSpeed });

      // Test completed
      this.updateResult({
        status: 'completed',
        progress: 100,
        phase: 'Completed'
      });

      logger.log('Speed test completed successfully!');
      logger.log(`Results: Download: ${downloadSpeed.toFixed(2)} Mbps, Upload: ${uploadSpeed.toFixed(2)} Mbps, Ping: ${ping.toFixed(2)} ms, Jitter: ${jitter.toFixed(2)} ms`);

      return this.getResult();
    } catch (error: any) {
      logger.log(`Speed test failed: ${error.message}`);
      this.updateResult({
        status: 'failed',
        phase: 'Failed',
        error: error.message
      });
      throw error;
    } finally {
      this.isTesting = false;
    }
  }

  reset(): void {
    this.result = {
      downloadSpeed: 0,
      uploadSpeed: 0,
      ping: 0,
      jitter: 0,
      status: 'idle',
      progress: 0,
      phase: 'Ready'
    };
  }
}

export const speedTester = new SpeedTester();
