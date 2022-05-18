import { Profile } from './profile';
import { Tweet } from './tweet';

export type FetchProfiles = (
  query: string,
  maxProfiles: number,
  cursor: string | undefined,
) => Promise<[Profile[], string | undefined]>;

export type FetchTweets = (
  query: string,
  maxTweets: number,
  cursor: string | undefined,
) => Promise<[Tweet[], string | undefined]>;

export async function* getUserTimeline(
  query: string,
  maxProfiles: number,
  fetchFunc: FetchProfiles,
): AsyncGenerator<Profile | null> {
  yield null;
}

export async function* getTweetTimeline(
  query: string,
  maxTweets: number,
  fetchFunc: FetchTweets,
): AsyncGenerator<Tweet | null> {
  yield null;
}
