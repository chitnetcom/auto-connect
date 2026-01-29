# Xray Auto-Connect

A web-based management interface for Xray proxy configurations with support for multiple simultaneous connections.

## Features

- **Multi-Connection Support**: Run multiple Xray configurations simultaneously, each on a separate port
- **Connection Management**: Add, remove, reorder, start, stop, and restart connections
- **Configuration Management**: Store and manage multiple Xray configurations
- **Latency Testing**: Test connection latency for all configurations
- **Speed Testing**: Measure download/upload speeds, ping, and jitter
- **Real-time Monitoring**: View connection status and logs
- **Drag-and-Drop Reordering**: Easily reorder connections in the list
- **State Persistence**: Connection list and states are saved across restarts

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd auto-connect
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your settings
```

4. Build TypeScript:
```bash
npm run build
# or
yarn build
```

5. Start the server:
```bash
npm start
# or
yarn start
```

6. Open your browser and navigate to `http://localhost:3000`

## Configuration

### Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Server Configuration
PORT=3000
ADMIN_PASSWORD=admin123

# Multi-Connection Settings
MAX_CONNECTIONS=10              # Maximum number of concurrent connections
CONNECTION_START_PORT=1080      # Starting port for connections (1080, 1081, 1082, ...)
AUTO_RESTART_CONNECTIONS=false   # Auto-restart connections on crash
CONNECTION_STARTUP_TIMEOUT=5000  # Connection startup timeout in milliseconds
```

### Port Assignment

Connections are assigned ports based on their position in the connection list:

- Position 0: Port 1080 (Primary connection)
- Position 1: Port 1081
- Position 2: Port 1082
- Position 3: Port 1083
- ...
- Position N: Port 1080 + N

## Usage

### Single Connection Mode (Legacy)

The original single connection mode is still supported for backward compatibility:

1. Go to the **Configs** tab
2. Click **Switch** on a configuration to activate it
3. Use the **Connect/Disconnect** button in the **Status** tab

### Multi-Connection Mode

1. Go to the **Configs** tab
2. Click **Add to Connections** on each configuration you want to run
3. Go to the **Connections** tab
4. Use **Start All** to start all connections, or start individual connections
5. Connections will run on their assigned ports (1080, 1081, 1082, etc.)

### Managing Connections

#### Adding Connections
- Navigate to the **Configs** tab
- Click **Add to Connections** button next to any configuration
- The connection will be added to the connection list

#### Removing Connections
- Go to the **Connections** tab
- Click **Remove** on the connection card
- Confirm the removal

#### Reordering Connections
- Go to the **Connections** tab
- Drag connections using the handle (⋮⋮) on the left
- Drop to reorder
- Ports will be automatically reassigned based on new order

#### Starting/Stopping Connections
- **Start All**: Start all connections in the list
- **Stop All**: Stop all running connections
- **Start/Stop**: Control individual connections
- **Restart**: Restart a specific connection

### Connection Status

Each connection displays:
- **Status**: Running, Stopped, Starting, or Error
- **Port**: Assigned port number
- **Duration**: Time since connection started
- **Error**: Last error message (if any)

### Latency Testing

1. Go to the **Configs** tab
2. Click **Run All Tests** to test all configurations
3. Click **Test** on individual configs to test specific ones
4. Results are displayed as latency badges

### Speed Testing

1. Connect to a VPN (single or multi-connection mode)
2. Go to the **Speed Test** tab
3. Click **Start Speed Test**
4. View results for download, upload, ping, and jitter

## API Endpoints

### Authentication
- `POST /api/login` - Login and get session token

### Status
- `GET /api/status` - Get current status

### Configuration Management
- `GET /api/configs` - List all configurations
- `POST /api/configs` - Add a new configuration
- `PUT /api/configs/:name` - Update a configuration
- `DELETE /api/configs/:name` - Delete a configuration
- `POST /api/switch` - Switch active configuration (legacy mode)

### Connection Management
- `GET /api/connections` - Get all connections
- `POST /api/connections` - Add a connection to the list
- `DELETE /api/connections/:id` - Remove a connection from the list
- `PUT /api/connections/reorder` - Reorder connections
- `POST /api/connections/:id/start` - Start a specific connection
- `POST /api/connections/:id/stop` - Stop a specific connection
- `POST /api/connections/:id/restart` - Restart a specific connection
- `POST /api/connections/start-all` - Start all connections
- `POST /api/connections/stop-all` - Stop all connections
- `GET /api/connections/status` - Get status of all connections
- `GET /api/connections/:id/status` - Get status of a specific connection

### Testing
- `POST /api/test-latency` - Run latency tests for all configs
- `POST /api/test-latency/:name` - Run latency test for specific config
- `GET /api/test-results` - Get latency test results
- `POST /api/speed-test` - Start speed test
- `GET /api/speed-test` - Get speed test results
- `POST /api/speed-test/reset` - Reset speed test

### Logs
- `GET /api/logs` - Get system logs

## File Structure

```
auto-connect/
├── src/
│   ├── connection-manager.ts    # Multi-connection management
│   ├── xray-manager.ts        # Xray process management
│   ├── latency-tester.ts      # Latency testing
│   ├── speed-tester.ts        # Speed testing
│   ├── logger.ts              # Logging system
│   ├── auth.ts               # Authentication
│   └── index.ts              # Express API server
├── public/
│   ├── index.html             # Main UI
│   ├── script.js             # Frontend JavaScript
│   ├── style.css             # Styles
│   └── vs/                  # Monaco Editor
├── configs/
│   ├── main/
│   │   └── config.json       # Active configuration (legacy)
│   ├── others.json            # All configurations
│   ├── connections.json        # Connection list state
│   ├── state.json            # Application state
│   └── temp/                # Temporary config files
├── logs/
│   └── xray.log             # System logs
└── plans/
    └── multi-connection-implementation.md
```

## Migration from Single Connection Mode

When you first run the application with multi-connection support:

1. The system automatically checks for existing single-connection state
2. If an active configuration exists, it's automatically added to the connection list
3. The connection is started if it was running before migration
4. All existing functionality remains available

## Troubleshooting

### Port Already in Use

If you see a "Port already in use" error:
1. Check which application is using the port
2. Stop the conflicting application
3. Restart the connection

### Connection Won't Start

1. Check the configuration is valid
2. View logs in the **Logs** tab for error details
3. Ensure Xray is installed and accessible

### High Latency

1. Test different configurations
2. Check your network connection
3. Try connecting to a different server

### Speed Test Fails

1. Ensure a VPN connection is active
2. Check your network connection
3. Try running the test again

## Security Considerations

- All API endpoints require authentication (except login)
- Connections bind to localhost (127.0.0.1) by default
- Configuration files are stored locally
- Session tokens are stored in browser localStorage

## Development

### Building TypeScript
```bash
npm run build
```

### Running in Development
```bash
npm run dev
```

### Linting
```bash
npm run lint
```

## License

[Add your license here]

## Contributing

[Add contribution guidelines here]
