import { TwitterAuthOptions, TwitterGuestAuth } from './auth';
import { requestApi } from './api';
import { CookieJar } from 'tough-cookie';
import { updateCookieJar } from './requests';
import { Headers } from 'headers-polyfill';
import { TwitterApiErrorRaw, AuthenticationError, ApiError } from './errors';
import { Type, type Static } from '@sinclair/typebox';
import { Check } from '@sinclair/typebox/value';
import * as OTPAuth from 'otpauth';

export interface TwitterUserAuthFlowInitRequest {
  flow_name: string;
  input_flow_data: Record<string, unknown>;
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
    const res = await requestApi<TwitterUserAuthVerifyCredentials>(
      'https://api.twitter.com/1.1/account/verify_credentials.json',
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
        'https://api.twitter.com/1.1/account/logout.json',
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

    return await this.executeFlowTask({
      flow_name: 'login',
      input_flow_data: {
        flow_context: {
          debug_overrides: {},
          start_location: {
            location: 'splash_screen',
          },
        },
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
    let error;
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

  private async executeFlowTask(
    data: TwitterUserAuthFlowRequest,
  ): Promise<FlowTokenResult> {
    const onboardingTaskUrl =
      'https://api.twitter.com/1.1/onboarding/task.json';

    const token = this.guestToken;
    if (token == null) {
      throw new AuthenticationError(
        'Authentication token is null or undefined.',
      );
    }

    const headers = new Headers({
      authorization: `Bearer ${this.bearerToken}`,
      cookie: await this.getCookieString(),
      'content-type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 11; Nokia G20) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.88 Mobile Safari/537.36',
      'x-guest-token': token,
      'x-twitter-auth-type': 'OAuth2Client',
      'x-twitter-active-user': 'yes',
      'x-twitter-client-language': 'en',
    });
    await this.installCsrfToken(headers);

    const res = await this.fetch(onboardingTaskUrl, {
      credentials: 'include',
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data),
    });

    await updateCookieJar(this.jar, res.headers);

    if (!res.ok) {
      return { status: 'error', err: await ApiError.fromResponse(res) };
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
