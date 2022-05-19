import { bearerToken, RequestApiResult } from './api';
import { TwitterGuestAuth } from './auth';
import { getProfile, getUserIdByScreenName, Profile } from './profile';
import { SearchMode, searchProfiles, searchTweets } from './search';
import { getTrends } from './trends';
import { getTweet, getTweets, Tweet } from './tweets';

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

  public searchTweets(
    query: string,
    maxTweets: number,
    includeReplies: boolean,
    searchMode: SearchMode,
  ): AsyncGenerator<Tweet> {
    return searchTweets(
      query,
      maxTweets,
      includeReplies,
      searchMode,
      this.auth,
    );
  }

  public searchProfiles(
    query: string,
    maxProfiles: number,
    includeReplies: boolean,
    searchMode: SearchMode,
  ): AsyncGenerator<Profile> {
    return searchProfiles(
      query,
      maxProfiles,
      includeReplies,
      searchMode,
      this.auth,
    );
  }

  public getTrends(includeReplies: boolean): Promise<string[]> {
    return getTrends(includeReplies, this.auth);
  }

  public getTweets(
    user: string,
    maxTweets: number,
    includeReplies: boolean,
  ): AsyncGenerator<Tweet> {
    return getTweets(user, maxTweets, includeReplies, this.auth);
  }

  public getTweet(id: string, includeReplies: boolean): Promise<Tweet | null> {
    return getTweet(id, includeReplies, this.auth);
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
