const request = require('request-promise')
const auth = require('../../helpers/auth.js')
const args = require('../args.js')


// request options
var request_options = {
  url: 'https://api.twitter.com/2/webhooks/' + args.webhookid + '/subscriptions/all',
  headers: { 'Authorization': 'Bearer ' + auth.provided_bearer_token },
  resolveWithFullResponse: true
}

// DELETE request (changed from POST comment in original code) to remove subscription
request.delete(request_options).then(function (response) {
  console.log('HTTP response code:', response.statusCode)

  if (response.statusCode == 204) {
    console.log('Subscription removed.')
  }
}).catch(function (response) {
  console.log('HTTP response code:', response.statusCode)
  console.log('Incorrect environment name or user has not authorized your app.')
})
