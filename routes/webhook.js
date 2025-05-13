const request = require('request-promise')
const auth = require('../helpers/auth.js')
const moment = require('moment')


var webhook = {}


/**
 * Retrieves existing webhook config and renders
 */
webhook.get_config = function (req, resp) {
  // construct request to retrieve webhook config
  var request_options = {
    url: 'https://api.twitter.com/2/webhooks',
    headers: { 'Authorization': 'Bearer ' + auth.provided_bearer_token },
    json: true // Ensures body is parsed JSON
  }

  request.get(request_options)
  // success
  .then(function (body) {
    var webhook_configs = [];
    if (body && body.data && Array.isArray(body.data)) {
      webhook_configs = body.data;
    }

    var json_response = {
      configs: webhook_configs, // Use the extracted array
      csrf_token: req.csrfToken(),
      update_webhook_url: 'https://' + req.headers.host + '/webhook/twitter' // Default
    }

    if (webhook_configs.length > 0 && webhook_configs[0].url) {
      // If a webhook is registered, its URL might be used by the template
      // for update/delete actions, ensure this reflects the actual registered URL if needed.
      // The template might also expect webhook_id as configs[0].id for other operations.
      // For now, we'll keep the update_webhook_url as the generic one for new creations.
      // If the template uses configs[0].url to prefill forms, that should work.
    }

    // console.log('Render data for /webhook:', json_response); // For debugging
    resp.render('webhook', json_response)
  })
  // failure
  .catch(function (err) { // Changed from body to err for correct error handling
    console.error('Error retrieving webhook config:', err.message || err.error || err.statusCode);
    var error_json_response = {
      title: 'Error',
      message: 'Webhook config unable to be retrieved.',
      button: {
        title: 'Ok',
        url: '/webhook'
      },
      csrf_token: req.csrfToken(), // Good to provide csrf even on error pages if forms are there
      configs: [] // Provide empty configs array
    }
    if (err.statusCode === 401) {
        error_json_response.message = 'Unauthorized. Check your Bearer Token.';
    }

    resp.status(err.statusCode || 500);
    resp.render('webhook', error_json_response); // Render the webhook page with an error message
  })
}


/**
 * Triggers challenge response check
 */
webhook.validate_config = function (req, resp) {
  // request options
  var request_options = {
    url: 'https://api.twitter.com/2/webhooks/' + req.body.webhook_id,
    resolveWithFullResponse: true,
    headers: { 'Authorization': 'Bearer ' + auth.provided_bearer_token }
  }

  // PUT request to retreive webhook config
  request.put(request_options)
  // success
  .then(function (response) {
    var json_response = {
      title: 'Success',
      message: 'Challenge request successful and webhook status set to valid.',
      button: {
        title: 'Ok',
        url: '/webhook'
      }
    }
    resp.render('status', json_response)
  })
  // failure
  .catch(function (response) {
    var json_response = {
      title: 'Error',
      message: response.error,
      button: {
        title: 'Ok',
        url: '/webhook'
      }
    }
    resp.render('status', json_response)
  })
}

/**
 * Deletes exiting webhook config
 * then creates new webhook config
 */
webhook.update_config = function (req, resp) {
  // delete webhook config
  delete_webhook(req.body.webhook_id)

  // create new webhook config
  .then(function () {
    var request_options = {
      url: 'https://api.twitter.com/2/webhooks',
      headers: {
        'Authorization': 'Bearer ' + auth.provided_bearer_token
      },
      body: {
        url: req.body.url
      },
      json: true
    }

    return request.post(request_options)
  })

  // render success response
  .then(function (body) {
    var json_response = {
      title: 'Success',
      message: 'Webhook successfully updated.',
      button: {
        title: 'Ok',
        url: '/webhook'
      }
    }

    resp.render('status', json_response)
  })

  // render error response
  .catch(function (body) {
    var json_response = {
      title: 'Error',
      message: 'Webhook not updated.',
      button: {
        title: 'Ok',
        url: '/webhook'
      }
    }
    console.log(body)
    // Look for detailed error
    if (body.error) {
      json_response.message = JSON.parse(body.error).errors[0].message
    }

    resp.render('status', json_response)
  })
}


/**
 * Deletes existing webhook config
 */
webhook.delete_config = function (req, resp) {

  // delete webhook config
  delete_webhook(req.body.webhook_id)

  // render success response
  .then(function (body) {
    var json_response = {
      title: 'Success',
      message: 'Webhook successfully deleted.',
      button: {
        title: 'Ok',
        url: '/webhook'
      }
    }

    resp.render('status', json_response)
  })

  // render error response
  .catch(function () {
    var json_response = {
      title: 'Error',
      message: 'Webhook was not deleted.',
      button: {
        title: 'Ok',
        url: '/webhook'
      }
    }
    console.log(body)
    // Look for detailed error
    if (body.error) {
      json_response.message = JSON.parse(body.error).errors[0].message
    }

    resp.render('status', json_response)
  })
}


/**
 * Triggers a Replay job
 */
 webhook.replay_config = function (req, resp) {

   const FROM_DATE = moment(req.body.startdate.toString()).format('YYYYMMDDHHmm');
   const TO_DATE = moment(req.body.enddate.toString()).format('YYYYMMDDHHmm');

   auth.get_webhook_id() // This now uses provided_bearer_token internally and takes no args
   .then(webhook_id => {
     // request options
     var request_options = {
       url: 'https://api.twitter.com/2/webhooks/' + webhook_id + '/subscriptions/all?from_date=' + FROM_DATE + '&to_date=' + TO_DATE,
       headers: { 'Authorization': 'Bearer ' + auth.provided_bearer_token }
     }

     // POST request to initial replay job
     request.post(request_options)

     // success
     .then(function (response) {
       var json_response = {
         title: 'Success',
         message: 'Replay job successfully initiated.',
         button: {
           title: 'Ok',
           url: '/webhook'
         }
       }

       resp.render('status', json_response)
     })

     // failure
     .catch(function (response) {
       var json_response = {
         title: 'Error',
         message: response.error,
         button: {
           title: 'Ok',
           url: '/webhook'
         }
       }

       resp.render('status', json_response)
     })
   })
 }


/**
 * Helper function that deletes the webhook config.
 * Returns a promise.
 */
function delete_webhook (webhook_id) {
  return new Promise (function (resolve, reject) {
    // if no webhook id provided, assume there is none to delete
    if (!webhook_id) {
      resolve()
      return;
    }

    // construct request to delete webhook config
    var request_options = {
      url: 'https://api.twitter.com/2/webhooks/' + webhook_id,
      headers: { 'Authorization': 'Bearer ' + auth.provided_bearer_token },
      resolveWithFullResponse: true
    }

    request.delete(request_options).then(function () {
      resolve()
    }).catch(function () {
      reject()
    })
  })
}

module.exports = webhook
