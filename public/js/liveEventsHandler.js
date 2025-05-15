let liveEventsSocket = null;
const MAX_EVENTS_DISPLAYED = 50; // Keep a manageable number of events on screen

function formatTwitterTimestamp(twitterTimestamp) {
    // Parses Twitter's timestamp string and formats it
    // Example: "Thu May 15 12:35:18 +0000 2025"
    try {
        const date = new Date(twitterTimestamp);
        if (isNaN(date.getTime())) {
            return twitterTimestamp; // Return original if parsing fails
        }
        return date.toLocaleString(); // User's local time
    } catch (e) {
        return twitterTimestamp; // Fallback
    }
}

function createEventCard(eventData) {
    const card = document.createElement('div');
    card.className = 'event-card';

    let content = '<p><strong>Unrecognized Event Type</strong></p>';
    content += `<p><small>Received: ${new Date().toLocaleTimeString()}</small></p>`;
    content += `<pre>${JSON.stringify(eventData, null, 2)}</pre>`;

    if (eventData.type === "connection_ack") {
        content = `<p><em>${eventData.message} (at ${new Date().toLocaleTimeString()})</em></p>`;
        card.classList.add('event-card-system');
    } else if (eventData.tweet_create_events && eventData.tweet_create_events.length > 0) {
        const tweetEvent = eventData.tweet_create_events[0];
        const user = tweetEvent.user;
        content = `
            <h4>New Tweet</h4>
            <p><strong>From:</strong> ${user.name} (@${user.screen_name})</p>
            <p><strong>Tweet:</strong> ${tweetEvent.text}</p>
            <p><small>Tweet ID: ${tweetEvent.id_str}</small></p>
            <p><small>User ID: ${user.id_str}</small></p>
            <p><small>Posted At: ${formatTwitterTimestamp(tweetEvent.created_at)}</small></p>
            <p><small>Received: ${new Date().toLocaleTimeString()}</small></p>
        `;
        card.classList.add('event-card-tweet-create');
    } else if (eventData.tweet_delete_events && eventData.tweet_delete_events.length > 0) {
        const deleteEvent = eventData.tweet_delete_events[0];
        content = `
            <h4>Tweet Deleted</h4>
            <p><strong>Tweet ID:</strong> ${deleteEvent.status.id}</p>
            <p><strong>User ID:</strong> ${deleteEvent.status.user_id}</p>
            <p><small>Event Timestamp (UTC ms): ${deleteEvent.timestamp_ms}</small></p>
            <p><small>Processed: ${new Date(parseInt(deleteEvent.timestamp_ms)).toLocaleString()}</small></p>
            <p><small>Received by Dashboard: ${new Date().toLocaleTimeString()}</small></p>
        `;
        card.classList.add('event-card-tweet-delete');
    } else if (eventData.favorite_events && eventData.favorite_events.length > 0) {
        const favEvent = eventData.favorite_events[0];
        content = `
            <h4>Tweet Favorited</h4>
            <p><strong>User:</strong> ${favEvent.user.name} (@${favEvent.user.screen_name}) favorited a tweet.</p>
            <p><strong>Favorited Tweet ID:</strong> ${favEvent.favorited_status.id_str}</p>
            <p><strong>Favorited Tweet User:</strong> @${favEvent.favorited_status.user.screen_name}</p>
            <p><small>Event At: ${formatTwitterTimestamp(favEvent.created_at)}</small></p>
            <p><small>Received: ${new Date().toLocaleTimeString()}</small></p>
        `;
        card.classList.add('event-card-favorite');
    } else if (eventData.follow_events && eventData.follow_events.length > 0) {
        const followEvent = eventData.follow_events[0];
        const actor = followEvent.source;
        const target = followEvent.target;
        const actionText = followEvent.type === 'follow' ? 'followed' : 'unfollowed';
        content = `
            <h4>User ${actionText.charAt(0).toUpperCase() + actionText.slice(1)}</h4>
            <p><strong>${actor.name}</strong> (@${actor.screen_name}) ${actionText} <strong>${target.name}</strong> (@${target.screen_name}).</p>
            <p><small>Event Timestamp: ${new Date(parseInt(followEvent.created_timestamp)).toLocaleString()}</small></p>
            <p><small>Received: ${new Date().toLocaleTimeString()}</small></p>
        `;
        card.classList.add(followEvent.type === 'follow' ? 'event-card-follow' : 'event-card-unfollow');
    } else if (eventData.mute_events && eventData.mute_events.length > 0) {
        const muteEvent = eventData.mute_events[0];
        const actor = muteEvent.source;
        const target = muteEvent.target;
        const actionText = muteEvent.type === 'mute' ? 'muted' : 'unmuted';
        content = `
            <h4>User ${actionText.charAt(0).toUpperCase() + actionText.slice(1)}</h4>
            <p><strong>${actor.name}</strong> (@${actor.screen_name}) ${actionText} <strong>${target.name}</strong> (@${target.screen_name}).</p>
            <p><small>Event Timestamp: ${new Date(parseInt(muteEvent.created_timestamp)).toLocaleString()}</small></p>
            <p><small>Received: ${new Date().toLocaleTimeString()}</small></p>
        `;
        card.classList.add(muteEvent.type === 'mute' ? 'event-card-mute' : 'event-card-unmute');
    }
    // Add more else if blocks for other event types like block, direct_message_events etc.
    
    card.innerHTML = content;
    return card;
}

