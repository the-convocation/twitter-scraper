import { Scraper } from './scraper';
import { SearchMode } from './search';
import { Tweet } from './tweets';

test('scraper can process search cursor', async () => {
  const scraper = new Scraper();

  let cursor: string | undefined = undefined;
  const maxTweets = 150;
  let nTweets = 0;
  while (nTweets < maxTweets) {
    const res: {
      tweets: Tweet[];
      next?: string;
    } = await scraper.fetchSearchTweets(
      'twitter',
      150,
      false,
      SearchMode.Top,
      cursor,
    );

    expect(cursor).toBeTruthy();

    nTweets += res.tweets.length;
    cursor = res.next;
  }
});
