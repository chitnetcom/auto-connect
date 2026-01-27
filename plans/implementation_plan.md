# Implementation Plan - Xray Auto-Connect

This document outlines the implementation strategy for the Xray Auto-Connect project, divided into two phases.

## Phase 1: Core Control Panel & Logging
Focuses on the basic ability to control the main Xray configuration and monitor its output.

### 1. Project Setup
- Initialize TypeScript configuration (`tsconfig.json`).
- Install dependencies: `express`, `axios`, `fs-extra`, `dotenv`, `cors`.
- Set up directory structure: `src/`, `public/`, `logs/`.

### 2. Logger Implementation
- Create a utility to write Xray stdout/stderr to `logs/xray.log`.
- Maintain an in-memory buffer of the last 100 lines for the WebUI.

### 3. XrayManager Implementation
- Logic to spawn and kill the Xray process using `configs/main/config.json`.
- Track process status (Running/Stopped).
- Capture and pipe logs to the Logger.

### 4. Express API (Phase 1)
- `GET /api/status`: Current status of the main Xray.
- `POST /api/start`: Start the main Xray.
- `POST /api/stop`: Stop the main Xray.
- `GET /api/logs`: Fetch the last 100 log lines.

### 5. WebUI (Phase 1)
- Minimal HTML/CSS/JS interface.
- Start/Stop buttons.
- Status indicator.
- Log viewer with auto-polling (2-5s).

## Phase 2: Latency Testing & Config Switching
Focuses on identifying the best configuration and switching to it.

### 1. LatencyTester Implementation
- Logic to iterate through `configs/others/`.
- Sequential testing:
  - Modify config to use port `1081`.
  - Spawn temporary Xray instance.
  - Measure HTTP latency to `https://www.google.com/generate_204`.
  - Kill temporary instance.
- Handle failures gracefully (report as "FAILED").

### 2. Configuration Switching Logic
- Logic to copy `configs/others/[ID]/config.json` to `configs/main/config.json`.
- Ensure Xray is restarted after the switch.

### 3. Express API (Phase 2)
- `GET /api/configs`: List available configurations.
- `POST /api/test-latency`: Trigger the testing process.
- `GET /api/test-results`: Fetch results of the latest test.
- `POST /api/switch`: Switch to a specific config and restart.

### 4. WebUI (Phase 2)
- Add a "Latency Testing" section.
- Display a table of configurations with their latency results.
- "Select & Switch" functionality for each configuration.

## Technical Details

### Port Management
- **Main Xray**: Always runs on port `1080`.
- **Latency Testing**: Each test will temporarily use port `1081`. The system will ensure the main Xray is NOT stopped during testing, but the test process will use a different port to avoid conflicts.
- **WebUI**: Runs on port `3000` (configurable via `PORT` env var).

### Latency Testing Workflow
1. Read all directories in `configs/others/`.
2. For each configuration:
   - Read `config.json`.
   - Identify the first inbound and change its port to `1081`.
   - Write the modified config to a temporary file.
   - Spawn `xray run -c test_config.json`.
   - Wait 2 seconds for initialization.
   - Send an HTTP GET request to `https://www.google.com/generate_204` via proxy `127.0.0.1:1081`.
   - Measure duration.
   - Kill test process and clean up.

### Configuration Switching
- Stop main Xray -> Copy file -> Start main Xray.

## Directory Structure
```
auto-connect/
├── configs/
│   ├── main/
│   │   └── config.json
│   └── others/
│       ├── 1/
│       │   └── config.json
│       └── 2/
│           └── config.json
├── logs/
│   └── xray.log
├── public/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── src/
│   ├── index.ts
│   ├── xray-manager.ts
│   ├── latency-tester.ts
│   ├── logger.ts
│   └── types.ts
├── package.json
└── tsconfig.json
```
