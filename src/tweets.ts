import { addApiFeatures, requestApi, bearerToken2 } from './api';
import { TwitterAuth, TwitterGuestAuth } from './auth';
import { Headers } from 'headers-polyfill';
import { generateTransactionId } from './xctxid';
import { getUserIdByScreenName } from './profile';
import { LegacyTweetRaw, QueryTweetsResponse } from './timeline-v1';
import {
  parseTimelineTweetsV2,
  TimelineV2,
  TimelineEntryItemContentRaw,
  parseTimelineEntryItemContentRaw,
  ThreadedConversation,
  parseThreadedConversation,
} from './timeline-v2';
import { getTweetTimeline } from './timeline-async';
import { apiRequestFactory, mutationEndpoints } from './api-data';
import { ListTimeline, parseListTimelineTweets } from './timeline-list';
import { AuthenticationError } from './errors';

export interface Mention {
  id: string;
  username?: string;
  name?: string;
}

export interface Photo {
  id: string;
  url: string;
  alt_text: string | undefined;
}

export interface Video {
  id: string;
  preview: string;
  url?: string;
}

export interface PlaceRaw {
  id?: string;
  place_type?: string;
  name?: string;
  full_name?: string;
  country_code?: string;
  country?: string;
  bounding_box?: {
    type?: string;
    coordinates?: number[][][];
  };
}

/**
 * A parsed Tweet object.
 */
export interface Tweet {
  __raw_UNSTABLE?: LegacyTweetRaw;
  bookmarkCount?: number;
  conversationId?: string;
  hashtags: string[];
  html?: string;
  id?: string;
  inReplyToStatus?: Tweet;
  inReplyToStatusId?: string;
  isEdited?: boolean;
  versions?: string[];
  isQuoted?: boolean;
  isPin?: boolean;
  isReply?: boolean;
  isRetweet?: boolean;
  isSelfThread?: boolean;
  likes?: number;
  name?: string;
  mentions: Mention[];
  permanentUrl?: string;
  photos: Photo[];
  place?: PlaceRaw;
  quotedStatus?: Tweet;
  quotedStatusId?: string;
  replies?: number;
  retweets?: number;
  retweetedStatus?: Tweet;
  retweetedStatusId?: string;
  text?: string;
  thread: Tweet[];
  timeParsed?: Date;
  timestamp?: number;
  urls: string[];
  userId?: string;
  username?: string;
  videos: Video[];
  views?: number;
  sensitiveContent?: boolean;
}

export type TweetQuery =
  | Partial<Tweet>
  | ((tweet: Tweet) => boolean | Promise<boolean>);

export const features = addApiFeatures({
  interactive_text_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_text_conversations_enabled: false,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
    false,
  vibe_api_enabled: false,
});

export async function fetchTweets(
  userId: string,
  maxTweets: number,
  cursor: string | undefined,
  auth: TwitterAuth,
): Promise<QueryTweetsResponse> {
  if (maxTweets > 200) {
    maxTweets = 200;
  }

  const userTweetsRequest = apiRequestFactory.createUserTweetsRequest();
  userTweetsRequest.variables.userId = userId;
  userTweetsRequest.variables.count = maxTweets;
  userTweetsRequest.variables.includePromotedContent = false; // true on the website

  if (cursor != null && cursor != '') {
    userTweetsRequest.variables['cursor'] = cursor;
  }

  // Use bearerToken2 for UserTweets endpoint
  const res = await requestApi<TimelineV2>(
    userTweetsRequest.toRequestUrl(),
    auth,
    'GET',
    undefined,
    undefined,
    bearerToken2,
  );

  if (!res.success) {
    throw res.err;
  }

  return parseTimelineTweetsV2(res.value);
}

