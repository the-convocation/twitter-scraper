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

test('scraper can get direct message conversation', async () => {
  const scraper = await getScraper();

  const directMessages = await scraper.getDirectMessageInbox();

  // get first key of conversations
  // you must have at least one DM to properly test this.
  const firstKey = Object.keys(directMessages.conversations)[0];
  expect(directMessages.conversations[firstKey]).toBeDefined();

  const conversation = await scraper.getDirectMessageConversation(
    directMessages.conversations[firstKey].conversation_id,
  );

  console.log(util.inspect(conversation, true, null, true));

  expect(conversation.status).toBeDefined();
  expect(conversation.min_entry_id).toBeDefined();
  expect(conversation.max_entry_id).toBeDefined();
  expect(conversation.entries).toBeDefined();
  expect(conversation.users).toBeDefined();
  expect(conversation.conversations).toBeDefined();
});

test('scraper can paginate through direct message conversation', async () => {
  const scraper = await getScraper();

  const directMessages = await scraper.getDirectMessageInbox();
  expect(directMessages.conversations).toBeDefined();

  const firstKey = Object.keys(directMessages.conversations)[0];
  expect(directMessages.conversations[firstKey]).toBeDefined();

  const conversationId = directMessages.conversations[firstKey].conversation_id;
  const messages = scraper.getDirectMessageConversationMessages(
    conversationId,
    10,
  );

  for await (const entry of messages) {
    expect(entry).toBeDefined();

    if (entry.message) {
      expect(entry.message).toBeDefined();

      console.log(util.inspect(entry.message, true, null, true));
    } else if (entry.welcome_message_create) {
      expect(entry.welcome_message_create).toBeDefined();

      console.log(util.inspect(entry.welcome_message_create, true, null, true));
    } else {
      fail('No messages were retrieved');
    }
  }
});
