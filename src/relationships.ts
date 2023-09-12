import { addApiFeatures, requestApi } from './api';
import { TwitterAuth } from './auth';
import { Profile, getUserIdByScreenName } from './profile';
import { QueryProfilesResponse } from './timeline-v1';
import { getUserTimeline } from './timeline-async';
import {
  RelationshipTimeline,
  parseRelationshipTimeline,
} from './timeline-relationship';
import stringify from 'json-stable-stringify';

export function getFollowing(
  userId: string,
  maxProfiles: number,
  auth: TwitterAuth,
): AsyncGenerator<Profile, void> {
  return getUserTimeline(userId, maxProfiles, (q, mt, c) => {
    return fetchProfileFollowing(q, mt, auth, c);
  });
}

export function getFollowers(
  userId: string,
  maxProfiles: number,
  auth: TwitterAuth,
): AsyncGenerator<Profile, void> {
  return getUserTimeline(userId, maxProfiles, (q, mt, c) => {
    return fetchProfileFollowers(q, mt, auth, c);
  });
}

export async function fetchProfileFollowing(
  userId: string,
  maxProfiles: number,
  auth: TwitterAuth,
  cursor?: string,
): Promise<QueryProfilesResponse> {
  const timeline = await getFollowingTimeline(
    userId,
    maxProfiles,
    auth,
    cursor,
  );

  return parseRelationshipTimeline(timeline);
}

export async function fetchProfileFollowers(
  userId: string,
  maxProfiles: number,
  auth: TwitterAuth,
  cursor?: string,
): Promise<QueryProfilesResponse> {
  const timeline = await getFollowersTimeline(
    userId,
    maxProfiles,
    auth,
    cursor,
  );

  return parseRelationshipTimeline(timeline);
}

async function getFollowingTimeline(
  userId: string,
  maxItems: number,
  auth: TwitterAuth,
  cursor?: string,
): Promise<RelationshipTimeline> {
  if (!auth.isLoggedIn()) {
    throw new Error('Scraper is not logged-in for profile following.');
  }

  if (maxItems > 50) {
    maxItems = 50;
  }

  const variables: Record<string, any> = {
    userId,
    count: maxItems,
    includePromotedContent: false,
  };

  const features = addApiFeatures({
    responsive_web_twitter_article_tweet_consumption_enabled: false,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
      true,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_media_download_video_enabled: false,
  });

  if (cursor != null && cursor != '') {
    variables['cursor'] = cursor;
  }

  const params = new URLSearchParams();
  params.set('features', stringify(features));
  params.set('variables', stringify(variables));

  const res = await requestApi<RelationshipTimeline>(
    `https://twitter.com/i/api/graphql/iSicc7LrzWGBgDPL0tM_TQ/Following?${params.toString()}`,
    auth,
  );

  if (!res.success) {
    throw res.err;
  }

  return res.value;
}

async function getFollowersTimeline(
  userId: string,
  maxItems: number,
  auth: TwitterAuth,
  cursor?: string,
): Promise<RelationshipTimeline> {
  if (!auth.isLoggedIn()) {
    throw new Error('Scraper is not logged-in for profile followers.');
  }

  if (maxItems > 50) {
    maxItems = 50;
  }

  const variables: Record<string, any> = {
    userId,
    count: maxItems,
    includePromotedContent: false,
  };

  const features = addApiFeatures({
    responsive_web_twitter_article_tweet_consumption_enabled: false,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
      true,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_media_download_video_enabled: false,
  });

  if (cursor != null && cursor != '') {
    variables['cursor'] = cursor;
  }

  const params = new URLSearchParams();
  params.set('features', stringify(features));
  params.set('variables', stringify(variables));

  const res = await requestApi<RelationshipTimeline>(
    `https://twitter.com/i/api/graphql/rRXFSG5vR6drKr5M37YOTw/Followers?${params.toString()}`,
    auth,
  );

  if (!res.success) {
    throw res.err;
  }

  return res.value;
}
