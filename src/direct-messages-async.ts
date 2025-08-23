import { ConversationTimeline, ConversationEntry } from './direct-messages';
import { jitter } from './api';

export interface FetchDirectMessageConversationResponse {
  conversation: ConversationTimeline;
  next?: string;
}

export type FetchDirectMessageConversation = (
  conversationId: string,
  maxMessages: number,
  cursor: string | undefined,
) => Promise<FetchDirectMessageConversationResponse>;

export async function* getDirectMessageConversationMessagesGenerator(
  conversationId: string,
  maxMessages: number,
  fetchFunc: FetchDirectMessageConversation,
): AsyncGenerator<ConversationEntry, void> {
  let nMessages = 0;
  let cursor: string | undefined = undefined;

  while (nMessages < maxMessages) {
    const batch: FetchDirectMessageConversationResponse = await fetchFunc(
      conversationId,
      maxMessages,
      cursor,
    );

    const { conversation, next } = batch;

    if (conversation.entries.length === 0) {
      break;
    }

    for (const entry of conversation.entries) {
      if (nMessages < maxMessages) {
        yield entry;
        nMessages++;
      } else {
        break;
      }
    }

    cursor = next;

    if (conversation.status === 'AT_END' || !next) {
      break;
    }

    await jitter(1000);
  }
}
