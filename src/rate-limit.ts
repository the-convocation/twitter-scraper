import { FetchParameters } from './api-types';
import { ApiError } from './errors';

/**
 * Information about a rate-limiting event. Both the request and response
 * information are provided.
 */
export interface RateLimitEvent {
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
export interface RateLimitStrategy {
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
export class WaitingRateLimitStrategy implements RateLimitStrategy {
  async onRateLimit({ response: res }: RateLimitEvent): Promise<void> {
    /*
      Known headers at this point:
      - x-rate-limit-limit: Maximum number of requests per time period?
      - x-rate-limit-reset: UNIX timestamp when the current rate limit will be reset.
      - x-rate-limit-remaining: Number of requests remaining in current time period?
      */
    const xRateLimitRemaining = res.headers.get('x-rate-limit-remaining');
    const xRateLimitReset = res.headers.get('x-rate-limit-reset');
    if (xRateLimitRemaining == '0' && xRateLimitReset) {
      const currentTime = new Date().valueOf() / 1000;
      const timeDeltaMs = 1000 * (parseInt(xRateLimitReset) - currentTime);

      // I have seen this block for 800s (~13 *minutes*)
      await new Promise((resolve) => setTimeout(resolve, timeDeltaMs));
    }
  }
}

/**
 * A rate-limiting strategy that throws an {@link ApiError} when a rate limiting event occurs.
 */
export class ErrorRateLimitStrategy implements RateLimitStrategy {
  async onRateLimit({ response: res }: RateLimitEvent): Promise<void> {
    throw await ApiError.fromResponse(res);
  }
}
