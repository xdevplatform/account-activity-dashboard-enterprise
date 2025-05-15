let currentOpenTab = 'webhooks'; // Default tab

document.addEventListener('DOMContentLoaded', () => {
    console.log("[MainJS_Debug] DOMContentLoaded event fired.");

    // Set up tab click listeners
    document.querySelectorAll('.navbar a[data-tab]').forEach((tabLink, index) => {
        console.log(`[MainJS_Debug] Attaching click listener to: ${tabLink.getAttribute('data-tab')}`);
        tabLink.addEventListener('click', function(event) {
            event.preventDefault();
            const tabId = this.getAttribute('data-tab');
            console.log(`[MainJS_Debug] Tab link clicked for: ${tabId}`);
            if (tabId) {
                showTab(tabId);
                try {
                    history.pushState(null, null, '#' + tabId);
                } catch (e) {
                    window.location.hash = '#' + tabId;
                }
            }
        });
    });

    // Handle initial tab based on hash or default
    console.log("[MainJS_Debug] About to call handleHashChange for initial load.");
    handleHashChange();
});

function handleHashChange() {
    console.log("[MainJS_Debug] handleHashChange called.");
    const hash = window.location.hash.substring(1);
    // Validate if the hash corresponds to a real tab ID, otherwise default
    const validTabIds = Array.from(document.querySelectorAll('.tabcontent')).map(tc => tc.id);
    const tabToOpen = hash && validTabIds.includes(hash) ? hash : 'webhooks';
    console.log(`[MainJS] Hash change or initial load. Attempting to show tab: ${tabToOpen}`);
    showTab(tabToOpen);
}

window.addEventListener('hashchange', handleHashChange, false);

function showTab(tabId) {
    console.log(`[MainJS_Debug] showTab function entered for tabId: ${tabId}. Current open tab: ${currentOpenTab}`);

    if (!tabId) {
        console.error("[MainJS] showTab called with no tabId.");
        return;
    }

    // Manage WebSocket connection for LiveEvents tab
    if (currentOpenTab === 'live-events' && tabId !== 'live-events') {
        if (typeof window.closeLiveEventsConnection === 'function') {
            console.log("[MainJS_Debug] Navigating away from LiveEvents. Closing WebSocket connection.");
            window.closeLiveEventsConnection();
        }
    }

    // Hide all tab content and remove active class from links
    document.querySelectorAll('.tabcontent').forEach(content => {
        content.style.display = 'none'; // Use style.display directly
        content.classList.remove('active');
    });
    document.querySelectorAll('.navbar a[data-tab]').forEach(link => {
        link.classList.remove('active');
    });

    // Show the selected tab content and set active class on link
    const activeContent = document.getElementById(tabId);
    const activeLink = document.querySelector(`.navbar a[data-tab="${tabId}"]`);

    if (activeContent) {
        activeContent.style.display = 'block'; // Use style.display directly
        activeContent.classList.add('active');
        console.log(`[MainJS] Tab ${tabId} content displayed.`);
    } else {
        console.warn(`[MainJS] No content found for tabId: ${tabId}`);
    }
    if (activeLink) {
        activeLink.classList.add('active');
    }

    // Update the currently open tab
    currentOpenTab = tabId;
    console.log(`[MainJS_Debug] currentOpenTab is now: ${currentOpenTab}`);

    // Initialize tab-specific content
    if (tabId === 'webhooks') {
        if (typeof fetchWebhooks === 'function') fetchWebhooks();
    } else if (tabId === 'subscriptions') {
        if (typeof initializeSubscriptionsPage === 'function') initializeSubscriptionsPage();
    } else if (tabId === 'live-events') {
        if (typeof window.initializeLiveEvents === 'function') {
            console.log("[MainJS_Debug] LiveEvents tab is active. Initializing WebSocket connection.");
            window.initializeLiveEvents();
        } else {
            console.error("[MainJS_Debug] initializeLiveEvents function not found!");
        }
    }
}

