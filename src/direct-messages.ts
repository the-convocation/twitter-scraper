import { AuthenticationError } from './errors';
import { TwitterAuth } from './auth';
import { LegacyUserRaw } from './profile';
import { requestApi } from './api';
import { apiRequestFactory } from './api-data';
import { decodeXChatEvent, XChatEventType, XChatDecodedEvent } from './thrift';
import debug from 'debug';

import { getDmConversationMessagesGenerator } from './direct-messages-async';

const log = debug('twitter-scraper:dm');

// ─── Existing types (maintained for backward compatibility) ──────────

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
  /** Whether the text content is end-to-end encrypted (X Chat). */
  encrypted?: boolean;
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

// ─── X Chat GraphQL response types ──────────────────────────────────

interface XChatInboxGraphQLResponse {
  data: {
    get_initial_chat_page: XChatInboxPage;
  };
}

interface XChatInboxPage {
  __typename: 'XChatGetInboxPageResponse' | 'XChatGetMessageEventsPageResponse';
  inboxCursor?: {
    __typename: string;
    graph_snapshot_id: string;
  };
  items?: XChatConversationData[];
  // Incremental sync fields (when __typename is XChatGetMessageEventsPageResponse)
  cursor?: {
    __typename: string;
    pull_finished: boolean;
  };
  encoded_message_events?: string[];
  has_message_requests?: boolean;
}

interface XChatConversationData {
  __typename: string;
  latest_message_events: string[]; // base64-encoded Thrift binary
  conversation_detail: XChatConversationDetail;
  latest_conversation_key_change_events: string[];
  latest_read_events_per_participant: XChatReadEvent[];
  latest_notifiable_message_create_event?: string;
  has_more: boolean;
}

interface XChatConversationDetail {
  __typename: string;
  is_muted: boolean;
  conversation_id: string;
  participants_results: XChatParticipantResult[];
}

interface XChatParticipantResult {
  __typename: string;
  rest_id: string;
  result: {
    __typename: string;
    rest_id: string;
    avatar?: {
      image_url: string;
    };
    core?: {
      name: string;
      screen_name: string;
      created_at_ms: number;
    };
    privacy?: {
      protected: boolean;
      suspended: boolean;
    };
    verification?: {
      is_blue_verified: boolean;
      verified: boolean;
    };
    profile_image_shape?: string;
  };
}

interface XChatReadEvent {
  __typename: string;
  participant_id: {
    __typename: string;
    rest_id: string;
  };
  latest_mark_conversation_read_event: string;
}

// ─── Fetch functions ─────────────────────────────────────────────────

/**
 * Fetch the DM inbox using the X Chat GraphQL API.
 * Falls back to the legacy REST endpoint if the account has not migrated.
 */
export async function fetchDmInbox(auth: TwitterAuth): Promise<DmInbox> {
  if (!(await auth.isLoggedIn())) {
    throw new AuthenticationError(
      'Scraper is not logged-in for fetching direct messages.',
    );
  }

  // Try the new X Chat GraphQL endpoint first
  try {
    const inbox = await fetchXChatInbox(auth);
    if (inbox && Object.keys(inbox.conversations).length > 0) {
      log('Fetched inbox via X Chat GraphQL API');
      return inbox;
    }
    log('X Chat inbox empty, trying legacy REST API');
  } catch (err) {
    log('X Chat GraphQL failed, falling back to legacy REST API:', err);
  }

  // Fallback: try legacy REST endpoint (for accounts not yet on X Chat)
  return fetchLegacyDmInbox(auth);
}

/**
 * Fetch inbox using the new X Chat GraphQL endpoint (GetInitialXChatPageQuery).
 */
async function fetchXChatInbox(auth: TwitterAuth): Promise<DmInbox> {
  const request = apiRequestFactory.createGetInitialXChatPageQueryRequest();

  const res = await requestApi<XChatInboxGraphQLResponse>(
    request.toRequestUrl(),
    auth,
  );

  if (!res.success) {
    throw res.err;
  }

  return parseXChatInbox(res.value);
}

