import { AuthenticationError } from './errors';
import { TwitterAuth } from './auth';
import { LegacyUserRaw } from './profile';
import { requestApi } from './api';

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

export async function fetchDmInbox(auth: TwitterAuth) {
  if (!(await auth.isLoggedIn())) {
    throw new AuthenticationError(
      'Scraper is not logged-in for fetching direct messages.',
    );
  }

  // TODO: Not sure how the "cursor" works for this. I don't have enough DMs to test.
  const res = await requestApi<DmInboxResponse>(
    'https://x.com/i/api/1.1/dm/inbox_initial_state.json?nsfw_filtering_enabled=false&filter_low_quality=true&include_quality=all&include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&include_can_media_tag=1&include_ext_is_blue_verified=1&include_ext_verified_type=1&include_ext_profile_image_shape=1&skip_status=1&dm_secret_conversations_enabled=false&krs_registration_enabled=false&cards_platform=Web-12&include_cards=1&include_ext_alt_text=true&include_ext_limited_action_results=true&include_quote_count=true&include_reply_count=1&tweet_mode=extended&include_ext_views=true&dm_users=true&include_groups=true&include_inbox_timelines=true&include_ext_media_color=true&supports_reactions=true&supports_edit=true&include_ext_edit_control=true&include_ext_business_affiliations_label=true&include_ext_parody_commentary_fan_label=true&ext=mediaColor%2CaltText%2CmediaStats%2ChighlightedLabel%2CparodyCommentaryFanLabel%2CvoiceInfo%2CbirdwatchPivot%2CsuperFollowMetadata%2CunmentionInfo%2CeditControl%2Carticle',
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
  conversation_id: string,
  maxId: string | undefined,
  auth: TwitterAuth,
) {
  if (!(await auth.isLoggedIn())) {
    throw new AuthenticationError(
      'Scraper is not logged-in for fetching direct messages.',
    );
  }

  let url = `https://x.com/i/api/1.1/dm/conversation/${conversation_id}.json?context=FETCH_DM_CONVERSATION_HISTORY&include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&include_can_media_tag=1&include_ext_is_blue_verified=1&include_ext_verified_type=1&include_ext_profile_image_shape=1&skip_status=1&dm_secret_conversations_enabled=false&krs_registration_enabled=false&cards_platform=Web-12&include_cards=1&include_ext_alt_text=true&include_ext_limited_action_results=true&include_quote_count=true&include_reply_count=1&tweet_mode=extended&include_ext_views=true&dm_users=true&include_groups=true&include_inbox_timelines=true&include_ext_media_color=true&supports_reactions=true&supports_edit=true&include_conversation_info=true&ext=mediaColor%2CaltText%2CmediaStats%2ChighlightedLabel%2CparodyCommentaryFanLabel%2CvoiceInfo%2CbirdwatchPivot%2CsuperFollowMetadata%2CunmentionInfo%2CeditControl%2Carticle`;

  // `max_id` does the pagination; to get the next "page", you set max_id to the response's min_entry_id.
  // To know when there are no more pages, the response's "status" will return "AT_END".
  if (maxId) {
    url += `&max_id=${maxId}`;
  }

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
  conversation_id: string,
  auth: TwitterAuth,
) {
  return await fetchDmConversation(conversation_id, undefined, auth);
}

export function getDmMessages(
  conversationId: string,
  maxMessages: number,
  auth: TwitterAuth,
): AsyncGenerator<DmMessageEntry, void> {
  return getDmConversationMessagesGenerator(
    conversationId,
    maxMessages,
    async (id: string, _max: number, cursor: string | undefined) => {
      const conversation = await fetchDmConversation(id, cursor, auth);

      return {
        conversation,
        next: conversation.min_entry_id,
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
