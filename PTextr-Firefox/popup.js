// popup.js - PTextr Material 3 Settings & Connection Manager

const DEFAULT_ENDPOINT = 'http://127.0.0.1:8000/api/process/';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Element references
    const tokenInput = document.getElementById('tokenInput');
    const endpointInput = document.getElementById('endpointInput');
    const toggleTokenVisibilityBtn = document.getElementById('toggleTokenVisibility');
    const visibilityIcon = document.getElementById('visibilityIcon');
    const presetLocalBtn = document.getElementById('presetLocal');
    const presetClearBtn = document.getElementById('presetClear');
    const saveBtn = document.getElementById('saveBtn');
    const testBtn = document.getElementById('testBtn');
    const testBtnText = document.getElementById('testBtnText');
    const btnSpinner = document.getElementById('btnSpinner');

    // Status Card references
    const statusCard = document.getElementById('statusCard');
    const statusIcon = document.getElementById('statusIcon');
    const statusTitle = document.getElementById('statusTitle');
    const statusBody = document.getElementById('statusBody');

    // 2. Material 3 Status Card Updater
    function updateStatus(state, title, message) {
        statusCard.className = `m3-status-card ${state}`;
        statusTitle.textContent = title;
        statusBody.textContent = message;

        switch (state) {
            case 'success':
                statusIcon.textContent = '✅';
                break;
            case 'error':
                statusIcon.textContent = '⚠️';
                break;
            case 'info':
                statusIcon.textContent = '⏳';
                break;
            default:
                statusIcon.textContent = '⚡';
                break;
        }
    }

    // 3. Load saved settings from Chrome extension storage
    async function loadSettings() {
        try {
            const data = await chrome.storage.local.get(['extensionToken', 'apiEndpoint']);

            if (data.extensionToken) {
                tokenInput.value = data.extensionToken;
            }

            endpointInput.value = data.apiEndpoint || DEFAULT_ENDPOINT;
        } catch (error) {
            updateStatus('error', 'Storage Error', 'Unable to retrieve saved settings from browser.');
        }
    }

    // 4. Save settings
    async function saveSettings() {
        const token = tokenInput.value.trim();
        const endpoint = endpointInput.value.trim() || DEFAULT_ENDPOINT;

        try {
            await chrome.storage.local.set({
                extensionToken: token,
                apiEndpoint: endpoint
            });

            endpointInput.value = endpoint;
            updateStatus('success', 'Settings Saved', 'Token and endpoint successfully stored.');
        } catch (error) {
            updateStatus('error', 'Save Failed', 'Could not persist settings to extension storage.');
        }
    }

    // 5. Test Connection to Django Backend
    async function testConnection() {
        const token = tokenInput.value.trim();
        const endpoint = endpointInput.value.trim() || DEFAULT_ENDPOINT;

        if (!token) {
            updateStatus('error', 'Token Required', 'Please enter your extension token before testing.');
            tokenInput.focus();
            return;
        }

        // Show loading state
        testBtn.disabled = true;
        btnSpinner.style.display = 'inline-block';
        testBtnText.textContent = 'Testing...';
        updateStatus('info', 'Connecting', 'Sending verification ping to Django backend...');

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: 'Connection test',
                    command: 'test',
                    token: token
                })
            });

            if (response.ok) {
                updateStatus('success', 'Connected', 'Backend verified! Ready to transform text.');
            } else if (response.status === 401) {
                updateStatus('error', 'Unauthorized (401)', 'Invalid extension token. Check your backend credentials.');
            } else if (response.status === 403) {
                updateStatus('error', 'Forbidden (403)', 'CSRF or permissions check failed. Ensure view allows token access.');
            } else if (response.status === 404) {
                updateStatus('error', 'Not Found (404)', 'Endpoint URL not found. Verify your Django URL pattern.');
            } else if (response.status >= 500) {
                updateStatus('error', `Server Error (${response.status})`, 'Django backend encountered an internal error.');
            } else {
                updateStatus('error', `HTTP Error (${response.status})`, `Backend returned status ${response.status}.`);
            }
        } catch (err) {
            updateStatus('error', 'Connection Failed', `Unable to reach ${endpoint}. Check that your Django server is running.`);
        } finally {
            testBtn.disabled = false;
            btnSpinner.style.display = 'none';
            testBtnText.textContent = 'Test Connection';
        }
    }

    // 6. Event Listeners
    toggleTokenVisibilityBtn.addEventListener('click', () => {
        if (tokenInput.type === 'password') {
            tokenInput.type = 'text';
            visibilityIcon.textContent = '🔒';
        } else {
            tokenInput.type = 'password';
            visibilityIcon.textContent = '👁️';
        }
    });

    presetLocalBtn.addEventListener('click', () => {
        endpointInput.value = DEFAULT_ENDPOINT;
    });

    presetClearBtn.addEventListener('click', () => {
        endpointInput.value = '';
        endpointInput.focus();
    });

    saveBtn.addEventListener('click', saveSettings);
    testBtn.addEventListener('click', testConnection);

    // Initial load
    loadSettings();
});