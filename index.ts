import { serve, type ServerWebSocket } from "bun";
import { handleWebhookRoutes } from "./src/routes/webhookRoutes"; // Import the new handler
import { handleUserRoutes } from "./src/routes/userRoutes"; // Import the new user route handler
import { handleXEventRoutes } from "./src/routes/xEventRoutes"; // Import the X event handler
import { handleFilteredStreamRoutes } from "./src/routes/filteredstreamRoutes"; // Import the filtered stream handler
import path from "node:path"; // For path joining

const projectRoot = import.meta.dir;
const publicFolder = path.resolve(projectRoot, "public");

// Set to store active WebSocket connections for live events
const liveEventClients = new Set<ServerWebSocket<unknown>>();

// Function to broadcast messages to all connected live event clients
function broadcastToLiveEventClients(message: string | object) {
  const messageString = typeof message === 'string' ? message : JSON.stringify(message);
  console.log(`[WEBSOCKET_BROADCAST] Broadcasting to ${liveEventClients.size} clients: ${messageString.substring(0,100)}...`);
  for (const client of liveEventClients) {
    try {
      client.send(messageString);
    } catch (e) {
      console.error("[WEBSOCKET_BROADCAST] Error sending to client:", e);
      // Client will be removed in the 'close' handler if the error causes a disconnect
    }
  }
}

serve({
  async fetch(req, server) {
    const url = new URL(req.url);
    console.log(`[REQUEST] ${req.method} ${url.pathname}`);

    // WebSocket upgrade for live events
    if (url.pathname === "/ws/live-events") {
      const success = server.upgrade(req);
      if (success) {
        // Bun automatically handles send/recv after successful upgrade.
        // The open, message, close, drain handlers are on the websocket object below.
        return; // Return nothing on successful upgrade
      }
      // Upgrade failed
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Handle /api/webhooks routes (which now also delegates to subscriptionRoutes)
    const webhookResponse = await handleWebhookRoutes(req, url);
    if (webhookResponse) {
      return webhookResponse;
    }

    // Handle /api/users routes
    const userResponse = await handleUserRoutes(req, url);
    if (userResponse) {
      return userResponse;
    }

    // Handle /api/rules routes for filtered stream
    const filteredStreamResponse = await handleFilteredStreamRoutes(req, url);
    if (filteredStreamResponse) {
      return filteredStreamResponse;
    }

    // Handle /webhooks/twitter for incoming X events (CRC & POST)
    const xEventResponse = await handleXEventRoutes(req, url, broadcastToLiveEventClients);
    if (xEventResponse) {
      return xEventResponse;
    }

    // Static file serving from /public
    if (url.pathname.startsWith("/public/")) {
      const filePath = path.join(publicFolder, url.pathname.substring("/public".length));
      const file = Bun.file(filePath);
      try {
        const exists = await file.exists();
        if (exists) {
          // Basic content type guessing based on extension
          let contentType = "application/octet-stream"; // Default
          if (filePath.endsWith(".css")) contentType = "text/css";
          if (filePath.endsWith(".js")) contentType = "application/javascript";
          if (filePath.endsWith(".png")) contentType = "image/png";
          if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) contentType = "image/jpeg";
          if (filePath.endsWith(".svg")) contentType = "image/svg+xml";
          if (filePath.endsWith(".html")) contentType = "text/html";
          
          console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: 200, Content-Type: ${contentType}, File: ${filePath}`);
          return new Response(file, { headers: { "Content-Type": contentType } });
        }
      } catch (e) {
        // If Bun.file or file.exists() throws (e.g. path issues), log and fall through to 404
        console.error(`Error serving static file ${filePath}:`, e);
      }
      // If file doesn't exist or error, fall through to 404 for /public/ paths
    }

    // Serve index.html for the root path
    if (url.pathname === "/") {
      const indexHtmlPath = path.join(projectRoot, "index.html"); // Serve from root
      console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: 200, Content-Type: text/html, File: ${indexHtmlPath}`);
      return new Response(Bun.file(indexHtmlPath), {
        headers: { "Content-Type": "text/html" },
      });
    }
    
    // TODO: Add static file serving for /public/* here later

    // Fallback to 404 Not Found
    console.log(`[RESPONSE] ${req.method} ${url.pathname} - Status: 404, Body: "Not Found"`);
    return new Response("Not Found", { status: 404 });
  },
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000, 
  hostname: "localhost",
  development: true, 
  websocket: {
    open(ws) {
      liveEventClients.add(ws);
      console.log(`[WEBSOCKET_SERVER] Client connected to /ws/live-events. Total clients: ${liveEventClients.size}`);
      ws.send(JSON.stringify({ type: "connection_ack", message: "Connected to live event stream!" }));
    },
    message(ws, message) {
      console.log(`[WEBSOCKET_SERVER] Received message from client (unexpected): ${message}`);
      // Echo back if needed for testing, or handle specific client messages
      // ws.send(`Server received: ${message}`); 
    },
    close(ws, code, reason) {
      liveEventClients.delete(ws);
      console.log(`[WEBSOCKET_SERVER] Client disconnected from /ws/live-events. Code: ${code}, Reason: ${reason}. Total clients: ${liveEventClients.size}`);
    },
    perMessageDeflate: true, // Enable compression if desired
  }
});

console.log(`Listening on http://localhost:${process.env.PORT || 3000} ...`);
console.log(`WebSocket for live events available at ws://localhost:${process.env.PORT || 3000}/ws/live-events`);