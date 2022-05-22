import { bearerToken, bearerToken2, RequestApiResult } from './api';
import { TwitterGuestAuth } from './auth';
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
import { getTweet, getTweets, Tweet } from './tweets';

/**
 * An interface to Twitter's undocumented API.
 * Reusing Scraper objects is recommended to minimize the time spent authenticating unnecessarily.
 */
export class Scraper {
  private auth: TwitterGuestAuth;
  private authTrends: TwitterGuestAuth;

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
   * Sets the optional cookie to be used in requests.
   * @param cookie The cookie to be used in requests.
   * @returns This scraper instance.
   */
  public withCookie(cookie: string): Scraper {
    this.auth.useCookie(cookie);
    this.authTrends.useCookie(cookie);
    return this;
  }

  /**
   * Sets the optional CSRF token to be used in requests.
   * @param token The CSRF token to be used in requests.
   * @returns This scraper instance.
   */
  public withXCsrfToken(token: string): Scraper {
    this.auth.useCsrfToken(token);
    this.authTrends.useCsrfToken(token);
    return this;
  }

  private handleResponse<T>(res: RequestApiResult<T>): T {
    if (!res.success) {
      throw res.err;
    }

    return res.value;
  }
}
