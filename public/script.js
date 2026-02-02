// Status summary elements
const totalConnectionsEl = document.getElementById('totalConnections');
const runningConnectionsEl = document.getElementById('runningConnections');
const stoppedConnectionsEl = document.getElementById('stoppedConnections');
const errorConnectionsEl = document.getElementById('errorConnections');
const goToConnectionsBtn = document.getElementById('goToConnectionsBtn');

// Speed test connection selector
const speedTestConnectionSelect = document.getElementById('speedTestConnection');

const logViewer = document.getElementById('logViewer');
const testLatencyBtn = document.getElementById('testLatencyBtn');
const testStatus = document.getElementById('testStatus');
const accordionContainer = document.getElementById('accordionContainer');
const newConfigNameInput = document.getElementById('newConfigName');
const addConfigBtn = document.getElementById('addConfigBtn');
const logoutBtn = document.getElementById('logoutBtn');

// Connection management elements
const connectionsList = document.getElementById('connectionsList');
const startAllConnectionsBtn = document.getElementById('startAllConnectionsBtn');
const stopAllConnectionsBtn = document.getElementById('stopAllConnectionsBtn');
const noConnectionsMessage = document.getElementById('noConnectionsMessage');

let mainEditor;
let activeConfigName = null;
let currentStatus = 'Stopped';
let configEditors = {}; // Store editor instances for accordion items
let connectionStartTime = null;
let connectionTimerInterval = null;
let isAnyAccordionOpen = false; // Track if any accordion is open to pause auto-update

// Authentication functions
function getAuthToken() {
    return localStorage.getItem('authToken');
}

function getAuthHeaders() {
    const token = getAuthToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function handleUnauthorized() {
    localStorage.removeItem('authToken');
    window.location.href = '/login.html';
}

async function authenticatedFetch(url, options = {}) {
    const headers = {
        ...getAuthHeaders(),
        ...options.headers
    };
    
    const response = await fetch(url, { ...options, headers });
    
    if (response.status === 401) {
        handleUnauthorized();
        throw new Error('Unauthorized');
    }
    
    return response;
}

// Check authentication on page load
function checkAuthentication() {
    const token = getAuthToken();
    if (!token) {
        window.location.href = '/login.html';
        return false;
    }
    return true;
}

// Add logout button to header
function addLogoutButton() {
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('authToken');
            window.location.href = '/login.html';
        });
    }
}

// Initialize authentication check
if (!checkAuthentication()) {
    // Will redirect to login
} else {
    addLogoutButton();
}

// Tab Switching Logic
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        
        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(target).classList.add('active');

        // Trigger layout for editors if needed
        if (target === 'add-config-tab' && mainEditor) {
            mainEditor.layout();
        }
        if (target === 'configs-tab') {
            Object.values(configEditors).forEach(ed => ed.layout());
        }
    });
});

// Initialize Monaco
require.config({ paths: { 'vs': 'vs' } });
require(['vs/editor/editor.main'], function () {
    mainEditor = monaco.editor.create(document.getElementById('editorContainer'), {
        value: '{\n  "inbounds": [],\n  "outbounds": []\n}',
        language: 'json',
        theme: 'vs-dark',
        automaticLayout: true
    });
});

// Connection timer functions
function startConnectionTimer() {
    // Only set connectionStartTime if it's not already set (e.g., from persisted state)
    if (!connectionStartTime) {
        connectionStartTime = Date.now();
    }
    if (connectionTimerInterval) {
        clearInterval(connectionTimerInterval);
    }
    connectionTimerInterval = setInterval(updateConnectionTimer, 1000);
    updateConnectionTimer();
}

function stopConnectionTimer() {
    if (connectionTimerInterval) {
        clearInterval(connectionTimerInterval);
        connectionTimerInterval = null;
    }
    connectionStartTime = null;
}

