const request = require('request-promise')
// const queryString = require('query-string'); // Not used
// const prompt = require('prompt-promise'); // Not used
const auth = require('../../helpers/auth.js')
const args = require('../args.js')

if (!args.webhookid) {
  console.error('Error: webhookid is required. Please provide it with -w <webhookid>');
  process.exit(1);
}

const request_options = {
  url: `https://api.twitter.com/2/account_activity/webhooks/${args.webhookid}/subscriptions/all`,
  oauth: auth.twitter_oauth, // App owner's OAuth 1.0a tokens
  resolveWithFullResponse: true
}

console.log('Attempting to add app owner subscription with options:', request_options.url, 'using app owner OAuth1.0a');
request.post(request_options)
  .then(function (response) {
    console.log('HTTP response code:', response.statusCode);
    if (response.statusCode == 204 || response.statusCode == 200) { // 200 might be possible if body is returned
      console.log('Subscription added (or already existed).');
      if(response.body) {
        console.log('Response body:', response.body);
      }
    }
  })
  .catch(function (err) {
    console.error('Error adding subscription:', err.statusCode);
    console.log('- Verify webhook ID and that the app owner has authorized the app.');
    console.log('- Verify "Read, Write and Access direct messages" is enabled on apps.twitter.com.');
    console.log('Full error message below:');
    console.log(err.error || err.message);
  });
