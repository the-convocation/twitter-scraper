import { requestApi, RequestApiResult } from './api';

export interface Profile {
  avatar?: string;
  banner?: string;
  biography?: string;
  birthday?: string;
  followersCount?: number;
  followingCount?: number;
  friendsCount?: number;
  isPrivate?: boolean;
  isVerified?: boolean;
  joined?: Date;
  likesCount?: number;
  listedCount?: number;
  location?: string;
  name?: string;
  pinnedTweetIds?: string[];
  tweetsCount?: number;
  url?: string;
  userId?: string;
  username?: string;
  website?: string;
}

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
  id_str?: string;
  listed_count?: number;
  name?: string;
  location?: string;
  pinned_tweet_ids_str?: string[];
  profile_banner_url?: string;
  profile_image_url_https?: string;
  protected?: boolean;
  screen_name?: string;
  statuses_count?: number;
  verified?: boolean;
}

export interface UserRaw {
  data: {
    user: {
      rest_id?: string;
      legacy: LegacyUserRaw;
    };
  };
  errors?: {
    message: string;
  }[];
}

function parseProfile(user: LegacyUserRaw): Profile {
  const profile: Profile = {
    avatar: user.profile_image_url_https,
    banner: user.profile_banner_url,
    biography: user.description,
    followersCount: user.followers_count,
    followingCount: user.favourites_count,
    friendsCount: user.friends_count,
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
  authorization: string,
  xGuestToken: string,
  cookie: string,
  xCsrfToken: string,
): Promise<RequestApiResult<Profile>> {
  const res = await requestApi<UserRaw>(
    'https://api.twitter.com/graphql/4S2ihIKfF3xhp-ENxvUAfQ/UserByScreenName?variables=%7B%22screen_name%22%3A%22' +
      username +
      '%22%2C%22withHighlightedLabel%22%3Atrue%7D',
    authorization,
    xGuestToken,
    cookie,
    xCsrfToken,
  );

  if (!res.success) {
    throw res.err;
  }

  const { deleteGuest, value } = res;
  const { errors } = value;
  if (errors != null && errors.length > 0) {
    return {
      success: false,
      deleteGuest,
      err: new Error(errors[0].message),
    };
  }

  const { user } = value.data;
  const { legacy } = user;
  if (user.rest_id == null || user.rest_id.length === 0) {
    return {
      success: false,
      deleteGuest,
      err: new Error('rest_id not found.'),
    };
  }

  legacy.id_str = user.rest_id;

  if (legacy.screen_name == null || legacy.screen_name.length === 0) {
    return {
      success: false,
      deleteGuest,
      err: new Error(`either ${username} does not exist or is private.`),
    };
  }

  return {
    success: true,
    deleteGuest,
    value: parseProfile(user.legacy),
  };
}

const idCache = new Map<string, string>();

export async function getUserIdByScreenName(
  screenName: string,
  authorization: string,
  xGuestToken: string,
  cookie: string,
  xCsrfToken: string,
): Promise<RequestApiResult<string>> {
  const cached = idCache.get(screenName);
  if (cached != null) {
    return { success: true, deleteGuest: false, value: cached };
  }

  const profileRes = await getProfile(
    screenName,
    authorization,
    xGuestToken,
    cookie,
    xCsrfToken,
  );
  const { success, deleteGuest } = profileRes;
  if (!success) {
    return {
      success: false,
      deleteGuest,
      err: profileRes.err,
    };
  }

  const profile = profileRes.value;
  if (profile.userId != null) {
    idCache.set(screenName, profile.userId);

    return {
      success: true,
      deleteGuest,
      value: profile.userId,
    };
  }

  return {
    success: false,
    deleteGuest,
    err: new Error('user ID is undefined.'),
  };
}
