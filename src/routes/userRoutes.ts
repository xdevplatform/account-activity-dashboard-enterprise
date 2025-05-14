import type { ServerWebSocket } from 'bun';

// Helper to create a JSON response (can be shared or redefined)
// For now, redefining for simplicity, but ideally, this would be a shared utility.
function jsonResponse(status: number, body: any, method: string, pathname: string): Response {
    const bodyStr = JSON.stringify(body);
    console.log(`[USER_API_RESPONSE] ${method} ${pathname} - Status: ${status}, Body: ${bodyStr}`);
    return new Response(bodyStr, {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

async function getUserDetails(req: Request, url: URL, userId: string): Promise<Response> {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
        console.error(`X_BEARER_TOKEN not found for GET /api/users/${userId}.`);
        return jsonResponse(500, { error: "Server configuration error: Missing API token." }, req.method, url.pathname);
    }

    const twitterApiUrl = `https://api.twitter.com/2/users/${userId}?user.fields=profile_image_url`;
    console.log(`[DEBUG] Fetching user details from Twitter API: ${twitterApiUrl}`);

    try {
        const response = await fetch(twitterApiUrl, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${bearerToken}`,
                "Content-Type": "application/json",
            },
        });
        const responseData = await response.json(); 
        if (!response.ok) {
            console.error(`Twitter API GET User Details Error for ID ${userId}: ${response.status} ${response.statusText}`, responseData);
            return jsonResponse(response.status, { error: "Failed to fetch user details from Twitter API.", details: responseData }, req.method, url.pathname);
        }
        // The responseData should be in the format: { data: { id, name, username, profile_image_url } }
        return jsonResponse(200, responseData, req.method, url.pathname);
    } catch (error) {
        console.error(`Error fetching user details for ID ${userId} from Twitter API:`, error);
        return jsonResponse(500, { error: "Internal server error while fetching user details." }, req.method, url.pathname);
    }
}

export async function handleUserRoutes(req: Request, url: URL): Promise<Response | null> {
    const pathParts = url.pathname.split('/'); // e.g. ['', 'api', 'users', '12345']
    
    if (pathParts.length === 4 && pathParts[1] === 'api' && pathParts[2] === 'users') {
        const userId = pathParts[3];
        if (req.method === "GET" && userId) {
            return getUserDetails(req, url, userId);
        }
    }
    return null; // Not a user route handled by this module
} 