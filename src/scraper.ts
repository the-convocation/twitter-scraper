import { Cookie } from 'tough-cookie';
import { bearerToken, bearerToken2, RequestApiResult } from './api';
import { TwitterAuth, TwitterGuestAuth } from './auth';
import { TwitterUserAuth } from './auth-user';
import { getProfile, getUserIdByScreenName, Profile } from './profile';
import {
  fetchSearchProfiles,
  fetchSearchTweets,
  SearchMode,
  searchProfiles,
  searchTweets,
} from './search';
import { QueryProfilesResponse, QueryTweetsResponse } from './timeline';
import { getTrends } from './trends';
import {
  getTweet,
  getTweets,
  getLatestTweet,
  Tweet,
  getTweetsByUserId,
} from './tweets';

const twUrl = 'https://twitter.com';

/**
 * An interface to Twitter's undocumented API.
 * Reusing Scraper objects is recommended to minimize the time spent authenticating unnecessarily.
 */
export class Scraper {
  private auth: TwitterAuth;
  private authTrends: TwitterAuth;

  /**
   * Creates a new Scraper object. Scrapers maintain their own guest tokens for Twitter's internal API.
   * Reusing Scraper objects is recommended to minimize the time spent authenticating unnecessarily.
   */
  constructor() {
    this.auth = new TwitterGuestAuth(bearerToken);
    this.authTrends = new TwitterGuestAuth(bearerToken2);
  }

  /**
   * Fetches a Twitter profile.
   * @param username The Twitter username of the profile to fetch, without an `@` at the beginning.
   * @returns The requested profile.
   */
  public async getProfile(username: string): Promise<Profile> {
    const res = await getProfile(username, this.auth);
    return this.handleResponse(res);
  }

  /**
   * Fetches the user ID corresponding to the provided screen name.
   * @param screenName The Twitter screen name of the profile to fetch.
   * @returns The ID of the corresponding account.
   */
  public async getUserIdByScreenName(screenName: string): Promise<string> {
    const res = await getUserIdByScreenName(screenName, this.auth);
    return this.handleResponse(res);
  }

  /**
   * Fetches tweets from Twitter.
   * @param query The search query. Any Twitter-compatible query format can be used.
   * @param maxTweets The maximum number of tweets to return.
   * @param includeReplies Whether or not replies should be included in the response.
   * @param searchMode The category filter to apply to the search. Defaults to `Top`.
   * @returns An async generator of tweets matching the provided filters.
   */
  public searchTweets(
    query: string,
    maxTweets: number,
    includeReplies: boolean,
    searchMode: SearchMode = SearchMode.Top,
  ): AsyncGenerator<Tweet> {
    return searchTweets(
      query,
      maxTweets,
      includeReplies,
      searchMode,
      this.auth,
    );
  }

  /**
   * Fetches profiles from Twitter.
   * @param query The search query. Any Twitter-compatible query format can be used.
   * @param maxProfiles The maximum number of profiles to return.
   * @returns An async generator of tweets matching the provided filters.
   */
  public searchProfiles(
    query: string,
    maxProfiles: number,
  ): AsyncGenerator<Profile> {
    return searchProfiles(query, maxProfiles, this.auth);
  }

  /**
   * Fetches tweets from Twitter.
   * @param query The search query. Any Twitter-compatible query format can be used.
   * @param maxTweets The maximum number of tweets to return.
   * @param includeReplies Whether or not replies should be included in the response.
   * @param searchMode The category filter to apply to the search. Defaults to `Top`.
   * @param cursor The search cursor, which can be passed into further requests for more results.
   * @returns A page of results, containing a cursor that can be used in further requests.
   */
  public fetchSearchTweets(
    query: string,
    maxTweets: number,
    includeReplies: boolean,
    searchMode: SearchMode,
    cursor?: string,
  ): Promise<QueryTweetsResponse> {
    return fetchSearchTweets(
      query,
      maxTweets,
      includeReplies,
      searchMode,
      this.auth,
      cursor,
    );
  }

  /**
   * Fetches profiles from Twitter.
   * @param query The search query. Any Twitter-compatible query format can be used.
   * @param maxProfiles The maximum number of profiles to return.
   * @param cursor The search cursor, which can be passed into further requests for more results.
   * @returns A page of results, containing a cursor that can be used in further requests.
   */
  public fetchSearchProfiles(
    query: string,
    maxProfiles: number,
    cursor?: string,
  ): Promise<QueryProfilesResponse> {
    return fetchSearchProfiles(query, maxProfiles, this.auth, cursor);
  }

  /**
   * Fetches the current trends from Twitter.
   * @returns The current list of trends.
   */
  public getTrends(): Promise<string[]> {
    return getTrends(this.authTrends);
  }

