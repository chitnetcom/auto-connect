const statusEl = document.getElementById('status');
const statusDisplay = document.getElementById('status-display');
const activeConfigNameEl = document.getElementById('active-config-name');
const currentLatencyEl = document.getElementById('current-latency');
const toggleServiceBtn = document.getElementById('toggleServiceBtn');
const logViewer = document.getElementById('logViewer');
const testLatencyBtn = document.getElementById('testLatencyBtn');
const testLatencyBtnQuick = document.getElementById('testLatencyBtnQuick');
const testStatus = document.getElementById('testStatus');
const accordionContainer = document.getElementById('accordionContainer');
const newConfigNameInput = document.getElementById('newConfigName');
const addConfigBtn = document.getElementById('addConfigBtn');

let mainEditor;
let activeConfigName = null;
let currentStatus = 'Stopped';
let configEditors = {}; // Store editor instances for accordion items

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

async function updateStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        
        currentStatus = data.status;
        const statusClass = 'status-' + currentStatus.toLowerCase();
        
        statusEl.textContent = currentStatus;
        statusEl.className = statusClass;
        
        if (statusDisplay) {
            statusDisplay.textContent = currentStatus;
            statusDisplay.className = statusClass;
        }

        if (toggleServiceBtn) {
            if (currentStatus === 'Running') {
                toggleServiceBtn.textContent = 'Stop Service';
                toggleServiceBtn.className = 'btn-danger';
            } else if (currentStatus === 'Starting') {
                toggleServiceBtn.textContent = 'Starting...';
                toggleServiceBtn.className = 'btn-warning';
                toggleServiceBtn.disabled = true;
            } else {
                toggleServiceBtn.textContent = 'Start Service';
                toggleServiceBtn.className = 'btn-success';
                toggleServiceBtn.disabled = false;
            }
        }

        if (activeConfigNameEl) {
            activeConfigNameEl.textContent = data.activeConfig || 'None';
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
        const response = await fetch('/api/logs');
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
        await fetch(endpoint, { method: 'POST' });
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
        const response = await fetch('/api/configs', {
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
        const response = await fetch('/api/test-results');
        const data = await response.json();
        
        const isTesting = data.isTesting;
        testLatencyBtn.disabled = isTesting;
        if (testLatencyBtnQuick) testLatencyBtnQuick.disabled = isTesting;
        testStatus.textContent = isTesting ? 'Testing in progress...' : '';

        const configsResponse = await fetch('/api/configs');
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
        const response = await fetch('/api/switch', {
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
        const response = await fetch(`/api/configs/${name}`, { method: 'DELETE' });
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
        const response = await fetch(`/api/configs/${name}`, {
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
        await fetch('/api/test-latency', { method: 'POST' });
        updateLatencyResults();
    } catch (error) {
        console.error('Failed to start latency test:', error);
    }
};

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