function updateConnectionTimer() {
    if (!connectionStartTime) return;

    const elapsed = Date.now() - connectionStartTime;
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);

    let timeString = '';
    if (hours > 0) {
        timeString += `${hours}:`;
    }
    timeString += `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

async function updateStatus() {
    try {
        const response = await authenticatedFetch('/api/status');
        const data = await response.json();
        
        const previousStatus = currentStatus;
        currentStatus = data.status;
        const statusClass = 'status-' + currentStatus.toLowerCase();

        if (activeConfigName !== data.activeConfig) {
            activeConfigName = data.activeConfig;
            updateLatencyResults();
        }
    } catch (error) {
        console.error('Failed to fetch status:', error);
    }
}

// Update status summary with connection list data
async function updateStatusSummary() {
    try {
        const response = await authenticatedFetch('/api/connections');
        const data = await response.json();
        const connections = data.connections || [];
        
        const total = connections.length;
        const running = connections.filter(c => c.status === 'Running').length;
        const stopped = connections.filter(c => c.status === 'Stopped').length;
        const errors = connections.filter(c => c.status === 'Error').length;
        
        if (totalConnectionsEl) totalConnectionsEl.textContent = total;
        if (runningConnectionsEl) runningConnectionsEl.textContent = running;
        if (stoppedConnectionsEl) stoppedConnectionsEl.textContent = stopped;
        if (errorConnectionsEl) errorConnectionsEl.textContent = errors;
        
        // Update connection selector for speed test
        updateSpeedTestConnectionSelector(connections);
    } catch (error) {
        console.error('Failed to update status summary:', error);
    }
}

// Update connection selector in speed test tab
function updateSpeedTestConnectionSelector(connections) {
    if (!speedTestConnectionSelect) return;
    
    const currentValue = speedTestConnectionSelect.value;
    speedTestConnectionSelect.innerHTML = '<option value="">Select a connection...</option>';
    
    connections.forEach(connection => {
        const option = document.createElement('option');
        option.value = connection.id;
        option.textContent = `${connection.name} (Port ${connection.port})`;
        if (connection.status === 'Running') {
            option.textContent += ' ✓';
        }
        speedTestConnectionSelect.appendChild(option);
    });
    
    // Restore previous selection if still valid
    if (currentValue && connections.find(c => c.id === currentValue)) {
        speedTestConnectionSelect.value = currentValue;
    }
}

async function updateLogs() {
    try {
        const response = await authenticatedFetch('/api/logs');
        const data = await response.json();
        logViewer.textContent = data.logs.join('\n');
        logViewer.scrollTop = logViewer.scrollHeight;
    } catch (error) {
        console.error('Failed to fetch logs:', error);
    }
}

addConfigBtn.addEventListener('click', async () => {
    const name = newConfigNameInput.value.trim();
    if (!name) {
        alert('Please enter a config name');
        return;
    }
    let config;
    try {
        config = JSON.parse(mainEditor.getValue());
    } catch (e) {
        alert('Invalid JSON config');
        return;
    }

    try {
        const response = await authenticatedFetch('/api/configs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, config })
        });
        const data = await response.json();
        if (data.error) {
            alert(data.error);
        } else {
            newConfigNameInput.value = '';
            updateLatencyResults();
            // Switch to configs tab
            document.querySelector('[data-tab="configs-tab"]').click();
        }
    } catch (error) {
        console.error('Failed to add config:', error);
    }
});

async function updateLatencyResults() {
    // Skip update if any accordion is open to prevent losing user's changes
    if (isAnyAccordionOpen) {
        console.log('Auto-update paused: accordion is open');
        return;
    }
    
    try {
        const response = await authenticatedFetch('/api/test-results');
        const data = await response.json();
        
        const isTesting = data.isTesting;
        testLatencyBtn.disabled = isTesting;
        testStatus.textContent = isTesting ? 'Testing in progress...' : '';

        const configsResponse = await authenticatedFetch('/api/configs');
        const configsData = await configsResponse.json();

        // Keep track of which items were open
        const openItems = Array.from(document.querySelectorAll('.accordion-item.active')).map(el => el.dataset.name);

        accordionContainer.innerHTML = '';
        // Clean up old editors
        Object.values(configEditors).forEach(ed => ed.dispose());
        configEditors = {};

        configsData.configs.forEach(item => {
            const id = item.name;
            const result = data.results.find(r => r.id === id);
            const latencyText = result ? (result.latency === 'FAILED' ? 'FAILED' : result.latency + ' ms') : '-';
            const latencyClass = result ? (result.latency === 'FAILED' ? 'bad' : (result.latency < 5000 ? 'good' : '')) : '';

            const itemEl = document.createElement('div');
            itemEl.className = `accordion-item ${openItems.includes(id) ? 'active' : ''}`;
            itemEl.dataset.name = id;
            const isActive = id === activeConfigName;
            itemEl.innerHTML = `
                <div class="accordion-header" onclick="toggleAccordion('${id}')">
                    <div class="accordion-title">
                        ${isActive ? '<span class="active-indicator"></span>' : ''}
                        ${id}
                        <span class="latency-badge ${latencyClass}">${latencyText}</span>
                    </div>
                    <div class="accordion-actions">
                        <button class="test-btn" onclick="event.stopPropagation(); testSingleConfig('${id}')">Test</button>
                        <button class="add-connection-btn" onclick="event.stopPropagation(); addToConnections('${id}')">Add</button>
                        <button class="delete-btn" onclick="event.stopPropagation(); deleteConfig('${id}')">Delete</button>
                    </div>
                </div>
                <div class="accordion-content">
                    <div class="config-name-input-container">
                        <label for="config-name-${id.replace(/\s+/g, '-')}">Config Name:</label>
                        <input 
                            type="text" 
                            id="config-name-${id.replace(/\s+/g, '-')}" 
                            class="config-name-input" 
                            value="${id}"
                            data-original-name="${id}"
                        />
                    </div>
                    <div id="editor-${id.replace(/\s+/g, '-')}" class="mini-editor"></div>
                    <button class="save-btn" onclick="saveConfig('${id}')">Save Changes</button>
                </div>
            `;
            accordionContainer.appendChild(itemEl);

            // Initialize mini editor for this item
            if (window.monaco) {
                const editorId = `editor-${id.replace(/\s+/g, '-')}`;
                configEditors[id] = monaco.editor.create(document.getElementById(editorId), {
                    value: JSON.stringify(item.config, null, 2),
                    language: 'json',
                    theme: 'vs-dark',
                    readOnly: false,
                    automaticLayout: true,
                    minimap: { enabled: false }
                });
            }
        });
    } catch (error) {
        console.error('Failed to fetch latency results:', error);
    }
}

function toggleAccordion(name) {
    const items = document.querySelectorAll('.accordion-item');
    items.forEach(item => {
        if (item.dataset.name === name) {
            const isOpening = !item.classList.contains('active');
            item.classList.toggle('active');
            
            // Update the flag based on whether any accordion is open
            const openAccordions = document.querySelectorAll('.accordion-item.active');
            isAnyAccordionOpen = openAccordions.length > 0;
            
            // Update visual indicator
            updateAutoUpdateIndicator();
            
            // Trigger layout for the editor inside
            if (configEditors[name]) {
                configEditors[name].layout();
            }
        }
    });
}

// Function to update the visual indicator for auto-update status
function updateAutoUpdateIndicator() {
    return
    let indicator = document.getElementById('autoUpdateIndicator');
    
    if (isAnyAccordionOpen) {
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'autoUpdateIndicator';
            indicator.className = 'auto-update-paused';
            indicator.innerHTML = '⏸️ Auto-update paused (accordion open)';
            
            // Insert after the section header
            const sectionHeader = document.querySelector('#configs-tab .section-header');
            if (sectionHeader) {
                sectionHeader.insertAdjacentElement('afterend', indicator);
            }
        }
    } else {
        if (indicator) {
            indicator.remove();
        }
    }
}

async function addToConnections(id) {
    const port = prompt('Enter base port (leave empty for default 1080):', '1080');
    if (port === null) return; // User cancelled
    
    const basePort = port.trim() === '' ? undefined : parseInt(port);
    if (basePort !== undefined && (isNaN(basePort) || basePort < 1024 || basePort > 65535)) {
        alert('Please enter a valid port number (1024-65535)');
        return;
    }
    
    try {
        const response = await authenticatedFetch('/api/connections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: id, basePort })
        });
        const data = await response.json();
        if (data.error) {
            alert(data.error);
        } else {
            alert(`Config "${id}" added to connections`);
            updateConnectionsList();
        }
    } catch (error) {
        console.error('Failed to add to connections:', error);
        alert('Failed to add to connections');
    }
}

async function deleteConfig(name) {
    if (!confirm(`Are you sure you want to delete config "${name}"?`)) return;
    try {
        const response = await authenticatedFetch(`/api/configs/${name}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.error) alert(data.error);
        updateLatencyResults();
    } catch (error) {
        console.error('Failed to delete config:', error);
    }
}

