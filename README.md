# Account Activity Dashboard (AAA Dashboard)

## Overview

The Account Activity Dashboard (AAA Dashboard) is a single-page web application designed to manage X (formerly Twitter) account activity. It allows users to register and manage webhooks, subscribe users to these webhooks for activity events, and view a live stream of these events.

The application features a frontend built with HTML, CSS, and vanilla JavaScript, and a backend powered by Bun.js using TypeScript.

## Features

### 1. Webhooks Management
Administrate the webhook URLs registered with your X Developer App.
- **List Webhooks:** View all currently registered webhooks for your X application, including their ID, URL, creation date, and validity status.
- **Add Webhook:** Register a new webhook URL with X. The dashboard requires the full URL that X will send events to.
- **Delete Webhook:** Remove an existing webhook registration from X.
- **Validate Webhook (CRC Check):** Manually trigger a CRC (Challenge-Response Check) request from X to your webhook URL to confirm its validity.

### 2. Subscriptions Management (Per Webhook)
Manage user subscriptions for each registered webhook. This determines whose account activity will generate events.
- **Webhook Selection:** Choose an active webhook from a dropdown list to manage its specific subscriptions.
- **List Subscriptions:** For the selected webhook, view a list of all users currently subscribed. Each user is displayed with their avatar, X handle (username), and User ID. Avatars link to the user's X profile.
- **Add Subscription:** Subscribe the user (whose credentials are in the `.env` file, specifically `X_ACCESS_TOKEN` and `X_ACCESS_TOKEN_SECRET` which represent the user to be subscribed) to the selected webhook to start receiving their account activity events.
- **Delete Subscription:** Unsubscribe a specific user from the selected webhook, stopping event delivery for their activity.

### 3. Live Events Viewer
View a real-time stream of account activity events for subscribed users.
- **Real-time Updates:** Uses WebSockets to receive and display events as they happen.
- **Event Cards:** Each event is displayed as a card with relevant details. Supported event types include:
    - **New Posts:** Shows when a subscribed user creates a new post (content, user info, timestamp).
    - **Deleted Posts:** Shows when a post from a subscribed user is deleted (post ID, user ID, timestamp).
    - **Favorited Posts:** Shows when a subscribed user favorites a post (favoriting user, details of the favorited post).
    - **Follows/Unfollows:** Shows when a subscribed user follows or unfollows another user (actor, target, timestamp).
    - **Mutes/Unmutes:** Shows when a subscribed user mutes or unmutes another user (actor, target, timestamp).
    - System messages for connection status and unrecognized event types are also displayed.
- **Instructions Panel:** A dedicated panel on the right side of the Live Events tab provides clear instructions on how to:
    - Expose the local application to the internet using `ngrok`.
    - Construct the correct webhook URL for use with X.
    - Add the webhook and subscribe users within this dashboard.

### 4. Backend Functionality
The Bun.js server handles several key tasks:
- **Static File Serving:** Serves the `index.html` and static assets (CSS, JS) from the `/public` directory.
- **API Proxy:** Provides backend API endpoints that proxy requests to the X API v2 (e.g., for fetching webhooks, users, managing subscriptions). This keeps X API credentials secure on the server.
- **Webhook Event Handling:**
    - **CRC Checks (GET `/webhooks/twitter`):** Responds to X's CRC validation requests using the `X_CONSUMER_SECRET`.
    - **Event Receiving (POST `/webhooks/twitter`):** Receives incoming event payloads from X.
- **Authentication:**
    - Uses **OAuth 1.0a** (with consumer keys and user access tokens from `.env`) for actions like creating subscriptions.
    - Uses **Bearer Token** (from `.env`) for read-only actions like fetching webhooks or user details.
- **WebSocket Server:** Establishes a WebSocket connection with the frontend (`/ws/live-events`) to broadcast incoming X events in real-time to the Live Events tab.

