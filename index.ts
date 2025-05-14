import { serve } from "bun";
import { handleWebhookRoutes } from "./src/routes/webhookRoutes"; // Import the new handler
import { handleUserRoutes } from "./src/routes/userRoutes"; // Import the new user route handler
import path from "node:path"; // For path joining

const projectRoot = import.meta.dir;
const publicFolder = path.resolve(projectRoot, "public");

serve({
  async fetch(req) {
    const url = new URL(req.url);
    console.log(`[REQUEST] ${req.method} ${url.pathname}`);

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
});

console.log(`Listening on http://localhost:${process.env.PORT || 3000} ...`);