async function saveConfig(originalName) {
    const editor = configEditors[originalName];
    if (!editor) return;

    // Get new name from input field
    const inputId = `config-name-${originalName.replace(/\s+/g, '-')}`;
    const nameInput = document.getElementById(inputId);
    const newName = nameInput.value.trim();

    // Validate new name
    if (!newName) {
        alert('Please enter a valid name');
        return;
    }

    // Parse JSON config
    let config;
    try {
        config = JSON.parse(editor.getValue());
    } catch (e) {
        alert('Invalid JSON config');
        return;
    }

    try {
        // First, rename if name has changed
        if (newName !== originalName) {
            const renameResponse = await authenticatedFetch(`/api/configs/${originalName}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newName: newName })
            });
            const renameData = await renameResponse.json();
            if (renameData.error) {
                alert(renameData.error);
                // Reset input to original name on error
                nameInput.value = originalName;
                return;
            }
            // Update the originalName to newName for the config update
            originalName = newName;
        }

        // Then, update the config content
        const response = await authenticatedFetch(`/api/configs/${originalName}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config })
        });
        const data = await response.json();
        if (data.error) {
            alert(data.error);
        } else {
            // Close the accordion after successful save to resume auto-update
            const accordionItem = document.querySelector(`.accordion-item[data-name="${originalName}"]`);
            if (accordionItem) {
                accordionItem.classList.remove('active');
                // Update the flag
                const openAccordions = document.querySelectorAll('.accordion-item.active');
                isAnyAccordionOpen = openAccordions.length > 0;
                // Update visual indicator
                updateAutoUpdateIndicator();
            }
            // Now update the latency results
            updateLatencyResults();
        }
    } catch (error) {
        console.error('Failed to update config:', error);
        alert('Failed to update config');
    }
}

