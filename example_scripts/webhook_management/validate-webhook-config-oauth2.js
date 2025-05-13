const request = require('request-promise')
const auth = require('../../helpers/auth.js')
const args = require('../args.js')


// auth.get_twitter_bearer_token().then(function (bearer_token) { // This line and its structure are removed

  // request options
  var request_options = {
    url: 'https://api.twitter.com/2/webhooks/' + args.webhookid,
    resolveWithFullResponse: true,
    headers: { 'Authorization': 'Bearer ' + auth.provided_bearer_token }
  }

  // PUT request to retrieve webhook config
  request.put(request_options).then(function (response) {
    console.log('HTTP response code:', response.statusCode)
    console.log('CRC request successful and webhook status set to valid.')
  }).catch(function (response) {
    console.log('HTTP response code:', response.statusCode)
    console.log(response.error)
  });
// }); // Corresponding end of removed structure
