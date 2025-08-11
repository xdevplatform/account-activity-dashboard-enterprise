import type { ServerWebSocket } from 'bun'; // Though not directly used, kept for consistency if other types are needed

interface Rule {
    id: string;
    tag: string;
    value: string;
}

// Helper to create a JSON response with logging (redefined for this module)
function jsonResponse(status: number, body: any, method: string, pathname: string): Response {
    const bodyStr = JSON.stringify(body);
    // Consider a more generic logger or passing a logger instance in a real app
    console.log(`[FILTEREDSTREAM_RESPONSE] ${method} ${pathname} - Status: ${status}, Body: ${bodyStr}`);
    return new Response(bodyStr, {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

async function getFilteredStreamRules(req: Request, url: URL): Promise<Response> {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
        console.error(`X_BEARER_TOKEN not found for GET /api/rules.`);
        return jsonResponse(500, { error: "Server configuration error: Missing API token." }, req.method, url.pathname);
    }

    let allRules: Rule[] = [];
    let nextToken: string | null = null;
    const twitterApiBaseUrl = 'https://api.twitter.com/2/tweets/search/stream/rules';

    do {
        let twitterApiUrl = twitterApiBaseUrl;
        if (nextToken) {
            twitterApiUrl += `?next_token=${nextToken}`;
        }
        console.log(`[DEBUG] Fetching rules from Twitter API: ${twitterApiUrl}`);

        try {
            const response = await fetch(twitterApiUrl, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${bearerToken}`,
                    "Content-Type": "application/json",
                },
            });
            const responseData: any = await response.json();
            if (!response.ok) {
                console.error(`Twitter API GET Rules Error: ${response.status} ${response.statusText}`, responseData);
                return jsonResponse(response.status, { error: "Failed to fetch rules from Twitter API.", details: responseData }, req.method, url.pathname);
            }
            if (responseData.data && Array.isArray(responseData.data)) {
                allRules = allRules.concat(responseData.data);
            }
            nextToken = responseData.meta?.next_token || null;
        } catch (error) {
            console.error(`Error fetching rules from Twitter API:`, error);
            return jsonResponse(500, { error: "Internal server error while fetching rules." }, req.method, url.pathname);
        }
    } while (nextToken);

    return jsonResponse(200, { data: allRules, meta: { result_count: allRules.length } }, req.method, url.pathname);
}

export async function handleFilteredStreamRoutes(req: Request, url: URL): Promise<Response | null> {
    console.log(`[FILTERED_STREAM] Handling request: ${req.method} ${url.pathname}`);
    if (url.pathname === "/api/rules") {
        if (req.method === "GET") {
            console.log(`[FILTERED_STREAM] Matched GET /api/rules`);
            return getFilteredStreamRules(req, url);
        }
    }
    console.log(`[FILTERED_STREAM] No match for ${req.method} ${url.pathname}`);
    return null; 
}
