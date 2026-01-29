const statusDisplay = document.getElementById('status-display');
const activeConfigNameEl = document.getElementById('active-config-name');
const currentLatencyEl = document.getElementById('current-latency');
const toggleServiceBtn = document.getElementById('toggleServiceBtn');
const connectionTimerEl = document.getElementById('connectionTimer');
const logViewer = document.getElementById('logViewer');
const testLatencyBtn = document.getElementById('testLatencyBtn');
const testLatencyBtnQuick = document.getElementById('testLatencyBtnQuick');
const testStatus = document.getElementById('testStatus');
const accordionContainer = document.getElementById('accordionContainer');
const newConfigNameInput = document.getElementById('newConfigName');
const addConfigBtn = document.getElementById('addConfigBtn');
const logoutBtn = document.getElementById('logoutBtn');

let mainEditor;
let activeConfigName = null;
let currentStatus = 'Stopped';
let configEditors = {}; // Store editor instances for accordion items
let connectionStartTime = null;
let connectionTimerInterval = null;

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
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
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
    if (connectionTimerEl) {
        connectionTimerEl.textContent = '';
    }
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
    
    if (connectionTimerEl) {
        connectionTimerEl.textContent = timeString;
    }
}

async function updateStatus() {
    try {
        const response = await authenticatedFetch('/api/status');
        const data = await response.json();
        
        const previousStatus = currentStatus;
        currentStatus = data.status;
        const statusClass = 'status-' + currentStatus.toLowerCase();
        
        if (statusDisplay) {
            statusDisplay.textContent = currentStatus === 'Running' ? 'Connected' : 'Disconnected';
            statusDisplay.className = statusClass;
        }

        if (toggleServiceBtn) {
            const buttonText = toggleServiceBtn.querySelector('.button-text');
            const buttonIcon = toggleServiceBtn.querySelector('.button-icon');
            
            // Remove all state classes
            toggleServiceBtn.classList.remove('connected', 'connecting');
            
            if (currentStatus === 'Running') {
                if (buttonText) buttonText.textContent = 'Disconnect';
                if (buttonIcon) buttonIcon.textContent = '⏹';
                toggleServiceBtn.classList.add('connected');
                toggleServiceBtn.disabled = false;
                
                // Use persisted connection start time if available
                if (data.connectionStartTime && !connectionStartTime) {
                    connectionStartTime = data.connectionStartTime;
                }
                
                // Start timer if not already running
                if (previousStatus !== 'Running') {
                    startConnectionTimer();
                }
            } else if (currentStatus === 'Starting') {
                if (buttonText) buttonText.textContent = 'Connecting...';
                if (buttonIcon) buttonIcon.textContent = '⏳';
                toggleServiceBtn.classList.add('connecting');
                toggleServiceBtn.disabled = true;
                
                // Stop timer when starting
                stopConnectionTimer();
            } else {
                if (buttonText) buttonText.textContent = 'Connect';
                if (buttonIcon) buttonIcon.textContent = '▶';
                toggleServiceBtn.disabled = false;
                
                // Stop timer when stopped
                stopConnectionTimer();
            }
        }

        if (activeConfigNameEl) {
            activeConfigNameEl.textContent = data.activeConfig || '-';
        }
        
        if (activeConfigName !== data.activeConfig) {
            activeConfigName = data.activeConfig;
            updateLatencyResults();
        }
    } catch (error) {
        console.error('Failed to fetch status:', error);
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

toggleServiceBtn.addEventListener('click', async () => {
    try {
        const endpoint = currentStatus === 'Running' ? '/api/stop' : '/api/start';
        await authenticatedFetch(endpoint, { method: 'POST' });
        // Update status immediately for better UX
        updateStatus();
    } catch (error) {
        console.error('Failed to toggle service:', error);
    }
});

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
    try {
        const response = await authenticatedFetch('/api/test-results');
        const data = await response.json();
        
        const isTesting = data.isTesting;
        testLatencyBtn.disabled = isTesting;
        if (testLatencyBtnQuick) testLatencyBtnQuick.disabled = isTesting;
        testStatus.textContent = isTesting ? 'Testing in progress...' : '';

        const configsResponse = await authenticatedFetch('/api/configs');
        const configsData = await configsResponse.json();

        // Update current latency in status tab
        if (activeConfigName && currentLatencyEl) {
            const activeResult = data.results.find(r => r.id === activeConfigName);
            if (activeResult) {
                currentLatencyEl.textContent = activeResult.latency === 'FAILED' ? 'FAILED' : activeResult.latency + ' ms';
                currentLatencyEl.className = activeResult.latency === 'FAILED' ? 'status-stopped' : (activeResult.latency < 500 ? 'status-running' : '');
            } else {
                currentLatencyEl.textContent = '-';
                currentLatencyEl.className = '';
            }
        }

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
            const latencyClass = result ? (result.latency === 'FAILED' ? 'bad' : (result.latency < 500 ? 'good' : '')) : '';

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
                        <button class="switch-btn" onclick="event.stopPropagation(); switchConfig('${id}')">Switch</button>
                        <button class="delete-btn" onclick="event.stopPropagation(); deleteConfig('${id}')">Delete</button>
                    </div>
                </div>
                <div class="accordion-content">
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
            item.classList.toggle('active');
            // Trigger layout for the editor inside
            if (configEditors[name]) {
                configEditors[name].layout();
            }
        }
    });
}

async function switchConfig(id) {
    try {
        const response = await authenticatedFetch('/api/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await response.json();
        // alert(data.message || data.error);
        updateStatus();
    } catch (error) {
        console.error('Failed to switch config:', error);
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

async function saveConfig(name) {
    const editor = configEditors[name];
    if (!editor) return;

    let config;
    try {
        config = JSON.parse(editor.getValue());
    } catch (e) {
        alert('Invalid JSON config');
        return;
    }

    try {
        const response = await authenticatedFetch(`/api/configs/${name}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config })
        });
        const data = await response.json();
        if (data.error) {
            alert(data.error);
        } else {
            // alert(`Config "${name}" updated successfully`);
            updateLatencyResults();
        }
    } catch (error) {
        console.error('Failed to update config:', error);
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
if (testLatencyBtnQuick) testLatencyBtnQuick.addEventListener('click', runLatencyTest);

// Polling
setInterval(updateStatus, 2000);
setInterval(updateLogs, 3000);
setInterval(updateLatencyResults, 10000); // Slower polling for configs to avoid editor flickering

// Initial load
updateStatus();
updateLogs();
setTimeout(updateLatencyResults, 1000); // Wait for Monaco to load