  /**
   * Fetches tweets from a Twitter user.
   * @param user The user whose tweets should be returned.
   * @param maxTweets The maximum number of tweets to return.
   * @param includeReplies Whether or not to include tweet replies.
   * @returns An async generator of tweets from the provided user.
   */
  public getTweets(
    user: string,
    maxTweets: number,
    includeReplies: boolean,
  ): AsyncGenerator<Tweet> {
    return getTweets(user, maxTweets, includeReplies, this.auth);
  }

  /**
   * Fetches tweets from a Twitter user using their ID.
   * @param userId The user whose tweets should be returned.
   * @param maxTweets The maximum number of tweets to return.
   * @param includeReplies Whether or not to include tweet replies.
   * @returns An async generator of tweets from the provided user.
   */
  public getTweetsByUserId(
    userId: string,
    maxTweets: number,
    includeReplies: boolean,
  ): AsyncGenerator<Tweet> {
    return getTweetsByUserId(userId, maxTweets, includeReplies, this.auth);
  }

  /**
   * Fetches the most recent tweet from a Twitter user.
   * @param user The user whose latest tweet should be returned.
   * @param includeReplies Whether or not to include tweet replies.
   * @param includeRetweets Whether or not to include retweets.
   * @returns The {@link Tweet} object or `null` if it couldn't be fetched.
   */
  public getLatestTweet(
    user: string,
    includeReplies: boolean,
    includeRetweets: boolean,
  ): Promise<Tweet | null> {
    return getLatestTweet(user, includeReplies, includeRetweets, this.auth);
  }

  /**
   * Fetches a single tweet.
   * @param id The ID of the tweet to fetch.
   * @param includeReplies Whether or not to include tweet replies.
   * @returns The request tweet, or `null` if it couldn't be fetched.
   */
  public getTweet(id: string, includeReplies: boolean): Promise<Tweet | null> {
    return getTweet(id, includeReplies, this.auth);
  }

  /**
   * Returns if the scraper has a guest token. The token may not be valid.
   * @returns `true` if the scraper has a guest token; otherwise `false`.
   */
  public hasGuestToken(): boolean {
    return this.auth.hasToken() || this.authTrends.hasToken();
  }

  /**
   * Returns if the scraper is logged in as a real user.
   * @returns `true` if the scraper is logged in with a real user account; otherwise `false`.
   */
  public async isLoggedIn(): Promise<boolean> {
    const authTrends = this.authTrends;
    if (!(authTrends instanceof TwitterUserAuth)) {
      return false;
    }

    return await authTrends.isLoggedIn();
  }

  /**
   * Login to Twitter as a real Twitter account. This enables running
   * searches.
   * @param username The username of the Twitter account to login with.
   * @param password The password of the Twitter account to login with.
   * @param email The password to log in with, if you have email confirmation enabled.
   */
  public async login(
    username: string,
    password: string,
    email?: string,
  ): Promise<void> {
    const authTrends = new TwitterUserAuth(bearerToken2);
    await authTrends.login(username, password, email);
    this.authTrends = authTrends;
  }

  /**
   * Logout of Twitter from a real Twitter account, if possible.
   */
  public async logout(): Promise<void> {
    const authTrends = this.authTrends;
    if (!(authTrends instanceof TwitterUserAuth)) {
      return;
    }

    await authTrends.logout();
  }

  /**
   * Retrieves all cookies for the current session.
   * @returns All cookies for the current session.
   */
  public async getCookies(): Promise<Cookie[]> {
    return await this.authTrends.cookieJar().getCookies(twUrl);
  }

  /**
   * Set cookies for the current session.
   * @param cookies The cookies to set for the current session.
   */
  public async setCookies(cookies: (string | Cookie)[]): Promise<void> {
    for (const cookie of cookies) {
      await this.authTrends.cookieJar().setCookie(cookie, twUrl);
    }
  }

  /**
   * Sets the optional cookie to be used in requests.
   * @param _cookie The cookie to be used in requests.
   * @deprecated This function no longer represents any part of Twitter's auth flow.
   * @returns This scraper instance.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public withCookie(_cookie: string): Scraper {
    console.warn(
      'Warning: Scraper#withCookie is deprecated and will be removed in a later version. Use Scraper#login or Scraper#setCookies instead.',
    );
    return this;
  }

  /**
   * Sets the optional CSRF token to be used in requests.
   * @param _token The CSRF token to be used in requests.
   * @deprecated This function no longer represents any part of Twitter's auth flow.
   * @returns This scraper instance.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public withXCsrfToken(_token: string): Scraper {
    console.warn(
      'Warning: Scraper#withXCsrfToken is deprecated and will be removed in a later version.',
    );
    return this;
  }

  private handleResponse<T>(res: RequestApiResult<T>): T {
    if (!res.success) {
      throw res.err;
    }

    return res.value;
  }
}
