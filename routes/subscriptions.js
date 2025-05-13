const request = require('request-promise')
const auth = require('../helpers/auth.js')
// const webhook_view = require('./webhook.js') // webhook_view is not used in this file

module.exports = function (req, res) { // Changed to res for consistency with Express conventions
  let webhook_id_holder
  const render_data = {
    application_id: auth.twitter_oauth.consumer_key,
    subscriptions: [],
    // Initialize other potential properties like meta if needed
  }

  auth.get_webhook_id() // Uses app bearer token to get webhook_id
    .then(webhook_id => {
      webhook_id_holder = webhook_id
      const request_options_subs_list = {
        url: `https://api.twitter.com/2/account_activity/webhooks/${webhook_id}/subscriptions/all/list`,
        headers: { 'Authorization': 'Bearer ' + auth.provided_bearer_token },
        json: true
      }
      return request.get(request_options_subs_list)
    })
    .then(subs_list_body => {
      render_data.meta = subs_list_body.meta // Assuming meta might exist

      let users_to_hydrate_or_ids = []
      if (subs_list_body && Array.isArray(subs_list_body.data)) {
        users_to_hydrate_or_ids = subs_list_body.data
      } else if (subs_list_body && Array.isArray(subs_list_body.subscriptions)) {
        users_to_hydrate_or_ids = subs_list_body.subscriptions
      } else if (subs_list_body && Array.isArray(subs_list_body.users)) {
        users_to_hydrate_or_ids = subs_list_body.users
      } else if (Array.isArray(subs_list_body)) {
        users_to_hydrate_or_ids = subs_list_body
      }

      render_data.subscriptions = users_to_hydrate_or_ids // Store initially

      if (!users_to_hydrate_or_ids.length) {
        return Promise.resolve(null) // Skip hydration if no initial subs
      }

      const user_ids = users_to_hydrate_or_ids.map(item => {
        if (typeof item === 'string') return item
        return item.id || item.user_id
      }).filter(id => id).join(',')
      if (!user_ids) {
        return Promise.resolve(null) // Skip hydration if no user IDs found
      }

      const request_options_users_lookup = {
        url: `https://api.twitter.com/2/users?ids=${user_ids}`,
        headers: { 'Authorization': 'Bearer ' + auth.provided_bearer_token },
        json: true
      }
      return request.get(request_options_users_lookup)
    })
    .then(users_lookup_response => {
      if (users_lookup_response && users_lookup_response.data && Array.isArray(users_lookup_response.data)) {
        render_data.subscriptions = users_lookup_response.data
      } else if (users_lookup_response === null) {
        // Hydration was skipped, render_data.subscriptions already holds the initial list (or empty)
      } else {
        console.warn('User lookup for subscriptions returned unexpected data:', users_lookup_response)
      }
      
      if (!res.headersSent) {
        res.render('subscriptions', render_data)
      }
    })
    .catch(err => {
      console.error('Error in /subscriptions route:', err.statusCode, err.error || err.message, err.response ? err.response.body : '')
      if (!res.headersSent) {
        const error_render_data = {
          title: 'Error',
          message: (err.error && err.error.errors && err.error.errors[0] && err.error.errors[0].message) || err.message || 'Subscriptions could not be retrieved.',
          button: {
            title: 'Ok',
            url: '/'
          },
          application_id: auth.twitter_oauth.consumer_key,
          subscriptions: [] 
        }
        res.status(err.statusCode || 500).render('status', error_render_data)
      }
    })
}
