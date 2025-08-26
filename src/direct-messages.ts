import { AuthenticationError } from './errors';
import { TwitterAuth } from './auth';
import { LegacyUserRaw } from './profile';
import { requestApi, addApiParams } from './api';

import { getDmConversationMessagesGenerator } from './direct-messages-async';

export interface DmInboxResponse {
  inbox_initial_state: DmInbox;
}

export interface DmInbox {
  last_seen_event_id: string;
  trusted_last_seen_event_id: string;
  untrusted_last_seen_event_id: string;
  cursor: string;
  inbox_timelines: DmInboxTimelines;
  entries: DmMessageEntry[];
  users: { [key: string]: LegacyUserRaw };
  conversations: { [key: string]: DmConversation };
}

export interface DmConversationResponse {
  conversation_timeline: DmConversationTimeline;
}

export interface DmConversationTimeline {
  status: DmStatus;
  min_entry_id: string;
  max_entry_id: string;
  entries: DmMessageEntry[];
  users: { [key: string]: LegacyUserRaw };
  conversations: { [key: string]: DmConversation };
}

export interface DmConversation {
  conversation_id: string;
  type: string;
  sort_event_id: string;
  sort_timestamp: string;
  participants: DmParticipant[];
  nsfw: boolean;
  notifications_disabled: boolean;
  mention_notifications_disabled: boolean;
  last_read_event_id: string;
  read_only: boolean;
  trusted: boolean;
  muted: boolean;
  status: DmStatus;
  min_entry_id: string;
  max_entry_id: string;
}

export type DmStatus = 'AT_END' | 'HAS_MORE';

export interface DmParticipant {
  user_id: string;
  last_read_event_id?: string;
}

export interface DmMessageEntry {
  welcome_message_create?: DmWelcomeMessage;
  message?: DmMessage;
}

export interface DmMessage {
  id: string;
  time: string;
  affects_sort: boolean;
  request_id: string;
  conversation_id: string;
  message_data: DmMessageData;
  message_reactions: DmReaction[];
}

export interface DmMessageData {
  id: string;
  time: string;
  recipient_id: string;
  sender_id: string;
  text: string;
  edit_count?: number;
  entities?: DmMessageEntities;
}

export interface DmReaction {
  id: string;
  time: string;
  conversation_id: string;
  message_id: string;
  reaction_key: string;
  emoji_reaction: string;
  sender_id: string;
}

export interface DmMessageEntities {
  // TODO: Not sure what these types are.
  hashtags: any[];
  symbols: any[];
  user_mentions: any[];
  urls: DmMessageUrl[];
}

export interface DmMessageUrl {
  url: string;
  expanded_url: string;
  display_url: string;
  indices: number[];
}

export interface DmWelcomeMessage extends DmMessage {
  welcome_message_id: string;
}

export interface DmInboxTimelines {
  trusted: DmTimelineState;
  untrusted: DmTimelineState;
  untrusted_low_quality: DmTimelineState;
}

export interface DmTimelineState {
  status: DmStatus;
  min_entry_id: string;
}

export interface DmCursorOptions {
  maxId?: string;
  minId?: string;
}

export async function fetchDmInbox(auth: TwitterAuth) {
  if (!(await auth.isLoggedIn())) {
    throw new AuthenticationError(
      'Scraper is not logged-in for fetching direct messages.',
    );
  }

  // TODO: Not sure how the "cursor" works for this. I don't have enough DMs to test.
  const params = new URLSearchParams();
  addApiParams(params, false);

  params.set('nsfw_filtering_enabled', 'false');
  params.set('filter_low_quality', 'true');
  params.set('include_quality', 'all');
  params.set('include_ext_profile_image_shape', '1');
  params.set('dm_secret_conversations_enabled', 'false');
  params.set('krs_registration_enabled', 'false');
  params.set('include_ext_limited_action_results', 'true');
  params.set('dm_users', 'true');
  params.set('include_groups', 'true');
  params.set('include_inbox_timelines', 'true');
  params.set('supports_reactions', 'true');
  params.set('supports_edit', 'true');
  params.set('include_ext_edit_control', 'true');
  params.set('include_ext_business_affiliations_label', 'true');
  params.set('include_ext_parody_commentary_fan_label', 'true');
  params.set(
    'ext',
    'mediaColor,altText,mediaStats,highlightedLabel,parodyCommentaryFanLabel,voiceInfo,birdwatchPivot,superFollowMetadata,unmentionInfo,editControl,article',
  );

  const res = await requestApi<DmInboxResponse>(
    `https://x.com/i/api/1.1/dm/inbox_initial_state.json?${params.toString()}`,
    auth,
  );

  if (!res.success) {
    throw res.err;
  }

  return parseDmInbox(res.value);
}

