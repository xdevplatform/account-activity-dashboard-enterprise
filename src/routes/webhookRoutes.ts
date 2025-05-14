import type { ServerWebSocket } from 'bun';
import crypto from 'crypto'; // Needed for oauth_nonce and potentially for signature (though full sig is complex)
import OAuth from 'oauth-1.0a';

// Helper to create a JSON response with logging
function jsonResponse(status: number, body: any, method: string, pathname: string): Response {
    const bodyStr = JSON.stringify(body);
    console.log(`[RESPONSE] ${method} ${pathname} - Status: ${status}, Body: ${bodyStr}`);
    return new Response(bodyStr, {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

// Helper for 204 No Content response with logging
function noContentResponse(method: string, pathname: string): Response {
    console.log(`[RESPONSE] ${method} ${pathname} - Status: 204 (No Content)`);
    return new Response(null, { status: 204 });
}

async function getWebhooks(req: Request, url: URL): Promise<Response> {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
        console.error("X_BEARER_TOKEN not found in environment variables.");
        return jsonResponse(500, { error: "Server configuration error: Missing API token." }, req.method, url.pathname);
    }
    try {
        const twitterApiUrl = "https://api.twitter.com/2/webhooks";
        const response = await fetch(twitterApiUrl, {
            headers: {
                "Authorization": `Bearer ${bearerToken}`,
                "Content-Type": "application/json",
            },
        });
        const data = await response.json(); // Assuming Twitter API always returns JSON or this will throw
        if (!response.ok) {
            console.error(`Twitter API GET Error: ${response.status} ${response.statusText}`, data);
            return jsonResponse(response.status, { error: "Failed to fetch data from Twitter API.", details: data }, req.method, url.pathname);
        }
        return jsonResponse(200, data, req.method, url.pathname);
    } catch (error) {
        console.error("Error fetching from Twitter API (GET /webhooks):", error);
        return jsonResponse(500, { error: "Internal server error while fetching from Twitter API." }, req.method, url.pathname);
    }
}

async function createWebhook(req: Request, url: URL): Promise<Response> {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
        console.error("X_BEARER_TOKEN not found for POST /api/webhooks.");
        return jsonResponse(500, { error: "Server configuration error: Missing API token." }, req.method, url.pathname);
    }
    try {
        const body = await req.json() as { url?: string };
        if (!body.url || typeof body.url !== 'string') {
            return jsonResponse(400, { error: "Invalid request body: 'url' is required and must be a string." }, req.method, url.pathname);
        }
        const twitterApiUrl = "https://api.twitter.com/2/webhooks";
        const response = await fetch(twitterApiUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${bearerToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: body.url }),
        });
        const responseData = await response.json();
        if (!response.ok) {
            console.error(`Twitter API POST Error: ${response.status}`, responseData);
            // Forward Twitter's error response directly, as it contains useful details
            return jsonResponse(response.status, responseData, req.method, url.pathname);
        }
        return jsonResponse(response.status, responseData, req.method, url.pathname); // Usually 201
    } catch (error) {
        let errorBody = { error: "Internal server error while creating webhook." };
        let errorStatus = 500;
        if (error instanceof SyntaxError && req.headers.get("content-type")?.includes("application/json")) {
            errorBody = { error: "Invalid JSON payload." };
            errorStatus = 400;
        }
        console.error("Error creating webhook via Twitter API (POST /webhooks):", error);
        return jsonResponse(errorStatus, errorBody, req.method, url.pathname);
    }
}

