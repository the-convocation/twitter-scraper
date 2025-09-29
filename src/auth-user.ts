import { Type, type Static } from '@sinclair/typebox';
import { Check } from '@sinclair/typebox/value';
import debug from 'debug';
import { Headers } from 'headers-polyfill';
import * as OTPAuth from 'otpauth';
import { CookieJar } from 'tough-cookie';
import { requestApi } from './api';
import { FetchParameters } from './api-types';
import { TwitterAuthOptions, TwitterGuestAuth } from './auth';
import { ApiError, AuthenticationError, TwitterApiErrorRaw } from './errors';
import { Platform } from './platform';
import { updateCookieJar } from './requests';

const log = debug('twitter-scraper:auth-user');

export interface TwitterUserAuthFlowInitRequest {
  flow_name: string;
  input_flow_data: Record<string, unknown>;
  subtask_versions: Record<string, number>;
}

export interface TwitterUserAuthFlowSubtaskRequest {
  flow_token: string;
  subtask_inputs: ({
    subtask_id: string;
  } & Record<string, unknown>)[];
}

export type TwitterUserAuthFlowRequest =
  | TwitterUserAuthFlowInitRequest
  | TwitterUserAuthFlowSubtaskRequest;

export interface TwitterUserAuthFlowResponse {
  errors?: TwitterApiErrorRaw[];
  flow_token?: string;
  status?: string;
  subtasks?: TwitterUserAuthSubtask[];
}

interface TwitterUserAuthVerifyCredentials {
  errors?: TwitterApiErrorRaw[];
}

const TwitterUserAuthSubtask = Type.Object({
  subtask_id: Type.String(),
  enter_text: Type.Optional(Type.Object({})),
});
type TwitterUserAuthSubtask = Static<typeof TwitterUserAuthSubtask>;

export type FlowTokenResultSuccess = {
  status: 'success';
  response: TwitterUserAuthFlowResponse;
};

export type FlowTokenResultError = {
  status: 'error';
  err: Error;
};

export type FlowTokenResult = FlowTokenResultSuccess | FlowTokenResultError;

export interface TwitterUserAuthCredentials {
  username: string;
  password: string;
  email?: string;
  twoFactorSecret?: string;
}

/* ---------------- helpers ---------------- */

function randomTxnId(bytes = 32): string {
  // produce a base64-ish string similar in length/shape to what frontend sends
  const buf = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256);
  // btoa over binary => map to string first
  let s = '';
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return Buffer.from(s, 'binary').toString('base64');
}

function normalizeXApiUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === 'corsproxy.io' || host.endsWith('.corsproxy.io')) {
      const q = u.search?.replace(/^\?/, '');
      if (q && (q.startsWith('http://') || q.startsWith('https://'))) return q;
      if (u.pathname?.length > 1) {
        const pathTarget = u.pathname.slice(1);
        if (
          pathTarget.startsWith('http://') ||
          pathTarget.startsWith('https://')
        )
          return pathTarget;
      }
    }
  } catch {}
  return url;
}

function assertXHost(urlStr: string): URL {
  const u = new URL(urlStr);
  const host = u.hostname.toLowerCase();
  if (!(host === 'api.x.com' || host === 'x.com' || host.endsWith('.x.com'))) {
    throw new AuthenticationError(
      `Login flow must POST directly to x.com; got host "${host}". Proxies are blocked by Cloudflare.`,
    );
  }
  return u;
}

async function buildBrowserishHeaders(
  base: Headers,
  token: string,
): Promise<Headers> {
  // start with what installTo() placed (auth, cookie, csrf)
  const headers = new Headers(base);

  const browserish: Record<string, string> = {
    'x-guest-token': token,
    'x-twitter-auth-type': 'OAuth2Client',
    'x-twitter-active-user': 'yes',
    'x-twitter-client-language': 'en-GB',
    'x-client-transaction-id': randomTxnId(),

    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    accept: '*/*',
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'accept-encoding': 'gzip, deflate, br, zstd',
    origin: 'https://x.com',
    referer: 'https://x.com/',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'sec-ch-ua':
      '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'content-type': 'application/json',
  };

  const extra = new Headers(browserish);
  extra.forEach((v, k) => headers.set(k, v));
  return headers;
}

async function isCloudflareBlock(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('text/html')) return false;
  try {
    const text = await res.clone().text();
    return /\bCloudflare\b/i.test(text) && /Attention Required!/i.test(text);
  } catch {
    return false;
  }
}

/* ---------------- class ---------------- */

export interface FlowSubtaskHandlerApi {
  sendFlowRequest: (
    request: TwitterUserAuthFlowRequest,
  ) => Promise<FlowTokenResult>;
  getFlowToken: () => string;
}

