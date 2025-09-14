import * as _sinclair_typebox from '@sinclair/typebox';
import { Static } from '@sinclair/typebox';
import { Cookie } from 'tough-cookie';
import fetch from 'cross-fetch';

type FetchParameters = [input: RequestInfo | URL, init?: RequestInit];

interface FetchTransformOptions {
    /**
     * Transforms the request options before a request is made. This executes after all of the default
     * parameters have been configured, and is stateless. It is safe to return new request options
     * objects.
     * @param args The request options.
     * @returns The transformed request options.
     */
    request: (...args: FetchParameters) => FetchParameters | Promise<FetchParameters>;
    /**
     * Transforms the response after a request completes. This executes immediately after the request
     * completes, and is stateless. It is safe to return a new response object.
     * @param response The response object.
     * @returns The transformed response object.
     */
    response: (response: Response) => Response | Promise<Response>;
}

/**
 * Information about a rate-limiting event. Both the request and response
 * information are provided.
 */
interface RateLimitEvent {
    /** The complete arguments that were passed to the fetch function. */
    fetchParameters: FetchParameters;
    /** The failing HTTP response. */
    response: Response;
}
/**
 * The public interface for all rate-limiting strategies. Library consumers are
 * welcome to provide their own implementations of this interface in the Scraper
 * constructor options.
 *
 * The {@link RateLimitEvent} object contains both the request and response
 * information associated with the event.
 *
 * @example
 * import { Scraper, RateLimitStrategy } from "@the-convocation/twitter-scraper";
 *
 * // A custom rate-limiting implementation that just logs request/response information.
 * class ConsoleLogRateLimitStrategy implements RateLimitStrategy {
 *   async onRateLimit(event: RateLimitEvent): Promise<void> {
 *     console.log(event.fetchParameters, event.response);
 *   }
 * }
 *
 * const scraper = new Scraper({
 *   rateLimitStrategy: new ConsoleLogRateLimitStrategy(),
 * });
 */
interface RateLimitStrategy {
    /**
     * Called when the scraper is rate limited.
     * @param event The event information, including the request and response info.
     */
    onRateLimit(event: RateLimitEvent): Promise<void>;
}
/**
 * A rate-limiting strategy that simply waits for the current rate limit period to expire.
 * This has been known to take up to 13 minutes, in some cases.
 */
declare class WaitingRateLimitStrategy implements RateLimitStrategy {
    onRateLimit({ response: res }: RateLimitEvent): Promise<void>;
}
/**
 * A rate-limiting strategy that throws an {@link ApiError} when a rate limiting event occurs.
 */
declare class ErrorRateLimitStrategy implements RateLimitStrategy {
    onRateLimit({ response: res }: RateLimitEvent): Promise<void>;
}

declare class ApiError extends Error {
    readonly response: Response;
    readonly data: any;
    constructor(response: Response, data: any);
    static fromResponse(response: Response): Promise<ApiError>;
}
declare class AuthenticationError extends Error {
    constructor(message?: string);
}
interface TwitterApiErrorPosition {
    line: number;
    column: number;
}
interface TwitterApiErrorTraceInfo {
    trace_id: string;
}
interface TwitterApiErrorExtensions {
    code?: number;
    kind?: string;
    name?: string;
    source?: string;
    tracing?: TwitterApiErrorTraceInfo;
}
interface TwitterApiErrorRaw extends TwitterApiErrorExtensions {
    message?: string;
    locations?: TwitterApiErrorPosition[];
    path?: string[];
    extensions?: TwitterApiErrorExtensions;
}

