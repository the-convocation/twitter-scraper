import { Cookie } from 'tough-cookie';
import { bearerToken, FetchTransformOptions, RequestApiResult } from './api';
import { TwitterAuth, TwitterAuthOptions, TwitterGuestAuth } from './auth';
import { TwitterUserAuth } from './auth-user';
import { getProfile, getUserIdByScreenName, Profile } from './profile';
import {
  fetchSearchProfiles,
  fetchSearchTweets,
  SearchMode,
  searchProfiles,
  searchTweets,
} from './search';
import {
  fetchProfileFollowing,
  fetchProfileFollowers,
  getFollowing,
  getFollowers,
} from './relationships';
import { QueryProfilesResponse, QueryTweetsResponse } from './timeline-v1';
import { getTrends } from './trends';
import {
  Tweet,
  getTweetAnonymous,
  getTweets,
  getLatestTweet,
  getTweetWhere,
  getTweetsWhere,
  getTweetsByUserId,
  TweetQuery,
  getTweet,
  fetchListTweets,
} from './tweets';
import fetch from 'cross-fetch';

const twUrl = 'https://twitter.com';

export interface ScraperOptions {
  /**
   * An alternative fetch function to use instead of the default fetch function. This may be useful
   * in nonstandard runtime environments, such as edge workers.
   */
  fetch: typeof fetch;

  /**
   * Additional options that control how requests and responses are processed. This can be used to
   * proxy requests through other hosts, for example.
   */
  transform: Partial<FetchTransformOptions>;
}

/**
 * An interface to Twitter's undocumented API.
 * - Reusing Scraper objects is recommended to minimize the time spent authenticating unnecessarily.
 */
export class Scraper {
  private auth!: TwitterAuth;
  private authTrends!: TwitterAuth;
  private token: string;

  /**
   * Creates a new Scraper object.
   * - Scrapers maintain their own guest tokens for Twitter's internal API.
   * - Reusing Scraper objects is recommended to minimize the time spent authenticating unnecessarily.
   */
  constructor(private readonly options?: Partial<ScraperOptions>) {
    this.token = bearerToken;
    this.useGuestAuth();
  }

  /**
   * Initializes auth properties using a guest token.
   * Used when creating a new instance of this class, and when logging out.
   * @internal
   */
  private useGuestAuth() {
    this.auth = new TwitterGuestAuth(this.token, this.getAuthOptions());
    this.authTrends = new TwitterGuestAuth(this.token, this.getAuthOptions());
  }

  /**
   * Fetches a Twitter profile.
   * @param username The Twitter username of the profile to fetch, without an `@` at the beginning.
   * @returns The requested {@link Profile}.
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
   * @returns An {@link AsyncGenerator} of tweets matching the provided filters.
   */
  public searchTweets(
    query: string,
    maxTweets: number,
    searchMode: SearchMode = SearchMode.Top,
  ): AsyncGenerator<Tweet, void> {
    return searchTweets(query, maxTweets, searchMode, this.auth);
  }

