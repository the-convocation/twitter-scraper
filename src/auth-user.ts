import { TwitterAuthOptions, TwitterGuestAuth } from './auth';
import { CHROME_SEC_CH_UA, CHROME_USER_AGENT, flexParseJson } from './api';
import { CookieJar } from 'tough-cookie';
import { updateCookieJar } from './requests';
import { Headers } from 'headers-polyfill';
import { TwitterApiErrorRaw, AuthenticationError, ApiError } from './errors';
import { Type, type Static } from '@sinclair/typebox';
import { Check } from '@sinclair/typebox/value';
import * as OTPAuth from 'otpauth';
import { FetchParameters } from './api-types';
import debug from 'debug';

import { generateTransactionId } from './xctxid';
import { generateLocalCastleToken } from './castle';

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
 *
 * The API is passed to each subtask handler and provides methods necessary for implementing
 * custom authentication subtasks. It abstracts away the low-level details of communicating
 * with Twitter's authentication API.
 *
 * @example
 * ```typescript
 * import { Scraper, FlowSubtaskHandler } from "@the-convocation/twitter-scraper";
 *
 * // A custom subtask handler that implements a hypothetical example subtask
 * const exampleHandler: FlowSubtaskHandler = async (subtaskId, response, credentials, api) => {
 *   // Process the example subtask somehow
 *   const data = await processExampleTask();
 *
 *   // Submit the processed data using the provided API
 *   return await api.sendFlowRequest({
 *     flow_token: api.getFlowToken(),
 *     subtask_inputs: [{
 *       subtask_id: subtaskId,
 *       example_data: {
 *         value: data,
 *         link: "next_link"
 *       }
 *     }]
 *   });
 * };
 *
 * const scraper = new Scraper();
 * scraper.registerAuthSubtaskHandler("ExampleSubtask", exampleHandler);
 * ```
 */
export interface FlowSubtaskHandlerApi {
  /**
   * Send a flow request to the Twitter API.
   * @param request The request object containing flow token and subtask inputs
   * @returns The result of the flow task
   */
  sendFlowRequest: (
    request: TwitterUserAuthFlowRequest,
  ) => Promise<FlowTokenResult>;
  /**
   * Gets the current flow token.
   * @returns The current flow token
   */
  getFlowToken: () => string;
}

