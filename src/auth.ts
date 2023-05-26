import { gotScraping } from 'got-scraping';
import { CookieJar } from 'tough-cookie';

export interface TwitterAuth {
  /**
   * Returns the current cookie jar.
   */
  cookieJar(): CookieJar;

  /**
   * Deletes the current guest token token.
   */
  deleteToken(): void;

  /**
   * Returns if the authentication state has a token.
   * @returns `true` if the authentication state has a token; `false` otherwise.
   */
  hasToken(): boolean;

  /**
   * Returns the time that authentication was performed.
   * @returns The time at which the authentication token was created, or `null` if it hasn't been created yet.
   */
  authenticatedAt(): Date | null;

  /**
   * Installs the authentication information into a headers-like object. If needed, the
   * authentication token will be updated from the API automatically.
   * @param headers A key-value object representing a request's headers.
   * @returns A Promise for the operation.
   */
  installTo(headers: { [key: string]: unknown }, url: string): Promise<void>;
}

/**
 * A guest authentication token manager. Automatically handles token refreshes.
 */
export class TwitterGuestAuth implements TwitterAuth {
  protected bearerToken: string;
  protected jar: CookieJar;
  protected guestToken?: string;
  protected guestCreatedAt?: Date;

  constructor(bearerToken: string) {
    this.bearerToken = bearerToken;
    this.jar = new CookieJar();
  }

  cookieJar(): CookieJar {
    return this.jar;
  }

  deleteToken() {
    delete this.guestToken;
    delete this.guestCreatedAt;
  }

  hasToken(): boolean {
    return this.guestToken != null;
  }

  authenticatedAt(): Date | null {
    if (this.guestCreatedAt == null) {
      return null;
    }

    return new Date(this.guestCreatedAt);
  }

  async installTo(
    headers: { [key: string]: unknown },
    url: string,
  ): Promise<void> {
    if (this.shouldUpdate()) {
      await this.updateGuestToken();
    }

    const token = this.guestToken;
    if (token == null) {
      throw new Error('Authentication token is null or undefined.');
    }

    headers['Authorization'] = `Bearer ${this.bearerToken}`;
    headers['X-Guest-Token'] = token;

    const cookies = await this.jar.getCookies(url);
    const xCsrfToken = cookies.find((cookie) => cookie.key === 'ct0');
    if (xCsrfToken) {
      headers['X-CSRF-Token'] = xCsrfToken.value;
    }
  }

  /**
   * Updates the authentication state with a new guest token from the Twitter API.
   */
  protected async updateGuestToken() {
    const res = await gotScraping.post({
      url: 'https://api.twitter.com/1.1/guest/activate.json',
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
      },
      cookieJar: this.jar,
    });

    if (res.statusCode != 200) {
      throw new Error(res.body);
    }

    const o = JSON.parse(res.body);
    if (o == null || o['guest_token'] == null) {
      throw new Error('guest_token not found.');
    }

    const newGuestToken = o['guest_token'];
    if (typeof newGuestToken !== 'string') {
      throw new Error('guest_token was not a string.');
    }

    this.guestToken = newGuestToken;
    this.guestCreatedAt = new Date();
  }

  /**
   * Returns if the authentication token needs to be updated or not.
   * @returns `true` if the token needs to be updated; `false` otherwise.
   */
  private shouldUpdate(): boolean {
    return (
      !this.hasToken() ||
      (this.guestCreatedAt != null &&
        this.guestCreatedAt <
          new Date(new Date().valueOf() - 3 * 60 * 60 * 1000))
    );
  }
}

interface TwitterUserAuthFlow {
  errors: {
    code: number;
    message: string;
  }[];
  flow_token: string;
  status: string;
}

/**
 * A user authentication token manager.
 */
export class TwitterUserAuth extends TwitterGuestAuth {
  private loggedIn: boolean;

  constructor(bearerToken: string) {
    super(bearerToken);
    this.loggedIn = false;
  }

  isLoggedIn(): boolean {
    return this.loggedIn;
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

    this.loggedIn = true;
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