function addEventToContainer(eventData) {
    const container = document.getElementById('live-events-container');
    if (!container) return;

    const card = createEventCard(eventData);
    container.insertBefore(card, container.firstChild); // Add new events to the top

    // Limit the number of displayed events
    while (container.children.length > MAX_EVENTS_DISPLAYED) {
        container.removeChild(container.lastChild);
    }
}

function initializeLiveEvents() {
    const liveEventsContainer = document.getElementById('live-events-container');
    if (!liveEventsContainer) {
        console.error("Live events container not found.");
        return;
    }
    liveEventsContainer.innerHTML = '<p><i>Attempting to connect to live event stream...</i></p>';

    if (liveEventsSocket && liveEventsSocket.readyState === WebSocket.OPEN) {
        console.log("WebSocket already open for live events.");
        addEventToContainer({type: "system_message", message: "Re-focused tab. WebSocket was already open."} ) // Example system message
        return;
    }

    // Determine WebSocket protocol (ws or wss)
    const wsProtocol = window.location.protocol === 'https:s' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/live-events`;

    liveEventsSocket = new WebSocket(wsUrl);

    liveEventsSocket.onopen = function(event) {
        console.log("[WebSocket] Connection established for live events.");
        if(liveEventsContainer.firstChild && liveEventsContainer.firstChild.tagName === 'P' && liveEventsContainer.firstChild.textContent.includes('Attempting to connect')){
            liveEventsContainer.innerHTML = ''; // Clear "Attempting to connect..."
        }
        // Server sends an ack, which will be handled by onmessage
        // addEventToContainer({ type: "system_message", message: "Connected to live event stream!" });
    };

    liveEventsSocket.onmessage = function(event) {
        try {
            const eventData = JSON.parse(event.data);
            console.log("[WebSocket] Message from server: ", eventData);
            addEventToContainer(eventData);
        } catch (e) {
            console.error("[WebSocket] Error parsing message from server:", e);
            addEventToContainer({ type: "system_error", message: "Error parsing server message.", details: event.data });
        }
    };

    liveEventsSocket.onerror = function(event) {
        console.error("[WebSocket] Error observed:", event);
        addEventToContainer({ type: "system_error", message: "WebSocket error observed. See console for details." });
        if(liveEventsContainer.firstChild && liveEventsContainer.firstChild.tagName === 'P' && liveEventsContainer.firstChild.textContent.includes('Attempting to connect')){
            liveEventsContainer.innerHTML = '<p style="color:red;"><i>Error connecting to live event stream. See console.</i></p>';
        }
    };

    liveEventsSocket.onclose = function(event) {
        console.log("[WebSocket] Connection closed for live events. Code:", event.code, "Reason:", event.reason);
        addEventToContainer({ type: "system_message", message: `WebSocket connection closed. Code: ${event.code}. ${event.reason ? "Reason: "+event.reason : ""}` });
        liveEventsSocket = null; // Reset for re-connection if tab is re-opened
         if(liveEventsContainer.firstChild && liveEventsContainer.firstChild.tagName === 'P' && liveEventsContainer.firstChild.textContent.includes('Attempting to connect')){
            liveEventsContainer.innerHTML = '<p style="color:orange;"><i>Disconnected from live event stream. Will attempt to reconnect if you revisit this tab.</i></p>';
        }
    };
}

function closeLiveEventsConnection() {
    if (liveEventsSocket) {
        console.log("[WebSocket] Closing live events connection.");
        liveEventsSocket.close();
        liveEventsSocket = null;
        const liveEventsContainer = document.getElementById('live-events-container');
        if (liveEventsContainer) {
            // liveEventsContainer.innerHTML = '<p><i>Disconnected from live event stream.</i></p>';
        }
    }
}

// Expose functions to be called from main.js or HTML
if (typeof window !== 'undefined') {
    window.initializeLiveEvents = initializeLiveEvents;
    window.closeLiveEventsConnection = closeLiveEventsConnection;
} 