const request = require('request-promise')
// const passport = require('passport') // Passport is not directly used by these actions themselves
const auth = require('../helpers/auth.js')

var actions = {}

actions.addsub = function (user) {
  // user object here is expected to have access_token, access_token_secret, and profile.id
  if (!user || !user.access_token || !user.access_token_secret || !user.profile || !user.profile.id) {
    console.error('actions.addsub: User object is missing required credentials or profile info.', user)
    return Promise.reject(new Error('User authentication data is incomplete.'))
  }
  return auth.get_webhook_id()
    .then(webhook_id => {
      const request_options_for_add = {
        url: `https://api.twitter.com/2/account_activity/webhooks/${webhook_id}/subscriptions/all`,
        oauth: {
          consumer_key: auth.twitter_oauth.consumer_key,
          consumer_secret: auth.twitter_oauth.consumer_secret,
          token: user.access_token,
          token_secret: user.access_token_secret
        },
        resolveWithFullResponse: true,
        json: true // Assuming the API might return a JSON body for success/failure details
      }
      return request.post(request_options_for_add)
    })
}

actions.removesub = function (user) {
  // user object for removesub (if called from Passport flow) might be req.user from passport
  // if called directly, it needs user.profile.id
  if (!user || !user.profile || !user.profile.id) {
    console.error('actions.removesub: User object is missing profile.id.', user)
    return Promise.reject(new Error('User ID not found for removing subscription.'))
  }
  return auth.get_webhook_id()
    .then(webhook_id => {
      const user_id_to_remove = user.profile.id
      const request_options_for_remove = {
        url: `https://api.twitter.com/2/account_activity/webhooks/${webhook_id}/subscriptions/${user_id_to_remove}/all`,
        headers: { 'Authorization': 'Bearer ' + auth.provided_bearer_token },
        resolveWithFullResponse: true,
        json: true
      }
      return request.delete(request_options_for_remove)
    })
}

// Export the actions object directly
module.exports = { actions }

// The old module.exports = function (req, resp) { ... } is removed as the routing
// and response rendering for these actions are now handled more directly in app.js
// or by the generic passport callback handler if removesub is still called via that.
