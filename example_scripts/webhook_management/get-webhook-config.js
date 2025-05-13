const request = require('request-promise')
const auth = require('../../helpers/auth.js')
const args = require('../args.js')


// request options
var request_options = {
  url: 'https://api.twitter.com/2/webhooks',
  headers: { 'Authorization': 'Bearer ' + auth.provided_bearer_token }
}


// GET request to retreive webhook config
request.get(request_options, function (error, response, body) {
  console.log(body)
})
