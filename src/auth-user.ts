import { TwitterAuthOptions, TwitterGuestAuth } from './auth';
import { requestApi } from './api';
import { CookieJar } from 'tough-cookie';
import { updateCookieJar } from './requests';
import { Headers } from 'headers-polyfill';
import { TwitterApiErrorRaw } from './errors';

interface TwitterUserAuthFlowInitRequest {
  flow_name: string;
  input_flow_data: Record<string, unknown>;
}

interface TwitterUserAuthFlowSubtaskRequest {
  flow_token: string;
  subtask_inputs: ({
    subtask_id: string;
  } & Record<string, unknown>)[];
}

type TwitterUserAuthFlowRequest =
  | TwitterUserAuthFlowInitRequest
  | TwitterUserAuthFlowSubtaskRequest;

interface TwitterUserAuthFlowResponse {
  errors?: TwitterApiErrorRaw[];
  flow_token?: string;
  status?: string;
  subtasks?: {
    subtask_id?: string;
  }[];
}

interface TwitterUserAuthVerifyCredentials {
  errors?: TwitterApiErrorRaw[];
}

type FlowTokenResult =
  | { status: 'success'; flowToken: string }
  | { status: 'acid'; flowToken: string }
  | { status: 'error'; err: Error };

/**
 * A user authentication token manager.
 */
export class TwitterUserAuth extends TwitterGuestAuth {
  constructor(bearerToken: string, options?: Partial<TwitterAuthOptions>) {
    super(bearerToken, options);
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
  ): Promise<void> {
    await this.updateGuestToken();

    // Executes the potential acid step in the login flow
    const executeFlowAcid = (ft: string) =>
      this.executeFlowTask({
        flow_token: ft,
        subtask_inputs: [
          {
            subtask_id: 'LoginAcid',
            enter_text: {
              text: email,
              link: 'next_link',
            },
          },
        ],
      });

    // Handles the result of a flow task
    const handleFlowTokenResult = async (
      p: Promise<FlowTokenResult>,
    ): Promise<string> => {
      const result = await p;
      const { status } = result;
      if (status === 'error') {
        throw result.err;
      } else if (status === 'acid') {
        return await handleFlowTokenResult(executeFlowAcid(result.flowToken));
      } else {
        return result.flowToken;
      }
    };

    // Executes a flow subtask and handles the result
    const executeFlowSubtask = (data: TwitterUserAuthFlowRequest) =>
      handleFlowTokenResult(this.executeFlowTask(data));

    await executeFlowSubtask({
      flow_name: 'login',
      input_flow_data: {
        flow_context: {
          debug_overrides: {},
          start_location: {
            location: 'splash_screen',
          },
        },
      },
    })
      .then((ft) =>
        executeFlowSubtask({
          flow_token: ft,
          subtask_inputs: [
            {
              subtask_id: 'LoginJsInstrumentationSubtask',
              js_instrumentation: {
                response: '{}',
                link: 'next_link',
              },
            },
          ],
        }),
      )
      .then((ft) =>
        executeFlowSubtask({
          flow_token: ft,
          subtask_inputs: [
            {
              subtask_id: 'LoginEnterUserIdentifierSSO',
              settings_list: {
                setting_responses: [
                  {
                    key: 'user_identifier',
                    response_data: {
                      text_data: { result: username },
                    },
                  },
                ],
                link: 'next_link',
              },
            },
          ],
        }),
      )
      .then((ft) =>
        executeFlowSubtask({
          flow_token: ft,
          subtask_inputs: [
            {
              subtask_id: 'LoginEnterPassword',
              enter_password: {
                password,
                link: 'next_link',
              },
            },
          ],
        }),
      )
      .then((ft) =>
        executeFlowSubtask({
          flow_token: ft,
          subtask_inputs: [
            {
              subtask_id: 'AccountDuplicationCheck',
              check_logged_in_account: {
                link: 'AccountDuplicationCheck_false',
              },
            },
          ],
        }),
      );
  }

  async logout(): Promise<void> {
    if (!this.isLoggedIn()) {
      return;
    }

    await requestApi<void>(
      'https://api.twitter.com/1.1/account/logout.json',
      this,
      'POST',
    );
    this.deleteToken();
    this.jar = new CookieJar();
  }

  async installTo(headers: Headers, url: string): Promise<void> {
    headers.set('authorization', `Bearer ${this.bearerToken}`);
    headers.set('cookie', await this.jar.getCookieString(url));

    const cookies = await this.jar.getCookies(url);
    const xCsrfToken = cookies.find((cookie) => cookie.key === 'ct0');
    if (xCsrfToken) {
      headers.set('x-csrf-token', xCsrfToken.value);
    }
  }

  private async executeFlowTask(
    data: TwitterUserAuthFlowRequest,
  ): Promise<FlowTokenResult> {
    const onboardingTaskUrl =
      'https://api.twitter.com/1.1/onboarding/task.json';

    const token = this.guestToken;
    if (token == null) {
      throw new Error('Authentication token is null or undefined.');
    }

    const headers = new Headers({
      authorization: `Bearer ${this.bearerToken}`,
      cookie: await this.jar.getCookieString(onboardingTaskUrl),
      'content-type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 11; Nokia G20) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.88 Mobile Safari/537.36',
      'x-guest-token': token,
      'x-twitter-auth-type': 'OAuth2Client',
      'x-twitter-active-user': 'yes',
      'x-twitter-client-language': 'en',
    });

    const res = await this.fetch(onboardingTaskUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data),
    });

    await updateCookieJar(this.jar, res.headers);

    if (!res.ok) {
      return { status: 'error', err: new Error(await res.text()) };
    }

    const flow: TwitterUserAuthFlowResponse = await res.json();
    if (flow?.flow_token == null) {
      return { status: 'error', err: new Error('flow_token not found.') };
    }

    if (flow.errors?.length) {
      return {
        status: 'error',
        err: new Error(
          `Authentication error (${flow.errors[0].code}): ${flow.errors[0].message}`,
        ),
      };
    }

    if (typeof flow.flow_token !== 'string') {
      return {
        status: 'error',
        err: new Error('flow_token was not a string.'),
      };
    }

    if (flow.subtasks?.length) {
      if (
        flow.subtasks[0].subtask_id === 'LoginEnterAlternateIdentifierSubtask'
      ) {
        return {
          status: 'error',
          err: new Error(
            'Authentication error: LoginEnterAlternateIdentifierSubtask',
          ),
        };
      } else if (flow.subtasks[0].subtask_id === 'LoginAcid') {
        return {
          status: 'acid',
          flowToken: flow.flow_token,
        };
      } else if (
        flow.subtasks[0].subtask_id === 'LoginTwoFactorAuthChallenge'
      ) {
        return {
          status: 'error',
          err: new Error('Authentication error: LoginTwoFactorAuthChallenge'),
        };
      } else if (flow.subtasks[0].subtask_id === 'DenyLoginSubtask') {
        return {
          status: 'error',
          err: new Error('Authentication error: DenyLoginSubtask'),
        };
      }
    }

    return {
      status: 'success',
      flowToken: flow.flow_token,
    };
  }
}
