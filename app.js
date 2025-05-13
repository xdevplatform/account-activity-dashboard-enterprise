const express = require('express')
const bodyParser = require('body-parser')
const session = require('express-session')
const passport = require('passport')
const uuid = require('uuid/v4')
const security = require('./helpers/security')
const auth = require('./helpers/auth')
const cacheRoute = require('./helpers/cache-route')
const socket = require('./helpers/socket')
const request = require('request-promise')
const queryString = require('query-string')

const app = express()

app.set('port', (process.env.PORT || 5000))
app.set('views', __dirname + '/views')
app.set('view engine', 'ejs')

app.use(express.static(__dirname + '/public'))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(passport.initialize());
app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}))

// start server
const server = app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'))
})

// initialize socket.io
socket.init(server)

// form parser middleware
var parseForm = bodyParser.urlencoded({ extended: false })


/**
 * Receives challenge response check (CRC)
 **/
app.get('/webhook/twitter', function(request, response) {

  var crc_token = request.query.crc_token

  if (crc_token) {
    var hash = security.get_challenge_response(crc_token, auth.twitter_oauth.consumer_secret)

    response.status(200);
    response.send({
      response_token: 'sha256=' + hash
    })
  } else {
    response.status(400);
    response.send('Error: crc_token missing from request.')
  }
})


/**
 * Receives Account Acitivity events
 **/
app.post('/webhook/twitter', function(request, response) {

  console.log(request.body)

  socket.io.emit(socket.activity_event, {
    internal_id: uuid(),
    event: request.body
  })

  response.send('200 OK')
})


/**
 * Serves the home page
 **/
app.get('/', function(request, response) {
  response.render('index')
})


/**
 * Subscription management
 **/

auth.basic = auth.basic || ((req, res, next) => next())

app.get('/subscriptions', auth.basic, cacheRoute(1000), require('./routes/subscriptions'))


/**
 * Starts Twitter sign-in process for adding a user subscription (NEW OAuth 1.0a 3-legged flow)
 **/
app.get('/subscriptions/add', function(req, res, next) {
  const app_callback_url = `${req.protocol}://${req.get('host')}/callbacks/addsub`;
  const request_token_options = {
    url: 'https://api.x.com/oauth/request_token',
    method: 'POST',
    oauth: {
      callback: app_callback_url,
      consumer_key: auth.twitter_oauth.consumer_key,
      consumer_secret: auth.twitter_oauth.consumer_secret
    }
  };

  request(request_token_options)
    .then(responseBody => {
      const request_token_data = queryString.parse(responseBody);
      if (request_token_data.oauth_callback_confirmed !== 'true') {
        console.error('OAuth callback_confirmed was not true.', request_token_data);
        return next(new Error('OAuth callback not confirmed by Twitter.'));
      }
      req.session.oauth_request_token = request_token_data.oauth_token;
      req.session.oauth_request_token_secret = request_token_data.oauth_token_secret;
      const authorization_url = `https://api.x.com/oauth/authenticate?oauth_token=${request_token_data.oauth_token}`;
      res.redirect(authorization_url);
    })
    .catch(err => {
      console.error('Error obtaining request token (Step 1):', err.statusCode, err.message, err.error);
      next(new Error('Failed to obtain request token from Twitter.'));
    });
});

/**
 * Handles Twitter sign-in OAuth1.0a callback for 'addsub' (NEW)
 **/
