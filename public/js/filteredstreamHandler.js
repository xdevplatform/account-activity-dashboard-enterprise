let cachedRulesData = null; // For client-side caching of rules

function renderRulesList(rulesArray) {
    const listElement = document.getElementById('rules-list');
    const errorElement = document.getElementById('rules-error');
    if (!listElement || !errorElement) {
        console.error("[FilteredStream] Rules list or error element not found for rendering.");
        return;
    }

    listElement.innerHTML = ''; // Clear previous list
    errorElement.style.display = 'none';
    errorElement.textContent = '';

    if (rulesArray && rulesArray.length > 0) {
        rulesArray.forEach(rule => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <div class="rule-card-content">
                    <p><strong>ID:</strong> <span class="code-block-value">${rule.id}</span></p>
                    <p><strong>Value:</strong> <span class="code-block-value">${rule.value}</span></p>
                    <p><strong>Tag:</strong> <span class="code-block-value">${rule.tag || 'N/A'}</span></p>
                </div>
                <div class="rule-card-actions">
                    <!-- Add delete button or other actions if needed -->
                </div>
            `;
            listElement.appendChild(listItem);
        });
    } else if (rulesArray) { // rulesArray exists but is empty
        listElement.innerHTML = '<li>No rules configured.</li>';
    } else {
        listElement.innerHTML = '<li>Could not load rules data.</li>';
    }
}

async function fetchRules(forceRefresh = false) {
    const listElement = document.getElementById('rules-list');
    const loadingElement = document.getElementById('rules-loading');
    const errorElement = document.getElementById('rules-error');

    if (!listElement || !loadingElement || !errorElement) return;

    console.log(`[FilteredStream] fetchRules called. Force refresh: ${forceRefresh}`);

    if (!forceRefresh && cachedRulesData !== null) {
        console.log("[FilteredStream] Using cached rules data.");
        loadingElement.style.display = 'none';
        renderRulesList(cachedRulesData);
        return;
    }

    listElement.innerHTML = '';
    errorElement.style.display = 'none';
    errorElement.textContent = '';
    loadingElement.style.display = 'block';

    try {
        console.log("[FilteredStream] Fetching rules from API.");
        const response = await fetch('/api/rules');
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
            throw new Error(`Error ${response.status}: ${errorData.error || errorData.details?.title || errorData.details?.detail || errorData.message || 'Failed to fetch rules'}`);
        }
        const result = await response.json();
        
        cachedRulesData = result.data || []; // Cache the data
        console.log("[FilteredStream] Rules fetched and cached:", cachedRulesData);
        renderRulesList(cachedRulesData);

    } catch (err) {
        console.error("Failed to fetch or display rules:", err);
        errorElement.textContent = err.message || 'An unexpected error occurred.';
        errorElement.style.display = 'block';
        listElement.innerHTML = '<li>Error loading rules.</li>';
        cachedRulesData = null; // Invalidate cache on error
    } finally {
        loadingElement.style.display = 'none';
    }
}

async function populateWebhookDropdownForFilteredStream() {
    const selectElement = document.getElementById('webhook-select-for-filteredstream');
    const errorElement = document.getElementById('webhook-select-error');

    if (!selectElement || !errorElement) {
        console.error("Filtered Stream page webhook select or error element not found.");
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
        console.error("Failed to populate webhook dropdown for filtered stream:", err);
        errorElement.textContent = err.message || 'An unexpected error occurred while loading webhooks.';
        selectElement.innerHTML = '<option value="">Error loading webhooks</option>';
    } finally {
        selectElement.disabled = false;
    }
}

async function initializeFilteredStreamPage() {
    console.log("[FilteredStream] Initializing Filtered Stream Page.");
    await populateWebhookDropdownForFilteredStream();
    fetchRules();
}

if (typeof window !== 'undefined') {
    window.fetchRules = fetchRules;
    window.initializeFilteredStreamPage = initializeFilteredStreamPage;
}

async function handleSubscribeWebhook() {
    const webhookSelectElement = document.getElementById('webhook-select-for-filteredstream');
    const messageElement = document.getElementById('subscribe-message');

    if (!webhookSelectElement || !messageElement) {
        console.error("Required elements for subscribing webhook not found.");
        return;
    }

    const selectedWebhookId = webhookSelectElement.value;

    messageElement.textContent = '';
    if (!selectedWebhookId) {
        messageElement.textContent = 'Please select a webhook first.';
        messageElement.style.color = 'red';
        return;
    }

    messageElement.textContent = `Subscribing webhook ${selectedWebhookId} to filtered stream...`;
    messageElement.style.color = 'black';

    try {
        const response = await fetch(`/api/webhooks/${selectedWebhookId}/filteredstream`, {
            method: 'POST',
        });

        const responseData = await response.json().catch(() => ({ message: 'Failed to parse server response.' }));

        if (response.ok) {
            messageElement.textContent = responseData.message || 'Webhook subscribed successfully!';
            messageElement.style.color = 'green';
        } else {
            let detailedErrorMessage = 'Unknown error';
            if (responseData) {
                detailedErrorMessage = responseData.error || responseData.details?.title || responseData.details?.detail || responseData.message || 'Failed to subscribe';
            }
            messageElement.textContent = `Error ${response.status}: ${detailedErrorMessage}`;
            messageElement.style.color = 'red';
        }
    } catch (err) {
        console.error("Failed to subscribe webhook:", err);
        messageElement.textContent = `Failed to subscribe webhook: ${err.message}`;
        messageElement.style.color = 'red';
    }
}

// In initializeFilteredStreamPage or separately, add listener
document.addEventListener('DOMContentLoaded', () => {
    const subscribeBtn = document.getElementById('subscribe-webhook-btn');
    if (subscribeBtn) {
        subscribeBtn.addEventListener('click', handleSubscribeWebhook);
    }
});

// Expose
window.handleSubscribeWebhook = handleSubscribeWebhook;
