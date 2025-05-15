import { Buffer } from 'buffer'; // Bun provides Buffer

// Helper to create a JSON response (can be shared or redefined)
function jsonResponse(status: number, body: any, method: string, pathname: string): Response {
    const bodyStr = JSON.stringify(body);
    console.log(`[TWITTER_EVENT_RESPONSE] ${method} ${pathname} - Status: ${status}, Body: ${bodyStr}`);
    return new Response(bodyStr, {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

// Helper for plain text or empty response
function textResponse(status: number, text: string, method: string, pathname: string): Response {
    console.log(`[TWITTER_EVENT_RESPONSE] ${method} ${pathname} - Status: ${status}, Body: ${text || "(empty)"}`);
    return new Response(text, { status });
}

async function handleCrcCheck(req: Request, url: URL): Promise<Response> {
    const crcToken = url.searchParams.get('crc_token');
    console.log(`[TWITTER_EVENT_CRC] Received GET request for CRC check. CRC Token: ${crcToken}`);

    if (!crcToken) {
        console.error("[TWITTER_EVENT_CRC] Error: crc_token missing from query parameters.");
        return jsonResponse(400, { error: "crc_token query parameter missing" }, req.method, url.pathname);
    }

    const consumerSecret = process.env.X_CONSUMER_SECRET;
    if (!consumerSecret) {
        console.error("[TWITTER_EVENT_CRC] Error: X_CONSUMER_SECRET is not set in environment variables.");
        return jsonResponse(500, { error: "Server configuration error: Missing consumer secret." }, req.method, url.pathname);
    }

    try {
        const hasher = new Bun.CryptoHasher("sha256", consumerSecret);
        hasher.update(crcToken);
        const arrayBufferDigest = hasher.digest(); // Get digest as ArrayBuffer

        const responseToken = 'sha256=' + Buffer.from(arrayBufferDigest).toString('base64');
        
        console.log(`[TWITTER_EVENT_CRC] Generated response_token: ${responseToken}`);
        return jsonResponse(200, { response_token: responseToken }, req.method, url.pathname);

    } catch (error) {
        console.error("[TWITTER_EVENT_CRC] Error during HMAC SHA256 generation:", error);
        return jsonResponse(500, { error: "Internal server error during CRC processing." }, req.method, url.pathname);
    }
}

// Update handleEventPost to accept and use the broadcast function
async function handleEventPost(req: Request, url: URL, broadcastFunction: (message: any) => void): Promise<Response> {
    console.log(`[TWITTER_EVENT_POST] Received POST request for event data.`);
    try {
        const eventData = await req.json();
        console.log("[TWITTER_EVENT_POST] --- Received Webhook Event ---");
        console.log(JSON.stringify(eventData, null, 2));
        console.log("[TWITTER_EVENT_POST] -----------------------------");
        
        // Broadcast the event to connected WebSocket clients
        broadcastFunction(eventData);

        return textResponse(200, "", req.method, url.pathname); // Twitter expects 200 OK
    } catch (error) {
        let requestBodyText = "(Could not read body)";
        try {
            // Try to read as text if JSON parsing failed, for logging
            const clonedReq = req.clone();
            requestBodyText = await clonedReq.text();
        } catch (e) {
            // Ignore if reading as text also fails
        }
        console.error("[TWITTER_EVENT_POST] Error processing POST request or non-JSON body:", error);
        console.log(`[TWITTER_EVENT_POST] Body: ${requestBodyText}`);
        // Even if there's an error processing, Twitter might expect a 200 OK
        // to prevent retries, or a specific error code if it's a malformed request.
        // For now, returning 200 as per the example's successful POST handling.
        // If Twitter sends something unparseable, it's their issue, not ours to block with a non-200.
        return textResponse(200, "", req.method, url.pathname);
    }
}


export async function handleTwitterEventRoutes(req: Request, url: URL, broadcastFunction: (message: any) => void): Promise<Response | null> {
    // Assuming the path is /webhooks/twitter as per the Python example
    if (url.pathname === '/webhooks/twitter') {
        if (req.method === 'GET') {
            return handleCrcCheck(req, url);
        }
        if (req.method === 'POST') {
            // Pass the broadcast function to handleEventPost
            return handleEventPost(req, url, broadcastFunction);
        }
        // Method Not Allowed for other HTTP methods on this path
        console.log(`[TWITTER_EVENT_HANDLER] Method ${req.method} not allowed for ${url.pathname}`);
        return textResponse(405, "Method Not Allowed", req.method, url.pathname);
    }
    return null; // Not a route handled by this module
} 