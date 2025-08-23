import { AuthenticationError } from './errors';
import { TwitterAuth } from './auth';
import { LegacyUserRaw } from './profile';
import { requestApi } from './api';

import { getDirectMessageConversationMessagesGenerator } from './direct-messages-async';

export interface DirectMessageInboxResponse {
  inbox_initial_state: DirectMessageInbox;
}

export interface DirectMessageInbox {
  last_seen_event_id: string;
  trusted_last_seen_event_id: string;
  untrusted_last_seen_event_id: string;
  cursor: string;
  inbox_timelines: InboxTimelines;
  entries: ConversationEntry[];
  users: { [key: string]: LegacyUserRaw };
  conversations: { [key: string]: Conversation };
}

export interface ConversationResponse {
  conversation_timeline: ConversationTimeline;
}

export interface ConversationTimeline {
  status: ConversationStatus;
  min_entry_id: string;
  max_entry_id: string;
  entries: ConversationEntry[];
  users: { [key: string]: LegacyUserRaw };
  conversations: { [key: string]: Conversation };
}

export interface Conversation {
  conversation_id: string;
  type: string;
  sort_event_id: string;
  sort_timestamp: string;
  participants: ConversationParticipant[];
  nsfw: boolean;
  notifications_disabled: boolean;
  mention_notifications_disabled: boolean;
  last_read_event_id: string;
  read_only: boolean;
  trusted: boolean;
  muted: boolean;
  status: ConversationStatus;
  min_entry_id: string;
  max_entry_id: string;
}

export type ConversationStatus = 'AT_END' | 'HAS_MORE';

export interface ConversationParticipant {
  user_id: string;
  last_read_event_id?: string;
}

export interface ConversationEntry {
  welcome_message_create?: WelcomeMessageCreate;
  message?: ConversationMessage;
}

export interface ConversationMessage {
  id: string;
  time: string;
  affects_sort: boolean;
  request_id: string;
  conversation_id: string;
  message_data: ConversationMessageData;
  message_reactions: ConversationMessageReaction[];
}

export interface ConversationMessageData {
  id: string;
  time: string;
  recipient_id: string;
  sender_id: string;
  text: string;
  edit_count?: number;
  entities?: MessageDataEntities;
}

export interface ConversationMessageReaction {
  id: string;
  time: string;
  conversation_id: string;
  message_id: string;
  reaction_key: string;
  emoji_reaction: string;
  sender_id: string;
}

export interface MessageDataEntities {
  // TODO: Not sure what these types are.
  hashtags: any[];
  symbols: any[];
  user_mentions: any[];
  urls: MessageDataEntitiesURL[];
}

export interface MessageDataEntitiesURL {
  url: string;
  expanded_url: string;
  display_url: string;
  indices: number[];
}

export interface WelcomeMessageCreate extends ConversationMessage {
  welcome_message_id: string;
}

export interface InboxTimelines {
  trusted: InboxTimelinesState;
  untrusted: InboxTimelinesState;
  untrusted_low_quality: InboxTimelinesState;
}

export interface InboxTimelinesState {
  status: ConversationStatus;
  min_entry_id: string;
}

export async function fetchDirectMessageInbox(auth: TwitterAuth) {
  if (!(await auth.isLoggedIn())) {
    throw new AuthenticationError(
      'Scraper is not logged-in for fetching direct messages.',
    );
  }

  // TODO: Not sure how the "cursor" works for this. I don't have enough DMs to test.
  const res = await requestApi<DirectMessageInboxResponse>(
    'https://x.com/i/api/1.1/dm/inbox_initial_state.json?nsfw_filtering_enabled=false&filter_low_quality=true&include_quality=all&include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&include_can_media_tag=1&include_ext_is_blue_verified=1&include_ext_verified_type=1&include_ext_profile_image_shape=1&skip_status=1&dm_secret_conversations_enabled=false&krs_registration_enabled=false&cards_platform=Web-12&include_cards=1&include_ext_alt_text=true&include_ext_limited_action_results=true&include_quote_count=true&include_reply_count=1&tweet_mode=extended&include_ext_views=true&dm_users=true&include_groups=true&include_inbox_timelines=true&include_ext_media_color=true&supports_reactions=true&supports_edit=true&include_ext_edit_control=true&include_ext_business_affiliations_label=true&include_ext_parody_commentary_fan_label=true&ext=mediaColor%2CaltText%2CmediaStats%2ChighlightedLabel%2CparodyCommentaryFanLabel%2CvoiceInfo%2CbirdwatchPivot%2CsuperFollowMetadata%2CunmentionInfo%2CeditControl%2Carticle',
    auth,
  );

  if (!res.success) {
    throw res.err;
  }

  return parseDirectMessageInbox(res.value);
}

export async function parseDirectMessageInbox(
  inbox: DirectMessageInboxResponse,
) {
  return inbox.inbox_initial_state;
}

// This gets the current authenticated user's direct messages.
// This requires the user to be authenticated.
export async function getDirectMessageInbox(auth: TwitterAuth) {
  return await fetchDirectMessageInbox(auth);
}

// This gets the current authenticated user's direct conversations.
// This requires the user to be authenticated.
export async function fetchDirectMessageConversation(
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

  const res = await requestApi<ConversationResponse>(url, auth);

  if (!res.success) {
    throw res.err;
  }

  return parseDirectMessageConversation(res.value);
}

export async function parseDirectMessageConversation(
  conversation: ConversationResponse,
) {
  return conversation.conversation_timeline;
}

export async function getDirectMessageConversation(
  conversation_id: string,
  auth: TwitterAuth,
) {
  return await fetchDirectMessageConversation(conversation_id, undefined, auth);
}

export function getDirectMessageConversationMessages(
  conversationId: string,
  maxMessages: number,
  auth: TwitterAuth,
): AsyncGenerator<ConversationEntry, void> {
  return getDirectMessageConversationMessagesGenerator(
    conversationId,
    maxMessages,
    async (id: string, _max: number, cursor: string | undefined) => {
      const conversation = await fetchDirectMessageConversation(
        id,
        cursor,
        auth,
      );

      return {
        conversation,
        next: conversation.min_entry_id,
      };
    },
  );
}