interface TwitterUserAuthFlowInitRequest {
    flow_name: string;
    input_flow_data: Record<string, unknown>;
    subtask_versions: Record<string, number>;
}
interface TwitterUserAuthFlowSubtaskRequest {
    flow_token: string;
    subtask_inputs: ({
        subtask_id: string;
    } & Record<string, unknown>)[];
}
type TwitterUserAuthFlowRequest = TwitterUserAuthFlowInitRequest | TwitterUserAuthFlowSubtaskRequest;
interface TwitterUserAuthFlowResponse {
    errors?: TwitterApiErrorRaw[];
    flow_token?: string;
    status?: string;
    subtasks?: TwitterUserAuthSubtask[];
}
declare const TwitterUserAuthSubtask: _sinclair_typebox.TObject<{
    subtask_id: _sinclair_typebox.TString;
    enter_text: _sinclair_typebox.TOptional<_sinclair_typebox.TObject<{}>>;
}>;
type TwitterUserAuthSubtask = Static<typeof TwitterUserAuthSubtask>;
type FlowTokenResultSuccess = {
    status: 'success';
    response: TwitterUserAuthFlowResponse;
};
type FlowTokenResultError = {
    status: 'error';
    err: Error;
};
type FlowTokenResult = FlowTokenResultSuccess | FlowTokenResultError;
interface TwitterUserAuthCredentials {
    username: string;
    password: string;
    email?: string;
    twoFactorSecret?: string;
}
/**
 * The API interface provided to custom subtask handlers for interacting with the Twitter authentication flow.
 * This interface allows handlers to send flow requests and access the current flow token.
 *
 * The API is passed to each subtask handler and provides methods necessary for implementing
 * custom authentication subtasks. It abstracts away the low-level details of communicating
 * with Twitter's authentication API.
 *
 * @example
 * ```typescript
 * import { Scraper, FlowSubtaskHandler } from "@the-convocation/twitter-scraper";
 *
 * // A custom subtask handler that implements a hypothetical example subtask
 * const exampleHandler: FlowSubtaskHandler = async (subtaskId, response, credentials, api) => {
 *   // Process the example subtask somehow
 *   const data = await processExampleTask();
 *
 *   // Submit the processed data using the provided API
 *   return await api.sendFlowRequest({
 *     flow_token: api.getFlowToken(),
 *     subtask_inputs: [{
 *       subtask_id: subtaskId,
 *       example_data: {
 *         value: data,
 *         link: "next_link"
 *       }
 *     }]
 *   });
 * };
 *
 * const scraper = new Scraper();
 * scraper.registerAuthSubtaskHandler("ExampleSubtask", exampleHandler);
 * ```
 */
interface FlowSubtaskHandlerApi {
    /**
     * Send a flow request to the Twitter API.
     * @param request The request object containing flow token and subtask inputs
     * @returns The result of the flow task
     */
    sendFlowRequest: (request: TwitterUserAuthFlowRequest) => Promise<FlowTokenResult>;
    /**
     * Gets the current flow token.
     * @returns The current flow token
     */
    getFlowToken: () => string;
}
/**
 * A handler function for processing Twitter authentication flow subtasks.
 * Library consumers can implement and register custom handlers for new or
 * existing subtask types using the Scraper.registerAuthSubtaskHandler method.
 *
 * Each subtask handler is called when its corresponding subtask ID is encountered
 * during the authentication flow. The handler receives the subtask ID, the previous
 * response data, the user's credentials, and an API interface for interacting with
 * the authentication flow.
 *
 * Handlers should process their specific subtask and return either a successful response
 * or an error. Success responses typically lead to the next subtask in the flow, while
 * errors will halt the authentication process.
 *
 * @param subtaskId - The identifier of the subtask being handled
 * @param previousResponse - The complete response from the previous authentication flow step
 * @param credentials - The user's authentication credentials including username, password, etc.
 * @param api - An interface providing methods to interact with the authentication flow
 * @returns A promise resolving to either a successful flow response or an error
 *
 * @example
 * ```typescript
 * import { Scraper, FlowSubtaskHandler } from "@the-convocation/twitter-scraper";
 *
 * // Custom handler for a hypothetical verification subtask
 * const verificationHandler: FlowSubtaskHandler = async (
 *   subtaskId,
 *   response,
 *   credentials,
 *   api
 * ) => {
 *   // Extract the verification data from the response
 *   const verificationData = response.subtasks?.[0].exampleData?.value;
 *   if (!verificationData) {
 *     return {
 *       status: 'error',
 *       err: new Error('No verification data found in response')
 *     };
 *   }
 *
 *   // Process the verification data somehow
 *   const result = await processVerification(verificationData);
 *
 *   // Submit the result using the flow API
 *   return await api.sendFlowRequest({
 *     flow_token: api.getFlowToken(),
 *     subtask_inputs: [{
 *       subtask_id: subtaskId,
 *       example_verification: {
 *         value: result,
 *         link: "next_link"
 *       }
 *     }]
 *   });
 * };
 *
 * const scraper = new Scraper();
 * scraper.registerAuthSubtaskHandler("ExampleVerificationSubtask", verificationHandler);
 *
 * // Later, when logging in...
 * await scraper.login("username", "password");
 * ```
 */
