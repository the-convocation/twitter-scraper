import { addApiFeatures, requestApi } from './api';
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
): AsyncGenerator<Tweet> {
  return getTweetTimeline(query, maxTweets, (q, mt, c) => {
    return fetchSearchTweets(q, mt, searchMode, auth, c);
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
  if (!auth.isLoggedIn()) {
    throw new Error('Scraper is not logged-in for search.');
  }

  if (maxItems > 50) {
    maxItems = 50;
  }

  const variables: Record<string, any> = {
    rawQuery: query,
    count: maxItems,
    querySource: 'typed_query',
    product: 'Top',
  };

  const features: Record<string, any> = {
    responsive_web_enhance_cards_enabled: false,
  };
  addApiFeatures(features);

  const fieldToggles: Record<string, any> = {
    withArticleRichContentState: false,
  };

  if (cursor != null && cursor != '') {
    variables['cursor'] = cursor;
  }

  switch (searchMode) {
    case SearchMode.Latest:
      variables.product = 'Latest';
      break;
    case SearchMode.Photos:
      variables.product = 'Photos';
      break;
    case SearchMode.Videos:
      variables.product = 'Videos';
      break;
    case SearchMode.Users:
      variables.product = 'People';
      break;
    default:
      break;
  }

  const params = new URLSearchParams();
  params.set('variables', JSON.stringify(variables));
  params.set('features', JSON.stringify(features));
  params.set('fieldToggles', JSON.stringify(fieldToggles));

  const res = await requestApi<SearchTimeline>(
    `https://twitter.com/i/api/graphql/nK1dw4oV3k4w5TdtcAdSww/SearchTimeline?${params.toString()}`,
    auth,
  );
  if (!res.success) {
    throw res.err;
  }

  return res.value;
}
