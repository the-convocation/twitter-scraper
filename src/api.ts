import { gotScraping, Headers, Response } from 'got-scraping';

export const bearerToken =
  'AAAAAAAAAAAAAAAAAAAAAPYXBAAAAAAACLXUNDekMxqa8h%2F40K4moUkGsoc%3DTYfbDKbT3jJPCEVnMYqilB28NHfOPqkca3qaAxGfsyKCs0wRbw';
export const bearerToken2 =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

export type RequestApiResult<T> =
  | { success: true; deleteGuest: boolean; value: T }
  | { success: false; deleteGuest: boolean; err: Error };

export async function requestApi<T>(
  url: string,
  authorization: string,
  xGuestToken: string,
  cookie: string,
  xCsrfToken: string,
): Promise<RequestApiResult<T>> {
  const headers: Headers = {
    Authorization: `Bearer ${authorization}`,
    'X-Guest-Token': xGuestToken,
  };

  if (cookie != '' && xCsrfToken != '') {
    headers['Cookie'] = cookie;
    headers['x-csrf-token'] = xCsrfToken;
  }

  let res: Response<string>;
  try {
    res = await gotScraping.get({
      url,
      headers,
    });
  } catch (err) {
    if (!(err instanceof Error)) {
      throw err;
    }

    return {
      success: false,
      deleteGuest: false,
      err: new Error('Failed to perform request.'),
    };
  }

  if (res.statusCode != 200 && res.statusCode != 403) {
    return {
      success: false,
      deleteGuest: false,
      err: new Error(`Response status: ${res.statusCode}`),
    };
  }

  const value: T = JSON.parse(res.body);
  if (res.headers['x-rate-limit-incoming'] == '0') {
    return { success: true, deleteGuest: true, value };
  } else {
    return { success: true, deleteGuest: false, value };
  }
}

export function addApiParams(
  params: URLSearchParams,
  includeTweetReplies: boolean,
): URLSearchParams {
  params.set('include_profile_interstitial_type', '1');
  params.set('include_blocking', '1');
  params.set('include_blocked_by', '1');
  params.set('include_followed_by', '1');
  params.set('include_want_retweets', '1');
  params.set('include_mute_edge', '1');
  params.set('include_can_dm', '1');
  params.set('include_can_media_tag', '1');
  params.set('include_ext_has_nft_avatar', '1');
  params.set('skip_status', '1');
  params.set('cards_platform', 'Web-12');
  params.set('include_cards', '1');
  params.set('include_ext_alt_text', 'true');
  params.set('include_quote_count', 'true');
  params.set('include_reply_count', '1');
  params.set('tweet_mode', 'extended');
  params.set('include_entities', 'true');
  params.set('include_user_entities', 'true');
  params.set('include_ext_media_color', 'true');
  params.set('include_ext_media_availability', 'true');
  params.set('include_ext_sensitive_media_warning', 'true');
  params.set('send_error_codes', 'true');
  params.set('simple_quoted_tweet', 'true');
  params.set('include_tweet_replies', `${includeTweetReplies}`);
  params.set(
    'ext',
    'mediaStats,highlightedLabel,hasNftAvatar,voiceInfo,superFollowMetadata',
  );
  return params;
}

export interface GuestAuthentication {
  token: string;
  createdAt: Date;
}

export async function getGuestToken(
  authorization: string,
): Promise<RequestApiResult<GuestAuthentication>> {
  let res: Response<string>;
  try {
    res = await gotScraping.post({
      url: 'https://api.twitter.com/1.1/guest/activate.json',
      headers: {
        Authorization: `Bearer ${authorization}`,
      },
    });
  } catch (err) {
    if (!(err instanceof Error)) {
      throw err;
    }

    return {
      success: false,
      deleteGuest: false,
      err: new Error('Failed to request guest token.'),
    };
  }

  if (res.statusCode != 200) {
    return { success: false, deleteGuest: false, err: new Error(res.body) };
  }

  const o = JSON.parse(res.body);
  if (o == null || o['guest_token'] == null) {
    return {
      success: false,
      deleteGuest: false,
      err: new Error('guest_token not found.'),
    };
  }

  const guestToken = o['guest_token'];
  if (typeof guestToken !== 'string') {
    return {
      success: false,
      deleteGuest: false,
      err: new Error('guest_token was not a string.'),
    };
  }

  return {
    success: true,
    deleteGuest: false,
    value: { token: guestToken, createdAt: new Date() },
  };
}