type FlowSubtaskHandler = (subtaskId: string, previousResponse: TwitterUserAuthFlowResponse, credentials: TwitterUserAuthCredentials, api: FlowSubtaskHandlerApi) => Promise<FlowTokenResult>;

type IndicesTuple = [number, number];
interface CoreUserRaw {
    created_at?: string;
    name?: string;
    screen_name?: string;
}
interface UrlEntity {
    url?: string;
    expanded_url?: string;
    display_url?: string;
    indices?: IndicesTuple;
}
interface LegacyUserRaw {
    id?: number;
    id_str?: string;
    name?: string;
    screen_name?: string;
    description?: string;
    location?: string;
    url?: string;
    created_at?: string;
    protected?: boolean;
    verified?: boolean;
    favourites_count?: number;
    followers_count?: number;
    friends_count?: number;
    listed_count?: number;
    media_count?: number;
    statuses_count?: number;
    fast_followers_count?: number;
    normal_followers_count?: number;
    entities?: {
        url?: {
            urls?: UrlEntity[];
        };
        description?: {
            urls?: UrlEntity[];
        };
    };
    profile_banner_url?: string;
    profile_image_url_https?: string;
    profile_image_url?: string;
    profile_background_image_url?: string;
    profile_background_image_url_https?: string;
    profile_background_tile?: boolean;
    profile_background_color?: string;
    profile_link_color?: string;
    profile_sidebar_border_color?: string;
    profile_sidebar_fill_color?: string;
    profile_text_color?: string;
    profile_use_background_image?: boolean;
    default_profile?: boolean;
    default_profile_image?: boolean;
    profile_interstitial_type?: string;
    geo_enabled?: boolean;
    has_custom_timelines?: boolean;
    has_extended_profile?: boolean;
    can_dm?: boolean;
    can_secret_dm?: boolean;
    can_media_tag?: boolean;
    is_translator?: boolean;
    is_translation_enabled?: boolean;
    contributors_enabled?: boolean;
    following?: boolean;
    follow_request_sent?: boolean;
    notifications?: boolean;
    blocking?: boolean;
    blocked_by?: boolean;
    subscribed_by?: boolean;
    want_retweets?: boolean;
    business_profile_state?: string;
    translator_type?: string;
    pinned_tweet_ids_str?: string[];
    possibly_sensitive?: boolean;
    withheld_in_countries?: string[];
    utc_offset?: number | null;
    time_zone?: string | null;
    lang?: string | null;
}
/**
 * A parsed profile object.
 */
interface Profile {
    avatar?: string;
    banner?: string;
    biography?: string;
    birthday?: string;
    followersCount?: number;
    followingCount?: number;
    friendsCount?: number;
    mediaCount?: number;
    statusesCount?: number;
    isPrivate?: boolean;
    isVerified?: boolean;
    isBlueVerified?: boolean;
    joined?: Date;
    likesCount?: number;
    listedCount?: number;
    location?: string;
    name?: string;
    pinnedTweetIds?: string[];
    tweetsCount?: number;
    url?: string;
    userId?: string;
    username?: string;
    website?: string;
    canDm?: boolean;
}

