import { Scraper } from './scraper';
import { SearchMode } from './search';
import { QueryTweetsResponse } from './timeline';

async function authSearchScraper() {
  const username = process.env['TWITTER_USERNAME'];
  const password = process.env['TWITTER_PASSWORD'];
  if (!username || !password) {
    throw new Error(
      'TWITTER_USERNAME and TWITTER_PASSWORD variables must be defined.',
    );
  }

  const scraper = new Scraper();
  await scraper.login(username, password);
  return scraper;
}

test('scraper can process search cursor', async () => {
  const scraper = await authSearchScraper();

  let cursor: string | undefined = undefined;
  const maxTweets = 150;
  let nTweets = 0;
  while (nTweets < maxTweets) {
    const res: QueryTweetsResponse = await scraper.fetchSearchTweets(
      'twitter',
      maxTweets,
      false,
      SearchMode.Top,
      cursor,
    );

    if (res.next?.startsWith('scroll:')) {
      continue;
    }

    expect(res.next).toBeTruthy();

    nTweets += res.tweets.length;
    cursor = res.next;
  }
}, 120000);

test('scraper can search profiles', async () => {
  const scraper = await authSearchScraper();

  const seenProfiles = new Map<string, boolean>();
  const maxProfiles = 150;
  let nProfiles = 0;
  for await (const profile of scraper.searchProfiles('Twitter', maxProfiles)) {
    nProfiles++;

    expect(profile.userId).toBeTruthy();
    if (profile.userId != null) {
      expect(seenProfiles.has(profile.userId)).toBeFalsy();
      seenProfiles.set(profile.userId, true);
    }
  }

  expect(nProfiles).toEqual(maxProfiles);
}, 120000);

test('scraper can search tweets', async () => {
  const scraper = await authSearchScraper();

  const seenTweets = new Map<string, boolean>();
  const maxTweets = 150;
  let nTweets = 0;
  for await (const tweet of scraper.searchTweets(
    'twitter',
    maxTweets,
    false,
    SearchMode.Top,
  )) {
    nTweets++;

    expect(tweet.id).toBeTruthy();
    if (tweet.id != null) {
      expect(seenTweets.has(tweet.id)).toBeFalsy();
      seenTweets.set(tweet.id, true);
    }

    expect(tweet.permanentUrl).toBeTruthy();
    expect(tweet.isRetweet).toBeFalsy();
    expect(tweet.text).toBeTruthy();
  }

  expect(nTweets).toEqual(maxTweets);
}, 120000);
