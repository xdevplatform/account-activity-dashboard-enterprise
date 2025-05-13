const request = require('request-promise')
const auth = require('../../helpers/auth.js')
const args = require('../args.js')

// This script now uses the app owner's OAuth 1.0a tokens for User Context auth

// We need webhook_id. The script used to take it as args.webhookid.
// To get it now, we could call auth.get_webhook_id() if the script needs to be self-contained,
// or assume args.webhookid is still provided if this script is called after manually getting the ID.
// For simplicity, let's assume args.webhookid is still provided.
if (!args.webhookid) {
  console.error('Error: webhookid is required. Please provide it with -w <webhookid>')
  process.exit(1)
}

const request_options = {
  url: `https://api.twitter.com/2/account_activity/webhooks/${args.webhookid}/subscriptions/all`,
  oauth: auth.twitter_oauth, // App owner's OAuth 1.0a tokens
  json: true // Expecting JSON response
}

console.log('Requesting subscriptions list with options:', request_options.url, 'using app owner OAuth1.0a')
request.get(request_options)
  .then(function (body) {
    console.log('Response:')
    console.log(JSON.stringify(body, null, 2))
  })
  .catch(function (err) {
    console.error('Error getting subscriptions list:', err.statusCode, err.error || err.message)
  })