interface DmInboxResponse {
    inbox_initial_state: DmInbox;
}
interface DmInbox {
    last_seen_event_id: string;
    trusted_last_seen_event_id: string;
    untrusted_last_seen_event_id: string;
    cursor: string;
    inbox_timelines: DmInboxTimelines;
    entries: DmMessageEntry[];
    users: {
        [key: string]: LegacyUserRaw;
    };
    conversations: {
        [key: string]: DmConversation;
    };
}
interface DmConversationResponse {
    conversation_timeline: DmConversationTimeline;
}
interface DmConversationTimeline {
    status: DmStatus;
    min_entry_id: string;
    max_entry_id: string;
    entries: DmMessageEntry[];
    users: {
        [key: string]: LegacyUserRaw;
    };
    conversations: {
        [key: string]: DmConversation;
    };
}
interface DmConversation {
    conversation_id: string;
    type: string;
    sort_event_id: string;
    sort_timestamp: string;
    participants: DmParticipant[];
    nsfw: boolean;
    notifications_disabled: boolean;
    mention_notifications_disabled: boolean;
    last_read_event_id: string;
    read_only: boolean;
    trusted: boolean;
    muted: boolean;
    status: DmStatus;
    min_entry_id: string;
    max_entry_id: string;
}
type DmStatus = 'AT_END' | 'HAS_MORE';
interface DmParticipant {
    user_id: string;
    last_read_event_id?: string;
}
interface DmMessageEntry {
    welcome_message_create?: DmWelcomeMessage;
    message?: DmMessage;
}
interface DmMessage {
    id: string;
    time: string;
    affects_sort: boolean;
    request_id: string;
    conversation_id: string;
    message_data: DmMessageData;
    message_reactions: DmReaction[];
}
interface DmMessageData {
    id: string;
    time: string;
    recipient_id: string;
    sender_id: string;
    text: string;
    edit_count?: number;
    entities?: DmMessageEntities;
}
interface DmReaction {
    id: string;
    time: string;
    conversation_id: string;
    message_id: string;
    reaction_key: string;
    emoji_reaction: string;
    sender_id: string;
}
interface DmMessageEntities {
    hashtags: any[];
    symbols: any[];
    user_mentions: any[];
    urls: DmMessageUrl[];
}
interface DmMessageUrl {
    url: string;
    expanded_url: string;
    display_url: string;
    indices: number[];
}
interface DmWelcomeMessage extends DmMessage {
    welcome_message_id: string;
}
interface DmInboxTimelines {
    trusted: DmTimelineState;
    untrusted: DmTimelineState;
    untrusted_low_quality: DmTimelineState;
}
interface DmTimelineState {
    status: DmStatus;
    min_entry_id: string;
}
interface DmCursorOptions {
    maxId?: string;
    minId?: string;
}

interface Mention {
    id: string;
    username?: string;
    name?: string;
}
interface Photo {
    id: string;
    url: string;
    alt_text: string | undefined;
}
interface Video {
    id: string;
    preview: string;
    url?: string;
}
interface PlaceRaw {
    id?: string;
    place_type?: string;
    name?: string;
    full_name?: string;
    country_code?: string;
    country?: string;
    bounding_box?: {
        type?: string;
        coordinates?: number[][][];
    };
}
/**
 * A parsed Tweet object.
 */
interface Tweet {
    __raw_UNSTABLE?: LegacyTweetRaw;
    bookmarkCount?: number;
    conversationId?: string;
    hashtags: string[];
    html?: string;
    id?: string;
    inReplyToStatus?: Tweet;
    inReplyToStatusId?: string;
    isEdited?: boolean;
    versions?: string[];
    isQuoted?: boolean;
    isPin?: boolean;
    isReply?: boolean;
    isRetweet?: boolean;
    isSelfThread?: boolean;
    likes?: number;
    name?: string;
    mentions: Mention[];
    permanentUrl?: string;
    photos: Photo[];
    place?: PlaceRaw;
    quotedStatus?: Tweet;
    quotedStatusId?: string;
    replies?: number;
    retweets?: number;
    retweetedStatus?: Tweet;
    retweetedStatusId?: string;
    text?: string;
    thread: Tweet[];
    timeParsed?: Date;
    timestamp?: number;
    urls: string[];
    userId?: string;
    username?: string;
    videos: Video[];
    views?: number;
    sensitiveContent?: boolean;
    userProfile?: {
        favourites_count?: number;
        followers_count?: number;
        friends_count?: number;
        listed_count?: number;
        media_count?: number;
        statuses_count?: number;
    };
}
type TweetQuery = Partial<Tweet> | ((tweet: Tweet) => boolean | Promise<boolean>);

