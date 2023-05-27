import { gotScraping } from 'got-scraping';
import { TwitterGuestAuth } from './auth';
import { requestApi } from './api';
import { CookieJar } from 'tough-cookie';

interface TwitterUserAuthFlow {
  errors?: {
    code?: number;
    message?: string;
  }[];
  flow_token?: string;
  status?: string;
  subtasks?: {
    subtask_id?: string;
  }[];
}

interface TwitterUserAuthVerifyCredentials {
  errors?: {
    code?: number;
    message?: string;
  }[];
}

type FlowTokenResult =
  | { status: 'success'; flowToken: string }
  | { status: 'acid'; flowToken: string }
  | { status: 'error'; err: Error };

/**
 * A user authentication token manager.
 */
export class TwitterUserAuth extends TwitterGuestAuth {
  constructor(bearerToken: string) {
    super(bearerToken);
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
    const executeFlowSubtask = (data: Record<string, unknown>) =>
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
      'post',
    );
    this.deleteToken();
    this.jar = new CookieJar();
  }

  async installTo(
    headers: { [key: string]: unknown },
    url: string,
  ): Promise<void> {
    headers['authorization'] = `Bearer ${this.bearerToken}`;

    const cookies = await this.jar.getCookies(url);
    const xCsrfToken = cookies.find((cookie) => cookie.key === 'ct0');
    if (xCsrfToken) {
      headers['x-csrf-token'] = xCsrfToken.value;
    }
  }

  private async executeFlowTask(
    data: Record<string, unknown>,
  ): Promise<FlowTokenResult> {
    const token = this.guestToken;
    if (token == null) {
      throw new Error('Authentication token is null or undefined.');
    }

    const res = await gotScraping.post({
      url: 'https://api.twitter.com/1.1/onboarding/task.json',
      headers: {
        authorization: `Bearer ${this.bearerToken}`,
        'content-type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 11; Nokia G20) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.88 Mobile Safari/537.36',
        'x-guest-token': token,
        'x-twitter-auth-type': 'OAuth2Client',
        'x-twitter-active-user': 'yes',
        'x-twitter-client-language': 'en',
      },
      cookieJar: this.jar,
      json: data,
    });

    if (res.statusCode != 200) {
      return { status: 'error', err: new Error(res.body) };
    }

    const flow: TwitterUserAuthFlow = JSON.parse(res.body);
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
      }
    }

    return {
      status: 'success',
      flowToken: flow.flow_token,
    };
  }
}
