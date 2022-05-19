import { Scraper } from './scraper';

test('scraper can get trends', async () => {
  const scraper = new Scraper();
  const trends = await scraper.getTrends(false);
  expect(trends).toHaveLength(20);
  trends.forEach((trend) => expect(trend).not.toBeFalsy());
});