const runLatencyTest = async () => {
    try {
        await authenticatedFetch('/api/test-latency', { method: 'POST' });
        updateLatencyResults();
    } catch (error) {
        console.error('Failed to start latency test:', error);
    }
};

async function testSingleConfig(id) {
    try {
        await authenticatedFetch(`/api/test-latency/${id}`, { method: 'POST' });
        updateLatencyResults();
    } catch (error) {
        console.error('Failed to start single config latency test:', error);
    }
}

testLatencyBtn.addEventListener('click', runLatencyTest);

// Speed Test functionality
const startSpeedTestBtn = document.getElementById('startSpeedTestBtn');
const resetSpeedTestBtn = document.getElementById('resetSpeedTestBtn');
const speedTestPhase = document.getElementById('speedTestPhase');
const speedTestProgress = document.getElementById('speedTestProgress');
const speedTestProgressText = document.getElementById('speedTestProgressText');
const downloadSpeedEl = document.getElementById('downloadSpeed');
const uploadSpeedEl = document.getElementById('uploadSpeed');
const pingValueEl = document.getElementById('pingValue');
const jitterValueEl = document.getElementById('jitterValue');
const speedTestError = document.getElementById('speedTestError');

let speedTestInterval = null;
let speedTestCharts = {};

// Initialize speed test charts
function initSpeedTestCharts() {
    const chartConfigs = [
        { id: 'downloadChart', color: '#3b82f6' },
        { id: 'uploadChart', color: '#8b5cf6' },
        { id: 'pingChart', color: '#10b981' },
        { id: 'jitterChart', color: '#f59e0b' }
    ];

    chartConfigs.forEach(config => {
        const canvas = document.getElementById(config.id);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            speedTestCharts[config.id] = {
                ctx,
                color: config.color,
                values: [],
                maxValue: 100
            };
            drawChart(config.id);
        }
    });
}

function drawChart(chartId) {
    const chart = speedTestCharts[chartId];
    if (!chart) return;

    const canvas = document.getElementById(chartId);
    const ctx = chart.ctx;
    const width = canvas.width = canvas.offsetWidth * 2;
    const height = canvas.height = canvas.offsetHeight * 2;
    const padding = 10;

    ctx.clearRect(0, 0, width, height);
    ctx.scale(2, 2);

    // Draw background
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, width / 2, height / 2);

    // Draw bars
    const barWidth = (width / 2 - padding * 2) / Math.max(chart.values.length, 1);
    const maxVal = Math.max(...chart.values, chart.maxValue);

    chart.values.forEach((value, index) => {
        const barHeight = (value / maxVal) * (height / 2 - padding * 2);
        const x = padding + index * barWidth;
        const y = height / 2 - padding - barHeight;

        // Draw bar with gradient
        const gradient = ctx.createLinearGradient(x, y, x, height / 2 - padding);
        gradient.addColorStop(0, chart.color);
        gradient.addColorStop(1, chart.color + '80');

        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth - 2, barHeight);
    });
}

