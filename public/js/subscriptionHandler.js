// public/js/subscriptionHandler.js

let cachedUserSubscriptions = {}; // Cache for subscriptions: { webhookId: [hydratedSubscriptionObjects] }

// Refactored to fetch and return user data, not directly update DOM for individual placeholders.
async function fetchUserDetailsForSubscription(userId) {
    // const userDetailsPlaceholder = document.getElementById(`user-details-${userId}`); // No longer directly updates placeholder here
    try {
        const response = await fetch(`/api/users/${userId}`);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to parse user details error' }));
            console.error(`Error fetching user details for ${userId}: ${response.status}`, errorData);
            // Return a structured error or null so Promise.all can handle it gracefully
            return { id: userId, error: true, status: response.status, details: errorData.error || errorData.details?.message || errorData.message || 'Failed to fetch' };
        }
        const userDataResponse = await response.json();
        if (userDataResponse && userDataResponse.data) {
            return userDataResponse.data; // Return the user data object
        } else {
            console.warn(`User details not found or in unexpected format for ${userId}.`);
            return { id: userId, error: true, message: 'User details not found or in unexpected format.' };
        }
    } catch (error) {
        console.error(`Failed to fetch user details for ${userId}:`, error);
        return { id: userId, error: true, message: error.message || 'Network error or similar' };
    }
}

function renderSubscriptionCards(webhookId, subscriptionsArray) {
    const container = document.getElementById('subscriptions-list-container');
    if (!container) {
        console.error("Subscription list container not found for rendering.");
        return;
    }

    if (!subscriptionsArray || subscriptionsArray.length === 0) {
        container.innerHTML = '<p>No active subscriptions for this webhook.</p>';
        return;
    }

    const ul = document.createElement('ul');
    ul.id = 'subscriptions-list';
    container.innerHTML = ''; // Clear loading/previous message
    container.appendChild(ul);

    subscriptionsArray.forEach(subscription => {
        const li = document.createElement('li');
        li.id = `subscription-card-${subscription.id}`;

        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-subscription-btn';
        deleteButton.textContent = 'Delete';
        deleteButton.onclick = () => confirmDeleteSubscription(webhookId, subscription.id);

        const contentDiv = document.createElement('div');
        let userDetailsHtml;
        if (subscription.error) {
            userDetailsHtml = `<p style="color:red;"><em>Error loading details for User ID ${subscription.id}: ${subscription.message || subscription.details || 'Unknown error'}</em></p>`;
        } else {
            const profileUrl = subscription.username ? `https://x.com/${subscription.username}` : '#';
            const avatarHtml = subscription.profile_image_url ? 
                `<img src="${subscription.profile_image_url.replace('_normal', '_bigger')}" alt="Avatar" class="avatar-img">` : 
                '<div class="avatar-placeholder"></div>';
            
            userDetailsHtml = `
                <div class="user-card-layout">
                    <div class="user-avatar-container">
                        <a href="${profileUrl}" target="_blank" rel="noopener noreferrer" title="View profile on X">
                            ${avatarHtml}
                        </a>
                    </div>
                    <div class="user-info-container">
                        <p class="user-handle">${subscription.username || 'N/A'}</p>
                        <p class="user-id-subtext">ID: ${subscription.id}</p>
                    </div>
                </div>
            `;
        }
        contentDiv.innerHTML = userDetailsHtml;
        
        li.appendChild(deleteButton);
        li.appendChild(contentDiv);
        ul.appendChild(li);
    });
}

async function fetchAndDisplaySubscriptions(webhookId, forceRefresh = false) {
    const container = document.getElementById('subscriptions-list-container');
    if (!container) {
        console.error("Subscription list container not found.");
        return;
    }

    console.log(`[SubHandler] fetchAndDisplaySubscriptions for ${webhookId}, forceRefresh: ${forceRefresh}`);

    if (!forceRefresh && cachedUserSubscriptions[webhookId]) {
        console.log(`[SubHandler] Using cached subscriptions for webhook ${webhookId}`);
        renderSubscriptionCards(webhookId, cachedUserSubscriptions[webhookId]);
        return;
    }

    container.innerHTML = '<p>Loading subscriptions...</p>';

    try {
        const response = await fetch(`/api/webhooks/${webhookId}/subscriptions`);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to parse error from server' }));
            throw new Error(`Error ${response.status}: ${errorData.error || errorData.details?.title || errorData.details?.detail || errorData.message || 'Failed to fetch subscriptions'}`);
        }
        const result = await response.json(); // Expects { data: [{id: "userId"}], meta: { result_count: X } }

        if (result.data && result.data.length > 0) {
            console.log(`[SubHandler] Fetched ${result.data.length} subscription IDs. Now fetching details...`);
            // Create an array of promises to fetch user details for each subscription ID
            const userDetailPromises = result.data.map(subscriptionRef => 
                fetchUserDetailsForSubscription(subscriptionRef.id).then(userData => {
                    // Combine original ref (id) with fetched user details
                    // userData could be the user object, or an error object from fetchUserDetailsForSubscription
                    return { ...subscriptionRef, ...userData }; 
                })
            );

            const hydratedSubscriptions = await Promise.all(userDetailPromises);
            console.log("[SubHandler] All user details fetched.", hydratedSubscriptions);
            
            cachedUserSubscriptions[webhookId] = hydratedSubscriptions; // Cache the fully hydrated data
            renderSubscriptionCards(webhookId, hydratedSubscriptions);

        } else if (result.meta && result.meta.result_count === 0) {
            console.log(`[SubHandler] No active subscriptions for webhook ${webhookId}.`);
            cachedUserSubscriptions[webhookId] = []; // Cache empty array
            renderSubscriptionCards(webhookId, []);
        } else {
            throw new Error('No subscriptions found or unable to parse data.');
        }
    } catch (err) {
        console.error("[SubHandler] Failed to fetch or display subscriptions:", err);
        container.innerHTML = `<p style="color: red;">Error loading subscriptions: ${err.message}</p>`;
        delete cachedUserSubscriptions[webhookId]; // Invalidate cache for this webhook on error
    }
}

