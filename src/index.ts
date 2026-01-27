import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { xrayManager } from './xray-manager';
import { logger } from './logger';
import { latencyTester } from './latency-tester';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.get('/api/status', (req, res) => {
  res.json({ status: xrayManager.getStatus() });
});

app.post('/api/start', async (req, res) => {
  try {
    await xrayManager.start();
    res.json({ message: 'Xray started' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/stop', (req, res) => {
  xrayManager.stop();
  res.json({ message: 'Xray stopped' });
});

app.get('/api/logs', (req, res) => {
  res.json({ logs: logger.getLogs() });
});

app.get('/api/configs', async (req, res) => {
  try {
    const configs = await xrayManager.listConfigs();
    res.json({ configs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/test-latency', async (req, res) => {
  try {
    // Run tests in background
    latencyTester.runTests().catch(err => logger.log(`Background test error: ${err.message}`));
    res.json({ message: 'Latency testing started' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/test-results', (req, res) => {
  res.json({
    results: latencyTester.getResults(),
    isTesting: latencyTester.getIsTesting()
  });
});

app.post('/api/switch', async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Config ID is required' });
  }
  try {
    await xrayManager.switchConfig(id);
    res.json({ message: `Switched to config ${id}` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
