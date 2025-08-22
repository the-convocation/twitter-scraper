import { AuthenticationError } from './errors';
import { TwitterAuth } from './auth';
import { LegacyUserRaw } from './profile';
import { requestApi } from './api';

export interface DirectMessageInboxResponse {
  inbox_initial_state: DirectMessageInbox;
}

export interface DirectMessageInbox {
  last_seen_event_id: string;
  trusted_last_seen_event_id: string;
  untrusted_last_seen_event_id: string;
  cursor: string;
  inbox_timelines: InboxTimelines;
  entries: Entry[];
  users: { [key: string]: LegacyUserRaw };
  conversations: { [key: string]: Conversation };
}

export interface Conversation {
  conversation_id: string;
  type: string;
  sort_event_id: string;
  sort_timestamp: string;
  participants: Participant[];
  nsfw: boolean;
  notifications_disabled: boolean;
  mention_notifications_disabled: boolean;
  last_read_event_id: string;
  read_only: boolean;
  trusted: boolean;
  muted: boolean;
  status: string;
  min_entry_id: string;
  max_entry_id: string;
}

export interface Participant {
  user_id: string;
  last_read_event_id?: string;
}

export interface Entry {
  welcome_message_create?: WelcomeMessageCreate;
  message?: Message;
}

export interface Message {
  id: string;
  time: string;
  affects_sort: boolean;
  request_id: string;
  conversation_id: string;
  message_data: MessageData;
  message_reactions: MessageReaction[];
}

export interface MessageData {
  id: string;
  time: string;
  recipient_id: string;
  sender_id: string;
  text: string;
  edit_count?: number;
  entities?: MessageDataEntities;
}

export interface MessageReaction {
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
  urls: URL[];
}

export interface URL {
  url: string;
  expanded_url: string;
  display_url: string;
  indices: number[];
}

export interface WelcomeMessageCreate extends Message {
  welcome_message_id: string;
}

export interface InboxTimelines {
  trusted: Trusted;
  untrusted: Untrusted;
}

export interface Trusted {
  status: string;
  min_entry_id: string;
}

export interface Untrusted {
  status: string;
}

export async function fetchDirectMessageInbox(auth: TwitterAuth) {
  if (!(await auth.isLoggedIn())) {
    throw new AuthenticationError(
      'Scraper is not logged-in for fetching direct messages.',
    );
  }

  const res = await requestApi<DirectMessageInboxResponse>(
    'https://x.com/i/api/1.1/dm/inbox_initial_state.json',
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

// This gets the current authenticated user's direct messages. This requires the user to be authenticated.
// TODO: Handle cursor pagination
export async function getDirectMessageInbox(auth: TwitterAuth) {
  return await fetchDirectMessageInbox(auth);
}