interface Hashtag {
    text?: string;
}
interface TimelineUserMentionBasicRaw {
    id_str?: string;
    name?: string;
    screen_name?: string;
}
interface TimelineMediaBasicRaw {
    media_url_https?: string;
    type?: string;
    url?: string;
}
interface TimelineUrlBasicRaw {
    expanded_url?: string;
    url?: string;
}
interface ExtSensitiveMediaWarningRaw {
    adult_content?: boolean;
    graphic_violence?: boolean;
    other?: boolean;
}
interface VideoVariant {
    bitrate?: number;
    content_type?: string;
    url?: string;
}
interface VideoInfo {
    variants?: VideoVariant[];
}
interface TimelineMediaExtendedRaw {
    id_str?: string;
    media_url_https?: string;
    ext_sensitive_media_warning?: ExtSensitiveMediaWarningRaw;
    type?: string;
    url?: string;
    video_info?: VideoInfo;
    ext_alt_text: string | undefined;
}
interface EditControlInitialRaw {
    edit_tweet_ids?: string[];
    editable_until_msecs?: `${number}`;
    edits_remaining?: `${number}`;
    is_edit_eligible?: boolean;
}
interface TimelineResultRaw {
    rest_id?: string;
    __typename?: string;
    edit_control?: {
        edit_control_initial?: EditControlInitialRaw;
    };
    core?: {
        user_results?: {
            result?: {
                __typename?: string;
                is_blue_verified?: boolean;
                core?: CoreUserRaw;
                legacy?: LegacyUserRaw;
            };
        };
    };
    views?: {
        count?: string;
    };
    note_tweet?: {
        note_tweet_results?: {
            result?: {
                text?: string;
            };
        };
    };
    quoted_status_result?: {
        result?: TimelineResultRaw;
    };
    legacy?: LegacyTweetRaw;
    tweet?: TimelineResultRaw;
}
interface LegacyTweetRaw {
    bookmark_count?: number;
    conversation_id_str?: string;
    created_at?: string;
    favorite_count?: number;
    full_text?: string;
    entities?: {
        hashtags?: Hashtag[];
        media?: TimelineMediaBasicRaw[];
        urls?: TimelineUrlBasicRaw[];
        user_mentions?: TimelineUserMentionBasicRaw[];
    };
    extended_entities?: {
        media?: TimelineMediaExtendedRaw[];
    };
    id_str?: string;
    in_reply_to_status_id_str?: string;
    place?: PlaceRaw;
    reply_count?: number;
    retweet_count?: number;
    retweeted_status_id_str?: string;
    retweeted_status_result?: {
        result?: TimelineResultRaw;
    };
    quoted_status_id_str?: string;
    time?: string;
    user_id_str?: string;
    ext_views?: {
        state?: string;
        count?: string;
    };
}
/**
 * A paginated tweets API response. The `next` field can be used to fetch the next page of results,
 * and the `previous` can be used to fetch the previous results (or results created after the
 * inital request)
 */
interface QueryTweetsResponse {
    tweets: Tweet[];
    next?: string;
    previous?: string;
}
/**
 * A paginated profiles API response. The `next` field can be used to fetch the next page of results.
 */
interface QueryProfilesResponse {
    profiles: Profile[];
    next?: string;
    previous?: string;
}

/**
 * The categories that can be used in Twitter searches.
 */
declare enum SearchMode {
    Top = 0,
    Latest = 1,
    Photos = 2,
    Videos = 3,
    Users = 4
}

interface ScraperOptions {
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
    /**
     * A handling strategy for rate limits (HTTP 429).
     */
    rateLimitStrategy: RateLimitStrategy;
}
/**
 * An interface to Twitter's undocumented API.
 * - Reusing Scraper objects is recommended to minimize the time spent authenticating unnecessarily.
 */
