let currentOpenTab = 'webhooks'; // Default tab
let lastSelectedWebhookIdForSubscriptions = null; // Store the last selected webhook ID
let cachedWebhooksData = null; // For client-side caching of webhooks
let currentReplayWebhookId = null; // Store webhook ID for replay modal
let currentValidateWebhookId = null; // Store webhook ID for validation modal

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

    // Event listener for the new Refresh Webhooks button
    const refreshWebhooksBtn = document.getElementById('refresh-webhooks-btn');
    if (refreshWebhooksBtn) {
        refreshWebhooksBtn.addEventListener('click', () => {
            console.log("[MainJS_Debug] Refresh Webhooks button clicked.");
            fetchWebhooks(true); // Force a refresh
        });
    }

    // Event listener for the new Refresh Subscriptions button
    const refreshSubscriptionsBtn = document.getElementById('refresh-subscriptions-btn');
    if (refreshSubscriptionsBtn) {
        refreshSubscriptionsBtn.addEventListener('click', () => {
            console.log("[MainJS_Debug] Refresh Subscriptions button clicked.");
            if (lastSelectedWebhookIdForSubscriptions && typeof window.fetchAndDisplaySubscriptions === 'function') {
                window.fetchAndDisplaySubscriptions(lastSelectedWebhookIdForSubscriptions, true);
            } else {
                console.warn("[MainJS_Debug] No webhook selected or fetchAndDisplaySubscriptions not available for refresh.");
            }
        });
    }

    // Handle initial tab based on hash or default
    console.log("[MainJS_Debug] About to call handleHashChange for initial load.");
    handleHashChange();

    // Add event listener for closing replay modal on outside click
    window.addEventListener('click', function(event) {
        const replayModal = document.getElementById('replay-events-modal');
        const replayModalContent = document.querySelector('.replay-modal-content');
        if (replayModal && replayModal.style.display === 'block' && event.target === replayModal) {
            // Check if the click is directly on the modal backdrop, not the content
            if (replayModalContent && !replayModalContent.contains(event.target)) {
                 closeReplayModal();
            }
        }
    });
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

function renderWebhooksList(webhooksArray) {
    const listElement = document.getElementById('webhooks-list');
    const errorElement = document.getElementById('webhooks-error');
    if (!listElement || !errorElement) {
        console.error("[MainJS] Webhooks list or error element not found for rendering.");
        return;
    }

    listElement.innerHTML = ''; // Clear previous list
    errorElement.style.display = 'none';
    errorElement.textContent = '';

    if (webhooksArray && webhooksArray.length > 0) {
        webhooksArray.forEach(webhook => {
            const listItem = document.createElement('li');
            const createdAt = new Date(webhook.created_at).toUTCString().replace('GMT', 'UTC');
            const isValid = webhook.valid ? 'Yes' : 'No';
            listItem.innerHTML = `
                <div class="webhook-card-content">
                    <p><strong>ID:</strong> <span class="code-block-value">${webhook.id}</span></p>
                    <p><strong>URL:</strong> <span class="code-block-value"><a href="${webhook.url}" target="_blank">${webhook.url}</a></span></p>
                    <p><strong>Created At:</strong> <span class="code-block-value">${createdAt}</span></p>
                    <p><strong>Valid:</strong> <span class="code-block-value">${isValid}</span></p>
                </div>
                <div class="webhook-card-actions">
                    <button class="replay-webhook-btn" onclick="showReplayModal('${webhook.id}')" aria-label="Replay Events" title="Create Replay Job"><img src="/public/img/icons/replay-icon.svg" alt="Replay"></button>
                    <button class="validate-webhook-btn" onclick="showValidateWebhookModal('${webhook.id}')" aria-label="Validate Webhook" title="Validate CRC Check"><img src="/public/img/icons/validate-icon.svg" alt="Validate"></button>
                    <button class="delete-webhook-btn" onclick="confirmDeleteWebhook('${webhook.id}', '${webhook.url}')" aria-label="Delete Webhook" title="Delete Webhook"><img src="/public/img/icons/delete-icon.svg" alt="Delete"></button>
                </div>
            `;
            listElement.appendChild(listItem);
        });
    } else if (webhooksArray) { // webhooksArray exists but is empty
        listElement.innerHTML = '<li>No webhooks registered.</li>';
    } else { // webhooksArray is null or undefined (should ideally not happen if called correctly)
         listElement.innerHTML = '<li>Could not load webhook data.</li>';
    }
}

