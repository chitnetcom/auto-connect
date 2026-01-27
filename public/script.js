const statusEl = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const logViewer = document.getElementById('logViewer');
const testLatencyBtn = document.getElementById('testLatencyBtn');
const testStatus = document.getElementById('testStatus');
const configBody = document.getElementById('configBody');

async function updateStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        statusEl.textContent = data.status;
        statusEl.className = 'status-' + data.status.toLowerCase();
    } catch (error) {
        console.error('Failed to fetch status:', error);
    }
}

async function updateLogs() {
    try {
        const response = await fetch('/api/logs');
        const data = await response.json();
        logViewer.textContent = data.logs.join('\n');
        logViewer.scrollTop = logViewer.scrollHeight;
    } catch (error) {
        console.error('Failed to fetch logs:', error);
    }
}

startBtn.addEventListener('click', async () => {
    try {
        await fetch('/api/start', { method: 'POST' });
        updateStatus();
    } catch (error) {
        console.error('Failed to start Xray:', error);
    }
});

stopBtn.addEventListener('click', async () => {
    try {
        await fetch('/api/stop', { method: 'POST' });
        updateStatus();
    } catch (error) {
        console.error('Failed to stop Xray:', error);
    }
});

async function updateLatencyResults() {
    try {
        const response = await fetch('/api/test-results');
        const data = await response.json();
        
        testLatencyBtn.disabled = data.isTesting;
        testStatus.textContent = data.isTesting ? 'Testing in progress...' : '';

        // We also need the list of configs to show all of them even if not tested
        const configsResponse = await fetch('/api/configs');
        const configsData = await configsResponse.json();

        configBody.innerHTML = '';
        configsData.configs.forEach(id => {
            const result = data.results.find(r => r.id === id);
            const latencyText = result ? (result.latency === 'FAILED' ? 'FAILED' : result.latency + ' ms') : '-';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${id}</td>
                <td>${latencyText}</td>
                <td><button class="switch-btn" onclick="switchConfig('${id}')">Switch</button></td>
            `;
            configBody.appendChild(tr);
        });
    } catch (error) {
        console.error('Failed to fetch latency results:', error);
    }
}

async function switchConfig(id) {
    try {
        const response = await fetch('/api/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await response.json();
        alert(data.message || data.error);
        updateStatus();
    } catch (error) {
        console.error('Failed to switch config:', error);
    }
}

testLatencyBtn.addEventListener('click', async () => {
    try {
        await fetch('/api/test-latency', { method: 'POST' });
        updateLatencyResults();
    } catch (error) {
        console.error('Failed to start latency test:', error);
    }
});

// Polling
setInterval(updateStatus, 2000);
setInterval(updateLogs, 3000);
setInterval(updateLatencyResults, 5000);

// Initial load
updateStatus();
updateLogs();
updateLatencyResults();