async function fetchWebhooks() {
    const listElement = document.getElementById('webhooks-list');
    const loadingElement = document.getElementById('webhooks-loading');
    const errorElement = document.getElementById('webhooks-error');

    if (!listElement || !loadingElement || !errorElement) return;

    listElement.innerHTML = '';
    errorElement.style.display = 'none';
    errorElement.textContent = '';
    loadingElement.style.display = 'block';

    try {
        const response = await fetch('/api/webhooks');
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
            throw new Error(`Error ${response.status}: ${errorData.error || errorData.details?.title || errorData.details?.detail || errorData.message || 'Failed to fetch webhooks'}`);
        }
        const result = await response.json();

        if (result.data && result.data.length > 0) {
            result.data.forEach(webhook => {
                const listItem = document.createElement('li');
                const createdAt = new Date(webhook.created_at).toUTCString().replace('GMT', 'UTC');
                const isValid = webhook.valid ? 'Yes' : 'No';
                listItem.innerHTML = `
                    <button class="delete-webhook-btn" onclick="confirmDeleteWebhook('${webhook.id}', '${webhook.url}')">Delete</button>
                    <button class="validate-webhook-btn" onclick="handleValidateWebhook(this, '${webhook.id}')">Validate</button>
                    <p><strong>ID:</strong> <span class="code-block-value">${webhook.id}</span></p>
                    <p><strong>URL:</strong> <span class="code-block-value"><a href="${webhook.url}" target="_blank">${webhook.url}</a></span></p>
                    <p><strong>Created At:</strong> <span class="code-block-value">${createdAt}</span></p>
                    <p><strong>Valid:</strong> <span class="code-block-value">${isValid}</span></p>
                `;
                listElement.appendChild(listItem);
            });
        } else if (result.meta && result.meta.result_count === 0) {
            listElement.innerHTML = '<li>No webhooks registered.</li>';
        } else {
             listElement.innerHTML = '<li>Could not parse webhook data or no webhooks found.</li>';
        }
    } catch (err) {
        console.error("Failed to fetch or display webhooks:", err);
        errorElement.textContent = err.message || 'An unexpected error occurred.';
        errorElement.style.display = 'block';
        listElement.innerHTML = '<li>Error loading webhooks.</li>';
    } finally {
        loadingElement.style.display = 'none';
    }
}

async function handleAddWebhook() {
    const urlInput = document.getElementById('webhook-url-input');
    const messageElement = document.getElementById('add-webhook-message');
    if (!urlInput || !messageElement) return;

    const webhookUrl = urlInput.value.trim();
    messageElement.textContent = '';
    messageElement.style.color = 'red';

    if (!webhookUrl) {
        messageElement.textContent = 'Please enter a webhook URL.';
        return;
    }
    try {
        new URL(webhookUrl);
    } catch (_) {
        messageElement.textContent = 'Invalid URL format.';
        return;
    }

    messageElement.textContent = 'Adding webhook...';
    messageElement.style.color = 'black';

    try {
        const response = await fetch('/api/webhooks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: webhookUrl }),
        });
        const responseData = await response.json();
        
        if (response.ok) {
            messageElement.textContent = `Webhook created successfully! ID: ${responseData.data?.id || 'N/A'}`;
            messageElement.style.color = 'green';
            urlInput.value = '';
            fetchWebhooks();
        } else {
            let detailedErrorMessage = 'Failed to create webhook.';
            const twitterError = responseData;
            if (typeof twitterError === 'object' && twitterError !== null) {
                if (twitterError.errors && twitterError.errors.length > 0 && twitterError.errors[0].message) {
                    detailedErrorMessage = twitterError.errors[0].message;
                } else if (twitterError.title) {
                    detailedErrorMessage = twitterError.title + (twitterError.detail ? `: ${twitterError.detail}` : '');
                } else if (twitterError.detail) {
                    detailedErrorMessage = twitterError.detail;
                } else if (twitterError.message) {
                    detailedErrorMessage = twitterError.message;
                } else {
                    detailedErrorMessage = JSON.stringify(twitterError);
                }
            } else if (typeof twitterError === 'string') {
                detailedErrorMessage = twitterError;
            }
            messageElement.textContent = `Error ${response.status}: ${detailedErrorMessage}`;
        }
    } catch (err) {
        console.error("Failed to add webhook:", err);
        messageElement.textContent = `Failed to add webhook: ${err.message}`;
    }
}