async function fetchWebhooks(forceRefresh = false) {
    const listElement = document.getElementById('webhooks-list');
    const loadingElement = document.getElementById('webhooks-loading');
    const errorElement = document.getElementById('webhooks-error');

    if (!listElement || !loadingElement || !errorElement) return;

    console.log(`[MainJS_Debug] fetchWebhooks called. Force refresh: ${forceRefresh}`);

    if (!forceRefresh && cachedWebhooksData !== null) {
        console.log("[MainJS_Debug] Using cached webhooks data.");
        loadingElement.style.display = 'none'; // Ensure loading is hidden
        renderWebhooksList(cachedWebhooksData);
        return;
    }

    listElement.innerHTML = ''; // Clear before loading if fetching fresh
    errorElement.style.display = 'none';
    errorElement.textContent = '';
    loadingElement.style.display = 'block';

    try {
        console.log("[MainJS_Debug] Fetching webhooks from API.");
        const response = await fetch('/api/webhooks');
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
            throw new Error(`Error ${response.status}: ${errorData.error || errorData.details?.title || errorData.details?.detail || errorData.message || 'Failed to fetch webhooks'}`);
        }
        const result = await response.json();
        
        cachedWebhooksData = result.data || []; // Cache the data (or empty array if no data field)
        console.log("[MainJS_Debug] Webhooks fetched and cached:", cachedWebhooksData);
        renderWebhooksList(cachedWebhooksData);

    } catch (err) {
        console.error("Failed to fetch or display webhooks:", err);
        errorElement.textContent = err.message || 'An unexpected error occurred.';
        errorElement.style.display = 'block';
        listElement.innerHTML = '<li>Error loading webhooks.</li>';
        cachedWebhooksData = null; // Invalidate cache on error
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
            fetchWebhooks(true);
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
            fetchWebhooks(true);
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
    lastSelectedWebhookIdForSubscriptions = selectedWebhookId; // Store the selection
    
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

async function initializeSubscriptionsPage() {
    console.log("[MainJS_Debug] Initializing Subscriptions Page.");
    const selectElement = document.getElementById('webhook-select-for-subscriptions');
    
    // Ensure the change event listener for the dropdown is set up only once
    if (selectElement && !selectElement.hasAttribute('data-listener-set')) {
        selectElement.addEventListener('change', handleSubscriptionWebhookChange);
        selectElement.setAttribute('data-listener-set', 'true');
    }
    
    // The refresh button listener is now added in DOMContentLoaded to ensure it's also only added once.

    await populateWebhookDropdownForSubscriptions(); 

    // Attempt to restore the last selected webhook
    if (lastSelectedWebhookIdForSubscriptions) {
        const optionExists = selectElement.querySelector(`option[value="${lastSelectedWebhookIdForSubscriptions}"]`);
        if (optionExists) {
            console.log(`[MainJS_Debug] Restoring last selected webhook for subscriptions: ${lastSelectedWebhookIdForSubscriptions}`);
            selectElement.value = lastSelectedWebhookIdForSubscriptions;
        } else {
            console.log(`[MainJS_Debug] Last selected webhook ${lastSelectedWebhookIdForSubscriptions} not found in dropdown, resetting.`);
            lastSelectedWebhookIdForSubscriptions = null; // Clear if not found
            selectElement.value = ""; // Reset to default/placeholder
        }
    } else {
        selectElement.value = ""; // Ensure it's on the placeholder if no prior selection
    }
    
    // Trigger change handler to load subscriptions for the (potentially restored) selection or clear list
    handleSubscriptionWebhookChange(); 
}

// --- Replay Events Modal Functions ---
function showReplayModal(webhookId) {
    currentReplayWebhookId = webhookId;
    const modal = document.getElementById('replay-events-modal');
    const messageElement = document.getElementById('replay-message');
    const fromDateInput = document.getElementById('replay-from-datetime');
    const toDateInput = document.getElementById('replay-to-datetime');

    if (messageElement) messageElement.textContent = '';
    if (fromDateInput) fromDateInput.value = '';
    if (toDateInput) toDateInput.value = '';
    
    if (modal) {
        modal.style.display = 'block';
    }
    console.log(`[MainJS] Show replay modal for webhook ID: ${webhookId}`);
}

function closeReplayModal() {
    const modal = document.getElementById('replay-events-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    currentReplayWebhookId = null;
    console.log('[MainJS] Replay modal closed.');
}

function formatDateTimeForApi(dateTimeLocalValue) {
    if (!dateTimeLocalValue) return '';
    // dateTimeLocalValue is like "YYYY-MM-DDTHH:mm"
    // We need "YYYYMMDDHHmm"
    return dateTimeLocalValue.replace(/[-T:]/g, '');
}

async function handleConfirmReplay() {
    if (!currentReplayWebhookId) {
        console.error("[MainJS] No webhook ID available for replay.");
        alert("Error: No webhook selected for replay.");
        return;
    }

    const fromDateInput = document.getElementById('replay-from-datetime');
    const toDateInput = document.getElementById('replay-to-datetime');
    const messageElement = document.getElementById('replay-message');

    if (!fromDateInput || !toDateInput || !messageElement) {
        console.error("[MainJS] Replay modal date/time input or message element not found.");
        alert("Error: Modal elements not found.");
        return;
    }

    const fromDateTime = fromDateInput.value;
    const toDateTime = toDateInput.value;

    messageElement.textContent = '';
    messageElement.style.color = 'red';

    if (!fromDateTime || !toDateTime) {
        messageElement.textContent = 'Please select both start and end date/time.';
        return;
    }

    const fromDateApi = formatDateTimeForApi(fromDateTime);
    const toDateApi = formatDateTimeForApi(toDateTime);

    if (fromDateApi >= toDateApi) {
        messageElement.textContent = 'Start date/time must be before end date/time.';
        return;
    }
    
    // Twitter API constraints: from_date and to_date must be within the last 15 days.
    // And to_date must be at least one minute after from_date.
    // And from_date must be at least one minute in the past from now.
    const now = new Date();
    const fromDateObj = new Date(fromDateTime);
    const toDateObj = new Date(toDateTime);
    const fifteenDaysAgo = new Date(now.getTime() - (15 * 24 * 60 * 60 * 1000));

    if (fromDateObj < fifteenDaysAgo || toDateObj < fifteenDaysAgo) {
        messageElement.textContent = 'Dates must be within the last 15 days.';
        return;
    }
    if (toDateObj.getTime() - fromDateObj.getTime() < 60000) { // Less than 1 minute difference
        messageElement.textContent = 'End time must be at least one minute after start time.';
        return;
    }
    if (fromDateObj >= now) {
        messageElement.textContent = 'Start time must be in the past.';
        return;
    }


    messageElement.textContent = 'Requesting replay...';
    messageElement.style.color = 'black';

    try {
        const apiUrl = `/api/webhooks/${currentReplayWebhookId}/replay?from_date=${fromDateApi}&to_date=${toDateApi}`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                // No Content-Type needed as there is no body
            },
            // No body, parameters are in URL
        });

        if (response.status === 200) { // OK - Success
            const resultData = await response.json();
            messageElement.textContent = `Replay request successful! Job ID: ${resultData?.data?.job_id}. Events should arrive soon.`;
            messageElement.style.color = 'green';
            // Optionally close modal after a short delay or keep it open with success message
            setTimeout(closeReplayModal, 4000);
        } else {
            const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response for replay' }));
            let detailedErrorMessage = `Failed to request replay (Status: ${response.status}).`;
            if (errorData.error) {
                detailedErrorMessage += ` Server Error: ${errorData.error}`;
            }
            if (errorData.details) {
                 if (typeof errorData.details === 'string') {
                    detailedErrorMessage += ` Details: ${errorData.details}`;
                 } else if (errorData.details.title && errorData.details.errors) {
                    detailedErrorMessage += ` X API Error: ${errorData.details.title} - ${errorData.details.errors.map(e => e.message).join(', ')}`;
                 } else if (errorData.details.detail) {
                     detailedErrorMessage += ` X API Detail: ${errorData.details.detail}`;
                 }
            }
            messageElement.textContent = detailedErrorMessage;
            console.error("Replay request failed:", detailedErrorMessage, errorData);
        }
    } catch (err) {
        console.error("Failed to send replay request:", err);
        messageElement.textContent = `Failed to send replay request: ${err.message}`;
    }
}

