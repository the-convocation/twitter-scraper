import { FetchParameters } from './api-types';
import { TwitterAuth } from './auth';
import { ApiError } from './errors';
import { Platform, PlatformExtensions } from './platform';
import { updateCookieJar } from './requests';
import { Headers } from 'headers-polyfill';
import { ClientTransaction } from 'x-client-transaction-id';
import debug from 'debug';
import fetch from 'cross-fetch';
import { Sha256 } from '@aws-crypto/sha256-browser';

const log = debug('twitter-scraper:api');

export interface FetchTransformOptions {
  /**
   * Transforms the request options before a request is made. This executes after all of the default
   * parameters have been configured, and is stateless. It is safe to return new request options
   * objects.
   * @param args The request options.
   * @returns The transformed request options.
   */
  request: (
    ...args: FetchParameters
  ) => FetchParameters | Promise<FetchParameters>;

  /**
   * Transforms the response after a request completes. This executes immediately after the request
   * completes, and is stateless. It is safe to return a new response object.
   * @param response The response object.
   * @returns The transformed response object.
   */
  response: (response: Response) => Response | Promise<Response>;
}

export const bearerToken =
  'AAAAAAAAAAAAAAAAAAAAAFQODgEAAAAAVHTp76lzh3rFzcHbmHVvQxYYpTw%3DckAlMINMjmCwxUcaXbAN4XqJVdgMJaHqNOFgPMK0zN1qLqLQCF';

export async function jitter(maxMs: number): Promise<void> {
  const jitter = Math.random() * maxMs;
  await new Promise((resolve) => setTimeout(resolve, jitter));
}

// @ts-expect-error type annotation
let linkedom: typeof import('linkedom') | undefined;
async function linkedomImport() {
  if (!linkedom) {
    linkedom = await import('linkedom');
  }
  return linkedom;
}

async function parseHTML(html: string) {
  const { parseHTML } = await linkedomImport();
  return parseHTML(html);
}

/**
 * An API result container.
 */
export type RequestApiResult<T> =
  | { success: true; value: T }
  | { success: false; err: Error };

