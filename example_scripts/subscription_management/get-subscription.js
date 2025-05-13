const request = require('request-promise')
const auth = require('../../helpers/auth.js')
const args = require('../args.js')

if (!args.webhookid) {
  console.error('Error: webhookid is required. Please provide it with -w <webhookid>')
  process.exit(1)
}

// request options
const request_options = {
  url: `https://api.twitter.com/2/account_activity/webhooks/${args.webhookid}/subscriptions/all`,
  oauth: auth.twitter_oauth, // App owner's OAuth 1.0a tokens
  resolveWithFullResponse: true // To check status code
}

console.log('Checking app owner subscription status with options:', request_options.url, 'using app owner OAuth1.0a')
request.get(request_options)
  .then(function (response) {
    console.log('HTTP response code:', response.statusCode)
    // For GET /subscriptions/all, a 200 OK with a list means the user (app owner) is subscribed if their ID is in the list.
    // A 204 No Content from older APIs meant subscription exists. V2 might be different.
    // The V2 GET /subscriptions/all (user context) should return a list of subscribed users if any for that token.
    // If it returns 200 and data, it means the token owner is subscribed.
    if (response.statusCode == 200) {
        console.log('Subscription status check successful. Response indicates app owner is subscribed (or list of subscriptions for app owner retrieved).')
        console.log('Response body:', JSON.stringify(JSON.parse(response.body), null, 2)) // Assuming body is JSON string
    } else {
        console.log('Subscription status check returned an unexpected status code.')
    }
  })
  .catch(function (err) {
    console.error('Error checking subscription status:', err.statusCode)
    if (err.statusCode === 404) {
        console.log('App owner is likely not subscribed, or no subscriptions exist for this webhook under app owner context.')
    } else {
        console.log('Full error message below:')
        console.log(err.error || err.message)
    }
  })