async function confirmDeleteWebhook(webhookId, webhookUrl) {
    if (!confirm(`Are you sure you want to delete the webhook for URL: ${webhookUrl} (ID: ${webhookId})?`)) {
        return;
    }
    const errorElement = document.getElementById('webhooks-error');
    if(errorElement) {
        errorElement.style.display = 'none';
        errorElement.textContent = '';
    }

    try {
        const response = await fetch(`/api/webhooks/${webhookId}`, {
            method: 'DELETE',
        });
        if (response.ok) {
            alert('Webhook deleted successfully!');
            fetchWebhooks();
        } else {
            const errorData = await response.json().catch(() => ({ message: 'Failed to parse server error response for delete operation' }));
            let finalDetailMessage = 'Failed to delete webhook.';
            if (errorData.details) {
                const twitterError = errorData.details;
                if (typeof twitterError === 'object' && twitterError !== null) {
                    if (twitterError.errors && twitterError.errors.length > 0 && twitterError.errors[0].message) {
                        finalDetailMessage = twitterError.errors[0].message;
                    } else if (twitterError.title) {
                        finalDetailMessage = twitterError.title + (twitterError.detail ? `: ${twitterError.detail}` : '');
                    } else if (twitterError.detail) {
                        finalDetailMessage = twitterError.detail;
                    } else { finalDetailMessage = JSON.stringify(twitterError); }
                } else if (typeof twitterError === 'string') { finalDetailMessage = twitterError; }
            } else if (errorData.error) { finalDetailMessage = errorData.error; }
             else if (errorData.message) { finalDetailMessage = errorData.message; }
            throw new Error(`Error ${response.status}: ${finalDetailMessage}`);
        }
    } catch (err) {
        console.error("Failed to delete webhook:", err);
        if(errorElement) {
            errorElement.textContent = `Failed to delete: ${err.message}`;
            errorElement.style.display = 'block';
        }
        alert(`Failed to delete webhook: ${err.message}`);
    }
}

async function handleValidateWebhook(buttonElement, webhookId) {
    const originalButtonText = buttonElement.textContent;
    buttonElement.textContent = 'Validating...';
    buttonElement.disabled = true;
    try {
        const response = await fetch(`/api/webhooks/${webhookId}`, {
            method: 'PUT',
        });
        if (response.status === 204) {
            alert(`Validation request sent successfully for webhook ID: ${webhookId}.\nCheck your server logs for CRC activity and refresh the list to see updated status eventually.`);
        } else if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to parse server error response for validation' }));
            let finalDetailMessage = 'Failed to send validation request.';
            if (errorData.details) {
                const twitterError = errorData.details;
                if (typeof twitterError === 'object' && twitterError !== null) {
                    if (twitterError.errors && twitterError.errors.length > 0 && twitterError.errors[0].message) {
                        finalDetailMessage = twitterError.errors[0].message;
                    } else if (twitterError.title) {
                        finalDetailMessage = twitterError.title + (twitterError.detail ? `: ${twitterError.detail}` : '');
                    } else if (twitterError.detail) {
                        finalDetailMessage = twitterError.detail;
                    } else { finalDetailMessage = JSON.stringify(twitterError); }
                } else if (typeof twitterError === 'string') { finalDetailMessage = twitterError; }
            } else if (errorData.error) { finalDetailMessage = errorData.error; }
             else if (errorData.message) { finalDetailMessage = errorData.message; }
            alert(`Error ${response.status}: ${finalDetailMessage}`);
        } else {
            alert(`Unexpected response status ${response.status} while sending validation request.`);
        }
    } catch (err) {
        console.error("Failed to send validation request:", err);
        alert(`Failed to send validation request: ${err.message}`);
    } finally {
        buttonElement.textContent = originalButtonText;
        buttonElement.disabled = false;
    }
}