export type FlowSubtaskHandler = (
  subtaskId: string,
  previousResponse: TwitterUserAuthFlowResponse,
  credentials: TwitterUserAuthCredentials,
  api: FlowSubtaskHandlerApi,
) => Promise<FlowTokenResult>;

export class TwitterUserAuth extends TwitterGuestAuth {
  private readonly subtaskHandlers: Map<string, FlowSubtaskHandler> = new Map();

  constructor(bearerToken: string, options?: Partial<TwitterAuthOptions>) {
    super(bearerToken, options);
    this.initializeDefaultHandlers();
  }

  registerSubtaskHandler(subtaskId: string, handler: FlowSubtaskHandler): void {
    this.subtaskHandlers.set(subtaskId, handler);
  }

  private initializeDefaultHandlers(): void {
    this.subtaskHandlers.set(
      'LoginJsInstrumentationSubtask',
      this.handleJsInstrumentationSubtask.bind(this),
    );
    this.subtaskHandlers.set(
      'LoginEnterUserIdentifierSSO',
      this.handleEnterUserIdentifierSSO.bind(this),
    );
    this.subtaskHandlers.set(
      'LoginEnterAlternateIdentifierSubtask',
      this.handleEnterAlternateIdentifierSubtask.bind(this),
    );
    this.subtaskHandlers.set(
      'LoginEnterPassword',
      this.handleEnterPassword.bind(this),
    );
    this.subtaskHandlers.set(
      'AccountDuplicationCheck',
      this.handleAccountDuplicationCheck.bind(this),
    );
    this.subtaskHandlers.set(
      'LoginTwoFactorAuthChallenge',
      this.handleTwoFactorAuthChallenge.bind(this),
    );
    this.subtaskHandlers.set('LoginAcid', this.handleAcid.bind(this));
    this.subtaskHandlers.set(
      'LoginSuccessSubtask',
      this.handleSuccessSubtask.bind(this),
    );
  }

  async isLoggedIn(): Promise<boolean> {
    const res = await requestApi<TwitterUserAuthVerifyCredentials>(
      'https://api.x.com/1.1/account/verify_credentials.json',
      this,
    );
    if (!res.success) return false;
    const { value: verify } = res;
    return verify && !verify.errors?.length;
  }

  async login(
    username: string,
    password: string,
    email?: string,
    twoFactorSecret?: string,
  ): Promise<void> {
    await this.updateGuestToken();

    const credentials: TwitterUserAuthCredentials = {
      username,
      password,
      email,
      twoFactorSecret,
    };

    // Warm up: visit login page to establish cookies (may set ct0/guest/cf cookies)
    await this.preLoginWarmup();

    let next: FlowTokenResult = await this.initLogin();
    while (next.status === 'success' && next.response.subtasks?.length) {
      const flowToken = next.response.flow_token;
      if (flowToken == null) throw new Error('flow_token not found.');

      const subtaskId = next.response.subtasks[0].subtask_id;
      const handler = this.subtaskHandlers.get(subtaskId);
      if (handler) {
        next = await handler(subtaskId, next.response, credentials, {
          sendFlowRequest: this.executeFlowTask.bind(this),
          getFlowToken: () => flowToken,
        });
      } else {
        throw new Error(`Unknown subtask ${subtaskId}`);
      }
    }
    if (next.status === 'error') throw next.err;
  }

  async logout(): Promise<void> {
    if (!this.hasToken()) return;
    try {
      await requestApi<void>(
        'https://api.x.com/1.1/account/logout.json',
        this,
        'POST',
      );
    } catch (error) {
      console.warn('Error during logout:', error);
    } finally {
      this.deleteToken();
      this.jar = new CookieJar();
    }
  }

  async installCsrfToken(headers: Headers): Promise<void> {
    const cookies = await this.getCookies();
    const xCsrfToken = cookies.find((cookie) => cookie.key === 'ct0');
    if (xCsrfToken) headers.set('x-csrf-token', xCsrfToken.value);
  }

  async installTo(headers: Headers): Promise<void> {
    headers.set('authorization', `Bearer ${this.bearerToken}`);
    headers.set('cookie', await this.getCookieString());
    await this.installCsrfToken(headers);
  }

