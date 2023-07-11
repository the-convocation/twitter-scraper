import { TwitterAuth } from './auth';
import { ApiError } from './errors';
import { updateCookieJar } from './requests';
import { Headers } from 'headers-polyfill';
import fetch from 'cross-fetch';

export const bearerToken =
  'AAAAAAAAAAAAAAAAAAAAAFQODgEAAAAAVHTp76lzh3rFzcHbmHVvQxYYpTw%3DckAlMINMjmCwxUcaXbAN4XqJVdgMJaHqNOFgPMK0zN1qLqLQCF';

/**
 * An API result container.
 */
export type RequestApiResult<T> =
  | { success: true; value: T }
  | { success: false; err: Error };

/**
 * Used internally to send HTTP requests to the Twitter API.
 * @internal
 *
 * @param url - The URL to send the request to.
 * @param auth - The instance of {@link TwitterAuth} that will be used to authorize this request.
 * @param method - The HTTP method used when sending this request.
 */
export async function requestApi<T>(
  url: string,
  auth: TwitterAuth,
  method: 'GET' | 'POST' = 'GET',
): Promise<RequestApiResult<T>> {
  const headers = new Headers();
  await auth.installTo(headers, url);

  let res: Response;
  do {
    try {
      res = await fetch(url, {
        method,
        headers,
      });
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }

      return {
        success: false,
        err: new Error('Failed to perform request.'),
      };
    }

    await updateCookieJar(auth.cookieJar(), res.headers);

    if (res.status === 429) {
      /*
      Known headers at this point:
      - x-rate-limit-limit: Maximum number of requests per time period?
      - x-rate-limit-reset: UNIX timestamp when the current rate limit will be reset.
      - x-rate-limit-remaining: Number of requests remaining in current time period?
      */
      const xRateLimitRemaining = res.headers.get('x-rate-limit-remaining');
      const xRateLimitReset = res.headers.get('x-rate-limit-reset');
      if (xRateLimitRemaining == '0' && xRateLimitReset) {
        const currentTime = new Date().valueOf() / 1000;
        const timeDeltaMs = 1000 * (parseInt(xRateLimitReset) - currentTime);

        // I have seen this block for 800s (~13 *minutes*)
        await new Promise((resolve) => setTimeout(resolve, timeDeltaMs));
      }
    }
  } while (res.status === 429);

  if (!res.ok) {
    return {
      success: false,
      err: new ApiError(res, `Response status: ${res.status}`),
    };
  }

  const value: T = await res.json();
  if (res.headers.get('x-rate-limit-incoming') == '0') {
    auth.deleteToken();
    return { success: true, value };
  } else {
    return { success: true, value };
  }
}

/**
 * @internal
 */
export function addApiFeatures(o: object) {
  return {
    ...o,
    rweb_lists_timeline_redesign_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    tweetypie_unmention_optimization_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    tweet_awards_web_tipping_enabled: false,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    longform_notetweets_rich_text_read_enabled: true,
    responsive_web_enhance_cards_enabled: false,
  };
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
  params.set('include_ext_is_blue_verified', '1');
  params.set('include_ext_verified_type', '1');
  params.set('skip_status', '1');
  params.set('cards_platform', 'Web-12');
  params.set('include_cards', '1');
  params.set('include_ext_alt_text', 'true');
  params.set('include_ext_limited_action_results', 'false');
  params.set('include_quote_count', 'true');
  params.set('include_reply_count', '1');
  params.set('tweet_mode', 'extended');
  params.set('include_ext_collab_control', 'true');
  params.set('include_ext_views', 'true');
  params.set('include_entities', 'true');
  params.set('include_user_entities', 'true');
  params.set('include_ext_media_color', 'true');
  params.set('include_ext_media_availability', 'true');
  params.set('include_ext_sensitive_media_warning', 'true');
  params.set('include_ext_trusted_friends_metadata', 'true');
  params.set('send_error_codes', 'true');
  params.set('simple_quoted_tweet', 'true');
  params.set('include_tweet_replies', `${includeTweetReplies}`);
  params.set(
    'ext',
    'mediaStats,highlightedLabel,hasNftAvatar,voiceInfo,birdwatchPivot,enrichments,superFollowMetadata,unmentionInfo,editControl,collab_control,vibe',
  );
  return params;
}