  /**
   * Fetches profiles from Twitter.
   * @param query The search query. Any Twitter-compatible query format can be used.
   * @param maxProfiles The maximum number of profiles to return.
   * @returns An {@link AsyncGenerator} of tweets matching the provided filter(s).
   */
  public searchProfiles(
    query: string,
    maxProfiles: number,
  ): AsyncGenerator<Profile, void> {
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
    searchMode: SearchMode,
    cursor?: string,
  ): Promise<QueryTweetsResponse> {
    return fetchSearchTweets(query, maxTweets, searchMode, this.auth, cursor);
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
   * Fetches list tweets from Twitter.
   * @param listId The list id
   * @param maxTweets The maximum number of tweets to return.
   * @param cursor The search cursor, which can be passed into further requests for more results.
   * @returns A page of results, containing a cursor that can be used in further requests.
   */
  public fetchListTweets(
    listId: string,
    maxTweets: number,
    cursor?: string,
  ): Promise<QueryTweetsResponse> {
    return fetchListTweets(listId, maxTweets, cursor, this.auth);
  }

  /**
   * Fetch the profiles a user is following
   * @param userId The user whose following should be returned
   * @param maxProfiles The maximum number of profiles to return.
   * @returns An {@link AsyncGenerator} of following profiles for the provided user.
   */
  public getFollowing(
    userId: string,
    maxProfiles: number,
  ): AsyncGenerator<Profile, void> {
    return getFollowing(userId, maxProfiles, this.auth);
  }

  /**
   * Fetch the profiles that follow a user
   * @param userId The user whose followers should be returned
   * @param maxProfiles The maximum number of profiles to return.
   * @returns An {@link AsyncGenerator} of profiles following the provided user.
   */
  public getFollowers(
    userId: string,
    maxProfiles: number,
  ): AsyncGenerator<Profile, void> {
    return getFollowers(userId, maxProfiles, this.auth);
  }

  /**
   * Fetches following profiles from Twitter.
   * @param userId The user whose following should be returned
   * @param maxProfiles The maximum number of profiles to return.
   * @param cursor The search cursor, which can be passed into further requests for more results.
   * @returns A page of results, containing a cursor that can be used in further requests.
   */
  public fetchProfileFollowing(
    userId: string,
    maxProfiles: number,
    cursor?: string,
  ): Promise<QueryProfilesResponse> {
    return fetchProfileFollowing(userId, maxProfiles, this.auth, cursor);
  }

  /**
   * Fetches profile followers from Twitter.
   * @param userId The user whose following should be returned
   * @param maxProfiles The maximum number of profiles to return.
   * @param cursor The search cursor, which can be passed into further requests for more results.
   * @returns A page of results, containing a cursor that can be used in further requests.
   */
  public fetchProfileFollowers(
    userId: string,
    maxProfiles: number,
    cursor?: string,
  ): Promise<QueryProfilesResponse> {
    return fetchProfileFollowers(userId, maxProfiles, this.auth, cursor);
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
   * @param maxTweets The maximum number of tweets to return. Defaults to `200`.
   * @returns An {@link AsyncGenerator} of tweets from the provided user.
   */
  public getTweets(user: string, maxTweets = 200): AsyncGenerator<Tweet> {
    return getTweets(user, maxTweets, this.auth);
  }

  /**
   * Fetches tweets from a Twitter user using their ID.
   * @param userId The user whose tweets should be returned.
   * @param maxTweets The maximum number of tweets to return. Defaults to `200`.
   * @returns An {@link AsyncGenerator} of tweets from the provided user.
   */
  public getTweetsByUserId(
    userId: string,
    maxTweets = 200,
  ): AsyncGenerator<Tweet, void> {
    return getTweetsByUserId(userId, maxTweets, this.auth);
  }

  /**
   * Fetches the first tweet matching the given query.
   *
   * Example:
   * ```js
   * const timeline = scraper.getTweets('user', 200);
   * const retweet = await scraper.getTweetWhere(timeline, { isRetweet: true });
   * ```
   * @param tweets The {@link AsyncIterable} of tweets to search through.
   * @param query A query to test **all** tweets against. This may be either an
   * object of key/value pairs or a predicate. If this query is an object, all
   * key/value pairs must match a {@link Tweet} for it to be returned. If this query
   * is a predicate, it must resolve to `true` for a {@link Tweet} to be returned.
   * - All keys are optional.
   * - If specified, the key must be implemented by that of {@link Tweet}.
   */
  public getTweetWhere(
    tweets: AsyncIterable<Tweet>,
    query: TweetQuery,
  ): Promise<Tweet | null> {
    return getTweetWhere(tweets, query);
  }

  /**
   * Fetches all tweets matching the given query.
   *
   * Example:
   * ```js
   * const timeline = scraper.getTweets('user', 200);
   * const retweets = await scraper.getTweetsWhere(timeline, { isRetweet: true });
   * ```
   * @param tweets The {@link AsyncIterable} of tweets to search through.
   * @param query A query to test **all** tweets against. This may be either an
   * object of key/value pairs or a predicate. If this query is an object, all
   * key/value pairs must match a {@link Tweet} for it to be returned. If this query
   * is a predicate, it must resolve to `true` for a {@link Tweet} to be returned.
   * - All keys are optional.
   * - If specified, the key must be implemented by that of {@link Tweet}.
   */
  public getTweetsWhere(
    tweets: AsyncIterable<Tweet>,
    query: TweetQuery,
  ): Promise<Tweet[]> {
    return getTweetsWhere(tweets, query);
  }

  /**
   * Fetches the most recent tweet from a Twitter user.
   * @param user The user whose latest tweet should be returned.
   * @param includeRetweets Whether or not to include retweets. Defaults to `false`.
   * @returns The {@link Tweet} object or `null`/`undefined` if it couldn't be fetched.
   */
  public getLatestTweet(
    user: string,
    includeRetweets = false,
    max = 200,
  ): Promise<Tweet | null | void> {
    return getLatestTweet(user, includeRetweets, max, this.auth);
  }

  /**
   * Fetches a single tweet.
   * @param id The ID of the tweet to fetch.
   * @returns The {@link Tweet} object, or `null` if it couldn't be fetched.
   */
  public getTweet(id: string): Promise<Tweet | null> {
    if (this.auth instanceof TwitterUserAuth) {
      return getTweet(id, this.auth);
    } else {
      return getTweetAnonymous(id, this.auth);
    }
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
    return (
      (await this.auth.isLoggedIn()) && (await this.authTrends.isLoggedIn())
    );
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
    // Swap in a real authorizer for all requests
    const userAuth = new TwitterUserAuth(this.token, this.getAuthOptions());
    await userAuth.login(username, password, email);
    this.auth = userAuth;
    this.authTrends = userAuth;
  }

  /**
   * Log out of Twitter.
   */
  public async logout(): Promise<void> {
    await this.auth.logout();
    await this.authTrends.logout();

    // Swap in guest authorizers for all requests
    this.useGuestAuth();
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
    const userAuth = new TwitterUserAuth(this.token, this.getAuthOptions());
    for (const cookie of cookies) {
      await userAuth.cookieJar().setCookie(cookie, twUrl);
    }

    this.auth = userAuth;
    this.authTrends = userAuth;
  }

  /**
   * Clear all cookies for the current session.
   */
  public async clearCookies(): Promise<void> {
    await this.auth.cookieJar().removeAllCookies();
    await this.authTrends.cookieJar().removeAllCookies();
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

  private getAuthOptions(): Partial<TwitterAuthOptions> {
    return {
      fetch: this.options?.fetch,
      transform: this.options?.transform,
    };
  }

  private handleResponse<T>(res: RequestApiResult<T>): T {
    if (!res.success) {
      throw res.err;
    }

    return res.value;
  }
}
