const request = require('request-promise')
const auth = require('../helpers/auth.js')
const moment = require('moment')

let webhook = {}

/**
 * Retrieves existing webhook config and renders
 */
webhook.get_config = async (req, resp) => {
  try {
    let request_options = {
      url: 'https://api.twitter.com/1.1/account_activity/webhooks.json',
      oauth: auth.twitter_oauth
    }

    const body = await request.get(request_options)

    if (req.headers.host) {
      var json_response = {
        configs: JSON.parse(body),
        csrf_token: req.csrfToken(),
        update_webhook_url: 'https://' + req.headers.host + '/webhook/twitter'
      }
    }

    if (json_response.configs.length) {
      json_response.update_webhook_url = json_response.configs[0].url
    }

    resp.render('webhook', json_response)
  } catch(e) {
    let json_response = {
      title: 'Error',
      message: 'Error retrieving webhook config. ',
      button: {
        title: 'Ok',
        url: '/webhook'
      }
    }

    json_response.message += JSON.parse(e.error).errors[0].message
    resp.status(500);
    resp.render('status', json_response)
  }
}


/**
 * Triggers challenge response check
 */
webhook.validate_config = async (req, resp) => {
  try {
    const bearer_token = await auth.get_twitter_bearer_token()

    let request_options = {
      url: 'https://api.twitter.com/1.1/account_activity/webhooks/' + req.body.webhook_id + '.json',
      resolveWithFullResponse: true,
      auth: {
        'bearer': bearer_token
      }
    }

    const response = request.put(request_options)

    const json_response = {
      title: 'Success',
      message: 'Challenge request successful and webhook status set to valid.',
      button: {
        title: 'Ok',
        url: '/webhook'
      }
    }

    resp.render('status', json_response)
  } catch {
    const json_response = {
      title: 'Error',
      message: response.error,
      button: {
        title: 'Ok',
        url: '/webhook'
      }
    }

    resp.render('status', json_response)
  }
}

/**
 * Deletes exiting webhook config
 * then creates new webhook config
 */
webhook.update_config = async (req, resp) => {
  try {
    const response = await delete_webhook(req.body.webhook_id)

    let request_options = {
      url: 'https://api.twitter.com/1.1/account_activity/all/' + auth.twitter_webhook_environment + '/webhooks.json',
      oauth: auth.twitter_oauth,
      headers: {
        'Content-type': 'application/x-www-form-urlencoded'
      },
      form: {
        url: req.body.url
      }
    }

    const body = await request.post(request_options)

    const json_response = {
      title: 'Success',
      message: 'Webhook successfully updated.',
      button: {
        title: 'Ok',
        url: '/webhook'
      }
    }

    resp.render('status', json_response)
  } catch(e) {
    let json_response = {
      title: 'Error',
      message: 'Webhook not updated.',
      button: {
        title: 'Ok',
        url: '/webhook'
      }
    }

    if (e) {
      console.log('e =>', e)
      json_response.message = JSON.parse(e).errors[0].message
    }

    resp.render('status', json_response)
  }
}


/**
 * Deletes existing webhook config
 */
webhook.delete_config = async (req, resp) => {
  try {
    const response = await delete_webhook(req.body.webhook_id)

    let json_response = {
      title: 'Success',
      message: 'Webhook successfully deleted.',
      button: {
        title: 'Ok',
        url: '/webhook'
      }
    }

    resp.render('status', json_response)
  } catch(e) {

    let json_response = {
      title: 'Error',
      message: 'Webhook was not deleted. ',
      button: {
        title: 'Ok',
        url: '/webhook'
      }
    }

    json_response.message += JSON.parse(e.error).errors[0].message
    resp.render('status', json_response)
  }
}


/**
 * Triggers a Replay job
 */
 webhook.replay_config = async (req, resp) => {
   try {
     const from_date = moment(req.body.startdate.toString()).format('YYYYMMDDHHmm')
     const to_date = moment(req.body.enddate.toString()).format('YYYYMMDDHHmm')

     const bearer_token = await auth.get_twitter_bearer_token()
     const webhook_id = await auth.get_webhook_id(bearer_token)

     let request_options = {
       url: 'https://api.twitter.com/1.1/account_activity/replay/webhooks/' + webhook_id + '/subscriptions/all.json?from_date=' + from_date + '&to_date=' + to_date,
       auth: {
         'bearer': bearer_token
       }
     }

     const response = request.post(request_options)

     var json_response = {
       title: 'Success',
       message: 'Replay job successfully initiated.',
       button: {
         title: 'Ok',
         url: '/webhook'
       }
     }

     resp.render('status', json_response)
   } catch {
     let json_response = {
       title: 'Error',
       message: response.error,
       button: {
         title: 'Ok',
         url: '/webhook'
       }
     }

     resp.render('status', json_response)
   }
 }


/**
 * Helper function that deletes the webhook config.
 * Returns a promise.
 */
const delete_webhook = webhook_id => {
  return new Promise(async (resolve, reject) => {
    // if no webhook id provided, assume there is none to delete
    if (!webhook_id) {
      resolve()
      return;
    }

    // construct request to delete webhook config
    const request_options = {
      url: 'https://api.twitter.com/1.1/account_activity/webhooks/' + webhook_id + '.json',
      oauth: auth.twitter_oauth,
      resolveWithFullResponse: true
    }

    try {
      await request.delete(request_options)
      resolve()
    } catch(e) {
      reject(e)
    }
  })
}

module.exports = webhook