/**
 * Fetch inbox using the legacy REST endpoint (dm/inbox_initial_state.json).
 * Used as fallback for accounts not yet migrated to X Chat.
 */
async function fetchLegacyDmInbox(auth: TwitterAuth): Promise<DmInbox> {
  const params = new URLSearchParams();
  params.set('nsfw_filtering_enabled', 'false');
  params.set('filter_low_quality', 'true');
  params.set('include_quality', 'all');
  params.set('dm_secret_conversations_enabled', 'false');
  params.set('krs_registration_enabled', 'false');
  params.set('dm_users', 'true');
  params.set('include_groups', 'true');
  params.set('include_inbox_timelines', 'true');
  params.set('supports_reactions', 'true');
  params.set('supports_edit', 'true');
  params.set(
    'ext',
    'mediaColor,altText,mediaStats,highlightedLabel,voiceInfo,birdwatchPivot,superFollowMetadata,unmentionInfo,editControl,article',
  );

  const res = await requestApi<DmInboxResponse>(
    `https://api.x.com/1.1/dm/inbox_initial_state.json?${params.toString()}`,
    auth,
  );

  if (!res.success) {
    throw res.err;
  }

  return res.value.inbox_initial_state;
}

/**
 * Parse the X Chat GraphQL inbox response into a backward-compatible DmInbox.
 */
function parseXChatInbox(response: XChatInboxGraphQLResponse): DmInbox {
  const page = response.data.get_initial_chat_page;

  // Handle incremental sync response (no items, just events)
  if (page.__typename === 'XChatGetMessageEventsPageResponse') {
    log('Got incremental sync response — returning empty inbox');
    return createEmptyInbox(page.cursor?.pull_finished ? 'AT_END' : 'HAS_MORE');
  }

  const items = page.items ?? [];
  const conversations: { [key: string]: DmConversation } = {};
  const users: { [key: string]: LegacyUserRaw } = {};
  const allEntries: DmMessageEntry[] = [];
  let maxEventId = '0';
  let minEventId = '';

  for (const item of items) {
    const detail = item.conversation_detail;
    const conversationId = detail.conversation_id;

    // Decode message events from Thrift binary
    const decodedEvents = decodeMessageEvents(item.latest_message_events);
    const messageEvents = decodedEvents.filter(
      (e) => e.eventType === XChatEventType.Message,
    );

    // Build conversation entry
    const eventIds = messageEvents.map((e) => e.eventId).sort();
    const convMinId = eventIds[0] ?? '';
    const convMaxId = eventIds[eventIds.length - 1] ?? '';

    if (convMaxId && (!maxEventId || convMaxId > maxEventId)) {
      maxEventId = convMaxId;
    }
    if (convMinId && (!minEventId || convMinId < minEventId)) {
      minEventId = convMinId;
    }

    // Extract read event IDs for participants
    const readEvents = extractReadEventIds(
      item.latest_read_events_per_participant,
    );

    // Build participants from GraphQL user data
    const participants: DmParticipant[] = detail.participants_results.map(
      (p) => ({
        user_id: p.rest_id,
        last_read_event_id: readEvents[p.rest_id],
      }),
    );

    // Build users dictionary
    for (const p of detail.participants_results) {
      if (p.result && !users[p.rest_id]) {
        users[p.rest_id] = xchatParticipantToLegacyUser(p);
      }
    }

    // Build conversation object
    // Note: X Chat's has_more refers to full conversation history, but we don't
    // support cursor-based pagination for encrypted X Chat messages. Always
    // report AT_END to prevent infinite pagination loops.
    conversations[conversationId] = {
      conversation_id: conversationId,
      type: conversationId.includes(':') ? 'ONE_TO_ONE' : 'GROUP_DM',
      sort_event_id: convMaxId,
      sort_timestamp:
        messageEvents[messageEvents.length - 1]?.timestampMs ?? '',
      participants,
      nsfw: false,
      notifications_disabled: detail.is_muted,
      mention_notifications_disabled: false,
      last_read_event_id:
        readEvents[detail.participants_results[0]?.rest_id ?? ''] ?? '',
      read_only: false,
      trusted: true,
      muted: detail.is_muted,
      status: 'AT_END',
      min_entry_id: convMinId,
      max_entry_id: convMaxId,
    };

    // Build message entries
    for (const event of messageEvents) {
      allEntries.push(
        xchatEventToMessageEntry(event, conversationId, participants),
      );
    }
  }

  // Sort entries by event ID descending (newest first)
  allEntries.sort((a, b) => {
    const aId = a.message?.id ?? '';
    const bId = b.message?.id ?? '';
    return bId.localeCompare(aId);
  });

  return {
    last_seen_event_id: maxEventId,
    trusted_last_seen_event_id: maxEventId,
    untrusted_last_seen_event_id: '0',
    cursor: page.inboxCursor?.graph_snapshot_id ?? '',
    inbox_timelines: {
      trusted: { status: 'AT_END', min_entry_id: minEventId },
      untrusted: { status: 'AT_END', min_entry_id: '' },
      untrusted_low_quality: { status: 'AT_END', min_entry_id: '' },
    },
    entries: allEntries,
    users,
    conversations,
  };
}

