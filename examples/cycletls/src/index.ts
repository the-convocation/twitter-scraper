import assert from 'node:assert';
import { Scraper } from '@the-convocation/twitter-scraper';
import {
  cycleTLSFetch,
  cycleTLSExit,
} from '@the-convocation/twitter-scraper/cycletls';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

/**
 * Example: Using CycleTLS to bypass Cloudflare bot detection
 *
 * CycleTLS uses golang to mimic Chrome browser TLS fingerprints, which helps
 * bypass Cloudflare's advanced bot detection. This is particularly useful
 * when you encounter 403 errors during authentication.
 *
 * Usage:
 * 1. Install cycletls: yarn add cycletls
 * 2. Pass cycleTLSFetch as the fetch option when creating a Scraper
 * 3. Make sure to call cycleTLSExit() when done to cleanup resources
 */

// Load credentials from the environment
const username = process.env['TWITTER_USERNAME'];
const password = process.env['TWITTER_PASSWORD'];
const email = process.env['TWITTER_EMAIL'];

assert(username && password && email, 'Missing required environment variables');

// Create scraper with CycleTLS fetch
const scraper = new Scraper({
  fetch: cycleTLSFetch,
});

const main = async () => {
  try {
    console.log('Logging in with CycleTLS-powered requests...');
    await scraper.login(username, password, email);

    console.log('Login successful! Fetching a tweet...');
    const tweet = await scraper.getTweet('1585338303800578049');

    console.log('Tweet details:');
    console.log(`- Text: ${tweet?.text}`);
    console.log(`- Likes: ${tweet?.likes}`);
    console.log(`- Retweets: ${tweet?.retweets}`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Important: cleanup CycleTLS resources
    cycleTLSExit();
  }
};

main();