export async function fetchTweetsAndReplies(
  userId: string,
  maxTweets: number,
  cursor: string | undefined,
  auth: TwitterAuth,
): Promise<QueryTweetsResponse> {
  if (maxTweets > 40) {
    maxTweets = 40;
  }

  const userTweetsRequest =
    apiRequestFactory.createUserTweetsAndRepliesRequest();
  userTweetsRequest.variables.userId = userId;
  userTweetsRequest.variables.count = maxTweets;
  userTweetsRequest.variables.includePromotedContent = false; // true on the website

  if (cursor != null && cursor != '') {
    userTweetsRequest.variables['cursor'] = cursor;
  }

  // Use bearerToken2 for UserTweetsAndReplies endpoint
  const res = await requestApi<TimelineV2>(
    userTweetsRequest.toRequestUrl(),
    auth,
    'GET',
    undefined,
    undefined,
    bearerToken2,
  );

  if (!res.success) {
    throw res.err;
  }

  return parseTimelineTweetsV2(res.value);
}

export async function fetchListTweets(
  listId: string,
  maxTweets: number,
  cursor: string | undefined,
  auth: TwitterAuth,
): Promise<QueryTweetsResponse> {
  if (maxTweets > 200) {
    maxTweets = 200;
  }

  const listTweetsRequest = apiRequestFactory.createListTweetsRequest();
  listTweetsRequest.variables.listId = listId;
  listTweetsRequest.variables.count = maxTweets;

  if (cursor != null && cursor != '') {
    listTweetsRequest.variables['cursor'] = cursor;
  }

  // Use bearerToken2 for ListTweet endpoint
  const res = await requestApi<ListTimeline>(
    listTweetsRequest.toRequestUrl(),
    auth,
    'GET',
    undefined,
    undefined,
    bearerToken2,
  );

  if (!res.success) {
    throw res.err;
  }

  return parseListTimelineTweets(res.value);
}

export function getTweets(
  user: string,
  maxTweets: number,
  auth: TwitterAuth,
): AsyncGenerator<Tweet, void> {
  return getTweetTimeline(user, maxTweets, async (q, mt, c) => {
    const userIdRes = await getUserIdByScreenName(q, auth);

    if (!userIdRes.success) {
      throw userIdRes.err;
    }

    const { value: userId } = userIdRes;

    return fetchTweets(userId, mt, c, auth);
  });
}

export function getTweetsByUserId(
  userId: string,
  maxTweets: number,
  auth: TwitterAuth,
): AsyncGenerator<Tweet, void> {
  return getTweetTimeline(userId, maxTweets, (q, mt, c) => {
    return fetchTweets(q, mt, c, auth);
  });
}

export function getTweetsAndReplies(
  user: string,
  maxTweets: number,
  auth: TwitterAuth,
): AsyncGenerator<Tweet, void> {
  return getTweetTimeline(user, maxTweets, async (q, mt, c) => {
    const userIdRes = await getUserIdByScreenName(q, auth);

    if (!userIdRes.success) {
      throw userIdRes.err;
    }

    const { value: userId } = userIdRes;

    return fetchTweetsAndReplies(userId, mt, c, auth);
  });
}

export function getTweetsAndRepliesByUserId(
  userId: string,
  maxTweets: number,
  auth: TwitterAuth,
): AsyncGenerator<Tweet, void> {
  return getTweetTimeline(userId, maxTweets, (q, mt, c) => {
    return fetchTweetsAndReplies(q, mt, c, auth);
  });
}

export async function fetchLikedTweets(
  userId: string,
  maxTweets: number,
  cursor: string | undefined,
  auth: TwitterAuth,
): Promise<QueryTweetsResponse> {
  if (!(await auth.isLoggedIn())) {
    throw new AuthenticationError(
      'Scraper is not logged-in for fetching liked tweets.',
    );
  }

  if (maxTweets > 200) {
    maxTweets = 200;
  }

  const userTweetsRequest = apiRequestFactory.createUserLikedTweetsRequest();
  userTweetsRequest.variables.userId = userId;
  userTweetsRequest.variables.count = maxTweets;
  userTweetsRequest.variables.includePromotedContent = false; // true on the website

  if (cursor != null && cursor != '') {
    userTweetsRequest.variables['cursor'] = cursor;
  }

  // Use bearerToken2 for UserLikedTweets endpoint
  const res = await requestApi<TimelineV2>(
    userTweetsRequest.toRequestUrl(),
    auth,
    'GET',
    undefined,
    undefined,
    bearerToken2,
  );

  if (!res.success) {
    throw res.err;
  }

  return parseTimelineTweetsV2(res.value);
}

