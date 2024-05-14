const nconf = require('nconf')
const request = require('request')
const queryString = require('query-string')
const passport = require('passport')
const TwitterStrategy = require('passport-twitter')
const httpAuth = require('http-auth')


require('dotenv').config()

const RequiredEnv = [
  'TWITTER_CONSUMER_KEY',
  'TWITTER_CONSUMER_SECRET',
  'TWITTER_ACCESS_TOKEN',
  'TWITTER_ACCESS_TOKEN_SECRET',
]

if (!RequiredEnv.every(key => typeof process.env[key] !== 'undefined')) {
  console.error(`One of more of the required environment variables (${RequiredEnv.join(', ')}) are not defined. Please check your environment and try again.`)
  process.exit(-1)
}

var auth = {}

// twitter info
auth.twitter_oauth = {
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  token: process.env.TWITTER_ACCESS_TOKEN,
  token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
}

// basic auth middleware for express
if (typeof process.env.BASIC_AUTH_USER !== 'undefined' &&
  typeof process.env.BASIC_AUTH_PASSWORD !== 'undefined') {
    auth.basic = httpAuth.connect(httpAuth.basic({
        realm: 'admin-dashboard'
    }, function(username, password, callback) {
        callback(username === process.env.BASIC_AUTH_USER && password === process.env.BASIC_AUTH_PASSWORD)
    }))
} else {
  console.warn([
    'Your admin dashboard is accessible by everybody.',
    'To restrict access, setup BASIC_AUTH_USER and BASIC_AUTH_PASSWORD',
    'as environment variables.',
    ].join(' '))
}

// csrf protection middleware for express
auth.csrf = require('csurf')()


// Configure the Twitter strategy for use by Passport.
passport.use(new TwitterStrategy({
    consumerKey: auth.twitter_oauth.consumer_key,
    consumerSecret: auth.twitter_oauth.consumer_secret,
    // we want force login, so we set the URL with the force_login=true
    userAuthorizationURL: 'https://api.x.com/oauth/authenticate?force_login=true'
  },
  // stores profile and tokens in the sesion user object
  // this may not be the best solution for your application
  function(token, tokenSecret, profile, cb) {
    return cb(null, {
      profile: profile,
      access_token: token,
      access_token_secret: tokenSecret
    })
  }
))

// Configure Passport authenticated session persistence.
passport.serializeUser(function(user, cb) {
  cb(null, user);
})

passport.deserializeUser(function(obj, cb) {
  cb(null, obj);
})


/**
 * Retrieves a Twitter Sign-in auth URL for OAuth1.0a
 */
auth.get_twitter_auth_url = function (host, callback_action) {

  // construct request to retrieve authorization token
  var request_options = {
    url: 'https://api.x.com/oauth/request_token',
    method: 'POST',
    oauth: {
      callback: 'https://' + host + '/callbacks/twitter/' + callback_action,
      consumer_key: auth.twitter_oauth.consumer_key,
      consumer_secret: auth.twitter_oauth.consumer_secret
    }
  }

  return new Promise (function (resolve, reject) {
    request(request_options, function(error, response) {
      if (error) {
        reject(error)
      }
      else {
        // construct sign-in URL from returned authorization token
        var response_params = queryString.parse(response.body)
        console.log(response_params)
        var twitter_auth_url = 'https://api.x.com/oauth/authenticate?force_login=true&oauth_token=' + response_params.oauth_token

        resolve({
          response_params: response_params,
          twitter_auth_url: twitter_auth_url
        })
      }
    })
  })
}


/**
 * Retrieves a bearer token for OAuth2
 */
auth.get_twitter_bearer_token = function () {

  // just return the bearer token if we already have one
  if (auth.twitter_bearer_token) {
    return new Promise (function (resolve, reject) {
      resolve(auth.twitter_bearer_token)
    })
  }

  // construct request for bearer token
  var request_options = {
    url: 'https://api.x.com/oauth2/token',
    method: 'POST',
    auth: {
      user: auth.twitter_oauth.consumer_key,
      pass: auth.twitter_oauth.consumer_secret
    },
    form: {
      'grant_type': 'client_credentials'
    }
  }

  return new Promise (function (resolve, reject) {
    request(request_options, function(error, response) {
      if (error) {
        reject(error)
      }
      else {
        var json_body = JSON.parse(response.body)
        auth.twitter_bearer_token = json_body.access_token
        resolve(auth.twitter_bearer_token)
      }
    })
  })
}

auth.get_webhook_id = function (bearer_token) {
  var request_options = {
    url: 'https://api.x.com/1.1/account_activity/webhooks.json',
    method: 'GET',
    auth: { 'bearer' : bearer_token }
  }

  return new Promise (function (resolve, reject) {
    request(request_options, function(error, response) {
      if (error) {
        reject(error)
      } else {
        const json_response = JSON.parse(response.body)
        auth.webhook_id = json_response[0].id
        resolve(auth.webhook_id)
      }
    })
  })
}

module.exports = auth
