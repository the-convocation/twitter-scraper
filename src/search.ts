import { bearerToken2, requestApi } from './api';
import { TwitterAuth } from './auth';
import { Profile } from './profile';
import { QueryProfilesResponse, QueryTweetsResponse } from './timeline-v1';
import { getTweetTimeline, getUserTimeline } from './timeline-async';
import { Tweet } from './tweets';
import {
  SearchTimeline,
  parseSearchTimelineTweets,
  parseSearchTimelineUsers,
} from './timeline-search';
import { AuthenticationError } from './errors';
import { apiRequestFactory } from './api-data';

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
  searchMode: SearchMode,
  auth: TwitterAuth,
): AsyncGenerator<Tweet, void> {
  return getTweetTimeline(query, maxTweets, (q, mt, c) => {
    return fetchSearchTweets(q, mt, searchMode, auth, c);
  });
}

export function searchProfiles(
  query: string,
  maxProfiles: number,
  auth: TwitterAuth,
): AsyncGenerator<Profile, void> {
  return getUserTimeline(query, maxProfiles, (q, mt, c) => {
    return fetchSearchProfiles(q, mt, auth, c);
  });
}

export async function fetchSearchTweets(
  query: string,
  maxTweets: number,
  searchMode: SearchMode,
  auth: TwitterAuth,
  cursor?: string,
): Promise<QueryTweetsResponse> {
  const timeline = await getSearchTimeline(
    query,
    maxTweets,
    searchMode,
    auth,
    cursor,
  );

  return parseSearchTimelineTweets(timeline);
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
    SearchMode.Users,
    auth,
    cursor,
  );

  return parseSearchTimelineUsers(timeline);
}

async function getSearchTimeline(
  query: string,
  maxItems: number,
  searchMode: SearchMode,
  auth: TwitterAuth,
  cursor?: string,
): Promise<SearchTimeline> {
  if (!(await auth.isLoggedIn())) {
    throw new AuthenticationError('Scraper is not logged-in for search.');
  }

  if (maxItems > 50) {
    maxItems = 50;
  }

  const searchTimelineRequest = apiRequestFactory.createSearchTimelineRequest();
  searchTimelineRequest.variables.rawQuery = query;
  searchTimelineRequest.variables.count = maxItems;
  searchTimelineRequest.variables.querySource = 'typed_query';
  searchTimelineRequest.variables.product = 'Top';

  if (cursor != null && cursor != '') {
    searchTimelineRequest.variables['cursor'] = cursor;
  }

  switch (searchMode) {
    case SearchMode.Latest:
      searchTimelineRequest.variables.product = 'Latest';
      break;
    case SearchMode.Photos:
      searchTimelineRequest.variables.product = 'Photos';
      break;
    case SearchMode.Videos:
      searchTimelineRequest.variables.product = 'Videos';
      break;
    case SearchMode.Users:
      searchTimelineRequest.variables.product = 'People';
      break;
    default:
      break;
  }

  const res = await requestApi<SearchTimeline>(
    searchTimelineRequest.toRequestUrl(),
    auth,
    'GET',
    undefined,
    undefined,
    bearerToken2,
  );

  if (!res.success) {
    throw res.err;
  }

  return res.value;
}