  private async preLoginWarmup(): Promise<void> {
    const platform = new Platform();
    await platform.randomizeCiphers();

    const hdrs = new Headers();
    await this.installTo(hdrs);
    const headers = await buildBrowserishHeaders(hdrs, this.guestToken!);

    const warmupUrl = 'https://x.com/i/flow/login';

    const fetchParameters: FetchParameters = [
      warmupUrl,
      {
        method: 'GET',
        headers,
        redirect: 'follow' as any, // some polyfills use string type
      },
    ];

    try {
      const res = await this.fetch(...fetchParameters);
      await updateCookieJar(this.jar, (res as Response).headers);

      if (await isCloudflareBlock(res)) {
        // We cannot solve JS challenges without a real browser.
        throw new AuthenticationError(
          'Cloudflare presented a challenge for x.com login warmup. A real browser context is required to obtain cookies. Import cookies from a browser session and retry.',
        );
      }
    } catch (e) {
      // Non-fatal: proceed; executeFlowTask will still run and error clearly if blocked
      log(`preLoginWarmup warning: ${String(e)}`);
    }
  }

  private async initLogin(): Promise<FlowTokenResult> {
    // Keep cookies stable. Only clear ct0 to force a fresh csrf if needed.
    this.removeCookie('ct0');

    return await this.executeFlowTask({
      flow_name: 'login',
      input_flow_data: {
        flow_context: {
          debug_overrides: {},
          start_location: { location: 'unknown' },
        },
      },
      subtask_versions: {
        action_list: 2,
        alert_dialog: 1,
        app_download_cta: 1,
        check_logged_in_account: 1,
        choice_selection: 3,
        contacts_live_sync_permission_prompt: 0,
        cta: 7,
        email_verification: 2,
        end_flow: 1,
        enter_date: 1,
        enter_email: 2,
        enter_password: 5,
        enter_phone: 2,
        enter_recaptcha: 1,
        enter_text: 5,
        enter_username: 2,
        generic_urt: 3,
        in_app_notification: 1,
        interest_picker: 3,
        js_instrumentation: 1,
        menu_dialog: 1,
        notifications_permission_prompt: 2,
        open_account: 2,
        open_home_timeline: 1,
        open_link: 1,
        phone_verification: 4,
        privacy_options: 1,
        security_key: 3,
        select_avatar: 4,
        select_banner: 2,
        settings_list: 7,
        show_code: 1,
        sign_up: 2,
        sign_up_review: 4,
        tweet_selection_urt: 1,
        update_users: 1,
        upload_media: 1,
        user_recommendations_list: 4,
        user_recommendations_urt: 1,
        wait_spinner: 3,
        web_modal: 1,
      },
    });
  }

