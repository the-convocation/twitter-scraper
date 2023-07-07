import { addApiParams, requestApi } from './api';
import { TwitterAuth } from './auth';
import { Profile } from './profile';
import {
  parseTimelineTweetsV1,
  parseUsers,
  QueryProfilesResponse,
  QueryTweetsResponse,
  TimelineV1,
} from './timeline-v1';
import { getTweetTimeline, getUserTimeline } from './timeline-async';
import { Tweet } from './tweets';

/**
 * The categories that can be used in Twitter searches.
 */
export enum SearchMode {
  Top,
  Latest,
  Photos,
  Videos,
  Users,
}

export function searchTweets(
  query: string,
  maxTweets: number,
  includeReplies: boolean,
  searchMode: SearchMode,
  auth: TwitterAuth,
): AsyncGenerator<Tweet> {
  return getTweetTimeline(query, maxTweets, (q, mt, c) => {
    return fetchSearchTweets(q, mt, includeReplies, searchMode, auth, c);
  });
}

export function searchProfiles(
  query: string,
  maxProfiles: number,
  auth: TwitterAuth,
): AsyncGenerator<Profile> {
  return getUserTimeline(query, maxProfiles, (q, mt, c) => {
    return fetchSearchProfiles(q, mt, auth, c);
  });
}

export async function fetchSearchTweets(
  query: string,
  maxTweets: number,
  includeReplies: boolean,
  searchMode: SearchMode,
  auth: TwitterAuth,
  cursor?: string,
): Promise<QueryTweetsResponse> {
  const timeline = await getSearchTimeline(
    query,
    maxTweets,
    includeReplies,
    searchMode,
    auth,
    cursor,
  );

  return parseTimelineTweetsV1(timeline);
}

export async function fetchSearchProfiles(
  query: string,
  maxProfiles: number,
  auth: TwitterAuth,
  cursor?: string,
): Promise<QueryProfilesResponse> {
  const timeline = await getSearchTimeline(
    query,
    maxProfiles,
    false,
    SearchMode.Users,
    auth,
    cursor,
  );

  return parseUsers(timeline);
}

async function getSearchTimeline(
  query: string,
  maxItems: number,
  includeReplies: boolean,
  searchMode: SearchMode,
  auth: TwitterAuth,
  cursor?: string,
): Promise<TimelineV1> {
  if (!auth.isLoggedIn()) {
    throw new Error('Scraper is not logged-in for search.');
  }

  if (maxItems > 50) {
    maxItems = 50;
  }

  const params = new URLSearchParams();
  addApiParams(params, includeReplies);

  params.set('q', query);
  params.set('count', `${maxItems}`);
  params.set('query_source', 'typed_query');
  params.set('pc', '1');
  params.set('requestContext', 'launch');
  params.set('spelling_corrections', '1');
  params.set('include_ext_edit_control', 'true');
  if (cursor != null && cursor != '') {
    params.set('cursor', cursor);
  }

  switch (searchMode) {
    case SearchMode.Latest:
      params.set('tweet_search_mode', 'live');
      break;
    case SearchMode.Photos:
      params.set('result_filter', 'image');
      break;
    case SearchMode.Videos:
      params.set('result_filter', 'video');
      break;
    case SearchMode.Users:
      params.set('result_filter', 'user');
      break;
    default:
      break;
  }

  const res = await requestApi<TimelineV1>(
    `https://twitter.com/i/api/2/search/adaptive.json?${params.toString()}`,
    auth,
  );
  if (!res.success) {
    throw res.err;
  }

  return res.value;
}
