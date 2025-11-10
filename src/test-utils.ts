import { HttpsProxyAgent } from 'https-proxy-agent';
import { Scraper } from './scraper';
import { Cookie } from 'tough-cookie';
import dotenv from 'dotenv';
import { cycleTLSFetch } from './cycletls-fetch';

dotenv.config({ path: '.env.local' });

export interface ScraperTestOptions {
  /**
   * Force the scraper to use username/password to authenticate instead of cookies. Only used
   * by this file for testing auth, but very unreliable. Should always use cookies to resume
   * session when possible.
   */
  authMethod: 'password' | 'cookies' | 'anonymous';
}

export async function getScraper(
  options: Partial<ScraperTestOptions> = { authMethod: 'cookies' },
) {
  const username = process.env['TWITTER_USERNAME'];
  const password = process.env['TWITTER_PASSWORD'];
  const email = process.env['TWITTER_EMAIL'];
  const twoFactorSecret = process.env['TWITTER_2FA_SECRET'];
  const cookies = process.env['TWITTER_COOKIES'];
  const proxyUrl = process.env['PROXY_URL'];
  let agent: any;

  if (options.authMethod === 'cookies' && !cookies) {
    console.warn(
      'TWITTER_COOKIES variable is not defined, reverting to password auth (not recommended)',
    );
    options.authMethod = 'password';
  }

  if (options.authMethod === 'password' && !(username && password)) {
    throw new Error(
      'TWITTER_USERNAME and TWITTER_PASSWORD variables must be defined.',
    );
  }

  if (proxyUrl) {
    agent = new HttpsProxyAgent(proxyUrl, {
      rejectUnauthorized: false,
    });
  }

  const scraper = new Scraper({
    fetch: cycleTLSFetch,
    transform: {
      request: (input, init) => {
        if (agent) {
          return [input, { ...init, agent }];
        }
        return [input, init];
      },
    },
    experimental: {
      xClientTransactionId: true,
      xpff: true,
    },
  });

  if (options.authMethod === 'password') {
    await scraper.login(username!, password!, email, twoFactorSecret);
  } else if (options.authMethod === 'cookies') {
    await scraper.setCookies(
      JSON.parse(cookies!).map((c: string) => Cookie.fromJSON(c)),
    );
  }

  return scraper;
}
