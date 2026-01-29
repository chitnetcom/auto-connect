import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { xrayManager } from './xray-manager';
import { connectionManager } from './connection-manager';
import { logger } from './logger';
import { latencyTester } from './latency-tester';
import { speedTester } from './speed-tester';
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
    activeConfig: xrayManager.getActiveConfigName(),
    connectionStartTime: xrayManager.getConnectionStartTime()
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

app.post('/api/test-latency/:name', async (req, res) => {
  const { name } = req.params;
  try {
    // Run single test in background
    latencyTester.runSingleTest(name).catch(err => logger.log(`Background single test error: ${err.message}`));
    res.json({ message: `Latency testing started for config ${name}` });
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

// Speed Test endpoints
app.post('/api/speed-test', async (req, res) => {
  try {
    const { connectionId } = req.body;
    // Run speed test in background
    speedTester.runSpeedTest(connectionId).catch(err => logger.log(`Speed test error: ${err.message}`));
    res.json({ message: 'Speed test started' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/speed-test', (req, res) => {
  res.json({
    result: speedTester.getResult(),
    isTesting: speedTester.getIsTesting()
  });
});

app.post('/api/speed-test/reset', (req, res) => {
  speedTester.reset();
  res.json({ message: 'Speed test reset' });
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

// ==================== Connection Management Endpoints ====================

// Get all connections
app.get('/api/connections', (req, res) => {
  try {
    const connections = connectionManager.getConnections();
    res.json({ connections });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Add a connection to the list
app.post('/api/connections', async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    await connectionManager.addConnection(name);
    res.json({ message: `Connection "${name}" added` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Remove a connection from the list
app.delete('/api/connections/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await connectionManager.removeConnection(id);
    res.json({ message: `Connection "${id}" removed` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Reorder connections
app.put('/api/connections/reorder', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: 'IDs array is required' });
  }
  try {
    await connectionManager.reorderConnections(ids);
    res.json({ message: 'Connections reordered' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start a specific connection
app.post('/api/connections/:id/start', async (req, res) => {
  const { id } = req.params;
  try {
    await connectionManager.startConnection(id);
    res.json({ message: `Connection "${id}" started` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stop a specific connection
app.post('/api/connections/:id/stop', async (req, res) => {
  const { id } = req.params;
  try {
    await connectionManager.stopConnection(id);
    res.json({ message: `Connection "${id}" stopped` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Restart a specific connection
app.post('/api/connections/:id/restart', async (req, res) => {
  const { id } = req.params;
  try {
    await connectionManager.restartConnection(id);
    res.json({ message: `Connection "${id}" restarted` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start all connections
app.post('/api/connections/start-all', async (req, res) => {
  try {
    await connectionManager.startAll();
    res.json({ message: 'All connections started' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stop all connections
app.post('/api/connections/stop-all', async (req, res) => {
  try {
    await connectionManager.stopAll();
    res.json({ message: 'All connections stopped' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get status of all connections
app.get('/api/connections/status', (req, res) => {
  try {
    const statuses = connectionManager.getAllStatuses();
    res.json({ statuses: Object.fromEntries(statuses) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get status of a specific connection
app.get('/api/connections/:id/status', (req, res) => {
  const { id } = req.params;
  try {
    const status = connectionManager.getConnectionStatus(id);
    res.json({ id, status });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  try {
    await xrayManager.migrateConfigs();
    await connectionManager.loadState();
    await connectionManager.migrateFromSingleConnection();
  } catch (err: any) {
    console.error('Migration failed:', err.message);
  }
});