export function getLikedTweets(
  user: string,
  maxTweets: number,
  auth: TwitterAuth,
): AsyncGenerator<Tweet, void> {
  return getTweetTimeline(user, maxTweets, async (q, mt, c) => {
    const userIdRes = await getUserIdByScreenName(q, auth);

    if (!userIdRes.success) {
      throw userIdRes.err;
    }

    const { value: userId } = userIdRes;

    return fetchLikedTweets(userId, mt, c, auth);
  });
}

export async function getTweetWhere(
  tweets: AsyncIterable<Tweet>,
  query: TweetQuery,
): Promise<Tweet | null> {
  const isCallback = typeof query === 'function';

  for await (const tweet of tweets) {
    const matches = isCallback
      ? await query(tweet)
      : checkTweetMatches(tweet, query);

    if (matches) {
      return tweet;
    }
  }

  return null;
}

export async function getTweetsWhere(
  tweets: AsyncIterable<Tweet>,
  query: TweetQuery,
): Promise<Tweet[]> {
  const isCallback = typeof query === 'function';
  const filtered = [];

  for await (const tweet of tweets) {
    const matches = isCallback ? query(tweet) : checkTweetMatches(tweet, query);

    if (!matches) continue;
    filtered.push(tweet);
  }

  return filtered;
}

function checkTweetMatches(tweet: Tweet, options: Partial<Tweet>): boolean {
  return Object.keys(options).every((k) => {
    const key = k as keyof Tweet;
    return tweet[key] === options[key];
  });
}

export async function getLatestTweet(
  user: string,
  includeRetweets: boolean,
  max: number,
  auth: TwitterAuth,
): Promise<Tweet | null | void> {
  const timeline = getTweets(user, max, auth);

  // No point looping if max is 1, just use first entry.
  return max === 1
    ? (await timeline.next()).value
    : await getTweetWhere(timeline, { isRetweet: includeRetweets });
}

export interface TweetResultByRestId {
  data?: TimelineEntryItemContentRaw;
}

export async function getTweet(
  id: string,
  auth: TwitterAuth,
): Promise<Tweet | null> {
  const tweetDetailRequest = apiRequestFactory.createTweetDetailRequest();
  tweetDetailRequest.variables.focalTweetId = id;

  // Use bearerToken2 for this specific endpoint (TweetDetail)
  // This is required for animated GIFs to appear in tweets with mixed media
  const res = await requestApi<ThreadedConversation>(
    tweetDetailRequest.toRequestUrl(),
    auth,
    'GET',
    undefined,
    undefined,
    bearerToken2,
  );

  if (!res.success) {
    throw res.err;
  }

  if (!res.value) {
    return null;
  }

  const tweets = parseThreadedConversation(res.value);

  return tweets.find((tweet) => tweet.id === id) ?? null;
}

export async function getTweetAnonymous(
  id: string,
  auth: TwitterAuth,
): Promise<Tweet | null> {
  const tweetResultByRestIdRequest =
    apiRequestFactory.createTweetResultByRestIdRequest();
  tweetResultByRestIdRequest.variables.tweetId = id;

  // Use bearerToken2 for this specific endpoint (TweetResultByRestId)
  // This matches the behavior observed in the Twitter web client and Go library
  // We pass it as an override to avoid mutating shared state (concurrency-safe)
  const res = await requestApi<TweetResultByRestId>(
    tweetResultByRestIdRequest.toRequestUrl(),
    auth,
    'GET',
    undefined,
    undefined,
    bearerToken2,
  );

  if (!res.success) {
    throw res.err;
  }

  if (!res.value.data) {
    return null;
  }

  return parseTimelineEntryItemContentRaw(res.value.data, id);
}