declare class Scraper {
    private readonly options?;
    private auth;
    private authTrends;
    private token;
    /**
     * Creates a new Scraper object.
     * - Scrapers maintain their own guest tokens for Twitter's internal API.
     * - Reusing Scraper objects is recommended to minimize the time spent authenticating unnecessarily.
     */
    constructor(options?: Partial<ScraperOptions> | undefined);
    /**
     * Registers a subtask handler for the given subtask ID. This
     * will override any existing handler for the same subtask.
     * @param subtaskId The ID of the subtask to register the handler for.
     * @param subtaskHandler The handler function to register.
     */
    registerAuthSubtaskHandler(subtaskId: string, subtaskHandler: FlowSubtaskHandler): void;
    /**
     * Fetches a Twitter profile.
     * @param username The Twitter username of the profile to fetch, without an `@` at the beginning.
     * @returns The requested {@link Profile}.
     */
    getProfile(username: string): Promise<Profile>;
    /**
     * Fetches the user ID corresponding to the provided screen name.
     * @param screenName The Twitter screen name of the profile to fetch.
     * @returns The ID of the corresponding account.
     */
    getUserIdByScreenName(screenName: string): Promise<string>;
    /**
     * Fetches tweets from Twitter.
     * @param query The search query. Any Twitter-compatible query format can be used.
     * @param maxTweets The maximum number of tweets to return.
     * @param includeReplies Whether or not replies should be included in the response.
     * @param searchMode The category filter to apply to the search. Defaults to `Top`.
     * @returns An {@link AsyncGenerator} of tweets matching the provided filters.
     */
    searchTweets(query: string, maxTweets: number, searchMode?: SearchMode): AsyncGenerator<Tweet, void>;
    /**
     * Fetches profiles from Twitter.
     * @param query The search query. Any Twitter-compatible query format can be used.
     * @param maxProfiles The maximum number of profiles to return.
     * @returns An {@link AsyncGenerator} of tweets matching the provided filter(s).
     */
    searchProfiles(query: string, maxProfiles: number): AsyncGenerator<Profile, void>;
    /**
     * Fetches tweets from Twitter.
     * @param query The search query. Any Twitter-compatible query format can be used.
     * @param maxTweets The maximum number of tweets to return.
     * @param includeReplies Whether or not replies should be included in the response.
     * @param searchMode The category filter to apply to the search. Defaults to `Top`.
     * @param cursor The search cursor, which can be passed into further requests for more results.
     * @returns A page of results, containing a cursor that can be used in further requests.
     */
    fetchSearchTweets(query: string, maxTweets: number, searchMode: SearchMode, cursor?: string): Promise<QueryTweetsResponse>;
    /**
     * Fetches profiles from Twitter.
     * @param query The search query. Any Twitter-compatible query format can be used.
     * @param maxProfiles The maximum number of profiles to return.
     * @param cursor The search cursor, which can be passed into further requests for more results.
     * @returns A page of results, containing a cursor that can be used in further requests.
     */
    fetchSearchProfiles(query: string, maxProfiles: number, cursor?: string): Promise<QueryProfilesResponse>;
    /**
     * Fetches list tweets from Twitter.
     * @param listId The list id
     * @param maxTweets The maximum number of tweets to return.
     * @param cursor The search cursor, which can be passed into further requests for more results.
     * @returns A page of results, containing a cursor that can be used in further requests.
     */
    fetchListTweets(listId: string, maxTweets: number, cursor?: string): Promise<QueryTweetsResponse>;
    /**
     * Fetch the tweets a user has liked
     * @param userId The user whose liked tweets should be returned
     * @param maxTweets The maximum number of tweets to return.
     * @param cursor The search cursor, which can be passed into further requests for more results.
     * @returns A page of results, containing a cursor that can be used in further requests.
     */
    fetchLikedTweets(userId: string, maxTweets: number, cursor?: string): Promise<QueryTweetsResponse>;
    /**
     * Fetch the profiles a user is following
     * @param userId The user whose following should be returned
     * @param maxProfiles The maximum number of profiles to return.
     * @returns An {@link AsyncGenerator} of following profiles for the provided user.
     */
    getFollowing(userId: string, maxProfiles: number): AsyncGenerator<Profile, void>;
    /**
     * Fetch the profiles that follow a user
     * @param userId The user whose followers should be returned
     * @param maxProfiles The maximum number of profiles to return.
     * @returns An {@link AsyncGenerator} of profiles following the provided user.
     */
    getFollowers(userId: string, maxProfiles: number): AsyncGenerator<Profile, void>;
    /**
     * Fetches following profiles from Twitter.
     * @param userId The user whose following should be returned
     * @param maxProfiles The maximum number of profiles to return.
     * @param cursor The search cursor, which can be passed into further requests for more results.
     * @returns A page of results, containing a cursor that can be used in further requests.
     */
    fetchProfileFollowing(userId: string, maxProfiles: number, cursor?: string): Promise<QueryProfilesResponse>;
    /**
     * Fetches profile followers from Twitter.
     * @param userId The user whose following should be returned
     * @param maxProfiles The maximum number of profiles to return.
     * @param cursor The search cursor, which can be passed into further requests for more results.
     * @returns A page of results, containing a cursor that can be used in further requests.
     */
    fetchProfileFollowers(userId: string, maxProfiles: number, cursor?: string): Promise<QueryProfilesResponse>;
    /**
     * Fetches the current trends from Twitter.
     * @returns The current list of trends.
     */
    getTrends(): Promise<string[]>;
    /**
     * Fetches tweets from a Twitter user.
     * @param user The user whose tweets should be returned.
     * @param maxTweets The maximum number of tweets to return. Defaults to `200`.
     * @returns An {@link AsyncGenerator} of tweets from the provided user.
     */
    getTweets(user: string, maxTweets?: number): AsyncGenerator<Tweet>;
    /**
     * Fetches liked tweets from a Twitter user. Requires authentication.
     * @param user The user whose likes should be returned.
     * @param maxTweets The maximum number of tweets to return. Defaults to `200`.
     * @returns An {@link AsyncGenerator} of liked tweets from the provided user.
     */
    getLikedTweets(user: string, maxTweets?: number): AsyncGenerator<Tweet>;
    /**
     * Fetches tweets from a Twitter user using their ID.
     * @param userId The user whose tweets should be returned.
     * @param maxTweets The maximum number of tweets to return. Defaults to `200`.
     * @returns An {@link AsyncGenerator} of tweets from the provided user.
     */
    getTweetsByUserId(userId: string, maxTweets?: number): AsyncGenerator<Tweet, void>;
    /**
     * Fetches tweets and replies from a Twitter user.
     * @param user The user whose tweets should be returned.
     * @param maxTweets The maximum number of tweets to return. Defaults to `200`.
     * @returns An {@link AsyncGenerator} of tweets from the provided user.
     */
    getTweetsAndReplies(user: string, maxTweets?: number): AsyncGenerator<Tweet>;
    /**
     * Fetches tweets and replies from a Twitter user using their ID.
     * @param userId The user whose tweets should be returned.
     * @param maxTweets The maximum number of tweets to return. Defaults to `200`.
     * @returns An {@link AsyncGenerator} of tweets from the provided user.
     */
    getTweetsAndRepliesByUserId(userId: string, maxTweets?: number): AsyncGenerator<Tweet, void>;
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
    getTweetWhere(tweets: AsyncIterable<Tweet>, query: TweetQuery): Promise<Tweet | null>;
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
    getTweetsWhere(tweets: AsyncIterable<Tweet>, query: TweetQuery): Promise<Tweet[]>;
    /**
     * Fetches the most recent tweet from a Twitter user.
     * @param user The user whose latest tweet should be returned.
     * @param includeRetweets Whether or not to include retweets. Defaults to `false`.
     * @returns The {@link Tweet} object or `null`/`undefined` if it couldn't be fetched.
     */
    getLatestTweet(user: string, includeRetweets?: boolean, max?: number): Promise<Tweet | null | void>;
    /**
     * Fetches a single tweet.
     * @param id The ID of the tweet to fetch.
     * @returns The {@link Tweet} object, or `null` if it couldn't be fetched.
     */
    getTweet(id: string): Promise<Tweet | null>;
    /**
     * Retrieves the direct message inbox for the authenticated user.
     *
     * @return A promise that resolves to an object representing the direct message inbox.
     */
    getDmInbox(): Promise<DmInbox>;
    /**
     * Retrieves the direct message conversation for the specified conversation ID.
     *
     * @param conversationId - The unique identifier of the DM conversation to retrieve.
     * @param cursor - Use `maxId` to get messages before a message ID (older messages), or `minId` to get messages after a message ID (newer messages).
     * @return A promise that resolves to the timeline of the DM conversation.
     */
    getDmConversation(conversationId: string, cursor?: DmCursorOptions): Promise<DmConversationTimeline>;
    /**
     * Retrieves direct messages from a specific conversation.
     *
     * @param conversationId - The unique identifier of the conversation to fetch messages from.
     * @param [maxMessages=20] - The maximum number of messages to retrieve per request.
     * @param cursor - Use `maxId` to get messages before a message ID (older messages), or `minId` to get messages after a message ID (newer messages).
     * @returns An {@link AsyncGenerator} of messages from the provided conversation.
     */
    getDmMessages(conversationId: string, maxMessages?: number, cursor?: DmCursorOptions): AsyncGenerator<DmMessageEntry, void>;
    /**
     * Retrieves a list of direct message conversations for a specific user based on their user ID.
     *
     * @param inbox - The DM inbox containing all available conversations.
     * @param userId - The unique identifier of the user whose DM conversations are to be retrieved.
     * @return An array of DM conversations associated with the specified user ID.
     */
    findDmConversationsByUserId(inbox: DmInbox, userId: string): DmConversation[];
    /**
     * Returns if the scraper has a guest token. The token may not be valid.
     * @returns `true` if the scraper has a guest token; otherwise `false`.
     */
    hasGuestToken(): boolean;
    /**
     * Returns if the scraper is logged in as a real user.
     * @returns `true` if the scraper is logged in with a real user account; otherwise `false`.
     */
    isLoggedIn(): Promise<boolean>;
    /**
     * Login to Twitter as a real Twitter account. This enables running
     * searches.
     * @param username The username of the Twitter account to login with.
     * @param password The password of the Twitter account to login with.
     * @param email The email to log in with, if you have email confirmation enabled.
     * @param twoFactorSecret The secret to generate two factor authentication tokens with, if you have two factor authentication enabled.
     */
    login(username: string, password: string, email?: string, twoFactorSecret?: string): Promise<void>;
    /**
     * Log out of Twitter.
     */
    logout(): Promise<void>;
    /**
     * Retrieves all cookies for the current session.
     * @returns All cookies for the current session.
     */
    getCookies(): Promise<Cookie[]>;
    /**
     * Set cookies for the current session.
     * @param cookies The cookies to set for the current session.
     */
    setCookies(cookies: (string | Cookie)[]): Promise<void>;
    /**
     * Clear all cookies for the current session.
     */
    clearCookies(): Promise<void>;
    /**
     * Sets the optional cookie to be used in requests.
     * @param _cookie The cookie to be used in requests.
     * @deprecated This function no longer represents any part of Twitter's auth flow.
     * @returns This scraper instance.
     */
    withCookie(_cookie: string): Scraper;
    /**
     * Sets the optional CSRF token to be used in requests.
     * @param _token The CSRF token to be used in requests.
     * @deprecated This function no longer represents any part of Twitter's auth flow.
     * @returns This scraper instance.
     */
    withXCsrfToken(_token: string): Scraper;
    private getAuthOptions;
    private handleResponse;
}

