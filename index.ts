import { serve } from "bun";

serve({
  async fetch(req) {
    const url = new URL(req.url);
    console.log(`[REQUEST] ${req.method} ${url.pathname}`);

    if (url.pathname === "/") {
      console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: 200, Content-Type: text/html, File: ./index.html`);
      return new Response(Bun.file("./index.html"), {
        headers: { "Content-Type": "text/html" },
      });
    }

    if (url.pathname === "/api/webhooks" && req.method === "GET") {
      const bearerToken = process.env.X_BEARER_TOKEN;
      if (!bearerToken) {
        const errorBody = JSON.stringify({ error: "Server configuration error: Missing API token." });
        console.error("X_BEARER_TOKEN not found in environment variables.");
        console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: 500, Body: ${errorBody}`);
        return new Response(
          errorBody,
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      try {
        const twitterApiUrl = "https://api.twitter.com/2/webhooks";
        const response = await fetch(twitterApiUrl, {
          headers: {
            "Authorization": `Bearer ${bearerToken}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          const errorBody = JSON.stringify({ error: "Failed to fetch data from Twitter API.", details: errorText });
          console.error(`Twitter API Error: ${response.status} ${response.statusText}`, errorText);
          console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: ${response.status}, Body: ${errorBody}`);
          return new Response(
            errorBody,
            { status: response.status, headers: { "Content-Type": "application/json" } }
          );
        }

        const data = await response.json();
        const responseBody = JSON.stringify(data);
        console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: 200, Body: ${responseBody}`);
        return new Response(responseBody, {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        const errorBody = JSON.stringify({ error: "Internal server error while fetching from Twitter API." });
        console.error("Error fetching from Twitter API:", error);
        console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: 500, Body: ${errorBody}`);
        return new Response(
          errorBody,
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Handle POST request to create a new webhook
    if (req.method === "POST" && url.pathname === "/api/webhooks") {
      const bearerToken = process.env.X_BEARER_TOKEN;

      if (!bearerToken) {
        const errorBody = JSON.stringify({ error: "Server configuration error: Missing API token." });
        console.error("X_BEARER_TOKEN not found for POST /api/webhooks.");
        console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: 500, Body: ${errorBody}`);
        return new Response(
          errorBody,
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      try {
        const body = await req.json() as { url?: string }; 
        if (!body.url || typeof body.url !== 'string') {
          const errorBody = JSON.stringify({ error: "Invalid request body: 'url' is required and must be a string." });
          console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: 400, Body: ${errorBody}`);
          return new Response(errorBody, {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
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
        const responseBodyStr = JSON.stringify(responseData);

        if (!response.ok) {
          console.error(`Twitter API POST Error: ${response.status}`, responseData);
          console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: ${response.status}, Body: ${responseBodyStr}`);
          return new Response(
            responseBodyStr, // Twitter API often returns JSON error body
            { status: response.status, headers: { "Content-Type": "application/json" } }
          );
        }
        
        console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: ${response.status}, Body: ${responseBodyStr}`);
        return new Response(responseBodyStr, {
          status: response.status, 
          headers: { "Content-Type": "application/json" },
        });

      } catch (error) {
        let errorBodyStr: string;
        let errorStatus = 500;
        if (error instanceof SyntaxError && req.headers.get("content-type")?.includes("application/json")) {
            errorBodyStr = JSON.stringify({ error: "Invalid JSON payload." });
            errorStatus = 400;
        } else {
            errorBodyStr = JSON.stringify({ error: "Internal server error while creating webhook." });
        }
        console.error("Error creating webhook via Twitter API:", error);
        console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: ${errorStatus}, Body: ${errorBodyStr}`);
        return new Response(
          errorBodyStr,
          { status: errorStatus, headers: { "Content-Type": "application/json" } }
        );
      }
    }
    
    // Handle PUT request to validate a webhook (trigger CRC)
    if (req.method === "PUT" && url.pathname.startsWith("/api/webhooks/")) {
      const webhookId = url.pathname.split('/').pop();
      const bearerToken = process.env.X_BEARER_TOKEN;

      if (!webhookId) {
        const errorBody = JSON.stringify({ error: "Webhook ID is missing for validation." });
        console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: 400, Body: ${errorBody}`);
        return new Response(errorBody, {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (!bearerToken) {
        const errorBody = JSON.stringify({ error: "Server configuration error: Missing API token." });
        console.error("X_BEARER_TOKEN not found for PUT /api/webhooks/:id.");
        console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: 500, Body: ${errorBody}`);
        return new Response(errorBody, {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      try {
        const twitterApiUrl = `https://api.twitter.com/2/webhooks/${webhookId}`;
        console.log(`[DEBUG] Sending PUT to Twitter API: ${twitterApiUrl}`);
        const response = await fetch(twitterApiUrl, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${bearerToken}`,
            // No Content-Type or body needed for this Twitter API PUT request
          },
        });

        if (!response.ok) {
          // Attempt to parse error from Twitter as JSON, otherwise use text
          let errorDetails = `Failed to send validation request for webhook ${webhookId}.`;
          let responseBodyForLog = "";
          try {
            const errorData = await response.json() as { title?: string, detail?: string, [key: string]: any };
            errorDetails = errorData.title || errorData.detail || JSON.stringify(errorData);
            responseBodyForLog = JSON.stringify({ error: "Twitter API Error during validation request.", details: errorData });
          } catch (e) {
            const textDetails = await response.text();
            errorDetails = textDetails || response.statusText;
            responseBodyForLog = JSON.stringify({ error: "Twitter API Error during validation request.", details: errorDetails });
          }
          console.error(`Twitter API PUT Error: ${response.status}`, errorDetails);
          console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: ${response.status}, Body: ${responseBodyForLog}`);
          return new Response(responseBodyForLog, {
            status: response.status,
            headers: { "Content-Type": "application/json" },
          });
        }
        
        // Twitter API PUT /2/webhooks/:id for validation returns 204 No Content on success
        console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: 204 (Validation request successful)`);
        return new Response(null, { status: 204 });

      } catch (error) {
        const errorBody = JSON.stringify({ error: "Internal server error while sending validation request." });
        console.error("Error sending validation request via Twitter API:", error);
        console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: 500, Body: ${errorBody}`);
        return new Response(errorBody, {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    
    // Handle DELETE request for a specific webhook
    if (req.method === "DELETE" && url.pathname.startsWith("/api/webhooks/")) {
      const webhookId = url.pathname.split('/').pop(); 
      const bearerToken = process.env.X_BEARER_TOKEN;

      if (!webhookId) {
        const errorBody = JSON.stringify({ error: "Webhook ID is missing." });
        console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: 400, Body: ${errorBody}`);
        return new Response(errorBody, {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (!bearerToken) {
        const errorBody = JSON.stringify({ error: "Server configuration error: Missing API token." });
        console.error("X_BEARER_TOKEN not found in environment variables for DELETE.");
        console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: 500, Body: ${errorBody}`);
        return new Response(
          errorBody,
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      try {
        const twitterApiUrl = `https://api.twitter.com/2/webhooks/${webhookId}`;
        const response = await fetch(twitterApiUrl, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${bearerToken}`,
          },
        });

        if (!response.ok) {
          let errorDetails = "Failed to delete webhook.";
          let responseBodyForLog = "";
          try {
            // Try to parse as JSON first, as Twitter API might send error details this way
            const errorData = await response.json() as { title?: string, detail?: string, [key: string]: any };
            errorDetails = errorData.title || errorData.detail || JSON.stringify(errorData);
            responseBodyForLog = JSON.stringify({ error: "Failed to delete webhook from Twitter API.", details: errorData });
          } catch (e) {
            // If not JSON, or if .json() fails (e.g. for an empty error response that's not 204)
            const textDetails = await response.text();
            errorDetails = textDetails || response.statusText;
            responseBodyForLog = JSON.stringify({ error: "Failed to delete webhook from Twitter API.", details: errorDetails });
          }
          console.error(`Twitter API DELETE Error: ${response.status}`, errorDetails);
          console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: ${response.status}, Body: ${responseBodyForLog}`);
          return new Response(
            responseBodyForLog,
            { status: response.status, headers: { "Content-Type": "application/json" } }
          );
        }
        
        console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: 204 (No Content)`);
        return new Response(null, { status: 204 }); 

      } catch (error) {
        const errorBody = JSON.stringify({ error: "Internal server error while deleting webhook." });
        console.error("Error deleting webhook via Twitter API:", error);
        console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: 500, Body: ${errorBody}`);
        return new Response(
          errorBody,
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: 404, Body: "Not Found"`);
    return new Response("Not Found", { status: 404 });
  },
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000, 
  hostname: "localhost",
  development: true, 
});

console.log(`Listening on http://localhost:${process.env.PORT || 3000} ...`);