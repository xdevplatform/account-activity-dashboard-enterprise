const request = require('request-promise')
const auth = require('../helpers/auth.js')
// const webhook_view = require('./webhook.js') // webhook_view is not used in this file

module.exports = function (req, res) { // Changed to res for consistency with Express conventions
  let json_response_from_subs_list

  auth.get_webhook_id()
    .then(webhook_id => {
      const request_options_subs_list = {
        url: `https://api.twitter.com/2/webhooks/${webhook_id}/subscriptions/all/list`,
        headers: { 'Authorization': 'Bearer ' + auth.provided_bearer_token },
        json: true // Automatically parses the JSON response
      }
      return request.get(request_options_subs_list)
    })
    .then(subs_list_body => {
      json_response_from_subs_list = subs_list_body

      if (!subs_list_body || !subs_list_body.subscriptions || !subs_list_body.subscriptions.length) {
        res.render('subscriptions', subs_list_body || { subscriptions: [] }) // Render with empty or original list
        return Promise.resolve(null) // Signal to skip user hydration
      }

      const user_ids = subs_list_body.subscriptions.map(sub => sub.user_id).filter(id => id).join(',')
      if (!user_ids) {
        res.render('subscriptions', subs_list_body) // Render with original list, no users to hydrate
        return Promise.resolve(null)
      }

      const request_options_users_lookup = {
        url: `https://api.twitter.com/1.1/users/lookup.json?user_id=${user_ids}`,
        headers: { 'Authorization': 'Bearer ' + auth.provided_bearer_token },
        json: true
      }
      return request.get(request_options_users_lookup)
    })
    .then(users_lookup_body => {
      if (users_lookup_body) { // If users_lookup_body is null, it means we skipped hydration
        json_response_from_subs_list.subscriptions = users_lookup_body
        res.render('subscriptions', json_response_from_subs_list)
      }
      // If users_lookup_body is null, response was already sent in the previous block.
    })
    .catch(err => {
      console.error('Error in /subscriptions route:', err.message || err.error || err.statusCode)
      const error_response = {
        title: 'Error',
        message: (err.error && err.error.errors && err.error.errors[0] && err.error.errors[0].message) || err.message || 'Subscriptions could not be retrieved.',
        button: {
          title: 'Ok',
          url: '/'
        }
      }
      if (!res.headersSent) {
        res.status(err.statusCode || 500).render('status', error_response)
      }
    })
}
