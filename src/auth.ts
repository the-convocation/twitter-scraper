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