async function populateWebhookDropdownForSubscriptions() {
    const selectElement = document.getElementById('webhook-select-for-subscriptions');
    const errorElement = document.getElementById('webhook-select-error');

    if (!selectElement || !errorElement) {
        console.error("Subscription page webhook select or error element not found.");
        return;
    }

    selectElement.innerHTML = '<option value="">Loading webhooks...</option>';
    selectElement.disabled = true;
    errorElement.textContent = '';

    try {
        const response = await fetch('/api/webhooks');
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to parse webhook list for dropdown' }));
            throw new Error(`Error ${response.status}: ${errorData.error || errorData.details?.title || errorData.details?.detail || errorData.message || 'Failed to fetch webhooks for dropdown'}`);
        }
        const result = await response.json();

        selectElement.innerHTML = ''; // Clear loading message

        if (result.data && result.data.length > 0) {
            const defaultOption = document.createElement('option');
            defaultOption.value = "";
            defaultOption.textContent = "-- Select a Webhook --";
            selectElement.appendChild(defaultOption);

            result.data.forEach(webhook => {
                const option = document.createElement('option');
                option.value = webhook.id;
                // Truncate URL for display if too long
                const displayUrl = webhook.url.length > 50 ? webhook.url.substring(0, 47) + "..." : webhook.url;
                option.textContent = `ID: ${webhook.id} (Url: ${displayUrl})`;
                selectElement.appendChild(option);
            });
        } else {
            const noWebhooksOption = document.createElement('option');
            noWebhooksOption.value = "";
            noWebhooksOption.textContent = "No webhooks registered. Please add one first.";
            selectElement.appendChild(noWebhooksOption);
        }
    } catch (err) {
        console.error("Failed to populate webhook dropdown for subscriptions:", err);
        errorElement.textContent = err.message || 'An unexpected error occurred while loading webhooks.';
        selectElement.innerHTML = '<option value="">Error loading webhooks</option>';
    } finally {
        selectElement.disabled = false;
    }
}

function handleSubscriptionWebhookChange(event) {
    const selectElement = document.getElementById('webhook-select-for-subscriptions');
    const subscriptionsListContainer = document.getElementById('subscriptions-list-container');
    if (!selectElement || !subscriptionsListContainer) return;

    const selectedWebhookId = selectElement.value; 
    subscriptionsListContainer.innerHTML = ''; 

    if (selectedWebhookId) {
        console.log(`Webhook selected for subscriptions: ${selectedWebhookId}`);
        // This will call the global fetchAndDisplaySubscriptions from subscriptionHandler.js
        if (typeof fetchAndDisplaySubscriptions === 'function') {
            fetchAndDisplaySubscriptions(selectedWebhookId);
        } else {
            console.error("fetchAndDisplaySubscriptions is not defined. Ensure subscriptionHandler.js is loaded.");
            if(subscriptionsListContainer) subscriptionsListContainer.innerHTML = '<p style="color:red">Error: UI Component not loaded.</p>';
        }
    } else {
        subscriptionsListContainer.innerHTML = '<p>Please select a webhook to see subscriptions.</p>';
    }
}

function initializeSubscriptionsPage() {
    populateWebhookDropdownForSubscriptions();
    const selectElement = document.getElementById('webhook-select-for-subscriptions');
    if (selectElement) {
        selectElement.addEventListener('change', handleSubscriptionWebhookChange);
    }
} 