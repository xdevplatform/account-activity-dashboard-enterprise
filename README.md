# Account Activity Dashboard (Bun Version)

A web application to help manage Twitter Account Activity API webhooks. This version is built using [Bun](https://bun.sh/).

## Features (Current)

*   **Webhook Management (via UI):**
    *   List registered webhooks for your Twitter application.
    *   Add new webhook URLs.
    *   Delete existing webhooks.
    *   Initiate a Challenge-Response Check (CRC) to validate a webhook.
*   **Navigation:**
    *   Tabbed interface for "Webhooks", "Subscriptions" (placeholder), and "Live Events" (placeholder).
    *   Logo and title in the navigation bar.
*   **Backend:**
    *   Serves the frontend `index.html`.
    *   Provides API endpoints (`/api/webhooks`) to interact with the Twitter API for webhook management, using a Bearer Token for authentication.
    *   Logs requests and responses to the console.

## Technologies Used

*   **Runtime & Bundler:** [Bun](https://bun.sh/)
*   **Frontend:** HTML, CSS, vanilla JavaScript
*   **API Interaction:** `fetch` API (both frontend and backend)

## Setup

1.  **Clone the Repository:**
    ```bash
    git clone <your-repository-url>
    cd <repository-directory>
    ```

2.  **Install Dependencies (Bun will handle this when running):**
    Bun typically installs dependencies automatically when it encounters them in `import` statements or as specified in `package.json` if you start using it more formally. For now, ensuring Bun is installed is key.

3.  **Configure Environment Variables:**
    *   Copy the `env.template` file to a new file named `.env` in the root of the project:
        ```bash
        cp env.template .env
        ```
    *   Edit the `.env` file and add your Twitter App's Bearer Token:
        ```
        X_CONSUMER_KEY=
        X_CONSUMER_SECRET=
        X_ACCESS_TOKEN=
        X_ACCESS_TOKEN_SECRET=
        X_BEARER_TOKEN=YOUR_TWITTER_APP_BEARER_TOKEN_HERE # Replace this
        ```
        The Bearer Token is used for authenticating with the Twitter API v2 webhook endpoints.

## Running the Application

1.  **Start the Server:**
    ```bash
    bun run index.ts
    ```
    This will start the Bun server, typically on port 3000. The console will confirm the listening address (e.g., `Listening on http://localhost:3000 ...`).

    For development with automatic reloading when `index.ts` changes:
    ```bash
    bun run --watch index.ts
    ```
    *(Note: Hot reloading for `index.html` changes directly served by `Bun.file()` might require a browser refresh or further server configuration if not automatically handled by Bun's development server for static files.)*

2.  **Access in Browser:**
    Open your web browser and navigate to `http://localhost:3000` (or the port indicated in the console).

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

## How it Works

*   The `index.ts` file uses Bun's built-in `serve` function to create an HTTP server.
*   It serves the `index.html` file for the root path (`/`).
*   It provides API endpoints under `/api/webhooks` that the frontend calls:
    *   `GET /api/webhooks`: Fetches the list of registered webhooks.
    *   `POST /api/webhooks`: Creates a new webhook.
    *   `DELETE /api/webhooks/:id`: Deletes a specified webhook.
    *   `PUT /api/webhooks/:id`: Initiates a CRC validation for a specified webhook.
*   These backend endpoints securely use the `X_BEARER_TOKEN` from the `.env` file to make authenticated requests to the Twitter API (`https://api.twitter.com/2/webhooks`).
*   The frontend `index.html` uses JavaScript to:
    *   Manage tab navigation.
    *   Fetch data from the backend API endpoints.
    *   Dynamically render the list of webhooks.
    *   Handle user interactions for adding, deleting, and validating webhooks, including confirmation dialogs and feedback messages.

## Future Enhancements (Potential)

*   Implement "Subscriptions" and "Live Events" tabs.
*   Add user authentication if multiple users need to manage webhooks.
*   Improve UI/UX styling.
*   More robust error handling and user feedback.
*   Client-side and server-side validation for inputs.
*   Webhook URL specific CRC handling/display within the UI.

## Security Note

This application is currently designed for local development and management by a trusted user who has access to the Bearer Token. Ensure your `.env` file with the Bearer Token is kept secure and not committed to version control if the repository becomes public.
