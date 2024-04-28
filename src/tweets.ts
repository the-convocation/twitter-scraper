import { addApiFeatures, requestApi } from './api';
import { TwitterAuth } from './auth';
import { getUserIdByScreenName } from './profile';
import { QueryTweetsResponse } from './timeline-v1';
import {
  parseTimelineTweetsV2,
  TimelineV2,
  TimelineEntryItemContentRaw,
  parseTimelineEntryItemContentRaw,
  ThreadedConversation,
  parseThreadedConversation,
} from './timeline-v2';
import { getTweetTimeline } from './timeline-async';
import { apiRequestFactory } from './api-data';
import { ListTimeline, parseListTimelineTweets } from './timeline-list';

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
  bookmarkCount?: number;
  conversationId?: string;
  hashtags: string[];
  html?: string;
  id?: string;
  inReplyToStatus?: Tweet;
  inReplyToStatusId?: string;
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

  const res = await requestApi<TimelineV2>(
    userTweetsRequest.toRequestUrl(),
    auth,
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

  const res = await requestApi<ListTimeline>(
    listTweetsRequest.toRequestUrl(),
    auth,
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

export async function fetchLikedTweets(
  userId: string,
  maxTweets: number,
  cursor: string | undefined,
  auth: TwitterAuth,
): Promise<QueryTweetsResponse> {
  if (!auth.isLoggedIn()) {
    throw new Error('Scraper is not logged-in for fetching liked tweets.');
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

  const res = await requestApi<TimelineV2>(
    userTweetsRequest.toRequestUrl(),
    auth,
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

  const res = await requestApi<ThreadedConversation>(
    tweetDetailRequest.toRequestUrl(),
    auth,
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

  const res = await requestApi<TweetResultByRestId>(
    tweetResultByRestIdRequest.toRequestUrl(),
    auth,
  );

  if (!res.success) {
    throw res.err;
  }

  if (!res.value.data) {
    return null;
  }

  return parseTimelineEntryItemContentRaw(res.value.data, id);
}
