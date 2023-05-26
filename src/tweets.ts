import { addApiParams, requestApi } from './api';
import { TwitterAuth } from './auth';
import { getUserIdByScreenName } from './profile';
import { TimelineRaw, parseTweets, QueryTweetsResponse } from './timeline';
import { getTweetTimeline } from './timeline-async';

export interface Mention {
  id: string;
  username?: string;
  name?: string;
}

export interface Photo {
  id: string;
  url: string;
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
  hashtags: string[];
  html?: string;
  id?: string;
  inReplyToStatus?: Tweet;
  isQuoted?: boolean;
  isPin?: boolean;
  isReply?: boolean;
  isRetweet?: boolean;
  likes?: number;
  name?: string;
  mentions: Mention[];
  permanentUrl?: string;
  photos: Photo[];
  place?: PlaceRaw;
  quotedStatus?: Tweet;
  replies?: number;
  retweets?: number;
  retweetedStatus?: Tweet;
  text?: string;
  timeParsed?: Date;
  timestamp?: number;
  urls: string[];
  userId?: string;
  username?: string;
  videos: Video[];
  sensitiveContent?: boolean;
}

export async function fetchTweets(
  userId: string,
  maxTweets: number,
  includeReplies: boolean,
  cursor: string | undefined,
  auth: TwitterAuth,
): Promise<QueryTweetsResponse> {
  if (maxTweets > 200) {
    maxTweets = 200;
  }

  const params = new URLSearchParams();
  addApiParams(params, includeReplies);

  params.set('count', `${maxTweets}`);
  params.set('userId', userId);
  if (cursor != null && cursor != '') {
    params.set('cursor', cursor);
  }

  const res = await requestApi<TimelineRaw>(
    `https://api.twitter.com/2/timeline/profile/${userId}.json?${params.toString()}`,
    auth,
  );
  if (!res.success) {
    throw res.err;
  }

  return parseTweets(res.value);
}

export function getTweets(
  user: string,
  maxTweets: number,
  includeReplies: boolean,
  auth: TwitterAuth,
): AsyncGenerator<Tweet> {
  return getTweetTimeline(user, maxTweets, async (q, mt, c) => {
    const userIdRes = await getUserIdByScreenName(q, auth);
    if (!userIdRes.success) {
      throw userIdRes.err;
    }

    const { value: userId } = userIdRes;

    return fetchTweets(userId, mt, includeReplies, c, auth);
  });
}

export function getTweetsByUserId(
  userId: string,
  maxTweets: number,
  includeReplies: boolean,
  auth: TwitterAuth,
): AsyncGenerator<Tweet> {
  return getTweetTimeline(userId, maxTweets, (q, mt, c) => {
    return fetchTweets(q, mt, includeReplies, c, auth);
  });
}

export async function getLatestTweet(
  user: string,
  includeReplies: boolean,
  includeRetweets: boolean,
  auth: TwitterAuth,
): Promise<Tweet | null> {
  const max = includeRetweets ? 1 : 200;
  const timeline = await getTweets(user, max, includeReplies, auth);

  if (max == 1) {
    return (await timeline.next()).value;
  }

  for await (const tweet of timeline) {
    if (!tweet.isRetweet) {
      return tweet;
    }
  }

  return null;
}

export async function getTweet(
  id: string,
  includeReplies: boolean,
  auth: TwitterAuth,
): Promise<Tweet | null> {
  const params = new URLSearchParams();
  addApiParams(params, includeReplies);

  const res = await requestApi<TimelineRaw>(
    `https://twitter.com/i/api/2/timeline/conversation/${id}.json?${params.toString()}`,
    auth,
  );
  if (!res.success) {
    throw res.err;
  }

  const { tweets } = parseTweets(res.value);
  for (const tweet of tweets) {
    if (tweet.id === id) {
      return tweet;
    }
  }

  return null;
}