export interface MediaData {
  data: Buffer;
  mediaType: string;
}

const MEDIA_UPLOAD_URL = 'https://upload.twitter.com/1.1/media/upload.json';

async function pollUploadStatus(
  mediaId: string,
  auth: TwitterAuth,
): Promise<void> {
  while (true) {
    const headers = new Headers();
    await auth.installTo(headers, MEDIA_UPLOAD_URL, bearerToken2);
    const params = new URLSearchParams({
      command: 'STATUS',
      media_id: mediaId,
    });
    const res = await auth.fetch(`${MEDIA_UPLOAD_URL}?${params}`, {
      headers,
      credentials: 'include',
    });
    const data = await res.json();
    const info = data.processing_info;
    if (!info || info.state === 'succeeded') return;
    if (info.state === 'failed') throw new Error('Media processing failed');
    await new Promise((resolve) =>
      setTimeout(resolve, (info.check_after_secs ?? 5) * 1000),
    );
  }
}

export async function uploadMedia(
  mediaData: MediaData,
  auth: TwitterAuth,
): Promise<string> {
  const { data, mediaType } = mediaData;

  if (mediaType.startsWith('video/')) {
    const totalBytes = data.byteLength;

    // INIT
    const initHeaders = new Headers();
    await auth.installTo(initHeaders, MEDIA_UPLOAD_URL, bearerToken2);
    initHeaders.set('content-type', 'application/x-www-form-urlencoded');
    const initRes = await auth.fetch(MEDIA_UPLOAD_URL, {
      method: 'POST',
      headers: initHeaders,
      credentials: 'include',
      body: new URLSearchParams({
        command: 'INIT',
        media_type: mediaType,
        total_bytes: totalBytes.toString(),
      }).toString(),
    });
    const initData = await initRes.json();
    const mediaId: string = initData.media_id_string;

    // APPEND (5 MB chunks)
    const chunkSize = 5 * 1024 * 1024;
    let segmentIndex = 0;
    for (let offset = 0; offset < totalBytes; offset += chunkSize) {
      const chunk = data.slice(offset, offset + chunkSize);
      const appendForm = new FormData();
      appendForm.append('command', 'APPEND');
      appendForm.append('media_id', mediaId);
      appendForm.append('segment_index', segmentIndex.toString());
      appendForm.append('media', new Blob([chunk], { type: mediaType }));
      const appendHeaders = new Headers();
      await auth.installTo(appendHeaders, MEDIA_UPLOAD_URL, bearerToken2);
      await auth.fetch(MEDIA_UPLOAD_URL, {
        method: 'POST',
        headers: appendHeaders,
        credentials: 'include',
        body: appendForm,
      });
      segmentIndex++;
    }

    // FINALIZE
    const finalizeHeaders = new Headers();
    await auth.installTo(finalizeHeaders, MEDIA_UPLOAD_URL, bearerToken2);
    finalizeHeaders.set('content-type', 'application/x-www-form-urlencoded');
    const finalizeRes = await auth.fetch(MEDIA_UPLOAD_URL, {
      method: 'POST',
      headers: finalizeHeaders,
      credentials: 'include',
      body: new URLSearchParams({
        command: 'FINALIZE',
        media_id: mediaId,
      }).toString(),
    });
    const finalizeData = await finalizeRes.json();
    if (finalizeData.processing_info) {
      await pollUploadStatus(mediaId, auth);
    }
    return mediaId;
  } else {
    // Simple upload for images
    const form = new FormData();
    form.append('media', new Blob([data], { type: mediaType }));
    const headers = new Headers();
    await auth.installTo(headers, MEDIA_UPLOAD_URL, bearerToken2);
    const res = await auth.fetch(MEDIA_UPLOAD_URL, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: form,
    });
    if (!res.ok) {
      throw new Error(`Media upload failed: ${res.status} ${res.statusText}`);
    }
    const uploadData = await res.json();
    return uploadData.media_id_string as string;
  }
}