function updateChart(chartId, value) {
    const chart = speedTestCharts[chartId];
    if (!chart) return;

    chart.values.push(value);
    if (chart.values.length > 10) {
        chart.values.shift();
    }
    drawChart(chartId);
}

function resetCharts() {
    Object.keys(speedTestCharts).forEach(chartId => {
        speedTestCharts[chartId].values = [];
        drawChart(chartId);
    });
}

async function startSpeedTest() {
    try {
        // Check if a connection is selected
        const selectedConnectionId = speedTestConnectionSelect ? speedTestConnectionSelect.value : null;
        
        if (!selectedConnectionId) {
            showError('Please select a connection to test.');
            return;
        }

        // Check if selected connection is running
        const connectionsResponse = await authenticatedFetch('/api/connections');
        const connectionsData = await connectionsResponse.json();
        const selectedConnection = connectionsData.connections.find(c => c.id === selectedConnectionId);
        
        if (!selectedConnection || selectedConnection.status !== 'Running') {
            showError('Please start the selected connection before running speed test.');
            return;
        }

        // Reset previous results
        resetSpeedTestUI();
        resetCharts();

        // Start the test with selected connection
        await authenticatedFetch('/api/speed-test', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId: selectedConnectionId })
        });

        // Start polling for results
        startSpeedTestBtn.disabled = true;
        resetSpeedTestBtn.disabled = true;
        speedTestError.classList.remove('show');

        if (speedTestInterval) clearInterval(speedTestInterval);
        speedTestInterval = setInterval(updateSpeedTestResults, 500);
    } catch (error) {
        console.error('Failed to start speed test:', error);
        showError(error.message || 'Failed to start speed test');
    }
}

async function updateSpeedTestResults() {
    try {
        const response = await authenticatedFetch('/api/speed-test');
        const data = await response.json();
        const result = data.result;

        // Update phase and progress
        if (speedTestPhase) speedTestPhase.textContent = result.phase;
        if (speedTestProgress) speedTestProgress.style.width = result.progress + '%';
        if (speedTestProgressText) speedTestProgressText.textContent = Math.round(result.progress) + '%';

        // Update metrics
        if (downloadSpeedEl) downloadSpeedEl.textContent = result.downloadSpeed.toFixed(2);
        if (uploadSpeedEl) uploadSpeedEl.textContent = result.uploadSpeed.toFixed(2);
        if (pingValueEl) pingValueEl.textContent = result.ping.toFixed(0);
        if (jitterValueEl) jitterValueEl.textContent = result.jitter.toFixed(0);

        // Update charts with current values
        if (result.downloadSpeed > 0) updateChart('downloadChart', result.downloadSpeed);
        if (result.uploadSpeed > 0) updateChart('uploadChart', result.uploadSpeed);
        if (result.ping > 0) updateChart('pingChart', result.ping);
        if (result.jitter > 0) updateChart('jitterChart', result.jitter);

        // Check if test is complete or failed
        if (result.status === 'completed' || result.status === 'failed') {
            clearInterval(speedTestInterval);
            speedTestInterval = null;
            startSpeedTestBtn.disabled = false;
            resetSpeedTestBtn.disabled = false;

            if (result.status === 'failed' && result.error) {
                showError(result.error);
            }
        }
    } catch (error) {
        console.error('Failed to fetch speed test results:', error);
    }
}

function resetSpeedTestUI() {
    if (speedTestPhase) speedTestPhase.textContent = 'Ready';
    if (speedTestProgress) speedTestProgress.style.width = '0%';
    if (speedTestProgressText) speedTestProgressText.textContent = '0%';
    if (downloadSpeedEl) downloadSpeedEl.textContent = '0.00';
    if (uploadSpeedEl) uploadSpeedEl.textContent = '0.00';
    if (pingValueEl) pingValueEl.textContent = '0';
    if (jitterValueEl) jitterValueEl.textContent = '0';
    speedTestError.classList.remove('show');
}

async function resetSpeedTest() {
    try {
        await authenticatedFetch('/api/speed-test/reset', { method: 'POST' });
        resetSpeedTestUI();
        resetCharts();
    } catch (error) {
        console.error('Failed to reset speed test:', error);
    }
}

