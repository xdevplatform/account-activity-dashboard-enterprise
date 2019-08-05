const request = require('request-promise')
const auth = require('../helpers/auth.js')
const webhook_view = require('./webhook.js')


module.exports = async (req, resp) => {

  try {
    let json_response
    let user_id;

    // get list of subs
    let bearer_token = await auth.get_twitter_bearer_token()
    let webhook_id = await auth.get_webhook_id(bearer_token)

    let request_options = {
      url: 'https://api.twitter.com/1.1/account_activity/webhooks/' + webhook_id + '/subscriptions/all/list.json',
      auth: {
        'bearer': bearer_token
      }
    }

    let body = await request.get(request_options)
    let json_body = json_response = JSON.parse(body)

    // if no subs, render as is and skip user hydration
    if (!json_body.subscriptions.length) {
      resp.render('subscriptions', json_body)
      return Promise.resolve()
    }

    // construct comma delimited list of user IDs for user hydration
    json_body.subscriptions.forEach(sub => {
      if (user_id) {
        user_id = user_id + ',' + sub.user_id
      } else {
        user_id = sub.user_id
      }
    });

    request_options = {
      url: 'https://api.twitter.com/1.1/users/lookup.json?user_id=' + user_id,
      auth: {
        'bearer': bearer_token
      }
    }

    body = await request.get(request_options)

    // replace the subscriptions list with list of user objects
    // and render list
    // only render if we didn't skip user hydration
    if (body) {
      json_response.subscriptions = JSON.parse(body)
      response.render('subscriptions', json_response)
    }
  } catch(e) {
    var json_response = {
      title: 'Error',
      message: 'Subscriptions could not be retrieved. ',
      button: {
        title: 'Ok',
        url: '/'
      }
    }

    json_response.message += JSON.parse(e.error).errors[0].message
    resp.status(500);
    resp.render('status', json_response)
  }
}