/**
 * A handler function for processing Twitter authentication flow subtasks.
 * Library consumers can implement and register custom handlers for new or
 * existing subtask types using the Scraper.registerAuthSubtaskHandler method.
 *
 * Each subtask handler is called when its corresponding subtask ID is encountered
 * during the authentication flow. The handler receives the subtask ID, the previous
 * response data, the user's credentials, and an API interface for interacting with
 * the authentication flow.
 *
 * Handlers should process their specific subtask and return either a successful response
 * or an error. Success responses typically lead to the next subtask in the flow, while
 * errors will halt the authentication process.
 *
 * @param subtaskId - The identifier of the subtask being handled
 * @param previousResponse - The complete response from the previous authentication flow step
 * @param credentials - The user's authentication credentials including username, password, etc.
 * @param api - An interface providing methods to interact with the authentication flow
 * @returns A promise resolving to either a successful flow response or an error
 *
 * @example
 * ```typescript
 * import { Scraper, FlowSubtaskHandler } from "@the-convocation/twitter-scraper";
 *
 * // Custom handler for a hypothetical verification subtask
 * const verificationHandler: FlowSubtaskHandler = async (
 *   subtaskId,
 *   response,
 *   credentials,
 *   api
 * ) => {
 *   // Extract the verification data from the response
 *   const verificationData = response.subtasks?.[0].exampleData?.value;
 *   if (!verificationData) {
 *     return {
 *       status: 'error',
 *       err: new Error('No verification data found in response')
 *     };
 *   }
 *
 *   // Process the verification data somehow
 *   const result = await processVerification(verificationData);
 *
 *   // Submit the result using the flow API
 *   return await api.sendFlowRequest({
 *     flow_token: api.getFlowToken(),
 *     subtask_inputs: [{
 *       subtask_id: subtaskId,
 *       example_verification: {
 *         value: result,
 *         link: "next_link"
 *       }
 *     }]
 *   });
 * };
 *
 * const scraper = new Scraper();
 * scraper.registerAuthSubtaskHandler("ExampleVerificationSubtask", verificationHandler);
 *
 * // Later, when logging in...
 * await scraper.login("username", "password");
 * ```
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

  constructor(bearerToken: string, options?: Partial<TwitterAuthOptions>) {
    super(bearerToken, options);
    this.initializeDefaultHandlers();
  }

  /**
   * Register a custom subtask handler or override an existing one
   * @param subtaskId The ID of the subtask to handle
   * @param handler The handler function that processes the subtask
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
    const cookies = await this.getCookies();
    // Both ct0 (CSRF token) and auth_token (session token) are required for authenticated requests.
    // ct0 alone is NOT sufficient - without auth_token, Twitter returns 401 on all API calls.
    return (
      cookies.some((c) => c.key === 'ct0') &&
      cookies.some((c) => c.key === 'auth_token')
    );
  }

  async login(
    username: string,
    password: string,
    email?: string,
    twoFactorSecret?: string,
  ): Promise<void> {
    // Pre-flight: visit x.com to establish Cloudflare cookies and session context.
    // A real browser visits the page before starting the login API flow, and skipping
    // this step can trigger Twitter's anti-bot detection (error 399).
    // The preflight also extracts the guest token from the page HTML (via inline <script>
    // that sets the `gt` cookie), matching real browser behavior where no separate
    // guest/activate.json call is made.
    await this.preflight();

    // Only call guest/activate.json if preflight didn't set the guest token.
    // Real browsers get the guest token from inline JS in the login page HTML,
    // not from a separate API call.
    if (!this.guestToken) {
      await this.updateGuestToken();
    }

    // IMPORTANT: Do NOT generate ct0 or send x-csrf-token during login.
    // Real browsers do NOT have a ct0 cookie during the unauthenticated login flow.
    // Sending x-csrf-token when the server doesn't expect it triggers bot detection (error 399).

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

      // Add a human-like delay between flow steps.
      // Real browsers take 1-3 seconds between steps (page render, user reading, typing).
      // Without this delay, Twitter flags the rapid-fire request pattern as bot activity (error 399).
      const configuredDelay = this.options?.experimental?.flowStepDelay;
      const delay =
        configuredDelay !== undefined
          ? configuredDelay
          : 1000 + Math.floor(Math.random() * 2000); // default: 1-3 seconds
      if (delay > 0) {
        log(`Waiting ${delay}ms before handling subtask: ${subtaskId}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

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

  /**
   * Pre-flight request to establish Cloudflare cookies and session context.
   * Mimics a real browser visiting x.com before starting the login API flow.
   */
  private async preflight(): Promise<void> {
    try {
      const headers = new Headers({
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'accept-language': 'en-US,en;q=0.9',
        'sec-ch-ua': CHROME_SEC_CH_UA,
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        'user-agent': CHROME_USER_AGENT,
      });

      log('Pre-flight: fetching https://x.com/i/flow/login');
      const res = await this.fetch('https://x.com/i/flow/login', {
        redirect: 'follow',
        headers: headers,
      });

      await updateCookieJar(this.jar, res.headers);
      log(`Pre-flight response: ${res.status}`);

      // Extract guest token from the HTML page.
      // Real browsers get the guest token from inline <script> tags that set
      // document.cookie="gt=<token>; ..." rather than calling guest/activate.json.
      try {
        const html = await res.text();
        const gtMatch = html.match(/document\.cookie="gt=(\d+)/);
        if (gtMatch) {
          this.guestToken = gtMatch[1];
          this.guestCreatedAt = new Date();
          // Also set the gt cookie in our jar (as the browser would)
          await this.setCookie('gt', gtMatch[1]);
          log(`Extracted guest token from HTML (length: ${gtMatch[1].length})`);
        }
      } catch (err) {
        log('Failed to extract guest token from HTML (non-fatal):', err);
      }
    } catch (err) {
      log('Pre-flight request failed (non-fatal):', err);
    }
  }

  async logout(): Promise<void> {
    if (!this.hasToken()) {
      return;
    }

    try {
      const logoutUrl = 'https://api.x.com/1.1/account/logout.json';
      const headers = new Headers();
      await this.installTo(headers, logoutUrl);

      await this.fetch(logoutUrl, {
        method: 'POST',
        headers,
      });
    } catch (error) {
      // Ignore errors during logout but still clean up state
      log('Error during logout:', error);
    } finally {
      this.deleteToken();
      this.jar = new CookieJar();
    }
  }

  async installTo(
    headers: Headers,
    url: string,
    bearerTokenOverride?: string,
  ): Promise<void> {
    // Reuse all shared browser + auth headers from the guest auth base class
    await super.installTo(headers, url, bearerTokenOverride);

    // CRITICAL: Tell Twitter this is an authenticated user session (not guest)
    headers.set('x-twitter-auth-type', 'OAuth2Session');
    headers.set('x-twitter-active-user', 'yes');
    headers.set('x-twitter-client-language', 'en');

    // Note: Transaction ID generation is NOT done here. It is handled by
    // requestApi() (api.ts) which knows the actual HTTP method (GET vs POST).
    // Generating it here would use the wrong method and be immediately
    // overwritten by requestApi anyway.
  }

  private async initLogin(): Promise<FlowTokenResult> {
    // Reset stale session cookies from previous logins.
    // We preserve __cf_bm (Cloudflare cookie from preflight) and gt (guest token).
    // ct0 should NOT exist during login - real browsers don't have it until authenticated.
    await this.removeCookie('twitter_ads_id');
    await this.removeCookie('ads_prefs');
    await this.removeCookie('_twitter_sess');
    await this.removeCookie('zipbox_forms_auth_token');
    await this.removeCookie('lang');
    await this.removeCookie('bouncer_reset_cookie');
    await this.removeCookie('twid');
    await this.removeCookie('twitter_ads_idb');
    await this.removeCookie('email_uid');
    await this.removeCookie('external_referer');
    await this.removeCookie('aa_u');

    return await this.executeFlowTask({
      flow_name: 'login',
      input_flow_data: {
        flow_context: {
          debug_overrides: {},
          start_location: {
            location: 'manual_link',
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
    prev: TwitterUserAuthFlowResponse,
    _credentials: TwitterUserAuthCredentials,
    api: FlowSubtaskHandlerApi,
  ): Promise<FlowTokenResult> {
    // Extract the JS instrumentation URL from the subtask response.
    // The script at this URL collects browser metrics (fingerprinting) that Twitter
    // validates. Sending "{}" (empty) triggers bot detection (error 399).
    const subtasks = prev.subtasks as {
      subtask_id: string;
      js_instrumentation?: { url: string };
    }[];
    const jsSubtask = subtasks?.find((s) => s.subtask_id === subtaskId);
    const jsUrl: string | undefined = jsSubtask?.js_instrumentation?.url;

    let metricsResponse = '{}';
    if (jsUrl) {
      try {
        metricsResponse = await this.executeJsInstrumentation(jsUrl);
        log(
          `JS instrumentation executed successfully, response length: ${metricsResponse.length}`,
        );
      } catch (err) {
        log('Failed to execute JS instrumentation (falling back to {})', err);
      }
    }

    return await api.sendFlowRequest({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          js_instrumentation: {
            response: metricsResponse,
            link: 'next_link',
          },
        },
      ],
    });
  }

  /**
   * Maximum allowed size (in bytes) for the JS instrumentation script.
   * Twitter's scripts are typically ~50-100KB. Anything significantly larger
   * may indicate tampering or an unexpected response.
   */
  private static readonly JS_INSTRUMENTATION_MAX_SIZE = 512 * 1024; // 512KB

  /**
   * Fetches and executes the JS instrumentation script to generate browser
   * fingerprinting data. The result is written to an input element named
   * 'ui_metrics'.
   *
   * In browser environments, uses a hidden iframe with native DOM APIs.
   * In Node.js, uses linkedom (for DOM) and the vm module for execution.
   *
   * @security This method executes **remote JavaScript** fetched from Twitter's servers.
   * - In browsers, execution is isolated in a disposable iframe.
   * - In Node.js, `vm.runInContext` is used for convenience, NOT for security.
   *   Node's `vm` module provides NO security sandbox — a malicious script can
   *   trivially escape the context (e.g., via `this.constructor.constructor('return process')()`).
   *   The only real trust boundary is that scripts are fetched from Twitter's known CDN URLs.
   *   Setting `process: undefined` etc. in the sandbox context is cosmetic and does not
   *   prevent escape.
   * - A maximum script size limit (512KB) and a 5-second timeout provide basic sanity checks.
   */
  private async executeJsInstrumentation(url: string): Promise<string> {
    log(`Fetching JS instrumentation from: ${url}`);
    const response = await this.fetch(url);
    const scriptContent = await response.text();
    log(`JS instrumentation script fetched, length: ${scriptContent.length}`);

    if (scriptContent.length > TwitterUserAuth.JS_INSTRUMENTATION_MAX_SIZE) {
      log(
        `WARNING: JS instrumentation script exceeds size limit (${scriptContent.length} > ${TwitterUserAuth.JS_INSTRUMENTATION_MAX_SIZE}), skipping execution`,
      );
      return '{}';
    }

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      return this.executeJsInstrumentationBrowser(scriptContent);
    }
    return this.executeJsInstrumentationNode(scriptContent);
  }

  /**
   * Execute JS instrumentation in a browser environment using a hidden iframe.
   * The iframe provides natural isolation — the script gets its own document
   * and window, and we can override setTimeout without affecting the host page.
   */
  private async executeJsInstrumentationBrowser(
    scriptContent: string,
  ): Promise<string> {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    try {
      const iframeWin = iframe.contentWindow;
      const iframeDoc = iframe.contentDocument;
      if (!iframeWin || !iframeDoc) {
        log('WARNING: Could not access iframe document/window');
        return '{}';
      }

      // Add the ui_metrics input element that the script writes its result to
      const input = iframeDoc.createElement('input');
      input.name = 'ui_metrics';
      input.type = 'hidden';
      iframeDoc.body.appendChild(input);

      // Override setTimeout to be synchronous — we need the result immediately
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (iframeWin as any).setTimeout = (fn: any) => fn();

      // Execute the script in the iframe context via <script> tag injection
      const script = iframeDoc.createElement('script');
      script.textContent = scriptContent;
      iframeDoc.body.appendChild(script);

      const value = input.value;
      if (value) {
        log(`JS instrumentation result extracted, length: ${value.length}`);
        return value;
      }

      log('WARNING: No ui_metrics value found after script execution');
      return '{}';
    } finally {
      document.body.removeChild(iframe);
    }
  }

  /**
   * Execute JS instrumentation in Node.js using linkedom for DOM emulation
   * and the vm module for sandboxed script execution.
   *
   * @security Node's `vm` module does NOT provide a security sandbox. A
   * malicious script can trivially escape the context. The only real trust
   * boundary is that scripts come from Twitter's CDN. The undefined globals
   * (process, require, etc.) are cosmetic — they do not prevent sandbox escape.
   */
  private async executeJsInstrumentationNode(
    scriptContent: string,
  ): Promise<string> {
    // Use linkedom to create a DOM environment with the required elements.
    // The script needs: document.createElement, getElementsByName, getElementsByTagName,
    // appendChild, removeChild, parentNode, children, innerText, lastElementChild, etc.
    // We use parseHTML (not DOMParser) for a more complete window/document implementation.
    const { parseHTML } = await import('linkedom');
    const { document: doc, window: win } = parseHTML(
      '<html><head></head><body><input name="ui_metrics" type="hidden" value="" /></body></html>',
    );

    // Polyfill getElementsByName if linkedom doesn't implement it.
    if (typeof doc.getElementsByName !== 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).getElementsByName = (name: string) =>
        doc.querySelectorAll(`[name="${name}"]`);
    }

    // Execute the script in a sandboxed VM context.
    // The script expects `document` and `window` as globals and uses `setTimeout`
    // to schedule execution. We make setTimeout synchronous since we need the result
    // immediately. The script checks document.readyState to decide between setTimeout
    // and addEventListener('load'/'DOMContentLoaded').
    const vm = await import('vm');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const origSetTimeout = (win as any).setTimeout;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (win as any).setTimeout = (fn: any) => fn();

    try {
      Object.defineProperty(doc, 'readyState', {
        value: 'complete',
        writable: true,
        configurable: true,
      });
    } catch {
      // If readyState can't be set, the script will use event listeners
    }

    const sandbox = {
      document: doc,
      window: win,
      Date: Date,
      JSON: JSON,
      parseInt: parseInt,
      // Deny access to Node.js internals to limit sandbox escape surface
      process: undefined,
      require: undefined,
      global: undefined,
      globalThis: undefined,
    };
    vm.runInNewContext(scriptContent, sandbox, { timeout: 5000 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (win as any).setTimeout = origSetTimeout;

    // Extract the result from the ui_metrics input element
    const inputs = doc.getElementsByName('ui_metrics');
    if (inputs && inputs.length > 0) {
      const value =
        (inputs[0] as HTMLInputElement).value ||
        inputs[0].getAttribute('value');
      if (value) {
        log(`JS instrumentation result extracted, length: ${value.length}`);
        return value;
      }
    }

    log('WARNING: No ui_metrics value found after script execution');
    return '{}';
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
    // Generate a Castle.io device fingerprint token.
    // Twitter requires this token with the username submission step (settings_list).
    // Without it, Twitter returns error 399 ("suspicious activity").
    let castleToken: string | undefined;
    try {
      castleToken = await this.generateCastleToken();
      log(`Castle token generated, length: ${castleToken.length}`);
    } catch (err) {
      log('Failed to generate castle token (continuing without it):', err);
    }

    const settingsList: {
      setting_responses: {
        key: string;
        response_data: { text_data: { result: string } };
      }[];
      link: string;
      castle_token?: string;
    } = {
      setting_responses: [
        {
          key: 'user_identifier',
          response_data: {
            text_data: { result: credentials.username },
          },
        },
      ],
      link: 'next_link',
    };

    if (castleToken) {
      settingsList.castle_token = castleToken;
    }

    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          settings_list: settingsList,
        },
      ],
    });
  }

  /**
   * Generates a Castle.io device fingerprint token for the login flow.
   * Uses local token generation (Castle.io v11 format) to avoid external
   * API dependencies and rate limits.
   */
  private async generateCastleToken(): Promise<string> {
    const userAgent = CHROME_USER_AGENT;

    const browserProfile = this.options?.experimental?.browserProfile;
    const { token, cuid } = generateLocalCastleToken(userAgent, browserProfile);

    // Set the __cuid cookie (Castle.io uses this for tracking)
    await this.setCookie('__cuid', cuid);

    log(
      `Castle token generated locally, length: ${
        token.length
      }, cuid: ${cuid.substring(0, 6)}...`,
    );

    return token;
  }

  private async handleEnterPassword(
    subtaskId: string,
    _prev: TwitterUserAuthFlowResponse,
    credentials: TwitterUserAuthCredentials,
    api: FlowSubtaskHandlerApi,
  ): Promise<FlowTokenResult> {
    // Generate a fresh castle token for the password step too.
    let castleToken: string | undefined;
    try {
      castleToken = await this.generateCastleToken();
      log(`Castle token for password step, length: ${castleToken.length}`);
    } catch (err) {
      log(
        'Failed to generate castle token for password (continuing without):',
        err,
      );
    }

    const enterPassword: {
      password: string;
      link: string;
      castle_token?: string;
    } = {
      password: credentials.password,
      link: 'next_link',
    };

    if (castleToken) {
      enterPassword.castle_token = castleToken;
    }

    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          enter_password: enterPassword,
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
    let lastResult!: FlowTokenResult;
    for (let attempts = 1; attempts < 4; attempts += 1) {
      const result = await api.sendFlowRequest({
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

      if (result.status === 'success') {
        return result;
      }

      lastResult = result;
      log(`2FA attempt ${attempts} failed: ${result.err.message}`);
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempts));
    }
    return lastResult;
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
          enter_text: {
            text: credentials.email,
            link: 'next_link',
          },
        },
      ],
    });
  }

  private async handleSuccessSubtask(): Promise<FlowTokenResult> {
    // Login completed successfully, nothing more to do
    log('Successfully logged in with user credentials.');
    return {
      status: 'success',
      response: {},
    };
  }

  private async executeFlowTask(
    data: TwitterUserAuthFlowRequest,
  ): Promise<FlowTokenResult> {
    let onboardingTaskUrl = 'https://api.x.com/1.1/onboarding/task.json';
    if ('flow_name' in data) {
      onboardingTaskUrl = `https://api.x.com/1.1/onboarding/task.json?flow_name=${data.flow_name}`;
    }

    log(`Making POST request to ${onboardingTaskUrl}`);
    log(
      'Request data:',
      JSON.stringify(
        data,
        (key, value) => (key === 'password' ? '[REDACTED]' : value),
        2,
      ),
    );
    // Match exact headers observed from real Chrome browser during login flow.
    // Notable absences vs authenticated requests: no cache-control, no pragma,
    // no x-csrf-token, no x-twitter-auth-type, no x-xp-forwarded-for.
    // We use installAuthCredentials() (not installTo()) to get only the auth
    // essentials (bearer token, guest token, cookies) without browser headers
    // that would need to be deleted afterwards.
    const headers = new Headers({
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/json',
      origin: 'https://x.com',
      priority: 'u=1, i',
      referer: 'https://x.com/',
      'sec-ch-ua': CHROME_SEC_CH_UA,
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'user-agent': CHROME_USER_AGENT,
      'x-twitter-active-user': 'yes',
      'x-twitter-client-language': 'en',
    });
    await this.installAuthCredentials(headers);

    // Generate x-client-transaction-id if enabled - real browsers send this during login.
    if (this.options?.experimental?.xClientTransactionId) {
      const transactionId = await generateTransactionId(
        onboardingTaskUrl,
        this.fetch.bind(this),
        'POST',
      );
      headers.set('x-client-transaction-id', transactionId);
    }

    // Strip flow_name from the body: real browsers only send it in the URL query parameter.
    const bodyData: Record<string, unknown> = { ...data };
    if ('flow_name' in bodyData) {
      delete bodyData.flow_name;
    }

    let res: Response;
    do {
      const fetchParameters: FetchParameters = [
        onboardingTaskUrl,
        {
          credentials: 'include',
          method: 'POST',
          headers: headers,
          body: JSON.stringify(bodyData),
        },
      ];

      try {
        res = await this.fetch(...fetchParameters);
      } catch (err) {
        if (!(err instanceof Error)) {
          throw err;
        }

        return {
          status: 'error',
          err: err,
        };
      }

      await updateCookieJar(this.jar, res.headers);

      log(`Response status: ${res.status}`);
      if (res.status === 429) {
        log('Rate limit hit, waiting before retrying...');
        await this.onRateLimit({
          fetchParameters: fetchParameters,
          response: res,
        });
      }
    } while (res.status === 429);

    // Parse the response body once - we need it for both error and success handling.
    // Twitter sometimes returns flow errors (e.g., error 399) with HTTP 400 status,
    // so we must parse the body before checking res.ok.
    let flow: TwitterUserAuthFlowResponse;
    try {
      flow = await flexParseJson(res);
    } catch {
      if (!res.ok) {
        return {
          status: 'error',
          err: new ApiError(res, 'Failed to parse response body'),
        };
      }
      return {
        status: 'error',
        err: new AuthenticationError('Failed to parse flow response.'),
      };
    }
    log(
      'Flow response: status=%s subtasks=%s',
      flow.status,
      flow.subtasks?.map((s) => s.subtask_id).join(', '),
    );

    // Check for flow-level errors (can appear in both 200 and 400 responses)
    if (flow.errors?.length) {
      log('Twitter auth flow errors:', JSON.stringify(flow.errors, null, 2));

      // Special handling for error 399 - suspicious activity detected
      if (flow.errors[0].code === 399) {
        const message = flow.errors[0].message || '';

        // Extract challenge token for logging (format: "g;...:...:...")
        const challengeMatch = message.match(/g;[^:]+:[^:]+:[0-9]+/);
        if (challengeMatch) {
          log('Twitter challenge token detected:', challengeMatch[0]);
        }

        // Provide actionable error message
        return {
          status: 'error',
          err: new AuthenticationError(
            'Twitter blocked this login attempt due to suspicious activity (error 399). ' +
              'This is not an issue with your credentials - Twitter requires additional authentication.\n\n' +
              'Solutions:\n' +
              '1. Use cookie-based authentication (RECOMMENDED): Export cookies from your browser ' +
              'and use scraper.setCookies() - see README for details\n' +
              '2. Enable Two-Factor Authentication (2FA) on your account and provide totp_secret\n' +
              '3. Wait 15 minutes before retrying (Twitter rate limit for suspicious logins)\n' +
              '4. Login via browser first to establish device trust\n\n' +
              `Original error: ${message}`,
          ),
        };
      }

      return {
        status: 'error',
        err: new AuthenticationError(
          `Authentication error (${flow.errors[0].code}): ${flow.errors[0].message}`,
        ),
      };
    }

    // For non-200 responses without recognized flow errors, return generic API error
    if (!res.ok) {
      return { status: 'error', err: new ApiError(res, flow) };
    }

    if (flow?.flow_token == null) {
      return {
        status: 'error',
        err: new AuthenticationError('flow_token not found.'),
      };
    }

    if (typeof flow.flow_token !== 'string') {
      return {
        status: 'error',
        err: new AuthenticationError('flow_token was not a string.'),
      };
    }

    const subtask = flow.subtasks?.length ? flow.subtasks[0] : undefined;
    if (subtask && !Check(TwitterUserAuthSubtask, subtask as unknown)) {
      log(
        'WARNING: Subtask failed schema validation: %s',
        subtask.subtask_id ?? 'unknown',
      );
    }

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