function showError(message) {
    if (speedTestError) {
        speedTestError.textContent = message;
        speedTestError.classList.add('show');
    }
}

// Speed test event listeners
if (startSpeedTestBtn) {
    startSpeedTestBtn.addEventListener('click', startSpeedTest);
}
if (resetSpeedTestBtn) {
    resetSpeedTestBtn.addEventListener('click', resetSpeedTest);
}

// Initialize charts when page loads
document.addEventListener('DOMContentLoaded', () => {
    initSpeedTestCharts();
});

// ==================== Connection Management Functions ====================

async function updateConnectionsList() {
    try {
        const response = await authenticatedFetch('/api/connections');
        const data = await response.json();
        const connections = data.connections || [];

        if (connections.length === 0) {
            connectionsList.style.display = 'none';
            noConnectionsMessage.style.display = 'block';
            return;
        }

        connectionsList.style.display = 'flex';
        noConnectionsMessage.style.display = 'none';

        connectionsList.innerHTML = '';

        connections.forEach((connection, index) => {
            const card = document.createElement('div');
            card.className = 'connection-card';
            card.dataset.id = connection.id;
            card.draggable = true;

            const statusClass = connection.status.toLowerCase();
            const statusText = connection.status;
            const duration = connection.connectionStartTime 
                ? formatDuration(Date.now() - connection.connectionStartTime)
                : '-';

            card.innerHTML = `
                <div class="connection-card-header">
                    <div class="connection-card-title">
                        <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
                        <div class="connection-status-indicator ${statusClass}"></div>
                        ${connection.name}
                    </div>
                </div>
                <div class="connection-card-info">
                    <div class="connection-info-item">
                        <span class="connection-info-label">Status</span>
                        <span class="connection-info-value status-${statusClass}">${statusText}</span>
                    </div>
                    <div class="connection-info-item">
                        <span class="connection-info-label">Port</span>
                        <div class="port-input-container">
                            <input 
                                type="number" 
                                class="connection-port-input" 
                                value="${connection.port}"
                                data-connection-id="${connection.id}"
                                min="1024"
                                max="65535"
                                ${connection.status === 'Running' ? 'disabled' : ''}
                            />
                            <button 
                                class="port-save-btn" 
                                onclick="saveConnectionPort('${connection.id}')"
                                ${connection.status === 'Running' ? 'disabled' : ''}
                            >Save</button>
                        </div>
                    </div>
                    <div class="connection-info-item">
                        <span class="connection-info-label">Duration</span>
                        <span class="connection-info-value">${duration}</span>
                    </div>
                </div>
                ${connection.error ? `<div class="connection-error-message">${connection.error}</div>` : ''}
                <div class="connection-card-actions">
                    <button class="connection-action-btn connection-start-btn" onclick="startConnection('${connection.id}')" ${connection.status === 'Running' || connection.status === 'Starting' ? 'disabled' : ''}>Start</button>
                    <button class="connection-action-btn connection-stop-btn" onclick="stopConnection('${connection.id}')" ${connection.status === 'Stopped' ? 'disabled' : ''}>Stop</button>
                    <button class="connection-action-btn connection-restart-btn" onclick="restartConnection('${connection.id}')" ${connection.status === 'Stopped' ? 'disabled' : ''}>Restart</button>
                    <button class="connection-action-btn connection-remove-btn" onclick="removeConnection('${connection.id}')">Remove</button>
                </div>
            `;

            // Add drag and drop handlers
            card.addEventListener('dragstart', handleDragStart);
            card.addEventListener('dragend', handleDragEnd);
            card.addEventListener('dragover', handleDragOver);
            card.addEventListener('drop', handleDrop);
            card.addEventListener('dragleave', handleDragLeave);

            connectionsList.appendChild(card);
        });
    } catch (error) {
        console.error('Failed to fetch connections:', error);
    }
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

async function startConnection(id) {
    try {
        await authenticatedFetch(`/api/connections/${id}/start`, { method: 'POST' });
        updateConnectionsList();
    } catch (error) {
        console.error('Failed to start connection:', error);
        alert('Failed to start connection');
    }
}

async function stopConnection(id) {
    try {
        await authenticatedFetch(`/api/connections/${id}/stop`, { method: 'POST' });
        updateConnectionsList();
    } catch (error) {
        console.error('Failed to stop connection:', error);
        alert('Failed to stop connection');
    }
}

async function restartConnection(id) {
    try {
        await authenticatedFetch(`/api/connections/${id}/restart`, { method: 'POST' });
        updateConnectionsList();
    } catch (error) {
        console.error('Failed to restart connection:', error);
        alert('Failed to restart connection');
    }
}

async function removeConnection(id) {
    if (!confirm('Are you sure you want to remove this connection from the list?')) return;
    try {
        await authenticatedFetch(`/api/connections/${id}`, { method: 'DELETE' });
        updateConnectionsList();
    } catch (error) {
        console.error('Failed to remove connection:', error);
        alert('Failed to remove connection');
    }
}

async function saveConnectionPort(id) {
    const input = document.querySelector(`input[data-connection-id="${id}"]`);
    const newPort = parseInt(input.value);
    
    if (isNaN(newPort) || newPort < 1024 || newPort > 65535) {
        alert('Please enter a valid port number (1024-65535)');
        return;
    }
    
    try {
        const response = await authenticatedFetch(`/api/connections/${id}/port`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ basePort: newPort })
        });
        const data = await response.json();
        if (data.error) {
            alert(data.error);
        } else {
            // Success - list will refresh automatically
            updateConnectionsList();
        }
    } catch (error) {
        console.error('Failed to update port:', error);
        alert('Failed to update port');
    }
}

