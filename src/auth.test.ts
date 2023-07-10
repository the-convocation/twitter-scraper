import { Scraper } from './scraper';

export async function authSearchScraper() {
  const username = process.env['TWITTER_USERNAME'];
  const password = process.env['TWITTER_PASSWORD'];
  const email = process.env['TWITTER_EMAIL'];
  if (!username || !password) {
    throw new Error(
      'TWITTER_USERNAME and TWITTER_PASSWORD variables must be defined.',
    );
  }

  const scraper = new Scraper();
  await scraper.login(username, password, email);
  return scraper;
}

test('scraper can log in', async () => {
  const scraper = await authSearchScraper();
  await expect(scraper.isLoggedIn()).resolves.toBeTruthy();
});

test('scraper can restore its login state from cookies', async () => {
  const scraper = await authSearchScraper();
  await expect(scraper.isLoggedIn()).resolves.toBeTruthy();
  const scraper2 = new Scraper();
  await expect(scraper2.isLoggedIn()).resolves.toBeFalsy();

  const cookies = await scraper.getCookies();
  await scraper2.setCookies(cookies);

  await expect(scraper2.isLoggedIn()).resolves.toBeTruthy();
});

test('scraper can log out', async () => {
  const scraper = await authSearchScraper();
  await expect(scraper.isLoggedIn()).resolves.toBeTruthy();

  await scraper.logout();

  await expect(scraper.isLoggedIn()).resolves.toBeFalsy();
});