// --- Validate Webhook Modal Functions ---
function showValidateWebhookModal(webhookId) {
    currentValidateWebhookId = webhookId;
    const modal = document.getElementById('validate-webhook-modal');
    const messageElement = document.getElementById('validate-webhook-message');
    const statusContainer = document.getElementById('validate-webhook-status-container');
    const confirmButton = document.getElementById('confirm-validate-webhook-btn');

    if (messageElement) messageElement.textContent = '';
    if (statusContainer) statusContainer.innerHTML = ''; // Clear previous status/animation
    if (confirmButton) confirmButton.disabled = false; // Ensure button is enabled

    if (modal) {
        modal.style.display = 'block';
    }
    console.log(`[MainJS] Show validate webhook modal for webhook ID: ${webhookId}`);
}

function closeValidateWebhookModal() {
    const modal = document.getElementById('validate-webhook-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    const messageElement = document.getElementById('validate-webhook-message');
    if (messageElement) messageElement.textContent = ''; // Clear messages on close
    const statusContainer = document.getElementById('validate-webhook-status-container');
    if (statusContainer) statusContainer.innerHTML = ''; // Clear status/animation

    currentValidateWebhookId = null;
    console.log('[MainJS] Validate webhook modal closed.');
}

async function handleConfirmValidateWebhook() {
    if (!currentValidateWebhookId) {
        alert("Error: No webhook ID available for validation.");
        return;
    }

    const messageElement = document.getElementById('validate-webhook-message');
    const statusContainer = document.getElementById('validate-webhook-status-container');
    const confirmButton = document.getElementById('confirm-validate-webhook-btn');

    if (!messageElement || !statusContainer || !confirmButton) {
        alert("Error: Modal elements not found for validation status.");
        return;
    }

    messageElement.textContent = '';
    messageElement.style.color = 'red'; // Default to red for errors
    statusContainer.innerHTML = '<div class="modal-spinner"></div> Validating...'; // Placeholder for animation
    confirmButton.disabled = true;

    try {
        const response = await fetch(`/api/webhooks/${currentValidateWebhookId}`, {
            method: 'PUT',
        });

        statusContainer.innerHTML = ''; // Clear spinner

        if (response.status === 204) {
            messageElement.textContent = `Validation request sent successfully for webhook ID: ${currentValidateWebhookId}. Check server logs and refresh list.`;
            messageElement.style.color = 'green';
            fetchWebhooks(true); // Refresh the webhooks list
            setTimeout(closeValidateWebhookModal, 3000); // Close modal after 3 seconds
        } else {
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
            messageElement.textContent = `Error ${response.status}: ${finalDetailMessage}`;
            confirmButton.disabled = false; // Re-enable button on error
        }
    } catch (err) {
        console.error("Failed to send validation request:", err);
        statusContainer.innerHTML = ''; // Clear spinner
        messageElement.textContent = `Failed to send validation request: ${err.message}`;
        confirmButton.disabled = false; // Re-enable button on error
    }
} 