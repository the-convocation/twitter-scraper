import { addApiFeatures, requestApi } from './api';
import { TwitterAuth } from './auth';
import { getUserIdByScreenName } from './profile';
import { QueryTweetsResponse } from './timeline-v1';
import {
  parseTimelineTweetsV2,
  parseThreadedConversation,
  ThreadedConversation,
  TimelineV2,
} from './timeline-v2';
import { getTweetTimeline } from './timeline-async';
import stringify from 'json-stable-stringify';

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

  const variables: Record<string, any> = {
    includeHasBirdwatchNotes: false,
    rest_id: userId,
    count: maxTweets,
  };

  if (cursor != null && cursor != '') {
    variables['cursor'] = cursor;
  }

  const params = new URLSearchParams();
  params.set('variables', stringify(variables));
  params.set('features', stringify(features));

  const res = await requestApi<TimelineV2>(
    `https://api.twitter.com/graphql/8IS8MaO-2EN6GZZZb8jF0g/UserWithProfileTweetsAndRepliesQueryV2?${params.toString()}`,
    auth,
  );

  if (!res.success) {
    throw res.err;
  }

  return parseTimelineTweetsV2(res.value);
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

export async function getTweet(
  id: string,
  auth: TwitterAuth,
): Promise<Tweet | null> {
  const variables: Record<string, any> = {
    focalTweetId: id,
    includeHasBirdwatchNotes: false,
  };

  const params = new URLSearchParams();
  params.set('features', stringify(features));
  params.set('variables', stringify(variables));

  const res = await requestApi<ThreadedConversation>(
    `https://api.twitter.com/graphql/83h5UyHZ9wEKBVzALX8R_g/ConversationTimelineV2?${params.toString()}`,
    auth,
  );

  if (!res.success) {
    throw res.err;
  }

  const tweets = parseThreadedConversation(res.value);
  return tweets.find((t) => t.id === id) ?? null;
}
