const request = require('request-promise')
const auth = require('../../helpers/auth.js')
const args = require('../args.js')


// request options
var request_options = {
  url: 'https://api.x.com/1.1/account_activity/webhooks.json',
  oauth: auth.twitter_oauth
}


// GET request to retreive webhook config
request.get(request_options, function (error, response, body) {
  console.log(body)
})
