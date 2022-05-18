import { bearerToken, getGuestToken, RequestApiResult } from './api';
import { getProfile, getUserIdByScreenName, Profile } from './profile';

export function add(a: number, b: number): number {
  return a + b;
}

enum SearchMode {
  Top,
  Latest,
  Photos,
  Videos,
  Users,
}

export class Scraper {
  private delay?: number;
  private guestToken?: string;
  private guestCreatedAt?: Date;
  private includeReplies?: boolean;
  private searchMode?: SearchMode;
  private cookie?: string;
  private xCsrfToken?: string;

  public async getProfile(username: string): Promise<Profile> {
    await this.tryUpdateGuestToken();

    const res = await getProfile(
      username,
      bearerToken,
      this.guestToken || '',
      this.cookie || '',
      this.xCsrfToken || '',
    );

    return this.handleResponse(res);
  }

  public async getUserIdByScreenName(screenName: string): Promise<string> {
    await this.tryUpdateGuestToken();

    const res = await getUserIdByScreenName(
      screenName,
      bearerToken,
      this.guestToken || '',
      this.cookie || '',
      this.xCsrfToken || '',
    );

    return this.handleResponse(res);
  }

  public async tryUpdateGuestToken(): Promise<boolean> {
    if (this.shouldUpdateGuest()) {
      await this.getGuestToken();
    }

    return this.isGuestToken();
  }

  public async getGuestToken() {
    const res = await getGuestToken(bearerToken);
    const { token, createdAt } = this.handleResponse(res);
    this.guestToken = token;
    this.guestCreatedAt = createdAt;
  }

  public shouldUpdateGuest(): boolean {
    return (
      !this.isGuestToken() ||
      (this.guestCreatedAt != null &&
        this.guestCreatedAt <
          new Date(new Date().valueOf() - 3 * 60 * 60 * 1000))
    );
  }

  public isGuestToken(): boolean {
    return this.guestToken != null;
  }

  public setSearchMode(mode: SearchMode): Scraper {
    this.searchMode = mode;
    return this;
  }

  public withDelay(seconds: number): Scraper {
    this.delay = seconds * 1000;
    return this;
  }

  public withReplies(replies: boolean): Scraper {
    this.includeReplies = replies;
    return this;
  }

  public withCookie(cookie: string): Scraper {
    this.cookie = cookie;
    return this;
  }

  public withXCsrfToken(token: string): Scraper {
    this.xCsrfToken = token;
    return this;
  }

  private handleResponse<T>(res: RequestApiResult<T>): T {
    if (res.deleteGuest) {
      delete this.guestToken;
    }

    if (!res.success) {
      throw res.err;
    }

    return res.value;
  }
}
