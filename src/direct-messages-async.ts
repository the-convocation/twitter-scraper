import { DmConversationTimeline, DmMessageEntry } from './direct-messages';
import { jitter } from './api';

export interface FetchDmConversationMessagesResponse {
  conversation: DmConversationTimeline;
  next?: string;
}

export type FetchDmConversationFn = (
  conversationId: string,
  maxMessages: number,
  cursor: string | undefined,
) => Promise<FetchDmConversationMessagesResponse>;

export async function* getDmConversationMessagesGenerator(
  conversationId: string,
  maxMessages: number,
  fetchFunc: FetchDmConversationFn,
): AsyncGenerator<DmMessageEntry, void> {
  let nMessages = 0;
  let cursor: string | undefined = undefined;

  while (nMessages < maxMessages) {
    const batch: FetchDmConversationMessagesResponse = await fetchFunc(
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
