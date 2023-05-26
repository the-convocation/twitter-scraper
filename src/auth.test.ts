import { Scraper } from './scraper';

export async function authSearchScraper() {
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

test('scrapper can log in', async () => {
  const scraper = await authSearchScraper();
  expect(await scraper.isLoggedIn()).toBeTruthy();
});
