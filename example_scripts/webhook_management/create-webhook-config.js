const request = require('request-promise')
const auth = require('../../helpers/auth.js')
const args = require('../args.js')


// request options
var request_options = {
  url: 'https://api.twitter.com/2/webhooks',
  headers: {
    'Authorization': 'Bearer ' + auth.provided_bearer_token
  },
  body: {
    url: args.url
  },
  json: true
}


// POST request to create webhook config
request.post(request_options).then(function (body) {
  console.log(body)
}).catch(function (body) {
  console.log(body)
})