## Tech Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+)
- **Backend:** [Bun.js](https://bun.sh/) (using TypeScript)
- **X API Version:** v2
- **Key Libraries:**
    - `oauth-1.0a` (for backend X API authentication)
- **Development Tooling:** `ngrok` (recommended for exposing local server)

## Project Structure

```
.
├── .env                # Local environment variables (created from env.template)
├── .env.template       # Template for environment variables
├── .gitignore          # Specifies intentionally untracked files
├── index.html          # Main frontend HTML, CSS, and JavaScript
├── index.ts            # Bun server (backend logic, API proxy)
├── package.json        # Project metadata, scripts, and dependencies
├── bun.lockb           # Bun's lockfile
├── tsconfig.json       # TypeScript configuration for editor support
└── README.md           # This file
```

## Setup and Running the Application

### Prerequisites
1.  **Bun:** Ensure you have Bun installed. Visit [bun.sh](https://bun.sh/) for installation instructions.
2.  **X Developer Account & App:**
    *   You need an X Developer Account.
    *   Create an App within your X Developer Portal to obtain API keys and tokens.
    *   Ensure your App has the necessary permissions for the Account Activity API (or the relevant v2 endpoints for webhooks and user activity). You will need Consumer Keys, and an Access Token & Secret for the user account whose activity you wish to monitor and manage subscriptions for. A Bearer Token is also needed for some v2 endpoints.

### Environment Variables
1.  **Create `.env` file:**
    Copy the `env.template` file to a new file named `.env` in the project root.
    ```bash
    cp env.template .env
    ```
2.  **Populate `.env`:**
    Open the `.env` file and fill in your X Developer App credentials:
    ```
    X_CONSUMER_KEY="YOUR_APP_CONSUMER_KEY"
    X_CONSUMER_SECRET="YOUR_APP_CONSUMER_SECRET"
    X_ACCESS_TOKEN="USER_ACCESS_TOKEN_FOR_SUBSCRIPTIONS"
    X_ACCESS_TOKEN_SECRET="USER_ACCESS_TOKEN_SECRET_FOR_SUBSCRIPTIONS"
    X_BEARER_TOKEN="YOUR_APP_BEARER_TOKEN"
    # Optional: PORT=3001 (defaults to 3000 if not set)
    ```
    - `X_ACCESS_TOKEN` and `X_ACCESS_TOKEN_SECRET` should belong to the X user account for which you want to manage webhook subscriptions (i.e., whose activities the webhook will monitor).

### Installation
Install project dependencies (primarily `oauth-1.0a` and any type definitions Bun pulls in automatically):
```bash
bun install
```

### Running the Application
1.  **Start the server:**
    ```bash
    bun run index.ts
    ```
    (If you have `nodemon` or similar tools configured for Bun, you might use `bun dev` or an equivalent command.)
2.  **Access the Dashboard:**
    Open your browser and navigate to `http://localhost:3000` (or the port you specified in `.env`).

### Setting Up Webhooks for Live Events
To receive live events from X in the dashboard:
1.  **Expose your local server:**
    Since the application runs locally, X needs a public URL to send events. Use a tool like `ngrok`.
    - If you don't have ngrok, download and install it from [ngrok.com](https://ngrok.com/).
    - Run ngrok to forward to your local Bun server's port (default 3000):
      ```bash
      ngrok http http://localhost:3000
      ```
    - ngrok will provide a public HTTPS forwarding URL (e.g., `https://your-unique-id.ngrok-free.app`). **Copy this HTTPS URL.**

2.  **Construct your full Webhook URL:**
    Append `/webhooks/twitter` to your ngrok HTTPS URL.
    *Example:* `https://your-unique-id.ngrok-free.app/webhooks/twitter`

3.  **Add the Webhook in the Dashboard:**
    - Navigate to the "Webhooks" tab in the AAA Dashboard.
    - Enter the full ngrok-based webhook URL you constructed into the "Add New Webhook" form and submit.
    - X will send a CRC request to this URL. The backend is set up to handle this. You should see the webhook appear in the list, and ideally, it becomes valid.

4.  **Subscribe a User:**
    - Go to the "Subscriptions" tab.
    - Select your newly added (and validated) webhook from the dropdown.
    - Click the "Add Subscription (for user in .env)" button. This will attempt to subscribe the X user (associated with the `X_ACCESS_TOKEN` and `X_ACCESS_TOKEN_SECRET` in your `.env` file) to activity events.

5.  **View Live Events:**
    - Navigate to the "Live Events" tab.
    - If the WebSocket connection is successful, any configured activity from the subscribed user should now appear here in real-time.

---

This README should provide a good overview for anyone looking to understand or run the Account Activity Dashboard.

## Future Enhancements (Potential)

*   Implement "Subscriptions" and "Live Events" tabs.
*   Add user authentication if multiple users need to manage webhooks.
*   Improve UI/UX styling.
*   More robust error handling and user feedback.
*   Client-side and server-side validation for inputs.
*   Webhook URL specific CRC handling/display within the UI.

## Security Note

This application is currently designed for local development and management by a trusted user who has access to the Bearer Token. Ensure your `.env` file with the Bearer Token is kept secure and not committed to version control if the repository becomes public.