  private async handleJsInstrumentationSubtask(
    subtaskId: string,
    _prev: TwitterUserAuthFlowResponse,
    _credentials: TwitterUserAuthCredentials,
    api: FlowSubtaskHandlerApi,
  ): Promise<FlowTokenResult> {
    return await api.sendFlowRequest({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          js_instrumentation: { response: '{}', link: 'next_link' },
        },
      ],
    });
  }

  private async handleEnterAlternateIdentifierSubtask(
    subtaskId: string,
    _prev: TwitterUserAuthFlowResponse,
    credentials: TwitterUserAuthCredentials,
    api: FlowSubtaskHandlerApi,
  ): Promise<FlowTokenResult> {
    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          enter_text: { text: credentials.email, link: 'next_link' },
        },
      ],
    });
  }

  private async handleEnterUserIdentifierSSO(
    subtaskId: string,
    _prev: TwitterUserAuthFlowResponse,
    credentials: TwitterUserAuthCredentials,
    api: FlowSubtaskHandlerApi,
  ): Promise<FlowTokenResult> {
    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          settings_list: {
            setting_responses: [
              {
                key: 'user_identifier',
                response_data: { text_data: { result: credentials.username } },
              },
            ],
            link: 'next_link',
          },
        },
      ],
    });
  }

  private async handleEnterPassword(
    subtaskId: string,
    _prev: TwitterUserAuthFlowResponse,
    credentials: TwitterUserAuthCredentials,
    api: FlowSubtaskHandlerApi,
  ): Promise<FlowTokenResult> {
    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          enter_password: { password: credentials.password, link: 'next_link' },
        },
      ],
    });
  }

  private async handleAccountDuplicationCheck(
    subtaskId: string,
    _prev: TwitterUserAuthFlowResponse,
    _credentials: TwitterUserAuthCredentials,
    api: FlowSubtaskHandlerApi,
  ): Promise<FlowTokenResult> {
    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          check_logged_in_account: { link: 'AccountDuplicationCheck_false' },
        },
      ],
    });
  }

  private async handleTwoFactorAuthChallenge(
    subtaskId: string,
    _prev: TwitterUserAuthFlowResponse,
    credentials: TwitterUserAuthCredentials,
    api: FlowSubtaskHandlerApi,
  ): Promise<FlowTokenResult> {
    if (!credentials.twoFactorSecret) {
      return {
        status: 'error',
        err: new AuthenticationError(
          'Two-factor authentication is required but no secret was provided',
        ),
      };
    }
    const totp = new OTPAuth.TOTP({ secret: credentials.twoFactorSecret });
    let error: unknown;
    for (let attempts = 1; attempts < 4; attempts += 1) {
      try {
        return await api.sendFlowRequest({
          flow_token: api.getFlowToken(),
          subtask_inputs: [
            {
              subtask_id: subtaskId,
              enter_text: { link: 'next_link', text: totp.generate() },
            },
          ],
        });
      } catch (err) {
        error = err;
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempts));
      }
    }
    throw error;
  }

  private async handleAcid(
    subtaskId: string,
    _prev: TwitterUserAuthFlowResponse,
    credentials: TwitterUserAuthCredentials,
    api: FlowSubtaskHandlerApi,
  ): Promise<FlowTokenResult> {
    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          enter_text: { text: credentials.email, link: 'next_link' },
        },
      ],
    });
  }

  private async handleSuccessSubtask(
    _subtaskId: string,
    _prev: TwitterUserAuthFlowResponse,
    _credentials: TwitterUserAuthCredentials,
    api: FlowSubtaskHandlerApi,
  ): Promise<FlowTokenResult> {
    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [],
    });
  }

  private async executeFlowTask(
    data: TwitterUserAuthFlowRequest,
  ): Promise<FlowTokenResult> {
    let onboardingTaskUrl = 'https://api.x.com/1.1/onboarding/task.json';
    if ('flow_name' in data) {
      onboardingTaskUrl = `https://api.x.com/1.1/onboarding/task.json?flow_name=${data.flow_name}`;
    }

    const normalizedUrl = normalizeXApiUrl(onboardingTaskUrl);
    const targetUrl = assertXHost(normalizedUrl).toString();

    log(`Making POST request to ${targetUrl}`);

    const token = this.guestToken;
    if (token == null) {
      throw new AuthenticationError(
        'Authentication token is null or undefined.',
      );
    }

    const platform = new Platform();
    await platform.randomizeCiphers();

    const base = new Headers();
    await this.installTo(base); // authorization, cookie, x-csrf-token
    const headers = await buildBrowserishHeaders(base, token);

    let res: Response;
    do {
      const fetchParameters: FetchParameters = [
        targetUrl,
        {
          credentials: 'include',
          method: 'POST',
          headers,
          body: JSON.stringify(data),
        },
      ];

      try {
        res = await this.fetch(...fetchParameters);
      } catch (err) {
        if (!(err instanceof Error)) throw err;
        return { status: 'error', err };
      }

      await updateCookieJar(this.jar, (res as Response).headers);

      if ((res as Response).status === 429) {
        log('Rate limit hit, waiting before retrying...');
        await this.onRateLimit({ fetchParameters, response: res });
      }
    } while ((res as Response).status === 429);

    // Detect Cloudflare block and surface a clear error with guidance
    if ((res as Response).status === 403 && (await isCloudflareBlock(res))) {
      return {
        status: 'error',
        err: new AuthenticationError(
          'Cloudflare blocked the login request (JS challenge). Perform the login in a real browser (e.g., Playwright/Puppeteer), export cookies (ct0, _twitter_sess, guest_id, personalization_id, and any cf_*), import them into the CookieJar, then retry.',
        ),
      };
    }

    if (!(res as Response).ok) {
      return {
        status: 'error',
        err: await ApiError.fromResponse(res as Response),
      };
    }

    const flow: TwitterUserAuthFlowResponse = await (res as Response).json();
    if (flow?.flow_token == null) {
      return {
        status: 'error',
        err: new AuthenticationError('flow_token not found.'),
      };
    }
    if (flow.errors?.length) {
      return {
        status: 'error',
        err: new AuthenticationError(
          `Authentication error (${flow.errors[0].code}): ${flow.errors[0].message}`,
        ),
      };
    }
    if (typeof flow.flow_token !== 'string') {
      return {
        status: 'error',
        err: new AuthenticationError('flow_token was not a string.'),
      };
    }

    const subtask = flow.subtasks?.length ? flow.subtasks[0] : undefined;
    Check(TwitterUserAuthSubtask, subtask);

    if (subtask && subtask.subtask_id === 'DenyLoginSubtask') {
      return {
        status: 'error',
        err: new AuthenticationError('Authentication error: DenyLoginSubtask'),
      };
    }

    return { status: 'success', response: flow };
  }
}