// Copied from https://github.com/Lqm1/x-client-transaction-id/blob/main/utils.ts with minor tweaks
async function handleXMigration(fetchFn: typeof fetch): Promise<Document> {
  // Set headers to mimic a browser request
  const headers = {
    accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'accept-language': 'ja',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    priority: 'u=0, i',
    'sec-ch-ua':
      '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  };

  // Fetch X.com homepage
  const response = await fetchFn('https://x.com', {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch X homepage: ${response.statusText}`);
  }

  const htmlText = await response.text();

  // Parse HTML using linkedom
  let dom = await parseHTML(htmlText);
  let document = dom.window.document;

  // Check for migration redirection links
  const migrationRedirectionRegex = new RegExp(
    '(http(?:s)?://(?:www\\.)?(twitter|x){1}\\.com(/x)?/migrate([/?])?tok=[a-zA-Z0-9%\\-_]+)+',
    'i',
  );

  const metaRefresh = document.querySelector("meta[http-equiv='refresh']");
  const metaContent = metaRefresh
    ? metaRefresh.getAttribute('content') || ''
    : '';

  const migrationRedirectionUrl =
    migrationRedirectionRegex.exec(metaContent) ||
    migrationRedirectionRegex.exec(htmlText);

  if (migrationRedirectionUrl) {
    // Follow redirection URL
    const redirectResponse = await fetch(migrationRedirectionUrl[0]);

    if (!redirectResponse.ok) {
      throw new Error(
        `Failed to follow migration redirection: ${redirectResponse.statusText}`,
      );
    }

    const redirectHtml = await redirectResponse.text();
    dom = await parseHTML(redirectHtml);
    document = dom.window.document;
  }

  // Handle migration form if present
  const migrationForm =
    document.querySelector("form[name='f']") ||
    document.querySelector("form[action='https://x.com/x/migrate']");

  if (migrationForm) {
    const url =
      migrationForm.getAttribute('action') || 'https://x.com/x/migrate';
    const method = migrationForm.getAttribute('method') || 'POST';

    // Collect form input fields
    const requestPayload = new FormData();

    const inputFields = migrationForm.querySelectorAll('input');
    for (const element of Array.from(inputFields)) {
      const name = element.getAttribute('name');
      const value = element.getAttribute('value');
      if (name && value) {
        requestPayload.append(name, value);
      }
    }

    // Submit form using POST request
    const formResponse = await fetch(url, {
      method: method,
      body: requestPayload,
      headers,
    });

    if (!formResponse.ok) {
      throw new Error(
        `Failed to submit migration form: ${formResponse.statusText}`,
      );
    }

    const formHtml = await formResponse.text();
    dom = await parseHTML(formHtml);
    document = dom.window.document;
  }

  // Return final DOM document
  return document;
}

export async function generateTransactionId(
  url: string,
  auth: TwitterAuth,
  method: 'GET' | 'POST',
) {
  const parsedUrl = new URL(url);
  const path = parsedUrl.pathname;

  log(`Generating transaction ID for ${method} ${path}`);
  const document = await handleXMigration(auth.fetch.bind(auth));
  const transaction = await ClientTransaction.create(document);
  const transactionId = await transaction.generateTransactionId(method, path);
  log(`Transaction ID: ${transactionId}`);

  return transactionId;
}

// https://stackoverflow.com/a/40031979
function buf2hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

// Adapted from https://github.com/dsekz/twitter-x-xp-forwarded-for-header
export class XPFFHeaderGenerator {
  constructor(private readonly seed: string) {}

  private async deriveKey(guestId: string): Promise<Uint8Array> {
    const combined = `${this.seed}${guestId}`;
    const hash = new Sha256();
    hash.update(combined);
    const result = await hash.digest();
    return result;
  }

  async generateHeader(plaintext: string, guestId: string): Promise<string> {
    log(`Generating XPFF key for guest ID: ${guestId}`);
    const key = await this.deriveKey(guestId);
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM' },
      false,
      ['encrypt'],
    );
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
      },
      cipher,
      new TextEncoder().encode(plaintext),
    );

    // Combine nonce and encrypted data
    const combined = new Uint8Array(nonce.length + encrypted.byteLength);
    combined.set(nonce);
    combined.set(new Uint8Array(encrypted), nonce.length);
    const result = buf2hex(combined);

    log(`XPFF header generated for guest ID ${guestId}: ${result}`);

    return result;
  }
}

const xpffBaseKey =
  '0e6be1f1e21ffc33590b888fd4dc81b19713e570e805d4e5df80a493c9571a05';

function xpffPlain(): string {
  const timestamp = Date.now();
  return JSON.stringify({
    navigator_properties: {
      hasBeenActive: 'true',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      webdriver: 'false',
    },
    created_at: timestamp,
  });
}

export async function generateXPFFHeader(guestId: string): Promise<string> {
  const generator = new XPFFHeaderGenerator(xpffBaseKey);
  const plaintext = xpffPlain();
  return generator.generateHeader(plaintext, guestId);
}

/**
 * Used internally to send HTTP requests to the Twitter API.
 * @internal
 * @param url - The URL to send the request to.
 * @param auth - The instance of {@link TwitterAuth} that will be used to authorize this request.
 * @param method - The HTTP method used when sending this request.
 */
export async function requestApi<T>(
  url: string,
  auth: TwitterAuth,
  method: 'GET' | 'POST' = 'GET',
  platform: PlatformExtensions = new Platform(),
  headers: Headers = new Headers(),
): Promise<RequestApiResult<T>> {
  log(`Making ${method} request to ${url}`);

  await auth.installTo(headers, url);
  await platform.randomizeCiphers();

  const transactionId = await generateTransactionId(url, auth, method);
  headers.set('x-client-transaction-id', transactionId);

  const guestToken = headers.get('x-guest-token');
  const xpffHeader = await generateXPFFHeader(guestToken || '0');
  headers.set('x-xp-forwarded-for', xpffHeader);

  let res: Response;
  do {
    const fetchParameters: FetchParameters = [
      url,
      {
        method,
        headers,
        credentials: 'include',
      },
    ];

    try {
      res = await auth.fetch(...fetchParameters);
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
      log('Rate limit hit, waiting for retry...');
      await auth.onRateLimit({
        fetchParameters: fetchParameters,
        response: res,
      });
    }
  } while (res.status === 429);

  if (!res.ok) {
    return {
      success: false,
      err: await ApiError.fromResponse(res),
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

/** @internal */
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
    subscriptions_verification_info_enabled: true,
    subscriptions_verification_info_reason_enabled: true,
    subscriptions_verification_info_verified_since_enabled: true,
    super_follow_badge_privacy_enabled: false,
    super_follow_exclusive_tweet_notifications_enabled: false,
    super_follow_tweet_api_enabled: false,
    super_follow_user_api_enabled: false,
    android_graphql_skip_api_media_color_palette: false,
    creator_subscriptions_subscription_count_enabled: false,
    blue_business_profile_image_shape_enabled: false,
    unified_cards_ad_metadata_container_dynamic_card_content_query_enabled:
      false,
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