/** Decode an array of base64-encoded Thrift events, skipping any that fail. */
function decodeMessageEvents(encodedEvents: string[]): XChatDecodedEvent[] {
  const decoded: XChatDecodedEvent[] = [];
  for (const encoded of encodedEvents) {
    try {
      decoded.push(decodeXChatEvent(encoded));
    } catch (err) {
      log('Failed to decode X Chat event:', err);
    }
  }
  return decoded;
}

/**
 * Extract read event IDs from the participant read events array.
 * Returns a map of user_id → last-read event ID.
 */
function extractReadEventIds(
  readEvents: XChatReadEvent[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const re of readEvents) {
    // The read event itself is a Thrift-encoded event; try to extract the event ID
    try {
      const decoded = decodeXChatEvent(re.latest_mark_conversation_read_event);
      result[re.participant_id.rest_id] =
        decoded.readEventId ?? decoded.eventId;
    } catch {
      result[re.participant_id.rest_id] = '';
    }
  }
  return result;
}

/** Convert an X Chat GraphQL participant to a minimal LegacyUserRaw. */
function xchatParticipantToLegacyUser(
  p: XChatParticipantResult,
): LegacyUserRaw {
  const user = p.result;
  return {
    id_str: user.rest_id,
    name: user.core?.name ?? '',
    screen_name: user.core?.screen_name ?? '',
    profile_image_url_https: user.avatar?.image_url ?? '',
    verified: user.verification?.verified ?? false,
    protected: user.privacy?.protected ?? false,
  };
}

/**
 * Convert a decoded X Chat event into a DmMessageEntry.
 * The message text is marked as encrypted since X Chat uses E2E encryption.
 */
function xchatEventToMessageEntry(
  event: XChatDecodedEvent,
  conversationId: string,
  participants: DmParticipant[],
): DmMessageEntry {
  // Determine recipient (the other participant in the conversation)
  const recipientId =
    participants.find((p) => p.user_id !== event.senderId)?.user_id ?? '';

  return {
    message: {
      id: event.eventId,
      time: event.timestampMs,
      affects_sort: true,
      request_id: event.uuid,
      conversation_id: conversationId,
      message_data: {
        id: event.eventId,
        time: event.timestampMs,
        sender_id: event.senderId,
        recipient_id: recipientId,
        text: '[Encrypted: X Chat E2E]',
        encrypted: true,
      },
      message_reactions: [],
    },
  };
}

/** Create an empty DmInbox with the given timeline status. */
function createEmptyInbox(status: DmStatus = 'AT_END'): DmInbox {
  return {
    last_seen_event_id: '0',
    trusted_last_seen_event_id: '0',
    untrusted_last_seen_event_id: '0',
    cursor: '',
    inbox_timelines: {
      trusted: { status, min_entry_id: '' },
      untrusted: { status: 'AT_END', min_entry_id: '' },
      untrusted_low_quality: { status: 'AT_END', min_entry_id: '' },
    },
    entries: [],
    users: {},
    conversations: {},
  };
}

