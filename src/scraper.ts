import { bearerToken, getGuestToken, requestApi } from './api';

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
  bearerToken: string;
  delay?: number;
  guestToken?: string;
  guestCreatedAt?: Date;
  includeReplies?: boolean;
  searchMode?: SearchMode;
  cookie?: string;
  xCsrfToken?: string;

  constructor() {
    this.bearerToken = bearerToken;
  }

  public async requestApi<T>(url: string): Promise<T> {
    if (this.shouldUpdateGuest()) {
      await this.getGuestToken();
    }

    const res = await requestApi<T>(
      url,
      this.bearerToken,
      this.guestToken || '',
      this.cookie || '',
      this.xCsrfToken || '',
    );
    if (!res.success) {
      throw res.err;
    }

    if (res.deleteGuest) {
      this.guestToken = undefined;
    }

    return res.value;
  }

  public async getGuestToken() {
    const res = await getGuestToken(this.bearerToken);
    if (!res.success) {
      throw res.err;
    }

    this.guestToken = res.token;
    this.guestCreatedAt = res.createdAt;
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

  private setBearerToken(token: string) {
    this.bearerToken = token;
    this.guestToken = undefined;
  }
}