async function validateWebhook(req: Request, url: URL, webhookId: string): Promise<Response> {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
        console.error("X_BEARER_TOKEN not found for PUT /api/webhooks/:id.");
        return jsonResponse(500, { error: "Server configuration error: Missing API token." }, req.method, url.pathname);
    }
    try {
        const twitterApiUrl = `https://api.twitter.com/2/webhooks/${webhookId}`;
        console.log(`[DEBUG] Sending PUT to Twitter API: ${twitterApiUrl}`);
        const response = await fetch(twitterApiUrl, {
            method: "PUT",
            headers: { "Authorization": `Bearer ${bearerToken}` },
        });
        if (!response.ok) {
            let errorDetails = `Failed to send validation request for webhook ${webhookId}.`;
            let errorDataForClient = { error: "Twitter API Error during validation request.", details: errorDetails };
            try {
                const twitterErrorData = await response.json() as any;
                errorDetails = twitterErrorData.title || twitterErrorData.detail || JSON.stringify(twitterErrorData);
                errorDataForClient.details = twitterErrorData;
            } catch (e) {
                const textDetails = await response.text();
                errorDetails = textDetails || response.statusText;
                errorDataForClient.details = errorDetails;
            }
            console.error(`Twitter API PUT Error: ${response.status}`, errorDetails);
            return jsonResponse(response.status, errorDataForClient, req.method, url.pathname);
        }
        return noContentResponse(req.method, url.pathname); // 204 No Content
    } catch (error) {
        console.error("Error sending validation request via Twitter API (PUT /webhooks/:id):", error);
        return jsonResponse(500, { error: "Internal server error while sending validation request." }, req.method, url.pathname);
    }
}

