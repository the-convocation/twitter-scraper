import { getScraper } from './test-utils';
import * as util from 'node:util';

test('scraper can get direct messages when authenticated', async () => {
  const scraper = await getScraper();

  const directMessages = await scraper.getDirectMessages();

  expect(directMessages).toBeDefined();

  console.log(util.inspect(directMessages, true, null, true));

  expect(typeof directMessages).toBe('object');
});

test('getDirectMessages throws error when not authenticated', async () => {
  const scraper = await getScraper({ authMethod: 'anonymous' });

  await expect(scraper.isLoggedIn()).resolves.toBeFalsy();
  await expect(scraper.getDirectMessages()).rejects.toThrow();
});