// ─── Legacy parse functions (kept for compatibility) ─────────────────

export async function parseDmInbox(inbox: DmInboxResponse) {
  return inbox.inbox_initial_state;
}

export async function parseDmConversation(
  conversation: DmConversationResponse,
) {
  return conversation.conversation_timeline;
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Get the current authenticated user's DM inbox.
 * Uses X Chat GraphQL API with fallback to legacy REST API.
 */
export async function getDmInbox(auth: TwitterAuth): Promise<DmInbox> {
  return await fetchDmInbox(auth);
}

/**
 * Fetch a specific DM conversation by ID.
 *
 * For X Chat accounts, this fetches the full inbox and extracts the
 * requested conversation. For legacy accounts, it uses the dedicated
 * conversation endpoint.
 */
export async function fetchDmConversation(
  conversationId: string,
  cursor: DmCursorOptions | undefined,
  auth: TwitterAuth,
): Promise<DmConversationTimeline> {
  if (!(await auth.isLoggedIn())) {
    throw new AuthenticationError(
      'Scraper is not logged-in for fetching direct messages.',
    );
  }

  // Try X Chat: fetch inbox and extract the target conversation
  try {
    const inbox = await fetchXChatInbox(auth);
    const convo = inbox.conversations[conversationId];
    if (convo) {
      const convoEntries = inbox.entries.filter(
        (e) => e.message?.conversation_id === conversationId,
      );

      const entryIds = convoEntries
        .map((e) => e.message?.id ?? '')
        .filter(Boolean)
        .sort();

      return {
        // Always AT_END for X Chat — no cursor-based pagination available
        status: 'AT_END' as const,
        min_entry_id: entryIds[0] ?? convo.min_entry_id,
        max_entry_id: entryIds[entryIds.length - 1] ?? convo.max_entry_id,
        entries: convoEntries,
        users: inbox.users,
        conversations: { [conversationId]: convo },
      };
    }
    log('Conversation %s not found in X Chat inbox', conversationId);
  } catch (err) {
    log('X Chat conversation fetch failed, trying legacy:', err);
  }

  // Fallback: legacy REST endpoint
  return fetchLegacyDmConversation(conversationId, cursor, auth);
}

/** Fetch conversation from the legacy REST API. */
async function fetchLegacyDmConversation(
  conversationId: string,
  cursor: DmCursorOptions | undefined,
  auth: TwitterAuth,
): Promise<DmConversationTimeline> {
  const params = new URLSearchParams();
  params.set('context', 'FETCH_DM_CONVERSATION_HISTORY');
  params.set('dm_secret_conversations_enabled', 'false');
  params.set('krs_registration_enabled', 'false');
  params.set('dm_users', 'true');
  params.set('include_groups', 'true');
  params.set('include_inbox_timelines', 'true');
  params.set('supports_reactions', 'true');
  params.set('supports_edit', 'true');
  params.set('include_conversation_info', 'true');
  params.set(
    'ext',
    'mediaColor,altText,mediaStats,highlightedLabel,voiceInfo,birdwatchPivot,superFollowMetadata,unmentionInfo,editControl,article',
  );

  if (cursor) {
    if (cursor.maxId) params.set('max_id', cursor.maxId);
    if (cursor.minId) params.set('min_id', cursor.minId);
  }

  const url = `https://api.x.com/1.1/dm/conversation/${conversationId}.json?${params.toString()}`;
  const res = await requestApi<DmConversationResponse>(url, auth);

  if (!res.success) {
    throw res.err;
  }

  return res.value.conversation_timeline;
}

export async function getDmConversation(
  conversationId: string,
  cursor: DmCursorOptions | undefined,
  auth: TwitterAuth,
): Promise<DmConversationTimeline> {
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
