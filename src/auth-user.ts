import { gotScraping } from 'got-scraping';
import { TwitterGuestAuth } from './auth';
import { requestApi } from './api';

interface TwitterUserAuthFlow {
  errors: {
    code: number;
    message: string;
  }[];
  flow_token: string;
  status: string;
}

interface TwitterUserAuthVerifyCredentials {
  errors: {
    code: number;
    message: string;
  }[];
}

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
      throw res.err;
    }

    const { value: verify } = res;
    return verify && verify.errors.length === 0;
  }

  /**
   * Logs into a Twitter account.
   * @param username The username to log in with.
   * @param password The password to log in with.
   */
  async login(username: string, password: string): Promise<void> {
    await this.updateGuestToken();

    await this.fetchFlowToken({
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
        this.fetchFlowToken({
          flow_token: ft,
          subtask_inputs: {
            subtask_id: 'LoginJsInstrumentationSubtask',
            js_instrumentation: {
              response: '{}',
              link: 'next_link',
            },
          },
        }),
      )
      .then((ft) =>
        this.fetchFlowToken({
          flow_token: ft,
          subtask_inputs: {
            subtask_id: 'LoginEnterUserIdentifierSSO',
            settings_list: {
              setting_responses: {
                key: 'user_identifier',
                response_data: {
                  text_data: {},
                  result: username,
                },
              },
              link: 'next_link',
            },
          },
        }),
      )
      .then((ft) =>
        this.fetchFlowToken({
          flow_token: ft,
          subtask_inputs: {
            subtask_id: 'LoginEnterPassword',
            enter_password: {
              password,
              link: 'next_link',
            },
          },
        }),
      )
      .then((ft) =>
        this.fetchFlowToken({
          flow_token: ft,
          subtask_inputs: {
            subtask_id: 'AccountDuplicationCheck',
            check_logged_in_account: {
              link: 'AccountDuplicationCheck_false',
            },
          },
        }),
      );
  }

  private async fetchFlowToken(data: Record<string, unknown>): Promise<string> {
    const token = this.guestToken;
    if (token == null) {
      throw new Error('Authentication token is null or undefined.');
    }

    const res = await gotScraping.post({
      url: 'https://api.twitter.com/1.1/onboarding/task.json',
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 11; Nokia G20) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.88 Mobile Safari/537.36',
        'X-Guest-Token': token,
        'X-Twitter-Auth-Type': 'OAuth2Client',
        'X-Twitter-Active-User': 'yes',
        'X-Twitter-Client-Language': 'en',
      },
      cookieJar: this.jar,
      json: data,
    });

    if (res.statusCode != 200) {
      throw new Error(res.body);
    }

    const flow: TwitterUserAuthFlow = JSON.parse(res.body);
    if (flow == null) {
      throw new Error('flow_token not found.');
    }

    if (flow.errors.length > 0) {
      throw new Error(
        `Authentication error (${flow.errors[0].code}): ${flow.errors[0].message}`,
      );
    }

    const newUserToken = flow.flow_token;
    if (typeof newUserToken !== 'string') {
      throw new Error('flow_token was not a string.');
    }

    return newUserToken;
  }
}
