import { Scraper } from './scraper';
import { SearchMode } from './search';
import { QueryTweetsResponse } from './timeline';

test('scraper can process search cursor', async () => {
  const scraper = new Scraper();

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

    expect(res.next).toBeTruthy();

    nTweets += res.tweets.length;
    cursor = res.next;
  }
}, 120000);