const subCallbacks = require('./routes/sub-callbacks'); // Require it here to access its actions
app.get('/callbacks/addsub', function(req, res, next) {
  const { oauth_token, oauth_verifier } = req.query;

  if (oauth_token !== req.session.oauth_request_token) {
    console.error('OAuth request token mismatch in callback.');
    delete req.session.oauth_request_token;
    delete req.session.oauth_request_token_secret;
    return next(new Error('OAuth request token mismatch. Please try again.'));
  }

  const access_token_options = {
    url: 'https://api.x.com/oauth/access_token',
    method: 'POST',
    oauth: {
      consumer_key: auth.twitter_oauth.consumer_key,
      consumer_secret: auth.twitter_oauth.consumer_secret,
      token: req.session.oauth_request_token,
      token_secret: req.session.oauth_request_token_secret,
      verifier: oauth_verifier
    }
  };

  let obtained_user_access_tokens;
  request(access_token_options)
    .then(responseBody => {
      obtained_user_access_tokens = queryString.parse(responseBody);
      delete req.session.oauth_request_token;
      delete req.session.oauth_request_token_secret;

      const verify_credentials_options = {
        url: 'https://api.x.com/1.1/account/verify_credentials.json?include_email=false&skip_status=true',
        oauth: {
          consumer_key: auth.twitter_oauth.consumer_key,
          consumer_secret: auth.twitter_oauth.consumer_secret,
          token: obtained_user_access_tokens.oauth_token,
          token_secret: obtained_user_access_tokens.oauth_token_secret
        },
        json: true
      };
      return request.get(verify_credentials_options);
    })
    .then(profile => {
      const user_for_action = {
        access_token: obtained_user_access_tokens.oauth_token,
        access_token_secret: obtained_user_access_tokens.oauth_token_secret,
        profile: profile 
      };
      // Ensure subCallbacks.actions exists and actions.addsub is a function
      if (!subCallbacks || !subCallbacks.actions || typeof subCallbacks.actions.addsub !== 'function') {
        console.error('actions.addsub not found or not a function in sub-callbacks module.');
        return next(new Error('Server configuration error for add subscription.'));
      }
      return subCallbacks.actions.addsub(user_for_action);
    })
    .then(() => { // Assuming actions.addsub resolves on success (even if no specific data)
      res.render('status', {
        title: 'Success',
        message: 'Subscription successfully added.',
        button: { title: 'Ok', url: '/subscriptions' }
      });
    })
    .catch(err => {
      console.error('Error in /callbacks/addsub (Step 3 or action call):', err.statusCode, err.message, err.error);
      delete req.session.oauth_request_token; // Clean up session on error
      delete req.session.oauth_request_token_secret;
      let error_message = 'Failed to add subscription.';
      if (err.error && err.error.errors && err.error.errors[0] && err.error.errors[0].message) {
        error_message = err.error.errors[0].message;
      } else if (err.message) {
        error_message = err.message;
      }
      res.status(500).render('status', {
        title: 'Error',
        message: error_message,
        button: { title: 'Ok', url: '/subscriptions' }
      });
    });
});


/**
 * Starts Twitter sign-in process for removing a user subscription (KEEPS OLD Passport flow for now)
 **/
app.get('/subscriptions/remove', passport.authenticate('twitter', {
  callbackURL: '/callbacks/removesub' 
}));

/**
 * Handles Twitter sign-in OAuth1.0a callbacks for actions OTHER than 'addsub' (KEEPS OLD Passport flow for now)
 **/
// The new /callbacks/addsub route will match before this generic one.
// This will now only handle /callbacks/removesub if that's the only other action using passport.
app.get('/callbacks/:action', passport.authenticate('twitter', { failureRedirect: '/' }),
  (req, res) => { // Changed to directly use the subCallbacks actions if action matches
    const action = req.params.action;
    if (subCallbacks && subCallbacks.actions && typeof subCallbacks.actions[action] === 'function') {
      subCallbacks.actions[action](req.user) // req.user is populated by passport for this flow
        .then(() => {
          res.render('status', {
            title: 'Success',
            message: `Subscription successfully ${action === 'removesub' ? 'removed' : 'processed'}.`,
            button: { title: 'Ok', url: '/subscriptions' }
          });
        })
        .catch(err => {
          console.error(`Error in passport callback for action ${action}:`, err.statusCode, err.message, err.error);
          let error_message = `Failed to ${action} subscription.`;
          if (err.error && err.error.errors && err.error.errors[0] && err.error.errors[0].message) {
            error_message = err.error.errors[0].message;
          } else if (err.message) {
            error_message = err.message;
          }
          res.status(500).render('status', {
            title: 'Error', 
            message: error_message, 
            button: { title: 'Ok', url: '/subscriptions' }
          });
        });
    } else {
      console.error(`Unknown action in passport callback: ${action}`);
      res.status(404).render('status', {
        title: 'Error', 
        message: 'Unknown action.', 
        button: { title: 'Ok', url: '/' }
      });
    }
  }
);


/**
 * Webhook management routes
 **/
var webhook_view = require('./routes/webhook')
app.get('/webhook', auth.basic, auth.csrf, webhook_view.get_config)
app.post('/webhook/update', parseForm, auth.csrf, webhook_view.update_config)
app.post('/webhook/validate', parseForm, auth.csrf, webhook_view.validate_config)
app.post('/webhook/replay', parseForm, auth.csrf, webhook_view.replay_config)
app.post('/webhook/delete', parseForm, auth.csrf, webhook_view.delete_config)


/**
 * Activity view
 **/
app.get('/activity', auth.basic, require('./routes/activity'))
