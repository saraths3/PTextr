// background.js - Service Worker for PTextr (Manifest V3)

const DEFAULT_ENDPOINT = 'https://ptextr.onrender.com/api/process/';
const REQUEST_TIMEOUT_MS = 35000; // 35 seconds timeout to accommodate Gemini generation and cold starts

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

/**
 * Safe logging utility conforming to Section 10 constraints:
 * - Request URL
 * - HTTP status code
 * - Request duration
 * - Command identifier
 * - Whether a token is present, represented ONLY as a boolean
 * - Whether the response was valid JSON
 * - Sanitized error message
 * NEVER log tokens, secret keys, auth headers, or user text.
 */
function logRequestMetrics({ url, method, command, hasToken, status, durationMs, isValidJson, error }) {
    console.info('[PTextr API Metrics]', {
        url,
        method,
        command,
        hasToken: !!hasToken,
        status,
        durationMs: Math.round(durationMs),
        isValidJson: !!isValidJson,
        ...(error ? { error: String(error).slice(0, 200) } : {})
    });
}

/**
 * Safely parses backend error responses (both structured JSON and unexpected non-JSON/HTML)
 */
async function parseErrorResponse(response) {
    const status = response.status;
    let bodyText = '';
    try {
        bodyText = await response.text();
    } catch {
        bodyText = '';
    }

    let parsedJson = null;
    if (bodyText) {
        try {
            parsedJson = JSON.parse(bodyText);
        } catch {
            // Non-JSON content (e.g. Render HTML 503/502 page)
        }
    }

    if (parsedJson && typeof parsedJson === 'object') {
        if (typeof parsedJson.error === 'string') {
            return { isJson: true, message: parsedJson.error };
        }
        if (typeof parsedJson.detail === 'string') {
            return { isJson: true, message: parsedJson.detail };
        }
        // Handle DRF serializer validation errors: {"field": ["msg"]}
        const firstKey = Object.keys(parsedJson)[0];
        if (firstKey && Array.isArray(parsedJson[firstKey])) {
            return { isJson: true, message: `${firstKey}: ${parsedJson[firstKey].join(', ')}` };
        }
    }

    // Friendly messages for non-JSON or standard status codes
    if (status === 503) {
        return {
            isJson: false,
            message: 'Service Unavailable (503): Render backend is waking up or AI service is overloaded. Please try again shortly.'
        };
    }
    if (status === 502 || status === 504) {
        return {
            isJson: false,
            message: `Gateway Error (${status}): Server gateway or upstream timed out.`
        };
    }
    if (status === 400) {
        return {
            isJson: false,
            message: 'Bad Request (400): Backend rejected the request parameters.'
        };
    }
    if (status === 401) {
        return {
            isJson: false,
            message: 'Unauthorized (401): Invalid or inactive extension token.'
        };
    }
    if (status === 403) {
        return {
            isJson: false,
            message: 'Forbidden (403): CSRF or permission verification failed.'
        };
    }
    if (status === 404) {
        return {
            isJson: false,
            message: 'Not Found (404): Endpoint path not found. Verify your URL ends with /api/process/.'
        };
    }
    if (status === 429) {
        return {
            isJson: false,
            message: 'Rate Limited (429): Quota exceeded or too many requests. Please wait a moment.'
        };
    }
    if (status >= 500) {
        return {
            isJson: false,
            message: `Server Error (${status}): Backend encountered an error while processing request.`
        };
    }

    return {
        isJson: false,
        message: `Backend returned HTTP ${status}.`
    };
}

/**
 * Executes the POST API request with a single transient retry for 503 cold starts
 */
