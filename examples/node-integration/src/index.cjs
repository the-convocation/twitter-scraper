/* eslint-disable @typescript-eslint/no-var-requires */
const assert = require('node:assert');
const dotenv = require('dotenv');
const { Scraper } = require('@the-convocation/twitter-scraper');

dotenv.config({ path: '../../.env.local' });

// Debug logging to show that the Node.js build is being loaded
console.log(
  `Loaded @the-convocation/twitter-scraper from ${require.resolve(
    '@the-convocation/twitter-scraper',
  )}`,
);

/*
 * Simplest scraper initialization. Refer to the README or `src/test-utils.ts` for more
 * comprehensive examples.
 */

// Load credentials from the environment
const username = process.env['TWITTER_USERNAME'];
const password = process.env['TWITTER_PASSWORD'];
const email = process.env['TWITTER_EMAIL'];

assert(username && password && email);

const scraper = new Scraper({
  experimental: {
    xClientTransactionId: true,
    xpff: true,
  },
});

const main = async () => {
  await scraper.login(username, password, email);

  const tweet = await scraper.getTweet('1585338303800578049');

  console.log(tweet);
};

main();