export async function sendTweet(
  text: string,
  replyToTweetId: string | undefined,
  mediaData: MediaData[] | undefined,
  hideLinkPreview: boolean | undefined,
  auth: TwitterAuth,
): Promise<Tweet | null> {
  const mediaIds: string[] = [];
  if (mediaData?.length) {
    for (const m of mediaData) {
      mediaIds.push(await uploadMedia(m, auth));
    }
  }

  const variables: Record<string, unknown> = {
    tweet_text: text,
    media: {
      media_entities: mediaIds.map((id) => ({
        media_id: id,
        tagged_users: [],
      })),
      possibly_sensitive: false,
    },
    semantic_annotation_ids: [],
    disallowed_reply_options: null,
    semantic_annotation_options: { source: 'Profile' },
  };

  if (hideLinkPreview) variables.card_uri = 'tombstone://card';
  if (replyToTweetId)
    variables.reply = { in_reply_to_tweet_id: replyToTweetId };

  const body: Record<string, unknown> = {
    queryId: mutationEndpoints.CreateTweet.queryId,
    variables,
    features: {
      premium_content_api_read_enabled: false,
      communities_web_enable_tweet_community_results_fetch: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      responsive_web_grok_analyze_button_fetch_trends_enabled: false,
      responsive_web_grok_analyze_post_followups_enabled: true,
      responsive_web_jetfuel_frame: true,
      responsive_web_grok_share_attachment_enabled: true,
      responsive_web_grok_annotations_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      content_disclosure_indicator_enabled: true,
      content_disclosure_ai_generated_indicator_enabled: true,
      responsive_web_grok_show_grok_translated_post: true,
      responsive_web_grok_analysis_button_from_backend: true,
      post_ctas_fetch_enabled: false,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: false,
      profile_label_improvements_pcf_label_in_post_enabled: true,
      responsive_web_profile_redirect_enabled: false,
      rweb_tipjar_consumption_enabled: false,
      verified_phone_label_enabled: false,
      articles_preview_enabled: true,
      responsive_web_grok_community_note_auto_translation_is_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
        true,
      responsive_web_grok_image_annotation_enabled: true,
      responsive_web_grok_imagine_annotation_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_enhance_cards_enabled: false,
    },
  };

  const headers = new Headers();
  await auth.installTo(
    headers,
    mutationEndpoints.CreateTweet.url,
    bearerToken2,
  );
  headers.set('content-type', 'application/json');

  if (
    auth instanceof TwitterGuestAuth &&
    auth.options?.experimental?.xClientTransactionId
  ) {
    const transactionId = await generateTransactionId(
      mutationEndpoints.CreateTweet.url,
      auth.fetch.bind(auth),
      'POST',
    );
    headers.set('x-client-transaction-id', transactionId);
  }

  const res = await auth.fetch(mutationEndpoints.CreateTweet.url, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`CreateTweet failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();

  if (json?.errors?.length) {
    const err = json.errors[0];
    throw new Error(`CreateTweet error ${err.code}: ${err.message}`);
  }

  const entryContent = json?.data?.create_tweet;
  if (!entryContent) return null;
  const tweetResult = entryContent.tweet_results?.result;

  if (tweetResult && !tweetResult.__typename) {
    tweetResult.__typename = 'Tweet';
  }

  const userResult = tweetResult?.core?.user_results?.result;
  console.log('[sendTweet] __typename:', tweetResult?.__typename);
  console.log('[sendTweet] has tweet legacy:', !!tweetResult?.legacy);
  console.log('[sendTweet] has user legacy:', !!userResult?.legacy);
  console.log('[sendTweet] has user core:', !!userResult?.core);
  console.log('[sendTweet] rest_id:', tweetResult?.rest_id);
  console.log('[sendTweet] id_str:', tweetResult?.legacy?.id_str);

  const tweetId: string = tweetResult?.rest_id ?? '';
  return parseTimelineEntryItemContentRaw(entryContent, tweetId) ?? null;
}
