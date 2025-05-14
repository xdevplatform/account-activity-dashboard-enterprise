import type { ServerWebSocket } from 'bun'; // Though not directly used, kept for consistency if other types are needed
import crypto from 'crypto';
import OAuth from 'oauth-1.0a';

// Helper to create a JSON response with logging (redefined for this module)
function jsonResponse(status: number, body: any, method: string, pathname: string): Response {
    const bodyStr = JSON.stringify(body);
    // Consider a more generic logger or passing a logger instance in a real app
    console.log(`[SUBSCRIPTION_RESPONSE] ${method} ${pathname} - Status: ${status}, Body: ${bodyStr}`);
    return new Response(bodyStr, {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

// Helper for 204 No Content response with logging (redefined for this module)
function noContentResponse(method: string, pathname: string): Response {
    console.log(`[SUBSCRIPTION_RESPONSE] ${method} ${pathname} - Status: 204 (No Content)`);
    return new Response(null, { status: 204 });
}

// Function to get subscriptions for a webhook
async function getWebhookSubscriptions(req: Request, url: URL, webhookId: string): Promise<Response> {
    const bearerToken = process.env.X_BEARER_TOKEN; // This API uses Bearer Token
    if (!bearerToken) {
        console.error(`X_BEARER_TOKEN not found for GET /api/webhooks/${webhookId}/subscriptions.`);
        return jsonResponse(500, { error: "Server configuration error: Missing API token." }, req.method, url.pathname);
    }
    try {
        const twitterApiUrl = `https://api.twitter.com/2/account_activity/webhooks/${webhookId}/subscriptions/all/list`;
        console.log(`[DEBUG] Fetching subscriptions from Twitter API: ${twitterApiUrl}`);
        const response = await fetch(twitterApiUrl, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${bearerToken}`,
                "Content-Type": "application/json",
            },
        });
        const twitterResponseData = await response.json() as any; 
        if (!response.ok) {
            console.error(`Twitter API GET Subscriptions Error: ${response.status} ${response.statusText}`, twitterResponseData);
            return jsonResponse(response.status, { error: "Failed to fetch subscriptions from Twitter API.", details: twitterResponseData }, req.method, url.pathname);
        }

        let subscriptions = [];
        if (twitterResponseData && twitterResponseData.data && Array.isArray(twitterResponseData.data.subscriptions)) {
            subscriptions = twitterResponseData.data.subscriptions.map((sub: { user_id: string }) => ({ id: sub.user_id }));
        } else {
            console.warn("Twitter API GET Subscriptions: Response structure was not as expected or no subscriptions array.", twitterResponseData);
        }
        
        return jsonResponse(200, { data: subscriptions, meta: { result_count: subscriptions.length } }, req.method, url.pathname);

    } catch (error) {
        console.error(`Error fetching subscriptions for webhook ${webhookId} from Twitter API:`, error);
        return jsonResponse(500, { error: "Internal server error while fetching subscriptions." }, req.method, url.pathname);
    }
}

// Function to add a subscription to a webhook
async function createWebhookSubscription(req: Request, url: URL, webhookId: string): Promise<Response> {
    const consumerKey = process.env.X_CONSUMER_KEY;
    const consumerSecret = process.env.X_CONSUMER_SECRET;
    const accessToken = process.env.X_ACCESS_TOKEN;
    const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

    if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
        console.error("Missing OAuth 1.0a credentials in environment variables for subscriptions.");
        return jsonResponse(500, { error: "Server configuration error: Missing OAuth credentials for subscription." }, req.method, url.pathname);
    }

    const method = "POST";
    // Note: Twitter endpoint for adding subscription is /subscriptions/all (for all event types for that user)
    const twitterApiUrl = `https://api.twitter.com/2/account_activity/webhooks/${webhookId}/subscriptions/all`;

    const oauth = new OAuth({
        consumer: { key: consumerKey, secret: consumerSecret },
        signature_method: 'HMAC-SHA1',
        hash_function(base_string: string, key: string) {
            return crypto.createHmac('sha1', key).update(base_string).digest('base64');
        }
    });

    const requestData = { url: twitterApiUrl, method: method };
    const token = { key: accessToken, secret: accessTokenSecret };
    const authHeader = oauth.toHeader(oauth.authorize(requestData, token)).Authorization;

    console.log(`[DEBUG] Attempting to add subscription with OAuth 1.0a. URL: ${twitterApiUrl}`);

    try {
        const response = await fetch(twitterApiUrl, {
            method: method,
            headers: { "Authorization": authHeader },
        });

        const responseData = await response.json().catch(() => null);

        if (!response.ok) {
            console.error(`Twitter API POST Subscriptions/all Error: ${response.status} ${response.statusText}`, responseData);
            return jsonResponse(response.status, { error: "Failed to add subscription via Twitter API (OAuth 1.0a).", details: responseData || { message: response.statusText } }, req.method, url.pathname);
        }
        
        if (response.status === 204) { // Typically success
             return jsonResponse(204, { message: "Subscription successful (or already exists)." }, req.method, url.pathname);
        }
        if (response.status === 200 && responseData) {
            console.log("Twitter API POST Subscriptions/all successful with 200:", responseData);
            // The /2/account_activity/.../subscriptions/all endpoint for POST might return details about the subscription or a confirmation
             return jsonResponse(200, { message: "Subscription request processed successfully.", details: responseData }, req.method, url.pathname);
        }
        
        console.warn("Twitter API POST Subscriptions/all: Unexpected successful response status or format", { status: response.status, body: responseData });
        return jsonResponse(response.status, { message: "Subscription request processed, but response format unexpected.", details: responseData }, req.method, url.pathname);

    } catch (error) {
        console.error(`Error adding subscription for webhook ${webhookId} (OAuth 1.0a):`, error);
        return jsonResponse(500, { error: "Internal server error while adding subscription." }, req.method, url.pathname);
    }
}

async function deleteWebhookSubscription(req: Request, url: URL, webhookId: string, userId: string): Promise<Response> {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
        console.error(`X_BEARER_TOKEN not found for DELETE /api/webhooks/${webhookId}/subscriptions/${userId}.`);
        return jsonResponse(500, { error: "Server configuration error: Missing API token." }, req.method, url.pathname);
    }

    const method = "DELETE";
    // Twitter API: DELETE /2/account_activity/webhooks/:webhook_id/subscriptions/:user_id/all
    const twitterApiUrl = `https://api.twitter.com/2/account_activity/webhooks/${webhookId}/subscriptions/${userId}/all`;

    console.log(`[DEBUG] Attempting to delete subscription. User ID: ${userId}, Webhook ID: ${webhookId}. URL: ${twitterApiUrl}`);

    try {
        const response = await fetch(twitterApiUrl, {
            method: method,
            headers: {
                "Authorization": `Bearer ${bearerToken}`,
            },
        });

        if (response.status === 204) { // Twitter typically returns 204 No Content on successful deletion
            return noContentResponse(method, url.pathname); 
        }
        
        // Handle other cases, e.g., if user was not subscribed, or other errors
        const responseData = await response.json().catch(() => ({ message: "Failed to parse error response from Twitter API or no content."}));
        console.error(`Twitter API DELETE Subscription Error: ${response.status} ${response.statusText}`, responseData);
        return jsonResponse(response.status, { 
            error: "Failed to delete subscription via Twitter API.", 
            details: responseData 
        }, req.method, url.pathname);

    } catch (error) {
        console.error(`Error deleting subscription for User ID ${userId} from webhook ${webhookId}:`, error);
        return jsonResponse(500, { error: "Internal server error while deleting subscription." }, req.method, url.pathname);
    }
}

export async function handleSubscriptionRoutes(req: Request, baseApiUrl: URL, webhookId: string): Promise<Response | null> {
    const fullPath = baseApiUrl.pathname; 
    const subscriptionsBasePath = `/api/webhooks/${webhookId}/subscriptions`;

    if (fullPath === subscriptionsBasePath) {
        if (req.method === "GET") {
            return getWebhookSubscriptions(req, baseApiUrl, webhookId);
        }
        if (req.method === "POST") {
            return createWebhookSubscription(req, baseApiUrl, webhookId);
        }
    }

    // Match DELETE /api/webhooks/:webhookId/subscriptions/:userId
    const deleteMatch = fullPath.match(new RegExp(`^${subscriptionsBasePath}/([^/]+)$`)); // Capture userId
    if (req.method === "DELETE" && deleteMatch) {
        const userId = deleteMatch[1];
        if (userId) {
            return deleteWebhookSubscription(req, baseApiUrl, webhookId, userId);
        }
    }
    
    return null; 
} 