async function startAllConnections() {
    try {
        await authenticatedFetch('/api/connections/start-all', { method: 'POST' });
        updateConnectionsList();
    } catch (error) {
        console.error('Failed to start all connections:', error);
        alert('Failed to start all connections');
    }
}

async function stopAllConnections() {
    try {
        await authenticatedFetch('/api/connections/stop-all', { method: 'POST' });
        updateConnectionsList();
    } catch (error) {
        console.error('Failed to stop all connections:', error);
        alert('Failed to stop all connections');
    }
}

// Drag and drop handlers
let draggedItem = null;

function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.connection-card').forEach(card => {
        card.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    this.classList.add('drag-over');
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

async function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');

    if (draggedItem !== this) {
        const cards = Array.from(connectionsList.querySelectorAll('.connection-card'));
        const fromIndex = cards.indexOf(draggedItem);
        const toIndex = cards.indexOf(this);

        // Reorder in DOM
        if (fromIndex < toIndex) {
            this.parentNode.insertBefore(draggedItem, this.nextSibling);
        } else {
            this.parentNode.insertBefore(draggedItem, this);
        }

        // Get new order and send to server
        const newOrder = Array.from(connectionsList.querySelectorAll('.connection-card'))
            .map(card => card.dataset.id);

        try {
            await authenticatedFetch('/api/connections/reorder', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: newOrder })
            });
            updateConnectionsList();
        } catch (error) {
            console.error('Failed to reorder connections:', error);
            updateConnectionsList(); // Revert on error
        }
    }
}

// Connection management event listeners
if (startAllConnectionsBtn) {
    startAllConnectionsBtn.addEventListener('click', startAllConnections);
}
if (stopAllConnectionsBtn) {
    stopAllConnectionsBtn.addEventListener('click', stopAllConnections);
}

// Polling
setInterval(updateStatusSummary, 2000);
setInterval(updateLogs, 1000);
setInterval(updateLatencyResults, 1000); // Slower polling for configs to avoid editor flickering
setInterval(updateConnectionsList, 3000); // Poll connections list

// Initial load
updateStatusSummary();
updateLogs();
setTimeout(updateLatencyResults, 1000); // Wait for Monaco to load
setTimeout(updateConnectionsList, 500); // Load connections list

// Go to Connections button
if (goToConnectionsBtn) {
    goToConnectionsBtn.addEventListener('click', () => {
        document.querySelector('[data-tab="connections-tab"]').click();
    });
}

// ==================== Server Resources Functions ====================

// Resource monitoring elements
const ramUsageEl = document.getElementById('ramUsage');
const ramProgressEl = document.getElementById('ramProgress');
const ramUsedEl = document.getElementById('ramUsed');
const ramTotalEl = document.getElementById('ramTotal');

const cpuUsageEl = document.getElementById('cpuUsage');
const cpuProgressEl = document.getElementById('cpuProgress');
const cpuCoresEl = document.getElementById('cpuCores');

const diskUsageEl = document.getElementById('diskUsage');
const diskProgressEl = document.getElementById('diskProgress');
const diskUsedEl = document.getElementById('diskUsed');
const diskTotalEl = document.getElementById('diskTotal');

