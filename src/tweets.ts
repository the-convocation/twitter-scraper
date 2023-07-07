import { addApiFeatures, requestApi } from './api';
import { TwitterAuth } from './auth';
import { getUserIdByScreenName } from './profile';
import { QueryTweetsResponse } from './timeline-v1';
import {
  TimelineV2,
  parseTimelineTweetsV2,
  parseThreadedConversation,
  ThreadedConversation,
} from './timeline-v2';
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
    userId,
    count: maxTweets,
    includePromotedContent: false,
    withQuickPromoteEligibilityTweetFields: false,
    withVoice: true,
    withV2Timeline: true,
  };

  const features: Record<string, any> = {};
  addApiFeatures(features);

  if (cursor != null && cursor != '') {
    variables['cursor'] = cursor;
  }

  const params = new URLSearchParams();
  params.set('variables', JSON.stringify(variables));
  params.set('features', JSON.stringify(features));

  const res = await requestApi<TimelineV2>(
    `https://twitter.com/i/api/graphql/UGi7tjRPr-d_U3bCPIko5Q/UserTweets?${params.toString()}`,
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
): AsyncGenerator<Tweet> {
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
): AsyncGenerator<Tweet> {
  return getTweetTimeline(userId, maxTweets, (q, mt, c) => {
    return fetchTweets(q, mt, c, auth);
  });
}

export async function getLatestTweet(
  user: string,
  includeRetweets: boolean,
  auth: TwitterAuth,
): Promise<Tweet | null> {
  const max = includeRetweets ? 1 : 200;
  const timeline = getTweets(user, max, auth);

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
  auth: TwitterAuth,
): Promise<Tweet | null> {
  const variables: Record<string, any> = {
    focalTweetId: id,
    referrer: 'profile',
    with_rux_injections: false,
    includePromotedContent: true,
    withCommunity: true,
    withQuickPromoteEligibilityTweetFields: true,
    withBirdwatchNotes: true,
    withVoice: true,
    withV2Timeline: true,
  };

  const features: Record<string, any> = {};
  addApiFeatures(features);

  const params = new URLSearchParams();
  params.set('variables', JSON.stringify(variables));
  params.set('features', JSON.stringify(features));

  const res = await requestApi<ThreadedConversation>(
    `https://twitter.com/i/api/graphql/wETHelmSuBQR5r-dgUlPxg/TweetDetail?${params.toString()}`,
    auth,
  );
  if (!res.success) {
    throw res.err;
  }

  const tweets = parseThreadedConversation(res.value);
  for (const tweet of tweets) {
    if (tweet.id === id) {
      return tweet;
    }
  }

  return null;
}
