# Command line example scripts
These scripts should be executed from root of the project folder. Your environment, url or webhook ID should be passed in as command line arguments. Your app keys and tokens should be defined in a `config.json` file at the root of this project folder.

These scripts only work with the enterprise Account Activity API.

---

## Webhook Management

**Create** webhook config.

	node example_scripts/webhook_management/create-webhook-config.js -u <url>

**Get** webook config details.

	node example_scripts/webhook_management/get-webhook-config.js

**Delete** webook config.

	node example_scripts/webhook_management/delete-webhook-config.js

**Validate** webook config (OAuth1).

	node example_scripts/webhook_management/validate-webhook-config.js -i <webhook_id>

**Validate** webook config (OAuth2).

	node example_scripts/webhook_management/validate-webhook-config-oauth2.js -i <webhook_id>

---

## Subscription Management

**Add** user subscription for the user that owns the app.

	node example_scripts/subscription_management/add-subscription-app-owner.js


**Add** a user subscription for another user using PIN-based Twitter sign-in.

	node example_scripts/subscription_management/add-subscription-other-user.js

**Get** a user subscription (check if it exists).

	node example_scripts/subscription_management/get-subscription.js

**Remove** a user subscription for the user that owns the app.

	node example_scripts/subscription_management/remove-subscription-app-owner.js

**Remove** a user subscription for another user using PIN-based Twitter sign-in.

	node example_scripts/subscription_management/remove-subscription-other-user.js

**Get** subscriptions count.

	node example_scripts/subscription_management/get-subscriptions-count.js

**Get** subscriptions list.

	node example_scripts/subscription_management/get-subscriptions-list.js
