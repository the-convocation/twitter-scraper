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
import { updateCookieJar } from './requests';

// NEW: Lqm1 library for x-client-transaction-id
import { ClientTransaction, handleXMigration } from 'x-client-transaction-id';

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

/**
 * The API interface provided to custom subtask handlers for interacting with the Twitter authentication flow.
 * This interface allows handlers to send flow requests and access the current flow token.
 */
export interface FlowSubtaskHandlerApi {
  sendFlowRequest: (
    request: TwitterUserAuthFlowRequest,
  ) => Promise<FlowTokenResult>;
  getFlowToken: () => string;
}

/**
 * A handler function for processing Twitter authentication flow subtasks.
 */
export type FlowSubtaskHandler = (
  subtaskId: string,
  previousResponse: TwitterUserAuthFlowResponse,
  credentials: TwitterUserAuthCredentials,
  api: FlowSubtaskHandlerApi,
) => Promise<FlowTokenResult>;

/**
 * A user authentication token manager.
 */
export class TwitterUserAuth extends TwitterGuestAuth {
  private readonly subtaskHandlers: Map<string, FlowSubtaskHandler> = new Map();

  // NEW: cache a ClientTransaction generator instance
  private clientTxn: ClientTransaction | null = null;

  constructor(bearerToken: string, options?: Partial<TwitterAuthOptions>) {
    super(bearerToken, options);
    this.initializeDefaultHandlers();
  }

  /**
   * Register a custom subtask handler or override an existing one
   */
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
    if (!res.success) {
      return false;
    }

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

    let next: FlowTokenResult = await this.initLogin();
    while (next.status === 'success' && next.response.subtasks?.length) {
      const flowToken = next.response.flow_token;
      if (flowToken == null) {
        // Should never happen
        throw new Error('flow_token not found.');
      }

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
    if (next.status === 'error') {
      throw next.err;
    }
  }

  async logout(): Promise<void> {
    if (!this.hasToken()) {
      return;
    }

    try {
      await requestApi<void>(
        'https://api.x.com/1.1/account/logout.json',
        this,
        'POST',
      );
    } catch (error) {
      // Ignore errors during logout but still clean up state
      console.warn('Error during logout:', error);
    } finally {
      this.deleteToken();
      this.jar = new CookieJar();
    }
  }

  async installCsrfToken(headers: Headers): Promise<void> {
    const cookies = await this.getCookies();
    const xCsrfToken = cookies.find((cookie) => cookie.key === 'ct0');
    if (xCsrfToken) {
      headers.set('x-csrf-token', xCsrfToken.value);
    }
  }

  async installTo(headers: Headers): Promise<void> {
    headers.set('authorization', `Bearer ${this.bearerToken}`);
    headers.set('cookie', await this.getCookieString());
    await this.installCsrfToken(headers);
  }

