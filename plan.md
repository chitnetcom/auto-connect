# Auto-Connect Xray Configuration Manager – Phased Implementation Plan

## Project Overview
This Node.js + TypeScript project is designed to evaluate multiple Xray configurations, determine the best-performing one based on real network latency, and switch the system to use that configuration.

The project is intentionally implemented in **two distinct phases** to reduce complexity and allow incremental delivery.

---

## Key Principles
- Linux server environment
- CLI-only interface
- Only one Xray instance may run at any time
- Main configuration must always use port `1080`
- Latency testing must reflect real application-level traffic

---

## Phase Breakdown Overview

### Phase 1 – Core CLI & Xray Control (MVP)
Focus:  
✅ Process control  
✅ Stable CLI  
✅ Manual configuration switching  

🚫 No latency testing  
🚫 No automatic decision-making  

---

### Phase 2 – Latency Testing & Smart Switching
Focus:  
✅ Real latency measurement  
✅ Config comparison  
✅ Assisted configuration switching  

---

## Assumptions
- Xray binary is available in `$PATH`
- Configuration files are valid and compatible
- Directory structure is fixed

---

## Project Structure
```

auto-connect/
├── src/
│   ├── cli.ts
│   ├── xray-runner.ts
│   ├── config-manager.ts
│   ├── logger.ts
│   └── types.ts
├── configs/
│   ├── main/
│   │   └── config.json
│   └── others/
│       ├── 1/
│       │   └── config.json
│       └── ...
├── logs/
│   └── xray.log
└── package.json

```

---

# Phase 1 – Core CLI & Xray Control (Current Phase)

## Goals
The goal of Phase 1 is to build a **stable and reliable CLI tool** that can fully control Xray using the main configuration.

Latency testing and performance evaluation are **explicitly out of scope** for this phase.

---

## Phase 1 Features

### 1. CLI Control Panel
The CLI must allow the user to:

- Start Xray using `configs/main/config.json`
- Stop the running Xray process
- Check Xray status (running / stopped)
- View recent Xray logs

### CLI Commands (Phase 1)
```

auto-connect start
auto-connect stop
auto-connect status
auto-connect logs

```

---

### 2. Xray Process Management
- Start Xray using `child_process.spawn`
- Track process state internally
- Prevent multiple instances from running
- Gracefully handle:
  - SIGINT
  - SIGTERM
  - Unexpected crashes

---

### 3. Configuration Management (Manual)
- Read and validate `configs/main/config.json`
- Ensure:
  - Port is set to `1080`
- No modification of `configs/others` in this phase

---

### 4. Logging
- Capture `stdout` and `stderr` from Xray
- Write logs to `logs/xray.log`
- Allow CLI to display last N lines

---

### Phase 1 Non-Goals
The following must NOT be implemented in Phase 1:
- Latency testing
- HTTP requests through proxy
- Port patching for test configs
- Automatic or assisted configuration selection
- Any logic involving `configs/others`

---

# Phase 2 – Latency Testing & Configuration Selection

⚠️ Phase 2 must only be implemented after Phase 1 is complete and stable.

---

## Phase 2 Goals
- Measure real network latency for each configuration
- Display results to the user
- Assist the user in selecting and switching configurations

---

## Phase 2 Features

### 1. Latency Measurement
- Test each config in `configs/others/`
- Use HTTP request through Xray tunnel
- Target: `https://www.google.com/generate_204`
- Metric: total request duration (ms)
- Sequential testing only

---

### 2. Port Management
- Temporary ports (1081+)
- Availability checks
- Guaranteed cleanup

---

### 3. Result Display
- CLI table with:
  - Config ID
  - Port
  - Latency
  - Status

---

### 4. Configuration Switching
- Copy selected config into `configs/main/config.json`
- Patch port to `1080`
- Restart Xray safely

---

## Phase 2 CLI Commands
```

auto-connect test
auto-connect switch <config-id>

```

---

## Future Extensions (Optional)
- TUI (ink / blessed)
- Web UI
- Historical performance data
- Automatic best-config selection mode