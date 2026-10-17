// content.js - Universal Content Script for PTextr

(function () {
    'use strict';

    // 1. Supported Input Types (excludes passwords, checkboxes, radio, hidden, etc.)
    const SUPPORTED_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel']);

    // 2. Identify the active editable target
    function getEditableTarget(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
        if (el.disabled || el.readOnly) return null;

        // Standard textarea
        if (el.tagName === 'TEXTAREA') return el;

        // Supported input elements
        if (el.tagName === 'INPUT') {
            const inputType = (el.type || 'text').toLowerCase();
            if (SUPPORTED_INPUT_TYPES.has(inputType)) return el;
            return null;
        }

        // Contenteditable elements (including Gmail, Notion, Slack, Zendesk, ProseMirror, etc.)
        if (el.isContentEditable) {
            // Find the closest root editable container so operations apply to the whole editor
            const root = el.closest('[contenteditable="true"], [contenteditable=""]') || el;
            if (root.disabled || root.getAttribute('aria-disabled') === 'true') return null;
            return root;
        }

        return null;
    }

    // 3. Command Parser: extracts text and command ending with ;command;
    function parseCommand(fullText) {
        if (!fullText) return null;

        // Strip harmless trailing whitespace, newlines, non-breaking spaces (\u00A0), and zero-width spaces (\u200B)
        const trimmed = fullText.replace(/[\s\u00A0\u200B]+$/, '');

        // Match ;command; at the end of the text
        // Command contains letters, numbers, and underscores
        const match = trimmed.match(/;([a-zA-Z0-9_]+);$/);
        if (!match) return null;

        const rawCommand = match[1];
        const commandStartIndex = match.index;
        const originalText = trimmed.slice(0, commandStartIndex);
        const command = rawCommand.replace(/_/g, ' ').trim();

        return {
            originalText,
            command,
            fullMatchText: trimmed
        };
    }

    // 4. Retrieve plain text from any supported element
    function getElementText(el) {
        if (!el) return '';
        if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
            return el.value || '';
        }
        if (el.isContentEditable) {
            return el.innerText || el.textContent || '';
        }
        return '';
    }

    // 5. React-compatible native value setter for INPUT and TEXTAREA
    function setNativeValue(element, value) {
        const prototype = Object.getPrototypeOf(element);
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
        const defaultSetter = Object.getOwnPropertyDescriptor(
            element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
            'value'
        )?.set;

        const setter = descriptor?.set || defaultSetter;
        if (setter) {
            setter.call(element, value);
        } else {
            element.value = value;
        }
    }

    // 6. Replace element content cleanly across native fields and rich-text editors
    function replaceElementContent(el, newText) {
        el.focus();

        if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
            setNativeValue(el, newText);

            // Set cursor to the end of the newly inserted text
            el.selectionStart = el.selectionEnd = newText.length;

            // Notify frameworks (React, Vue, Angular, Svelte)
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return;
        }

        if (el.isContentEditable) {
            // Select all current content in this editable element
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            selection.removeAllRanges();
            selection.addRange(range);

            // document.execCommand('insertText') updates Gmail, Slack, and other editors' internal state and undo history
            const inserted = document.execCommand('insertText', false, newText);

            if (!inserted) {
                // Fallback for strict environments
                el.innerText = newText;
                el.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                    inputType: 'insertText',
                    data: newText
                }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Move cursor to the end of the inserted content
            try {
                const endRange = document.createRange();
                endRange.selectNodeContents(el);
                endRange.collapse(false);
                selection.removeAllRanges();
                selection.addRange(endRange);
            } catch {
                // Non-critical if browser disallows manual range collapse
            }
        }
    }

    // 7. Floating Feedback Badge
    function getOrCreateBadge() {
        const badgeId = 'ptextr-status-badge';
        let badge = document.getElementById(badgeId);

        if (!badge) {
            badge = document.createElement('div');
            badge.id = badgeId;
            badge.style.position = 'fixed';
            badge.style.bottom = '24px';
            badge.style.right = '24px';
            badge.style.zIndex = '2147483647'; // Maximum z-index
            badge.style.padding = '8px 16px';
            badge.style.borderRadius = '20px';
            badge.style.fontSize = '12px';
            badge.style.fontWeight = '500';
            badge.style.fontFamily = 'Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
            badge.style.boxShadow = '0 4px 16px rgba(0,0,0,0.35)';
            badge.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
            badge.style.pointerEvents = 'none';
            document.body.appendChild(badge);
        }

        return badge;
    }

    function showStatusBadge(text, isError = false) {
        const badge = getOrCreateBadge();
        badge.textContent = text;
        badge.style.display = 'block';
        badge.style.opacity = '1';
        badge.style.transform = 'translateY(0)';

        if (isError) {
            badge.style.backgroundColor = '#601410'; // Material 3 Error container
            badge.style.color = '#f9dedc';
            badge.style.border = '1px solid rgba(242, 184, 181, 0.4)';
            setTimeout(() => {
                badge.style.opacity = '0';
                setTimeout(() => { badge.style.display = 'none'; }, 250);
            }, 4500);
        } else {
            badge.style.backgroundColor = '#211f26'; // Material 3 Surface Container
            badge.style.color = '#d0bcff'; // Material 3 Primary
            badge.style.border = '1px solid #4f378b';
        }
    }

    function hideStatusBadge() {
        const badge = document.getElementById('ptextr-status-badge');
        if (badge) {
            badge.style.opacity = '0';
            setTimeout(() => { badge.style.display = 'none'; }, 250);
        }
    }

    // 8. Event Listener for Typing
    function handleInput(event) {
        const target = getEditableTarget(event.target);
        if (!target) return;

        // Prevent duplicate processing if already running on this field
        if (target.dataset.ptextrBusy === 'true') return;

        const currentText = getElementText(target);
        const parsed = parseCommand(currentText);

        if (!parsed) return;

        if (!parsed.originalText.trim()) {
            showStatusBadge('PTextr: Please provide text before the command.', true);
            return;
        }

        // Lock element and record text snapshot before sending request
        target.dataset.ptextrBusy = 'true';
        const snapshotBeforeRequest = currentText;
        showStatusBadge(`PTextr: Running "${parsed.command}"...`);

        try {
            chrome.runtime.sendMessage({
                action: 'processText',
                text: parsed.originalText,
                command: parsed.command
            }, (response) => {
                try {
                    // Check for extension context invalidation
                    if (chrome.runtime.lastError) {
                        showStatusBadge('PTextr: ' + chrome.runtime.lastError.message, true);
                        return;
                    }

                    if (response && response.success) {
                        // Check if the user entered new text while waiting for the response
                        const textNow = getElementText(target);
                        if (textNow !== snapshotBeforeRequest) {
                            showStatusBadge('PTextr: New edits detected while processing. Text kept intact to prevent loss.', true);
                            return;
                        }

                        replaceElementContent(target, response.outputText);
                        hideStatusBadge();
                    } else {
                        const errorMsg = (response && response.error) ? response.error : 'Transformation failed.';
                        showStatusBadge('PTextr: ' + errorMsg, true);
                    }
                } finally {
                    delete target.dataset.ptextrBusy;
                }
            });
        } catch {
            showStatusBadge('PTextr: Extension disconnected. Please refresh the page.', true);
            delete target.dataset.ptextrBusy;
        }
    }

    // Attach listener using capture phase on document to support dynamic fields and all frameworks
    document.addEventListener('input', handleInput, true);

})();
