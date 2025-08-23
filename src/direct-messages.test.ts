import { getScraper } from './test-utils';
import { findDmConversationsByUserId, DmInbox } from './direct-messages';

async function getInboxWithConversations() {
  const scraper = await getScraper();
  const directMessages = await scraper.getDmInbox();
  expect(directMessages.conversations).toBeDefined();

  const conversationIds = Object.keys(directMessages.conversations);
  expect(conversationIds.length).toBeGreaterThan(0);

  return { scraper, directMessages, conversationIds };
}

function getFirstConversation(
  directMessages: DmInbox,
  conversationIds: string[],
) {
  // This should be your most recent DM.
  const firstConversation = directMessages.conversations[conversationIds[0]];
  expect(firstConversation).toBeDefined();

  return firstConversation;
}

test('scraper can get direct message inbox when authenticated', async () => {
  const scraper = await getScraper();

  const directMessages = await scraper.getDmInbox();
  expect(directMessages).toBeDefined();

  expect(typeof directMessages).toBe('object');
});

test('getDmInbox throws error when not authenticated', async () => {
  const scraper = await getScraper({ authMethod: 'anonymous' });

  await expect(scraper.isLoggedIn()).resolves.toBeFalsy();
  await expect(scraper.getDmInbox()).rejects.toThrow();
});

test('scraper can get direct message conversation', async () => {
  const { scraper, directMessages, conversationIds } =
    await getInboxWithConversations();

  const firstConversation = getFirstConversation(
    directMessages,
    conversationIds,
  );
  expect(firstConversation.conversation_id).toBeDefined();

  const conversation = await scraper.getDmConversation(
    firstConversation.conversation_id,
  );

  expect(conversation.status).toBeDefined();
  expect(conversation.min_entry_id).toBeDefined();
  expect(conversation.max_entry_id).toBeDefined();
  expect(conversation.entries).toBeDefined();
  expect(conversation.users).toBeDefined();
  expect(conversation.conversations).toBeDefined();
});

test('scraper can paginate through direct message conversation', async () => {
  const { scraper, directMessages, conversationIds } =
    await getInboxWithConversations();

  const firstConversation = getFirstConversation(
    directMessages,
    conversationIds,
  );
  expect(firstConversation.conversation_id).toBeDefined();

  const conversationId = firstConversation.conversation_id;
  const messages = scraper.getDmMessages(conversationId, 30);

  let count = 0;
  for await (const entry of messages) {
    expect(entry).toBeDefined();

    if (entry.message) {
      expect(entry.message).toBeDefined();
    } else if (entry.welcome_message_create) {
      expect(entry.welcome_message_create).toBeDefined();
    } else {
      fail('No messages were retrieved');
    }

    count++;
  }

  // Your DM will need at least 20+ messages to test this.
  // 20 was chosen because that seems to be the max size per response.
  expect(count).toBeGreaterThan(20);
});

test('findConversationsByUserId filters conversations by user ID', async () => {
  const { directMessages, conversationIds } = await getInboxWithConversations();

  const firstConversation = getFirstConversation(
    directMessages,
    conversationIds,
  );
  expect(firstConversation.participants).toBeDefined();
  expect(firstConversation.participants.length).toBeGreaterThan(0);

  // in my responses, 0th is the current user and 1st is the other user.
  const targetUserId = firstConversation.participants[1].user_id;

  const foundConversations = findDmConversationsByUserId(
    directMessages,
    targetUserId,
  );

  expect(foundConversations).toBeDefined();
  expect(foundConversations.length).toBeGreaterThan(0);

  // make sure all convos are the right user
  foundConversations.forEach((conversation) => {
    const hasUser = conversation.participants.some(
      (participant) => participant.user_id === targetUserId,
    );
    expect(hasUser).toBe(true);
  });
});
