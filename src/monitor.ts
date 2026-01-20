import { Pool } from 'pg';
import { Scraper } from './scraper';
import { Tweet } from './tweets';
import { cycleTLSFetch, cycleTLSExit } from './cycletls-fetch';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'password',
  database: process.env.POSTGRES_DB || 'twitter',
});

// Helper to pause execution
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function upsertTweet(tweet: Tweet, criteria: string, client: any) {
  try {
    const tweetId = tweet.id;
    const body = JSON.stringify(tweet);
    
    // Check if 'timeParsed' is available, fallback to timestamp
    const createdAt = tweet.timeParsed 
      ? tweet.timeParsed 
      : (tweet.timestamp ? new Date(tweet.timestamp * 1000) : null); 

    const query = `
      INSERT INTO tweets (tweet_id, body, criteria, created_at, scraped_at)
      VALUES ($1, $2::jsonb, jsonb_build_array($3::text), $4, NOW())
      ON CONFLICT (tweet_id) 
      DO UPDATE SET
        criteria = (
          SELECT jsonb_agg(DISTINCT elems)
          FROM jsonb_array_elements(tweets.criteria || jsonb_build_array($3::text)) elems
        ),
        scraped_at = NOW();
    `;

    await client.query(query, [tweetId, body, criteria, createdAt]);
  } catch (err) {
    console.error(`Failed to upsert tweet ${tweet.id}:`, err);
  }
}

async function processJob(scraper: Scraper, job: any) {
  const client = await pool.connect();
  try {
    console.log(`[Job ${job.job_id}] Starting ${job.type}: ${job.query}`);
    
    let count = 0;
    const criteriaTag = `${job.type}:${job.query}`;

    if (job.type === 'profile') {
      const iterator = scraper.getTweets(job.query, 20);
      for await (const tweet of iterator) {
        await upsertTweet(tweet, criteriaTag, client);
        count++;
      }
    } else if (job.type === 'search') {
      const iterator = scraper.searchTweets(job.query, 20, 0); // Top mode
      for await (const tweet of iterator) {
        await upsertTweet(tweet, criteriaTag, client);
        count++;
      }
    }

    console.log(`[Job ${job.job_id}] Finished. Upserted ${count} tweets.`);

    // Update last_run_at
    await client.query('UPDATE jobs SET last_run_at = NOW() WHERE job_id = $1', [job.job_id]);

  } catch (err) {
    console.error(`[Job ${job.job_id}] Failed:`, err);
  } finally {
    client.release();
  }
}

async function runMonitor() {
  // Initialize Scraper with CycleTLS to bypass Cloudflare
  const scraper = new Scraper({
    fetch: cycleTLSFetch,
  });
  
  const username = process.env.TWITTER_USERNAME;
  const password = process.env.TWITTER_PASSWORD;
  const email = process.env.TWITTER_EMAIL;

  if (!username || !password) {
    console.error('Missing TWITTER_USERNAME or TWITTER_PASSWORD in environment');
    process.exit(1);
  }

  try {
    console.log('Logging in...');
    await scraper.login(username, password, email);
    console.log('Logged in successfully.');

    while (true) {
      const client = await pool.connect();
      let jobs = [];
      try {
        // Fetch due jobs
        // We look for jobs where last_run_at is null OR it's been longer than interval_minutes
        const res = await client.query(`
          SELECT * FROM jobs 
          WHERE active = true 
          AND (last_run_at IS NULL OR last_run_at < NOW() - (interval_minutes || ' minutes')::interval)
          ORDER BY last_run_at ASC NULLS FIRST
          LIMIT 1
        `);
        jobs = res.rows;
      } finally {
        client.release();
      }

      if (jobs.length > 0) {
        const job = jobs[0];
        await processJob(scraper, job);
        
        // Sleep a bit between jobs to be nice to Twitter
        await sleep(5000); 
      } else {
        console.log('No jobs due. Sleeping for 60 seconds...');
        await sleep(60000);
      }
    }

  } catch (err) {
    console.error('Fatal error in monitor:', err);
    process.exit(1);
  } finally {
    await pool.end();
    cycleTLSExit();
  }
}

if (require.main === module) {
  runMonitor();
}