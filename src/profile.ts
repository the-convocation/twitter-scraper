import stringify from 'json-stable-stringify';
import { addApiFeatures, requestApi, RequestApiResult } from './api';
import { TwitterAuth } from './auth';

export interface LegacyUserRaw {
  created_at?: string;
  description?: string;
  entities?: {
    url?: {
      urls?: {
        expanded_url?: string;
      }[];
    };
  };
  favourites_count?: number;
  followers_count?: number;
  friends_count?: number;
  media_count?: number;
  statuses_count?: number;
  id_str?: string;
  listed_count?: number;
  name?: string;
  location: string;
  geo_enabled?: boolean;
  pinned_tweet_ids_str?: string[];
  profile_background_color?: string;
  profile_banner_url?: string;
  profile_image_url_https?: string;
  protected?: boolean;
  screen_name?: string;
  verified?: boolean;
  has_custom_timelines?: boolean;
  has_extended_profile?: boolean;
  url?: string;
}

/**
 * A parsed profile object.
 */
export interface Profile {
  avatar?: string;
  banner?: string;
  biography?: string;
  birthday?: string;
  followersCount?: number;
  followingCount?: number;
  friendsCount?: number;
  mediaCount?: number;
  statusesCount?: number;
  isPrivate?: boolean;
  isVerified?: boolean;
  isBlueVerified?: boolean;
  joined?: Date;
  likesCount?: number;
  listedCount?: number;
  location: string;
  name?: string;
  pinnedTweetIds?: string[];
  tweetsCount?: number;
  url?: string;
  userId?: string;
  username?: string;
  website?: string;
}

export interface UserRaw {
  data: {
    user_result: {
      result: {
        rest_id?: string;
        isBlueVerified: boolean;
        legacy: LegacyUserRaw;
      };
    };
  };
  errors?: {
    message: string;
  }[];
}

export function parseProfile(
  user: LegacyUserRaw,
  isBlueVerified?: boolean,
): Profile {
  const profile: Profile = {
    avatar: user.profile_image_url_https,
    banner: user.profile_banner_url,
    biography: user.description,
    followersCount: user.followers_count,
    followingCount: user.favourites_count,
    friendsCount: user.friends_count,
    mediaCount: user.media_count,
    isPrivate: user.protected,
    isVerified: user.verified,
    likesCount: user.favourites_count,
    listedCount: user.listed_count,
    location: user.location,
    name: user.name,
    pinnedTweetIds: user.pinned_tweet_ids_str,
    tweetsCount: user.statuses_count,
    url: `https://twitter.com/${user.screen_name}`,
    userId: user.id_str,
    username: user.screen_name,
    isBlueVerified: isBlueVerified ?? false,
  };

  if (user.created_at != null) {
    profile.joined = new Date(Date.parse(user.created_at));
  }

  const urls = user.entities?.url?.urls;
  if (urls?.length != null && urls?.length > 0) {
    profile.website = urls[0].expanded_url;
  }

  return profile;
}

export async function getProfile(
  username: string,
  auth: TwitterAuth,
): Promise<RequestApiResult<Profile>> {
  const params = new URLSearchParams();
  params.set(
    'variables',
    stringify({
      screen_name: username,
      withHighlightedLabel: true,
    }),
  );

  const features = addApiFeatures({
    interactive_text_enabled: true,
    longform_notetweets_inline_media_enabled: false,
    responsive_web_text_conversations_enabled: false,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
      false,
    vibe_api_enabled: false,
  });

  params.set('features', stringify(features));

  const res = await requestApi<UserRaw>(
    `https://api.twitter.com/graphql/u7wQyGi6oExe8_TRWGMq4Q/UserResultByScreenNameQuery?${params.toString()}`,
    auth,
  );
  if (!res.success) {
    return res;
  }

  const { value } = res;
  const { errors } = value;
  if (errors != null && errors.length > 0) {
    return {
      success: false,
      err: new Error(errors[0].message),
    };
  }

  const { result: user } = value.data.user_result;
  const { legacy } = user;

  if (user.rest_id == null || user.rest_id.length === 0) {
    return {
      success: false,
      err: new Error('rest_id not found.'),
    };
  }

  legacy.id_str = user.rest_id;

  if (legacy.screen_name == null || legacy.screen_name.length === 0) {
    return {
      success: false,
      err: new Error(`Either ${username} does not exist or is private.`),
    };
  }

  return {
    success: true,
    value: parseProfile(user.legacy, user.isBlueVerified),
  };
}

const idCache = new Map<string, string>();

export async function getUserIdByScreenName(
  screenName: string,
  auth: TwitterAuth,
): Promise<RequestApiResult<string>> {
  const cached = idCache.get(screenName);
  if (cached != null) {
    return { success: true, value: cached };
  }

  const profileRes = await getProfile(screenName, auth);
  if (!profileRes.success) {
    return profileRes;
  }

  const profile = profileRes.value;
  if (profile.userId != null) {
    idCache.set(screenName, profile.userId);

    return {
      success: true,
      value: profile.userId,
    };
  }

  return {
    success: false,
    err: new Error('User ID is undefined.'),
  };
}