export { ApiError, AuthenticationError, type DmConversation, type DmConversationResponse, type DmConversationTimeline, type DmInbox, type DmInboxResponse, type DmInboxTimelines, type DmMessage, type DmMessageData, type DmMessageEntities, type DmMessageEntry, type DmMessageUrl, type DmParticipant, type DmReaction, type DmStatus, type DmTimelineState, type DmWelcomeMessage, ErrorRateLimitStrategy, type FetchParameters, type FetchTransformOptions, type FlowSubtaskHandler, type FlowSubtaskHandlerApi, type FlowTokenResult, type FlowTokenResultError, type FlowTokenResultSuccess, type Mention, type Photo, type PlaceRaw, type Profile, type QueryProfilesResponse, type QueryTweetsResponse, type RateLimitEvent, type RateLimitStrategy, Scraper, type ScraperOptions, SearchMode, type Tweet, type TweetQuery, type TwitterApiErrorExtensions, type TwitterApiErrorPosition, type TwitterApiErrorRaw, type TwitterApiErrorTraceInfo, type TwitterUserAuthCredentials, type TwitterUserAuthFlowInitRequest, type TwitterUserAuthFlowRequest, type TwitterUserAuthFlowResponse, type TwitterUserAuthFlowSubtaskRequest, type Video, WaitingRateLimitStrategy };
