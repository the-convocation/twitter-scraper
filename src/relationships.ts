import { bearerToken2, requestApi } from './api';
import { TwitterAuth } from './auth';
import { Profile } from './profile';
import { QueryProfilesResponse } from './timeline-v1';
import { getUserTimeline } from './timeline-async';
import {
  RelationshipTimeline,
  parseRelationshipTimeline,
} from './timeline-relationship';
import { AuthenticationError } from './errors';
import { apiRequestFactory } from './api-data';

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
  if (!(await auth.isLoggedIn())) {
    throw new AuthenticationError(
      'Scraper is not logged-in for profile following.',
    );
  }

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
  if (!(await auth.isLoggedIn())) {
    throw new AuthenticationError(
      'Scraper is not logged-in for profile followers.',
    );
  }

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
    throw new AuthenticationError(
      'Scraper is not logged-in for profile following.',
    );
  }

  if (maxItems > 50) {
    maxItems = 50;
  }

  const followingRequest = apiRequestFactory.createFollowingRequest();
  followingRequest.variables.userId = userId;
  followingRequest.variables.count = maxItems;
  followingRequest.variables.includePromotedContent = false;

  if (cursor != null && cursor != '') {
    followingRequest.variables.cursor = cursor;
  }

  const res = await requestApi<RelationshipTimeline>(
    followingRequest.toRequestUrl(),
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

async function getFollowersTimeline(
  userId: string,
  maxItems: number,
  auth: TwitterAuth,
  cursor?: string,
): Promise<RelationshipTimeline> {
  if (!auth.isLoggedIn()) {
    throw new AuthenticationError(
      'Scraper is not logged-in for profile followers.',
    );
  }

  if (maxItems > 50) {
    maxItems = 50;
  }

  const followersRequest = apiRequestFactory.createFollowersRequest();
  followersRequest.variables.userId = userId;
  followersRequest.variables.count = maxItems;
  followersRequest.variables.includePromotedContent = false;

  if (cursor != null && cursor != '') {
    followersRequest.variables.cursor = cursor;
  }

  const res = await requestApi<RelationshipTimeline>(
    followersRequest.toRequestUrl(),
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
