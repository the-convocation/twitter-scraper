import { getScraper } from './test-utils';
import * as util from 'node:util';

test('scraper can get direct message inbox when authenticated', async () => {
  const scraper = await getScraper();

  const directMessages = await scraper.getDirectMessageInbox();

  expect(directMessages).toBeDefined();

  console.log(util.inspect(directMessages, true, null, true));

  expect(typeof directMessages).toBe('object');
});

test('getDirectMessageInbox throws error when not authenticated', async () => {
  const scraper = await getScraper({ authMethod: 'anonymous' });

  await expect(scraper.isLoggedIn()).resolves.toBeFalsy();
  await expect(scraper.getDirectMessageInbox()).rejects.toThrow();
});
