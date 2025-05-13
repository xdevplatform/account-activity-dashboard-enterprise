const request = require('request-promise')
const auth = require('../../helpers/auth.js')
const args = require('../args.js')


// auth.get_twitter_bearer_token().then(function (bearer_token) { // This line and its structure are removed

  // request options
  var request_options = {
    url: 'https://api.twitter.com/2/webhooks/' + args.webhookid + '/subscriptions/all/list',
    headers: { 'Authorization': 'Bearer ' + auth.provided_bearer_token }
  }
  console.log(request_options)
  request.get(request_options).then(function (body) {
    console.log(body)
  }).catch(function (err) { // Added catch for robustness
    console.error('Error getting subscriptions list:', err.message || err.error || err.statusCode);
  });
// }); // Corresponding end of removed structure