async function executeApiRequest({ endpoint, text, command, token, timeoutMs = REQUEST_TIMEOUT_MS }) {
    const startTime = Date.now();
    let attempt = 0;
    const maxAttempts = 2; // Initial attempt + at most 1 retry for transient 503

    while (attempt < maxAttempts) {
        attempt++;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    command: command,
                    token: token
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const durationMs = Date.now() - startTime;

            // Handle successful HTTP response
            if (response.ok) {
                let data;
                try {
                    data = await response.json();
                } catch {
                    logRequestMetrics({
                        url: endpoint,
                        method: 'POST',
                        command,
                        hasToken: !!token,
                        status: response.status,
                        durationMs,
                        isValidJson: false,
                        error: 'Server returned invalid JSON.'
                    });
                    return { success: false, error: 'Server returned invalid JSON response.' };
                }

                logRequestMetrics({
                    url: endpoint,
                    method: 'POST',
                    command,
                    hasToken: !!token,
                    status: response.status,
                    durationMs,
                    isValidJson: true
                });

                if (data && typeof data.output_text === 'string') {
                    if (data.output_text.trim() === '') {
                        return { success: false, error: 'AI returned an empty response. Original text kept.' };
                    }
                    return { success: true, outputText: data.output_text };
                }

                return { success: false, error: 'Server response missing output_text field.' };
            }

            // Retry once on transient 503 (e.g. Render cold start or Google server overload)
            if (response.status === 503 && attempt < maxAttempts) {
                console.warn('[PTextr] Received 503 on initial attempt; retrying once after cold-start pause...');
                await new Promise((resolve) => setTimeout(resolve, 2500));
                continue;
            }

            const errorInfo = await parseErrorResponse(response);
            logRequestMetrics({
                url: endpoint,
                method: 'POST',
                command,
                hasToken: !!token,
                status: response.status,
                durationMs,
                isValidJson: errorInfo.isJson,
                error: errorInfo.message
            });

            return { success: false, error: errorInfo.message, status: response.status };

        } catch (err) {
            clearTimeout(timeoutId);
            const durationMs = Date.now() - startTime;

            const errStr = (err.message || '').toLowerCase();

            // Retry once on initial fetch network failure or abort
            if (attempt < maxAttempts && (err.name === 'AbortError' || errStr.includes('fetch') || errStr.includes('network'))) {
                console.warn('[PTextr] Network error on initial attempt; retrying once...');
                await new Promise((resolve) => setTimeout(resolve, 2000));
                continue;
            }

            let errorMsg;
            if (err.name === 'AbortError') {
                errorMsg = `Request timed out (${Math.round(timeoutMs / 1000)}s): Server took too long to respond. Render backend may still be waking up.`;
            } else if (errStr.includes('networkerror') || errStr.includes('failed to fetch')) {
                let host = 'backend';
                try { host = new URL(endpoint).host; } catch {}
                errorMsg = `Connection error: Unable to reach ${host}. Check that backend is running and host permissions are enabled.`;
            } else {
                errorMsg = `Connection error: ${err.message || 'Unable to reach backend server. Ensure it is running.'}`;
            }

            logRequestMetrics({
                url: endpoint,
                method: 'POST',
                command,
                hasToken: !!token,
                status: 0,
                durationMs,
                isValidJson: false,
                error: errorMsg
            });

            return { success: false, error: errorMsg };
        }
    }
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'processText') {
        (async () => {
            try {
                // 1. Retrieve stored credentials from extension storage
                const config = await chrome.storage.local.get(['extensionToken', 'apiEndpoint']);
                const token = config.extensionToken ? config.extensionToken.trim() : '';
                const rawEndpoint = config.apiEndpoint ? config.apiEndpoint.trim() : DEFAULT_ENDPOINT;
                const endpoint = normalizeEndpoint(rawEndpoint);

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

                // 3. Execute request
                const result = await executeApiRequest({
                    endpoint,
                    text: message.text,
                    command: message.command,
                    token,
                    timeoutMs: REQUEST_TIMEOUT_MS
                });

                sendResponse(result);
            } catch (err) {
                sendResponse({
                    success: false,
                    error: `Unexpected background error: ${err.message || 'Unknown error'}`
                });
            }
        })();

        return true; // Keep message channel open for async response
    }

    if (message.action === 'testConnection') {
        (async () => {
            try {
                let token = message.token ? message.token.trim() : '';
                let rawEndpoint = message.endpoint ? message.endpoint.trim() : '';

                // If not provided in message, read from storage
                if (!token || !rawEndpoint) {
                    const config = await chrome.storage.local.get(['extensionToken', 'apiEndpoint']);
                    if (!token) token = config.extensionToken ? config.extensionToken.trim() : '';
                    if (!rawEndpoint) rawEndpoint = config.apiEndpoint ? config.apiEndpoint.trim() : DEFAULT_ENDPOINT;
                }

                if (!token) {
                    sendResponse({
                        success: false,
                        error: 'Extension token is required to test connection.'
                    });
                    return;
                }

                const endpoint = normalizeEndpoint(rawEndpoint);
                try {
                    new URL(endpoint);
                } catch {
                    sendResponse({
                        success: false,
                        error: 'Invalid API endpoint URL.'
                    });
                    return;
                }

                const result = await executeApiRequest({
                    endpoint,
                    text: 'Connection test',
                    command: 'test',
                    token,
                    timeoutMs: 50000 // Accommodate potential Render cold starts
                });

                sendResponse(result);
            } catch (err) {
                sendResponse({
                    success: false,
                    error: `Test error: ${err.message || 'Unknown error'}`
                });
            }
        })();

        return true;
    }
});