const networkConnectionsEl = document.getElementById('networkConnections');
const networkInboundEl = document.getElementById('networkInbound');
const networkOutboundEl = document.getElementById('networkOutbound');
const resourcesLastUpdatedEl = document.getElementById('resourcesLastUpdated');
const refreshResourcesBtn = document.getElementById('refreshResourcesBtn');

// Format bytes to human readable
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format number with comma separators
function formatNumber(num) {
    return num.toLocaleString();
}

// Update resource card warning/critical state
function updateResourceState(elementId, percentage) {
    const card = document.querySelector(`.resource-card:has(#${elementId})`);
    if (!card) return;
    
    card.classList.remove('warning', 'critical');
    if (percentage >= 90) {
        card.classList.add('critical');
    } else if (percentage >= 75) {
        card.classList.add('warning');
    }
}

// Fetch and update server resources
async function updateServerResources() {
    try {
        const response = await authenticatedFetch('/api/resources');
        const data = await response.json();
        
        // Update RAM
        if (data.memory) {
            const { used, total, percentage } = data.memory;
            const totalGB = (total / (1024 * 1024 * 1024)).toFixed(1);
            const usedGB = (used / (1024 * 1024 * 1024)).toFixed(2);
            
            if (ramUsageEl) ramUsageEl.textContent = percentage + '%';
            if (ramProgressEl) ramProgressEl.style.width = percentage + '%';
            if (ramUsedEl) ramUsedEl.textContent = usedGB + ' GB';
            if (ramTotalEl) ramTotalEl.textContent = '/ ' + totalGB + ' GB';
            
            updateResourceState('ramProgress', percentage);
        }
        
        // Update CPU
        if (data.cpu) {
            const { usage, cores } = data.cpu;
            
            if (cpuUsageEl) cpuUsageEl.textContent = usage + '%';
            if (cpuProgressEl) cpuProgressEl.style.width = usage + '%';
            if (cpuCoresEl) cpuCoresEl.textContent = cores + ' Core' + (cores > 1 ? 's' : '');
            
            updateResourceState('cpuProgress', usage);
        }
        
        // Update Disk
        if (data.disk) {
            const { used, total, percentage } = data.disk;
            const totalGB = (total / (1024 * 1024 * 1024)).toFixed(1);
            const usedGB = (used / (1024 * 1024 * 1024)).toFixed(2);
            
            if (diskUsageEl) diskUsageEl.textContent = percentage + '%';
            if (diskProgressEl) diskProgressEl.style.width = percentage + '%';
            if (diskUsedEl) usedGB + ' GB';
            if (diskTotalEl) '/ ' + totalGB + ' GB';
            
            updateResourceState('diskProgress', percentage);
        }
        
        // Update Network
        if (data.network) {
            const { connections, inbound, outbound } = data.network;
            
            if (networkConnectionsEl) networkConnectionsEl.textContent = formatNumber(connections);
            if (networkInboundEl) networkInboundEl.textContent = formatBytes(inbound);
            if (networkOutboundEl) networkOutboundEl.textContent = formatBytes(outbound);
        }
        
        // Update timestamp
        if (resourcesLastUpdatedEl) {
            const now = new Date();
            resourcesLastUpdatedEl.textContent = now.toLocaleTimeString();
        }
        
    } catch (error) {
        console.error('Failed to fetch server resources:', error);
        // Set default values on error
        if (ramUsageEl) ramUsageEl.textContent = '--';
        if (cpuUsageEl) cpuUsageEl.textContent = '--';
        if (diskUsageEl) diskUsageEl.textContent = '--';
        if (networkConnectionsEl) networkConnectionsEl.textContent = '--';
    }
}

// Refresh button click handler
if (refreshResourcesBtn) {
    refreshResourcesBtn.addEventListener('click', () => {
        refreshResourcesBtn.disabled = true;
        refreshResourcesBtn.textContent = '⏳';
        updateServerResources().then(() => {
            setTimeout(() => {
                refreshResourcesBtn.disabled = false;
                refreshResourcesBtn.textContent = '🔄 Refresh';
            }, 500);
        });
    });
}

// Initial load and polling for resources
if (resourcesLastUpdatedEl) {
    updateServerResources();
    setInterval(updateServerResources, 5000); // Update every 5 seconds
}

