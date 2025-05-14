function openTab(evt, tabName) {
    let i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
        tabcontent[i].classList.remove("active");
    }
    // Clear active class from all tab links
    const navLinksContainer = document.querySelector('.navbar .nav-links');
    if (navLinksContainer) {
        tablinks = navLinksContainer.getElementsByTagName("a");
        for (i = 0; i < tablinks.length; i++) {
            tablinks[i].classList.remove("active");
        }
    }

    const activeTabContent = document.getElementById(tabName);
    if (activeTabContent) {
        activeTabContent.style.display = "block";
        activeTabContent.classList.add("active");
    }
    
    if (history.pushState) {
        history.pushState(null, null, '#' + tabName);
    } else {
        location.hash = '#' + tabName;
    }

    if (evt && evt.currentTarget) {
        evt.currentTarget.classList.add('active');
    }

    if (tabName === 'webhooks') {
        fetchWebhooks();
    } else if (tabName === 'subscriptions') {
        initializeSubscriptionsPage();
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

async function fetchAndDisplaySubscriptions(webhookId) {
    const container = document.getElementById('subscriptions-list-container');
    if (!container) return;

    container.innerHTML = '<p>Loading subscriptions...</p>';

    try {
        const response = await fetch(`/api/webhooks/${webhookId}/subscriptions`);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to parse error from server' }));
            throw new Error(`Error ${response.status}: ${errorData.error || errorData.details?.title || errorData.details?.detail || errorData.message || 'Failed to fetch subscriptions'}`);
        }
        const result = await response.json();

        if (result.data && result.data.length > 0) {
            const ul = document.createElement('ul');
            ul.id = 'subscriptions-list';
            result.data.forEach(subscription => {
                const li = document.createElement('li');
                // Assuming the API returns user objects with id, name, username
                // The Twitter API for /2/webhooks/:webhook_id/subscriptions returns a list of user objects that are subscribed.
                li.innerHTML = `
                    <p><strong>User ID:</strong> <span class="code-block-value">${subscription.id}</span></p>
                    <p><strong>Name:</strong> <span class="code-block-value">${subscription.name || 'N/A'}</span></p>
                    <p><strong>Username:</strong> <span class="code-block-value">${subscription.username || 'N/A'}</span></p>
                `;
                ul.appendChild(li);
            });
            container.innerHTML = ''; // Clear loading message
            container.appendChild(ul);
        } else if (result.meta && result.meta.result_count === 0) {
            container.innerHTML = '<p>No active subscriptions for this webhook.</p>';
        } else {
            container.innerHTML = '<p>No subscriptions found or unable to parse data.</p>';
        }
    } catch (err) {
        console.error("Failed to fetch or display subscriptions:", err);
        container.innerHTML = `<p style="color: red;">Error loading subscriptions: ${err.message}</p>`;
    }
}

function handleSubscriptionWebhookChange(event) {
    const selectElement = document.getElementById('webhook-select-for-subscriptions');
    const subscriptionsListContainer = document.getElementById('subscriptions-list-container');
    if (!selectElement || !subscriptionsListContainer) return;

    const selectedWebhookId = selectElement.value; // event.target.value can also be used
    subscriptionsListContainer.innerHTML = ''; // Clear previous subscriptions or messages

    if (selectedWebhookId) {
        console.log(`Webhook selected for subscriptions: ${selectedWebhookId}`);
        fetchAndDisplaySubscriptions(selectedWebhookId);
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

async function handleAddSubscription() {
    const webhookSelectElement = document.getElementById('webhook-select-for-subscriptions');
    const messageElement = document.getElementById('add-subscription-message');

    if (!webhookSelectElement || !messageElement) {
        console.error("Required elements for adding subscription not found.");
        if (messageElement) {
            messageElement.textContent = 'Error: UI elements missing. Please refresh.';
            messageElement.style.color = 'red';
        }
        return;
    }

    const selectedWebhookId = webhookSelectElement.value;

    messageElement.textContent = ''; // Clear previous messages

    if (!selectedWebhookId) {
        messageElement.textContent = 'Please select a webhook first.';
        messageElement.style.color = 'red';
        return;
    }

    messageElement.textContent = `Attempting to subscribe user (from .env settings) to webhook ${selectedWebhookId}...`;
    messageElement.style.color = 'black';

    try {
        const response = await fetch(`/api/webhooks/${selectedWebhookId}/subscriptions`, {
            method: 'POST',
            headers: {},
        });

        const responseData = await response.json().catch(() => ({ message: 'Failed to parse server response.' }));

        if (response.ok) {
            messageElement.textContent = responseData.message || 'Subscription request successful!';
            messageElement.style.color = 'green';
            fetchAndDisplaySubscriptions(selectedWebhookId); // Refresh list
        } else {
            const errorDetail = responseData.details?.title || responseData.details?.detail || responseData.error || responseData.message || 'Unknown error';
            messageElement.textContent = `Error ${response.status}: ${errorDetail}`;
            messageElement.style.color = 'red';
        }
    } catch (err) {
        console.error("Failed to add subscription:", err);
        messageElement.textContent = `Failed to add subscription: ${err.message}`;
        messageElement.style.color = 'red';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    let tabToOpen = 'webhooks'; 
    if (window.location.hash) {
        const hash = window.location.hash.substring(1);
        const el = document.getElementById(hash);
        if (el && el.classList.contains('tabcontent')) {
            tabToOpen = hash;
        }
    }
    const targetLink = document.querySelector(`.navbar .nav-links a[href="#${tabToOpen}"]`);
    if (targetLink) {
        // Directly call openTab with a mocked event target for initial load
        openTab({ currentTarget: targetLink }, tabToOpen);
    } else {
        // Fallback if the hashed tab link isn't found, try opening webhooks directly
        const webhooksLink = document.querySelector('.navbar .nav-links a[href="#webhooks"]');
        if (webhooksLink) {
            openTab({ currentTarget: webhooksLink }, 'webhooks');
        }
    }
}); 