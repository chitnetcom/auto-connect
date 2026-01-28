import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { xrayManager } from './xray-manager';
import { logger } from './logger';
import { latencyTester } from './latency-tester';
import { authMiddleware, createSession, generateSessionToken } from './auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Login endpoint
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  
  if (password === ADMIN_PASSWORD) {
    const token = generateSessionToken();
    createSession(token);
    res.json({ token, message: 'Login successful' });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Apply auth middleware to all routes except login and static files
app.use(authMiddleware);

// API Routes
app.get('/api/status', (req, res) => {
  res.json({
    status: xrayManager.getStatus(),
    activeConfig: xrayManager.getActiveConfigName()
  });
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

app.post('/api/configs', async (req, res) => {
  const { name, config } = req.body;
  if (!name || !config) {
    return res.status(400).json({ error: 'Name and config are required' });
  }
  try {
    await xrayManager.addConfig(name, config);
    res.json({ message: `Config ${name} added` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/configs/:name', async (req, res) => {
  const { name } = req.params;
  try {
    await xrayManager.removeConfig(name);
    res.json({ message: `Config ${name} removed` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/configs/:name', async (req, res) => {
  const { name } = req.params;
  const { config } = req.body;
  if (!config) {
    return res.status(400).json({ error: 'Config is required' });
  }
  try {
    await xrayManager.updateConfig(name, config);
    res.json({ message: `Config ${name} updated` });
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

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  try {
    await xrayManager.migrateConfigs();
  } catch (err: any) {
    console.error('Migration failed:', err.message);
  }
});
