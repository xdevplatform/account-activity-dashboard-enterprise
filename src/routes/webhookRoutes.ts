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

// Helper for responses with no content (e.g., 204 No Content, 202 Accepted)
function noContentResponse(method: string, pathname: string, status: number = 204): Response {
    console.log(`[RESPONSE] ${method} ${pathname} - Status: ${status}, Body: (empty)`);
    return new Response(null, { status });
}

function convertLocalYYYYMMDDHHmmToUTC(localDateTimeStr: string): string {
    const year = parseInt(localDateTimeStr.substring(0, 4), 10);
    const month = parseInt(localDateTimeStr.substring(4, 6), 10) - 1; // Month is 0-indexed in JS Date
    const day = parseInt(localDateTimeStr.substring(6, 8), 10);
    const hour = parseInt(localDateTimeStr.substring(8, 10), 10);
    const minute = parseInt(localDateTimeStr.substring(10, 12), 10);

    const localDate = new Date(year, month, day, hour, minute);

    const utcYear = localDate.getUTCFullYear();
    const utcMonth = (localDate.getUTCMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed, add 1 back
    const utcDay = localDate.getUTCDate().toString().padStart(2, '0');
    const utcHour = localDate.getUTCHours().toString().padStart(2, '0');
    const utcMinute = localDate.getUTCMinutes().toString().padStart(2, '0');

    return `${utcYear}${utcMonth}${utcDay}${utcHour}${utcMinute}`;
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

async function replayWebhookEvents(req: Request, url: URL, webhookId: string): Promise<Response> {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
        console.error(`X_BEARER_TOKEN not found for POST /api/webhooks/${webhookId}/replay.`);
        return jsonResponse(500, { error: "Server configuration error: Missing API token." }, req.method, url.pathname);
    }

    try {
        const from_date = url.searchParams.get('from_date');
        const to_date = url.searchParams.get('to_date');

        if (!from_date || typeof from_date !== 'string' || !to_date || typeof to_date !== 'string') {
            return jsonResponse(400, { error: "Invalid query parameters: 'from_date' and 'to_date' are required strings in YYYYMMDDHHmm format representing local time." }, req.method, url.pathname);
        }
        
        // Basic validation for YYYYMMDDHHmm format (length 12, all digits)
        if (from_date.length !== 12 || !/^[0-9]+$/.test(from_date) || to_date.length !== 12 || !/^[0-9]+$/.test(to_date)) {
            return jsonResponse(400, { error: "Invalid date format in query parameters: 'from_date' and 'to_date' must be in YYYYMMDDHHmm format representing local time." }, req.method, url.pathname);
        }

        const from_date_utc = convertLocalYYYYMMDDHHmmToUTC(from_date);
        const to_date_utc = convertLocalYYYYMMDDHHmmToUTC(to_date);

        const twitterApiUrl = `https://api.twitter.com/2/account_activity/replay/webhooks/${webhookId}/subscriptions/all?from_date=${from_date_utc}&to_date=${to_date_utc}`;
        console.log(`[DEBUG] Sending POST to X API for replay: ${twitterApiUrl} (UTC times) from local inputs: from=${from_date}, to=${to_date}`);

        const response = await fetch(twitterApiUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${bearerToken}`,
                // Content-Type is not needed for POST with query parameters and no body
            },
            // No body for this request as parameters are in URL
        });

        interface XReplaySuccessResponse {
            data: {
                job_id: string;
                created_at: string;
            };
        }

        if (response.status === 200) { // OK
            const responseData = await response.json() as XReplaySuccessResponse;
            console.log(`[DEBUG] X API Replay request successful for webhook ${webhookId}. Job ID: ${responseData?.data?.job_id}`);
            return jsonResponse(200, responseData, req.method, url.pathname); // Forward X API's response
        }
        
        // Handle X API errors
        let errorDetails = `Failed to request replay for webhook ${webhookId}.`;
        let errorDataForClient = { error: "X API Error during replay request.", details: errorDetails };
        try {
            const twitterErrorData = await response.json() as any;
            errorDetails = twitterErrorData.title || twitterErrorData.detail || JSON.stringify(twitterErrorData);
            errorDataForClient.details = twitterErrorData; // Send the whole X error object
        } catch (e) {
            const textDetails = await response.text();
            errorDetails = textDetails || response.statusText;
            errorDataForClient.details = errorDetails;
        }
        console.error(`X API Replay Error: ${response.status}`, errorDetails);
        return jsonResponse(response.status, errorDataForClient, req.method, url.pathname);

    } catch (error) {
        // No SyntaxError check needed here as we are not parsing a request body
        console.error("Error processing replay request (POST /api/webhooks/:id/replay):", error);
        return jsonResponse(500, { error: "Internal server error while requesting event replay." }, req.method, url.pathname);
    }
}

async function subscribeWebhookToFilteredStream(req: Request, url: URL, webhookId: string): Promise<Response> {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
        console.error(`X_BEARER_TOKEN not found for POST /api/webhooks/${webhookId}/filteredstream.`);
        return jsonResponse(500, { error: "Server configuration error: Missing API token." }, req.method, url.pathname);
    }

    const twitterApiUrl = `https://api.twitter.com/2/tweets/search/webhooks/${webhookId}`;
    console.log(`[DEBUG] Subscribing webhook to filtered stream: ${twitterApiUrl}`);

    try {
        const response = await fetch(twitterApiUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${bearerToken}`,
            },
        });

        if (response.ok) {
            return jsonResponse(200, { message: "Webhook subscribed to filtered stream successfully." }, req.method, url.pathname);
        } else {
            const errorData = await response.json();
            console.error(`Twitter API POST Subscribe Error: ${response.status} ${response.statusText}`, errorData);
            return jsonResponse(response.status, { error: "Failed to subscribe webhook to filtered stream.", details: errorData }, req.method, url.pathname);
        }
    } catch (error) {
        console.error(`Error subscribing webhook ${webhookId} to filtered stream:`, error);
        return jsonResponse(500, { error: "Internal server error while subscribing webhook." }, req.method, url.pathname);
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
    
    // POST /api/webhooks/:webhookId/replay
    const replayMatch = url.pathname.match(/^\/api\/webhooks\/([a-zA-Z0-9_]+)\/replay$/);
    if (replayMatch && req.method === 'POST') {
        const webhookIdForReplay = replayMatch[1];
        return replayWebhookEvents(req, url, webhookIdForReplay);
    }

    // POST /api/webhooks/:webhookId/filteredstream
    const filteredStreamMatch = url.pathname.match(/^\/api\/webhooks\/([a-zA-Z0-9_]+)\/filteredstream$/);
    if (filteredStreamMatch && req.method === 'POST') {
        const webhookIdForSubscribe = filteredStreamMatch[1];
        return subscribeWebhookToFilteredStream(req, url, webhookIdForSubscribe);
    }

    return null; // No match
} 