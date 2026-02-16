import { getScraper } from './test-utils';
import { findDmConversationsByUserId, DmInbox } from './direct-messages';

/**
 * Get the inbox and find conversations that have at least one other participant.
 * Filters out self-conversations (e.g., "saved messages" in X Chat).
 */
async function getInboxWithConversations() {
  const scraper = await getScraper();
  const directMessages = await scraper.getDmInbox();
  expect(directMessages.conversations).toBeDefined();

  const conversationIds = Object.keys(directMessages.conversations).filter(
    (id) => {
      const parts = id.split(':');
      // Exclude self-conversations where both sides are the same user
      return parts.length < 2 || parts[0] !== parts[1];
    },
  );
  expect(conversationIds.length).toBeGreaterThan(0);

  return { scraper, directMessages, conversationIds };
}

function getFirstConversation(
  directMessages: DmInbox,
  conversationIds: string[],
) {
  const firstConversation = directMessages.conversations[conversationIds[0]];
  expect(firstConversation).toBeDefined();

  return firstConversation;
}

test('scraper can get direct message inbox when authenticated', async () => {
  const scraper = await getScraper();

  const directMessages = await scraper.getDmInbox();
  expect(directMessages).toBeDefined();
  expect(typeof directMessages).toBe('object');

  // Should have the conversations dictionary
  expect(directMessages.conversations).toBeDefined();
  expect(typeof directMessages.conversations).toBe('object');
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

test('scraper can iterate through direct message entries', async () => {
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
      expect(entry.message.id).toBeDefined();
      expect(entry.message.message_data).toBeDefined();
      expect(entry.message.message_data.sender_id).toBeDefined();
    } else if (entry.welcome_message_create) {
      expect(entry.welcome_message_create).toBeDefined();
    }

    count++;
  }

  // Expect at least one message in the conversation
  expect(count).toBeGreaterThanOrEqual(1);
});

test('findConversationsByUserId filters conversations by user ID', async () => {
  const { directMessages, conversationIds } = await getInboxWithConversations();

  const firstConversation = getFirstConversation(
    directMessages,
    conversationIds,
  );
  expect(firstConversation.participants).toBeDefined();
  expect(firstConversation.participants.length).toBeGreaterThan(0);

  // Find the other participant (not the current user)
  // For X Chat, the conversation ID format is "userId1:userId2"
  const conversationParts = firstConversation.conversation_id.split(':');
  const currentUserId = conversationParts.find((id) =>
    firstConversation.participants.some((p) => p.user_id === id),
  );
  const targetUserId = firstConversation.participants.find(
    (p) => p.user_id !== currentUserId,
  )?.user_id;

  // Skip if we can't find another participant (e.g., self-conversation)
  if (!targetUserId) return;

  const foundConversations = findDmConversationsByUserId(
    directMessages,
    targetUserId,
  );

  expect(foundConversations).toBeDefined();
  expect(foundConversations.length).toBeGreaterThan(0);

  // Make sure all found conversations include the target user
  foundConversations.forEach((conversation) => {
    const hasUser = conversation.participants.some(
      (participant) => participant.user_id === targetUserId,
    );
    expect(hasUser).toBe(true);
  });
});