export async function parseDmInbox(inbox: DmInboxResponse) {
  return inbox.inbox_initial_state;
}

// This gets the current authenticated user's direct messages.
// This requires the user to be authenticated.
export async function getDmInbox(auth: TwitterAuth) {
  return await fetchDmInbox(auth);
}

// This gets the current authenticated user's direct conversations.
// This requires the user to be authenticated.
export async function fetchDmConversation(
  conversationId: string,
  cursor: DmCursorOptions | undefined,
  auth: TwitterAuth,
) {
  if (!(await auth.isLoggedIn())) {
    throw new AuthenticationError(
      'Scraper is not logged-in for fetching direct messages.',
    );
  }

  const params = new URLSearchParams();
  addApiParams(params, false);

  params.set('context', 'FETCH_DM_CONVERSATION_HISTORY');
  params.set('include_ext_profile_image_shape', '1');
  params.set('dm_secret_conversations_enabled', 'false');
  params.set('krs_registration_enabled', 'false');
  params.set('include_ext_limited_action_results', 'true');
  params.set('dm_users', 'true');
  params.set('include_groups', 'true');
  params.set('include_inbox_timelines', 'true');
  params.set('supports_reactions', 'true');
  params.set('supports_edit', 'true');
  params.set('include_conversation_info', 'true');
  params.set(
    'ext',
    'mediaColor,altText,mediaStats,highlightedLabel,parodyCommentaryFanLabel,voiceInfo,birdwatchPivot,superFollowMetadata,unmentionInfo,editControl,article',
  );

  // By default, passing no cursor means you get the latest results.
  // `max_id` does backwards pagination using min_entry_id as the maxId to get older messages.
  // `min_id` does forward pagination using max_entry_id as the minId to get newer messages.
  // To know when there are no more pages, the response's "status" will return "AT_END".
  if (cursor) {
    if (cursor.maxId) {
      params.set('max_id', cursor.maxId);
    }
    if (cursor.minId) {
      params.set('min_id', cursor.minId);
    }
  }

  const url = `https://x.com/i/api/1.1/dm/conversation/${conversationId}.json?${params.toString()}`;

  const res = await requestApi<DmConversationResponse>(url, auth);

  if (!res.success) {
    throw res.err;
  }

  return parseDmConversation(res.value);
}

export async function parseDmConversation(
  conversation: DmConversationResponse,
) {
  return conversation.conversation_timeline;
}

export async function getDmConversation(
  conversationId: string,
  cursor: DmCursorOptions | undefined,
  auth: TwitterAuth,
) {
  return await fetchDmConversation(conversationId, cursor, auth);
}

export function getDmMessages(
  conversationId: string,
  maxMessages: number,
  cursor: DmCursorOptions | undefined,
  auth: TwitterAuth,
): AsyncGenerator<DmMessageEntry, void> {
  return getDmConversationMessagesGenerator(
    conversationId,
    maxMessages,
    cursor,
    async (id, _max, cursor) => {
      const conversation = await fetchDmConversation(id, cursor, auth);

      let next: DmCursorOptions | undefined = undefined;

      if (cursor?.minId && conversation.max_entry_id) {
        next = { minId: conversation.max_entry_id };
      } else if (conversation.min_entry_id) {
        next = { maxId: conversation.min_entry_id };
      }

      return {
        conversation,
        next,
      };
    },
  );
}

export function findDmConversationsByUserId(
  inbox: DmInbox,
  userId: string,
): DmConversation[] {
  const conversations: DmConversation[] = [];

  for (const conversationId in inbox.conversations) {
    const conversation = inbox.conversations[conversationId];
    const hasUser = conversation.participants.some(
      (participant) => participant.user_id === userId,
    );

    if (hasUser) {
      conversations.push(conversation);
    }
  }

  return conversations;
}
