// background.js - Service Worker for PTextr (Manifest V3)

const DEFAULT_ENDPOINT = 'http://127.0.0.1:8000/api/process/';
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds timeout for Gemini text processing

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'processText') {
        (async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

            try {
                // 1. Retrieve stored credentials from extension storage
                const config = await chrome.storage.local.get(['extensionToken', 'apiEndpoint']);
                const token = config.extensionToken ? config.extensionToken.trim() : '';
                const endpoint = config.apiEndpoint ? config.apiEndpoint.trim() : DEFAULT_ENDPOINT;

                if (!token) {
                    sendResponse({
                        success: false,
                        error: 'Extension token is missing. Please open the PTextr popup and save your token.'
                    });
                    return;
                }

                // 2. Validate endpoint format
                try {
                    new URL(endpoint);
                } catch {
                    sendResponse({
                        success: false,
                        error: 'Invalid API endpoint URL. Please check your settings in the PTextr popup.'
                    });
                    return;
                }

                // 3. Send the POST request to the Django endpoint
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        text: message.text,
                        command: message.command,
                        token: token
                    }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                // 4. Handle HTTP responses
                if (response.ok) {
                    let data;
                    try {
                        data = await response.json();
                    } catch {
                        sendResponse({
                            success: false,
                            error: 'Server returned invalid JSON.'
                        });
                        return;
                    }

                    if (data && typeof data.output_text === 'string') {
                        if (data.output_text.trim() === '') {
                            sendResponse({
                                success: false,
                                error: 'AI returned an empty response. Original text kept.'
                            });
                        } else {
                            sendResponse({
                                success: true,
                                outputText: data.output_text
                            });
                        }
                    } else {
                        sendResponse({
                            success: false,
                            error: 'Server response missing output_text field.'
                        });
                    }
                } else if (response.status === 400) {
                    sendResponse({
                        success: false,
                        error: 'Bad Request (400): Backend rejected the request parameters.'
                    });
                } else if (response.status === 401) {
                    sendResponse({
                        success: false,
                        error: 'Authentication failed (401): Invalid extension token.'
                    });
                } else if (response.status === 403) {
                    sendResponse({
                        success: false,
                        error: 'Forbidden (403): CSRF or permission verification failed on backend.'
                    });
                } else if (response.status === 429) {
                    sendResponse({
                        success: false,
                        error: 'Rate limited (429): Too many requests. Please wait a moment.'
                    });
                } else if (response.status >= 500) {
                    sendResponse({
                        success: false,
                        error: `Server error (${response.status}): Django backend failed to process request.`
                    });
                } else {
                    sendResponse({
                        success: false,
                        error: `Backend returned HTTP ${response.status}.`
                    });
                }
            } catch (err) {
                clearTimeout(timeoutId);
                if (err.name === 'AbortError') {
                    sendResponse({
                        success: false,
                        error: 'Request timed out: Server took longer than 30 seconds to respond.'
                    });
                } else {
                    sendResponse({
                        success: false,
                        error: 'Connection error: Unable to reach backend server. Ensure it is running.'
                    });
                }
            }
        })();

        return true; // Keep message channel open for async response
    }
});
