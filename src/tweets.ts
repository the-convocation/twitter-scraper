import {
  addApiParams,
  HandleDeleteGuest,
  InjectGuestToken,
  requestApi,
} from './api';
import { getUserIdByScreenName } from './profile';
import { TimelineRaw, parseTweets } from './timeline';
import { getTweetTimeline } from './timeline-async';

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
  permanentUrl?: string;
  photos: string[];
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
  user: string,
  maxTweets: number,
  cursor: string | undefined,
  includeReplies: boolean,
  authorization: string,
  cookie: string,
  xCsrfToken: string,
  handleDeleteGuest: HandleDeleteGuest,
  injectGuest: InjectGuestToken,
): Promise<[Tweet[], string | undefined]> {
  if (maxTweets > 200) {
    maxTweets = 200;
  }

  const userIdRes = await getUserIdByScreenName(
    user,
    authorization,
    injectGuest(),
    cookie,
    xCsrfToken,
  );
  handleDeleteGuest(userIdRes.deleteGuest);
  if (!userIdRes.success) {
    throw userIdRes.err;
  }

  const params = new URLSearchParams();
  addApiParams(params, includeReplies);

  params.set('count', `${maxTweets}`);
  params.set('userId', userIdRes.value);
  if (cursor != null && cursor != '') {
    params.set('cursor', cursor);
  }

  const res = await requestApi<TimelineRaw>(
    `https://api.twitter.com/2/timeline/profile/${
      userIdRes.value
    }.json?${params.toString()}`,
    authorization,
    injectGuest(),
    cookie,
    xCsrfToken,
  );
  handleDeleteGuest(res.deleteGuest);
  if (!res.success) {
    throw res.err;
  }

  return parseTweets(res.value);
}

export function getTweets(
  user: string,
  maxTweets: number,
  includeReplies: boolean,
  authorization: string,
  cookie: string,
  xCsrfToken: string,
  handleDeleteGuest: HandleDeleteGuest,
  injectGuest: InjectGuestToken,
) {
  return getTweetTimeline(user, maxTweets, async (q, mt, c) => {
    const [tweets, next] = await fetchTweets(
      q,
      mt,
      c,
      includeReplies,
      authorization,
      cookie,
      xCsrfToken,
      handleDeleteGuest,
      injectGuest,
    );

    return { tweets, next };
  });
}

export async function getTweet(
  id: string,
  includeReplies: boolean,
  authorization: string,
  xGuestToken: string,
  cookie: string,
  xCsrfToken: string,
  handleDeleteGuest: HandleDeleteGuest,
): Promise<Tweet | null> {
  const params = new URLSearchParams();
  addApiParams(params, includeReplies);

  const res = await requestApi<TimelineRaw>(
    `https://twitter.com/i/api/2/timeline/conversation/${id}.json`,
    authorization,
    xGuestToken,
    cookie,
    xCsrfToken,
  );
  handleDeleteGuest(res.deleteGuest);
  if (!res.success) {
    throw res.err;
  }

  const [tweets] = parseTweets(res.value);
  for (const tweet of tweets) {
    if (tweet.id === id) {
      return tweet;
    }
  }

  return null;
}
