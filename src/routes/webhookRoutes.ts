import type { ServerWebSocket } from 'bun';
// crypto and OAuth imports are no longer needed here if all subscription logic is moved.
// import crypto from 'crypto'; 
// import OAuth from 'oauth-1.0a';
import { handleSubscriptionRoutes } from './subscriptionRoutes'; // Import new handler

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

export async function handleWebhookRoutes(req: Request, url: URL): Promise<Response | null> {
    if (!url.pathname.startsWith("/api/webhooks")) {
        return null; // Not a webhook route
    }

    const pathParts = url.pathname.split('/');
    // /api/webhooks -> length 3
    // /api/webhooks/:id -> length 4
    // /api/webhooks/:id/subscriptions -> length 5
    // /api/webhooks/:id/subscriptions/:userId -> length 6

    const primaryId = pathParts.length > 3 ? pathParts[3] : null;
    const secondaryAction = pathParts.length > 4 ? pathParts[4] : null;

    // Check for subscription routes first: /api/webhooks/:webhookId/subscriptions(/:optionalUserId)
    if (primaryId && secondaryAction === 'subscriptions') {
        const webhookIdForSubs = primaryId;
        // Pass the original URL (url object) to handleSubscriptionRoutes for its own path parsing
        return handleSubscriptionRoutes(req, url, webhookIdForSubs);
    }

    // Handle direct webhook actions: /api/webhooks or /api/webhooks/:id
    if (req.method === "GET" && !primaryId) { // GET /api/webhooks
        return getWebhooks(req, url);
    }
    if (req.method === "POST" && !primaryId) { // POST /api/webhooks
        return createWebhook(req, url);
    }
    
    if (primaryId && !secondaryAction) { // Routes like /api/webhooks/:id for PUT, DELETE
        if (req.method === "PUT") {
            return validateWebhook(req, url, primaryId);
        }
        if (req.method === "DELETE") {
            return deleteWebhook(req, url, primaryId);
        }
    }
    
    return null; 
} 