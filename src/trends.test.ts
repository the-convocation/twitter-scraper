import { authSearchScraper } from './auth.test';

test('scraper can get trends', async () => {
  const scraper = await authSearchScraper();
  const trends = await scraper.getTrends();
  expect(trends).toHaveLength(20);
  trends.forEach((trend) => expect(trend).not.toBeFalsy());
});
