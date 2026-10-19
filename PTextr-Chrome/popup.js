// popup.js - PTextr Minimal Settings & Setup Manager

const DEFAULT_ENDPOINT = 'https://ptextr.onrender.com/api/process/';
const LOCAL_ENDPOINT = 'http://127.0.0.1:8000/api/process/';
const WEBSITE_URL = 'https://ptextr.onrender.com/';

/**
 * Normalizes an API endpoint to ensure valid protocol and trailing slash for Django DRF
 */
function normalizeEndpoint(rawEndpoint) {
    if (!rawEndpoint || typeof rawEndpoint !== 'string') {
        return DEFAULT_ENDPOINT;
    }
    const trimmed = rawEndpoint.trim();
    if (!trimmed) return DEFAULT_ENDPOINT;

    try {
        const url = new URL(trimmed);
        if (!url.pathname.endsWith('/')) {
            url.pathname += '/';
        }
        return url.toString();
    } catch {
        return trimmed;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Element references
    const openWebsiteBtn = document.getElementById('openWebsiteBtn');
    const tokenInput = document.getElementById('tokenInput');
    const toggleTokenVisibilityBtn = document.getElementById('toggleTokenVisibility');
    const visibilityIcon = document.getElementById('visibilityIcon');
    const saveBtn = document.getElementById('saveBtn');
    const saveBtnText = document.getElementById('saveBtnText');
    const btnSpinner = document.getElementById('btnSpinner');

    const statusPill = document.getElementById('statusPill');
    const statusLabel = document.getElementById('statusLabel');

    const statusBanner = document.getElementById('statusBanner');
    const statusIcon = document.getElementById('statusIcon');
    const statusMsg = document.getElementById('statusMsg');

    const endpointInput = document.getElementById('endpointInput');
    const presetProdBtn = document.getElementById('presetProd');
    const presetLocalBtn = document.getElementById('presetLocal');

    // 2. Status updater
    function updateStatus(state, message, iconChar = '⚡') {
        statusBanner.className = `status-banner ${state}`;
        statusIcon.textContent = iconChar;
        statusMsg.textContent = message;

        switch (state) {
            case 'connected':
                statusPill.className = 'status-pill status-connected';
                statusLabel.textContent = 'Connected';
                break;
            case 'loading':
                statusPill.className = 'status-pill status-loading';
                statusLabel.textContent = 'Verifying...';
                break;
            case 'error':
                statusPill.className = 'status-pill status-error';
                statusLabel.textContent = 'Error';
                break;
            default:
                statusPill.className = 'status-pill status-ready';
                statusLabel.textContent = 'Ready';
                break;
        }
    }

    // 3. Load saved settings
    async function loadSettings() {
        try {
            const data = await chrome.storage.local.get(['extensionToken', 'apiEndpoint']);
            const token = data.extensionToken ? data.extensionToken.trim() : '';

            if (token) {
                tokenInput.value = token;
                updateStatus('connected', 'Token configured. Ready to transform text.', '✅');
            } else {
                updateStatus('ready', 'Click "Visit PTextr Website" to get your token.', '⚡');
            }

            if (endpointInput) {
                endpointInput.value = data.apiEndpoint || DEFAULT_ENDPOINT;
            }
        } catch (error) {
            updateStatus('error', 'Unable to retrieve settings from storage.', '⚠️');
        }
    }

    /**
     * Ensures host permissions are granted for the given endpoint.
     * In Firefox/Chrome MV3, requesting host permissions during user gesture ensures cross-origin access.
     */
    async function ensureHostPermission(endpointUrl) {
        try {
            const urlObj = new URL(endpointUrl);
            const originPattern = `${urlObj.origin}/*`;
            const api = (typeof browser !== 'undefined' && browser.permissions) ? browser : (typeof chrome !== 'undefined' && chrome.permissions ? chrome : null);
            if (!api || !api.permissions) return true;

            // Check if origin permission is already granted
            const hasPermission = await new Promise((resolve) => {
                try {
                    const res = api.permissions.contains({ origins: [originPattern] }, (granted) => {
                        if (typeof granted !== 'undefined') resolve(granted);
                    });
                    if (res && typeof res.then === 'function') {
                        res.then(resolve).catch(() => resolve(false));
                    }
                } catch {
                    resolve(false);
                }
            });

            if (hasPermission) return true;

            // Request permission during user click gesture
            const granted = await new Promise((resolve) => {
                try {
                    const res = api.permissions.request({ origins: [originPattern] }, (allowed) => {
                        if (typeof allowed !== 'undefined') resolve(allowed);
                    });
                    if (res && typeof res.then === 'function') {
                        res.then(resolve).catch(() => resolve(false));
                    }
                } catch {
                    resolve(false);
                }
            });

            return !!granted;
        } catch (e) {
            console.warn('[PTextr] Permission check error:', e);
            return true;
        }
    }

    // 4. Save and Verify Token
    async function saveAndVerify() {
        const token = tokenInput.value.trim();
        const rawEndpoint = endpointInput ? endpointInput.value.trim() : DEFAULT_ENDPOINT;
        const endpoint = normalizeEndpoint(rawEndpoint || DEFAULT_ENDPOINT);

        if (!token) {
            updateStatus('error', 'Please enter your extension token before saving.', '⚠️');
            tokenInput.focus();
            return;
        }

        try {
            new URL(endpoint);
        } catch {
            updateStatus('error', 'Invalid API endpoint URL. Please check advanced settings.', '⚠️');
            return;
        }

        // Show loading state
        saveBtn.disabled = true;
        btnSpinner.style.display = 'inline-block';
        saveBtnText.textContent = 'Verifying...';
        updateStatus('loading', 'Connecting to PTextr backend...', '⏳');

        // Persist settings first
        try {
            await chrome.storage.local.set({
                extensionToken: token,
                apiEndpoint: endpoint
            });
            if (endpointInput) {
                endpointInput.value = endpoint;
            }
        } catch {
            // Non-critical, continue verification
        }

        // Ensure host permission is granted
        const hasPermission = await ensureHostPermission(endpoint);
        if (!hasPermission) {
            saveBtn.disabled = false;
            btnSpinner.style.display = 'none';
            saveBtnText.textContent = 'Save & Connect';
            let hostName = 'backend';
            try { hostName = new URL(endpoint).host; } catch {}
            updateStatus('error', `Permission required: Please allow access to ${hostName} when prompted, or enable it in browser extension permissions.`, '⚠️');
            return;
        }

        // Send verify ping to background service worker
        try {
            chrome.runtime.sendMessage({
                action: 'testConnection',
                endpoint: endpoint,
                token: token
            }, (response) => {
                saveBtn.disabled = false;
                btnSpinner.style.display = 'none';
                saveBtnText.textContent = 'Save & Connect';

                if (chrome.runtime.lastError) {
                    updateStatus('error', chrome.runtime.lastError.message, '⚠️');
                    return;
                }

                if (response && response.success) {
                    updateStatus('connected', 'Token verified & ready! Type ;command; to transform text.', '✅');
                } else {
                    const errorMsg = (response && response.error) ? response.error : 'Connection verification failed.';
                    updateStatus('error', errorMsg, '⚠️');
                }
            });
        } catch (err) {
            saveBtn.disabled = false;
            btnSpinner.style.display = 'none';
            saveBtnText.textContent = 'Save & Connect';
            updateStatus('error', 'Unable to communicate with background service worker.', '⚠️');
        }
    }

    // 5. Event Listeners
    if (openWebsiteBtn) {
        openWebsiteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: WEBSITE_URL });
        });
    }

    toggleTokenVisibilityBtn.addEventListener('click', () => {
        if (tokenInput.type === 'password') {
            tokenInput.type = 'text';
            visibilityIcon.textContent = '🔒';
        } else {
            tokenInput.type = 'password';
            visibilityIcon.textContent = '👁️';
        }
    });

    saveBtn.addEventListener('click', saveAndVerify);

    tokenInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            saveAndVerify();
        }
    });

    if (presetProdBtn) {
        presetProdBtn.addEventListener('click', () => {
            if (endpointInput) endpointInput.value = DEFAULT_ENDPOINT;
        });
    }

    if (presetLocalBtn) {
        presetLocalBtn.addEventListener('click', () => {
            if (endpointInput) endpointInput.value = LOCAL_ENDPOINT;
        });
    }

    // Initial load
    loadSettings();
});