async function deleteWebhook(req: Request, url: URL, webhookId: string): Promise<Response> {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
        console.error("X_BEARER_TOKEN not found for DELETE /api/webhooks/:id.");
        return jsonResponse(500, { error: "Server configuration error: Missing API token." }, req.method, url.pathname);
    }
    try {
        const twitterApiUrl = `https://api.twitter.com/2/webhooks/${webhookId}`;
        const response = await fetch(twitterApiUrl, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${bearerToken}` },
        });
        if (!response.ok) {
            let errorDetails = `Failed to delete webhook ${webhookId}.`;
            let errorDataForClient = { error: "Failed to delete webhook from Twitter API.", details: errorDetails };
            try {
                const twitterErrorData = await response.json() as any;
                errorDetails = twitterErrorData.title || twitterErrorData.detail || JSON.stringify(twitterErrorData);
                errorDataForClient.details = twitterErrorData;
            } catch (e) {
                const textDetails = await response.text();
                errorDetails = textDetails || response.statusText;
                errorDataForClient.details = errorDetails;
            }
            console.error(`Twitter API DELETE Error: ${response.status}`, errorDetails);
            return jsonResponse(response.status, errorDataForClient, req.method, url.pathname);
        }
        return noContentResponse(req.method, url.pathname); // 204 No Content
    } catch (error) {
        console.error("Error deleting webhook via Twitter API (DELETE /webhooks/:id):", error);
        return jsonResponse(500, { error: "Internal server error while deleting webhook." }, req.method, url.pathname);
    }
}

// New function to get subscriptions for a webhook
async function getWebhookSubscriptions(req: Request, url: URL, webhookId: string): Promise<Response> {
    const bearerToken = process.env.X_BEARER_TOKEN;
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
        const twitterResponseData = await response.json() as any; // Use 'any' for now, or define a more specific type
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

async function createWebhookSubscription(req: Request, url: URL, webhookId: string): Promise<Response> {
    const consumerKey = process.env.X_CONSUMER_KEY;
    const consumerSecret = process.env.X_CONSUMER_SECRET;
    const accessToken = process.env.X_ACCESS_TOKEN;
    const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

    if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
        console.error("Missing OAuth 1.0a credentials in environment variables.");
        return jsonResponse(500, { error: "Server configuration error: Missing OAuth credentials." }, req.method, url.pathname);
    }

    const method = "POST";
    const twitterApiUrl = `https://api.twitter.com/2/account_activity/webhooks/${webhookId}/subscriptions/all`;

    const oauth = new OAuth({
        consumer: { key: consumerKey, secret: consumerSecret },
        signature_method: 'HMAC-SHA1',
        hash_function(base_string: string, key: string) {
            return crypto.createHmac('sha1', key).update(base_string).digest('base64');
        }
    });

    const requestData = {
        url: twitterApiUrl,
        method: method,
        // No body data for this specific request
    };

    const token = {
        key: accessToken,
        secret: accessTokenSecret
    };

    // The library generates the full Authorization header string
    const authHeader = oauth.toHeader(oauth.authorize(requestData, token)).Authorization;

    console.log(`[DEBUG] Attempting to add subscription with OAuth 1.0a. URL: ${twitterApiUrl}`);
    // console.log(`[DEBUG] OAuth Header: ${authHeader}`); // Be cautious logging full auth headers

    try {
        const response = await fetch(twitterApiUrl, {
            method: method,
            headers: {
                "Authorization": authHeader,
            },
        });

        const responseData = await response.json().catch(() => null);

        if (!response.ok) {
            console.error(`Twitter API POST Subscriptions/all Error: ${response.status} ${response.statusText}`, responseData);
            return jsonResponse(response.status, { error: "Failed to add subscription via Twitter API (OAuth 1.0a).", details: responseData || { message: response.statusText } }, req.method, url.pathname);
        }
        
        // Assuming 204 No Content is success for this endpoint as per typical subscription APIs
        if (response.status === 204) {
             return jsonResponse(204, { message: "Subscription successful (or already exists)." }, req.method, url.pathname);
        }
        // The /subscriptions/all endpoint might return 200 with a body or 204.
        // If it's 200, let's see what it returns.
        if (response.status === 200 && responseData) {
            console.log("Twitter API POST Subscriptions/all successful with 200:", responseData);
            return jsonResponse(200, { message: "Subscription request processed successfully.", details: responseData }, req.method, url.pathname);
        }
        
        console.warn("Twitter API POST Subscriptions/all: Unexpected successful response status or format", { status: response.status, body: responseData });
        return jsonResponse(response.status, { message: "Subscription request processed, but response format unexpected.", details: responseData }, req.method, url.pathname);

    } catch (error) {
        console.error(`Error adding subscription for webhook ${webhookId} (OAuth 1.0a):`, error);
        return jsonResponse(500, { error: "Internal server error while adding subscription." }, req.method, url.pathname);
    }
}

export async function handleWebhookRoutes(req: Request, url: URL): Promise<Response | null> {
    if (!url.pathname.startsWith("/api/webhooks")) {
        return null; // Not a webhook route
    }

    // Log the request at the entry point of this module
    // console.log(`[WEBHOOK_ROUTE_REQUEST] ${req.method} ${url.pathname}`); 
    // This is now handled in index.ts before routing here.

    const pathParts = url.pathname.split('/');
    const baseRoute = pathParts[2]; // 'webhooks'
    const webhookId = pathParts.length > 3 && pathParts[3] !== 'subscriptions' ? pathParts[3] : null;
    const action = pathParts.length > 4 ? pathParts[4] : null; // 'subscriptions' or null

    if (req.method === "GET" && url.pathname === "/api/webhooks") {
        return getWebhooks(req, url);
    }
    if (req.method === "POST" && url.pathname === "/api/webhooks") {
        return createWebhook(req, url);
    }

    // Match /api/webhooks/:webhookId/subscriptions
    const subscriptionsMatch = url.pathname.match(/^\/api\/webhooks\/(\d+)\/subscriptions$/);
    if (req.method === "GET" && subscriptionsMatch) {
        const subWebhookId = subscriptionsMatch[1];
        if (subWebhookId) { // Ensure subWebhookId is treated as a string for TypeScript
            return getWebhookSubscriptions(req, url, subWebhookId);
        }
    }
    if (req.method === "POST" && subscriptionsMatch) {
        const subWebhookId = subscriptionsMatch[1];
        if (subWebhookId) {
            // The userId from the frontend input is not strictly needed here for the Twitter API call itself,
            // as Twitter uses the Bearer token to identify the user to subscribe.
            // However, if we needed to pass it (e.g. if req.json() was used), it would be extracted here.
            return createWebhookSubscription(req, url, subWebhookId);
        }
    }

    if (webhookId) {
        if (req.method === "PUT") {
            return validateWebhook(req, url, webhookId);
        }
        if (req.method === "DELETE") {
            return deleteWebhook(req, url, webhookId);
        }
    }
    
    // If no specific /api/webhooks route matched, return null to let index.ts handle 404
    return null; 
} 