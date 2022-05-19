import { bearerToken, RequestApiResult } from './api';
import { TwitterGuestAuth } from './auth';
import { getProfile, getUserIdByScreenName, Profile } from './profile';

export function add(a: number, b: number): number {
  return a + b;
}

export class Scraper {
  private auth: TwitterGuestAuth;

  constructor() {
    this.auth = new TwitterGuestAuth(bearerToken);
  }

  public async getProfile(username: string): Promise<Profile> {
    const res = await getProfile(username, this.auth);
    return this.handleResponse(res);
  }

  public async getUserIdByScreenName(screenName: string): Promise<string> {
    const res = await getUserIdByScreenName(screenName, this.auth);
    return this.handleResponse(res);
  }

  public hasGuestToken(): boolean {
    return this.auth.hasToken();
  }

  public withCookie(cookie: string): Scraper {
    this.auth.useCookie(cookie);
    return this;
  }

  public withXCsrfToken(token: string): Scraper {
    this.auth.useCsrfToken(token);
    return this;
  }

  private handleResponse<T>(res: RequestApiResult<T>): T {
    if (!res.success) {
      throw res.err;
    }

    return res.value;
  }
}
