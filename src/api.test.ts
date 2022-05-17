import { Scraper } from './scraper';

test('scraper can get guest token', async () => {
  const scraper = new Scraper();
  await scraper.getGuestToken();
  expect(scraper.isGuestToken()).toBeTruthy();
});