function confirmDeleteSubscription(webhookId, userId) {
    if (confirm(`Are you sure you want to delete the subscription for User ID: ${userId} from webhook ${webhookId}?`)) {
        handleDeleteSubscription(webhookId, userId);
    }
}

async function handleDeleteSubscription(webhookId, userId) {
    const messageElement = document.getElementById('add-subscription-message'); 
    if(messageElement) messageElement.textContent = '';

    try {
        const response = await fetch(`/api/webhooks/${webhookId}/subscriptions/${userId}`, {
            method: 'DELETE',
        });

        if (response.ok) {
            alert('Subscription deleted successfully!');
            fetchAndDisplaySubscriptions(webhookId, true); // Force refresh
        } else {
            const errorData = await response.json().catch(() => ({ message: 'Failed to parse server error response' }));
            let finalDetailMessage = 'Failed to delete subscription.';
            if (errorData.details && errorData.details.errors && Array.isArray(errorData.details.errors) && errorData.details.errors.length > 0 && errorData.details.errors[0].message) {
                finalDetailMessage = errorData.details.errors[0].message;
            } else if (errorData.details && errorData.details.detail) {
                finalDetailMessage = errorData.details.detail;
            } else if (errorData.details && errorData.details.title) {
                finalDetailMessage = errorData.details.title;
            } else if (errorData.error) {
                finalDetailMessage = errorData.error;
            } else if (errorData.message) {
                finalDetailMessage = errorData.message;
            }
            alert(`Error ${response.status}: ${finalDetailMessage}`);
        }
    } catch (err) {
        console.error("Error deleting subscription:", err);
        alert(`Failed to delete subscription: ${err.message}`);
    }
}

async function handleAddSubscription() {
    const webhookSelectElement = document.getElementById('webhook-select-for-subscriptions');
    const messageElement = document.getElementById('add-subscription-message');

    if (!webhookSelectElement || !messageElement) {
        console.error("Required elements for adding subscription not found in subscriptionHandler.js.");
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
            // Refresh list by calling the globally available fetchAndDisplaySubscriptions
            if (typeof fetchAndDisplaySubscriptions === 'function') {
                 fetchAndDisplaySubscriptions(selectedWebhookId);
            } else {
                console.error("fetchAndDisplaySubscriptions function not found to refresh list.");
            }
        } else {
            let detailedErrorMessage = 'Unknown error';
            if (responseData) {
                if (responseData.details && responseData.details.errors && Array.isArray(responseData.details.errors) && responseData.details.errors.length > 0 && responseData.details.errors[0].message) {
                    detailedErrorMessage = responseData.details.errors[0].message;
                } else if (responseData.details && responseData.details.detail) {
                    detailedErrorMessage = responseData.details.detail;
                } else if (responseData.details && responseData.details.title) {
                    detailedErrorMessage = responseData.details.title;
                } else if (responseData.error) {
                    detailedErrorMessage = responseData.error;
                } else if (responseData.message) {
                    detailedErrorMessage = responseData.message;
                } else if (typeof responseData.details === 'string') {
                    detailedErrorMessage = responseData.details;
                }
            }
            messageElement.textContent = `Error ${response.status}: ${detailedErrorMessage}`;
            messageElement.style.color = 'red';
        }
    } catch (err) {
        console.error("Failed to add subscription:", err);
        messageElement.textContent = `Failed to add subscription: ${err.message}`;
        messageElement.style.color = 'red';
    }
}

// Ensure functions are globally accessible if called by onclick or from other scripts directly
if (typeof window !== 'undefined') {
    window.fetchAndDisplaySubscriptions = fetchAndDisplaySubscriptions;
    window.handleAddSubscription = handleAddSubscription;
    window.confirmDeleteSubscription = confirmDeleteSubscription; // Make this global for the button's onclick
    window.handleDeleteSubscription = handleDeleteSubscription; // Though called internally, good practice if it were directly used
    window.fetchUserDetailsForSubscription = fetchUserDetailsForSubscription; // Expose if needed, though called internally
} 