const request = require('request-promise')
const auth = require('../../helpers/auth.js')
const args = require('../args.js')

if (!args.webhookid) {
  console.error('Error: webhookid is required. Please provide it with -w <webhookid>')
  process.exit(1)
}
if (!args.userid) {
  console.error('Error: userid for the subscription to remove is required. Please provide it with -u <userid>')
  process.exit(1)
}

// request options
const request_options = {
  url: `https://api.twitter.com/2/account_activity/webhooks/${args.webhookid}/subscriptions/${args.userid}/all`,
  headers: { 'Authorization': 'Bearer ' + auth.provided_bearer_token }, // Bearer token auth
  resolveWithFullResponse: true
}

console.log(`Attempting to remove subscription for user ${args.userid} from webhook ${args.webhookid}`)
request.delete(request_options)
  .then(function (response) {
    console.log('HTTP response code:', response.statusCode)
    if (response.statusCode == 204) {
      console.log(`Subscription for user ${args.userid} removed successfully.`)
    } else if (response.statusCode == 200) {
      console.log(`Subscription for user ${args.userid} removed (response with body).`)
      if (response.body) {
        console.log('Response body:', response.body)
      }
    } else {
      console.warn('Subscription removal may not have been successful. Status code:', response.statusCode)
    }
  })
  .catch(function (err) {
    console.error(`Error removing subscription for user ${args.userid}:`, err.statusCode)
    console.log('- Verify webhook ID and user ID.')
    console.log('Full error message below:')
    console.log(err.error || err.message)
  })