  private async initLogin(): Promise<FlowTokenResult> {
    // Reset certain session-related cookies because Twitter complains sometimes if we don't
    this.removeCookie('twitter_ads_id=');
    this.removeCookie('ads_prefs=');
    this.removeCookie('_twitter_sess=');
    this.removeCookie('zipbox_forms_auth_token=');
    this.removeCookie('lang=');
    this.removeCookie('bouncer_reset_cookie=');
    this.removeCookie('twid=');
    this.removeCookie('twitter_ads_idb=');
    this.removeCookie('email_uid=');
    this.removeCookie('external_referer=');
    this.removeCookie('ct0=');
    this.removeCookie('aa_u=');
    this.removeCookie('__cf_bm=');

    return await this.executeFlowTask({
      flow_name: 'login',
      input_flow_data: {
        flow_context: {
          debug_overrides: {},
          start_location: {
            location: 'unknown',
          },
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
          js_instrumentation: {
            response: '{}',
            link: 'next_link',
          },
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
    if (!credentials.email) {
      return {
        status: 'error',
        err: new AuthenticationError('Email is required for this subtask'),
      };
    }
    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          enter_text: {
            text: credentials.email,
            link: 'next_link',
          },
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
                response_data: {
                  text_data: { result: credentials.username },
                },
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
          enter_password: {
            password: credentials.password,
            link: 'next_link',
          },
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
          check_logged_in_account: {
            link: 'AccountDuplicationCheck_false',
          },
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
              enter_text: {
                link: 'next_link',
                text: totp.generate(),
              },
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
    if (!credentials.email) {
      return {
        status: 'error',
        err: new AuthenticationError('Email is required for this subtask'),
      };
    }
    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          enter_text: {
            text: credentials.email,
            link: 'next_link',
          },
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

  // --------- NEW helpers for headers / detection / transaction id ---------

  /** Optionally provide a valid x-xp-forwarded-for if your app can generate one. */
  // eslint-disable-next-line class-methods-use-this
  protected getXpffHeader(): string | undefined {
    // Example: return this.options?.getXpff?.();
    return undefined;
  }

  /** Detect Cloudflare/HTML interstitials quickly. */
  private async isHtmlIntervention(res: Response): Promise<boolean> {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('text/html')) return true;
    const peek = await res.clone().text();
    return (
      /<title>\s*Attention Required!\s*\|\s*Cloudflare\s*<\/title>/i.test(
        peek,
      ) || /<h1[^>]*>\s*Sorry,\s*you have been blocked\s*<\/h1>/i.test(peek)
    );
  }

  /** Ensure we have a ready ClientTransaction generator. */
  private async ensureClientTxn(): Promise<ClientTransaction> {
    if (this.clientTxn) return this.clientTxn;
    // Handles x.com migration & returns a document compatible with generator
    const doc = await handleXMigration();
    this.clientTxn = await ClientTransaction.create(doc);
    return this.clientTxn;
  }

  /** Generate a valid x-client-transaction-id per request (method + path). */
  private async makeTransactionId(
    method: string,
    path: string,
  ): Promise<string> {
    const txn = await this.ensureClientTxn();
    return txn.generateTransactionId(method.toUpperCase(), path);
  }

  private async buildOnboardingHeaders(
    token: string,
    method: string,
    path: string,
  ): Promise<Headers> {
    const headers = new Headers({
      authorization: `Bearer ${this.bearerToken}`,
      cookie: await this.getCookieString(),
      'content-type': 'application/json',
      accept: '*/*',
      'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
      // Use a realistic desktop UA (closer to captured traffic)
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      origin: 'https://x.com',
      referer: 'https://x.com/',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'x-guest-token': token,
      'x-twitter-auth-type': 'OAuth2Client',
      'x-twitter-active-user': 'yes',
      'x-twitter-client-language': 'en-GB',
      // CRITICAL: valid per-request transaction id from Lqm1 lib
      'x-client-transaction-id': await this.makeTransactionId(method, path),
    });

    console.log(headers);

    const xpff = this.getXpffHeader();
    if (xpff) headers.set('x-xp-forwarded-for', xpff);

    await this.installCsrfToken(headers);
    return headers;
  }

  // --------- /NEW helpers ---------

  private async executeFlowTask(
    data: TwitterUserAuthFlowRequest,
  ): Promise<FlowTokenResult> {
    let onboardingTaskUrl = 'https://api.x.com/1.1/onboarding/task.json';
    if ('flow_name' in data) {
      onboardingTaskUrl = `https://api.x.com/1.1/onboarding/task.json?flow_name=${encodeURIComponent(
        data.flow_name,
      )}`;
    }

    log(`Making POST request to ${onboardingTaskUrl}`);

    const token = this.guestToken;
    if (token == null) {
      throw new AuthenticationError(
        'Authentication token is null or undefined.',
      );
    }

    // Generate headers with a valid transaction id for POST + path
    const { pathname } = new URL(onboardingTaskUrl);
    const headers = await this.buildOnboardingHeaders(token, 'POST', pathname);

    let res: Response;
    let attempts = 0;

    do {
      attempts += 1;

      const fetchParameters: FetchParameters = [
        onboardingTaskUrl,
        {
          // NOTE: run server-side; avoid public CORS proxies
          method: 'POST',
          headers,
          body: JSON.stringify(data),
        },
      ];

      try {
        res = await this.fetch(...fetchParameters);
      } catch (err) {
        if (!(err instanceof Error)) {
          throw err;
        }
        return { status: 'error', err };
      }

      await updateCookieJar(this.jar, res.headers);

      if (res.status === 429) {
        log('Rate limit hit, waiting before retrying...');
        await this.onRateLimit({ fetchParameters, response: res });
        // New transaction id on retry
        headers.set(
          'x-client-transaction-id',
          await this.makeTransactionId('POST', pathname),
        );
        continue;
      }

      // If CF/HTML or 401/403/400, retry once with a fresh transaction id
      if (
        (res.status === 403 || res.status === 401 || res.status === 400) &&
        (await this.isHtmlIntervention(res.clone())) &&
        attempts < 2
      ) {
        log(
          '403/HTML block detected; regenerating x-client-transaction-id and retrying once.',
        );
        headers.set(
          'x-client-transaction-id',
          await this.makeTransactionId('POST', pathname),
        );
        continue;
      }

      break;
    } while (true);

    if (!res.ok) {
      if (await this.isHtmlIntervention(res.clone())) {
        return {
          status: 'error',
          err: new AuthenticationError(
            'Blocked by Cloudflare (HTML challenge). Ensure valid x-client-transaction-id and server-side requests.',
          ),
        };
      }
      return { status: 'error', err: await ApiError.fromResponse(res) };
    }

    // Guard: sometimes 200 with HTML body
    if (await this.isHtmlIntervention(res.clone())) {
      return {
        status: 'error',
        err: new AuthenticationError(
          'Blocked by Cloudflare (HTML challenge). Check headers and environment.',
        ),
      };
    }

    const flow: TwitterUserAuthFlowResponse = await res.json();
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

    return {
      status: 'success',
      response: flow,
    };
  }
}
