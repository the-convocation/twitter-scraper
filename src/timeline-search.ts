import { Profile, parseProfile } from './profile';
import { QueryProfilesResponse, QueryTweetsResponse } from './timeline-v1';
import { SearchEntryRaw, parseLegacyTweet } from './timeline-v2';
import { Tweet } from './tweets';

export interface SearchTimeline {
  data?: {
    search_by_raw_query?: {
      search_timeline?: {
        timeline?: {
          instructions?: {
            entries?: SearchEntryRaw[];
            entry?: SearchEntryRaw;
            type?: string;
          }[];
        };
      };
    };
  };
}

export function parseSearchTimelineTweets(
  timeline: SearchTimeline,
): QueryTweetsResponse {
  let cursor: string | undefined;
  const tweets: Tweet[] = [];
  const instructions =
    timeline.data?.search_by_raw_query?.search_timeline?.timeline
      ?.instructions ?? [];
  for (const instruction of instructions) {
    if (
      instruction.type === 'TimelineAddEntries' ||
      instruction.type === 'TimelineReplaceEntry'
    ) {
      if (instruction.entry?.content?.cursorType === 'Bottom') {
        cursor = instruction.entry.content.value;
        continue;
      }

      const entries = instruction.entries ?? [];
      for (const entry of entries) {
        const itemContent = entry.content?.itemContent;
        if (itemContent?.tweetDisplayType === 'Tweet') {
          const tweetResultRaw = itemContent.tweet_results?.result;
          const tweetResult = parseLegacyTweet(
            tweetResultRaw?.core?.user_results?.result?.legacy,
            tweetResultRaw?.legacy,
          );

          if (tweetResult.success) {
            if (!tweetResult.tweet.views && tweetResultRaw?.views?.count) {
              const views = parseInt(tweetResultRaw.views.count);
              if (!isNaN(views)) {
                tweetResult.tweet.views = views;
              }
            }

            tweets.push(tweetResult.tweet);
          }
        } else if (entry.content?.cursorType === 'Bottom') {
          cursor = entry.content.value;
        }
      }
    }
  }

  return { tweets, next: cursor };
}

export function parseSearchTimelineUsers(
  timeline: SearchTimeline,
): QueryProfilesResponse {
  let cursor: string | undefined;
  const profiles: Profile[] = [];
  const instructions =
    timeline.data?.search_by_raw_query?.search_timeline?.timeline
      ?.instructions ?? [];

  for (const instruction of instructions) {
    if (
      instruction.type === 'TimelineAddEntries' ||
      instruction.type === 'TimelineReplaceEntry'
    ) {
      if (instruction.entry?.content?.cursorType === 'Bottom') {
        cursor = instruction.entry.content.value;
        continue;
      }

      const entries = instruction.entries ?? [];
      for (const entry of entries) {
        const itemContent = entry.content?.itemContent;
        if (itemContent?.userDisplayType === 'User') {
          const userResultRaw = itemContent.user_results?.result;

          if (userResultRaw?.legacy) {
            const profile = parseProfile(
              userResultRaw.legacy,
              userResultRaw.is_blue_verified,
            );

            if (!profile.userId) {
              profile.userId = userResultRaw.rest_id;
            }

            profiles.push(profile);
          }
        } else if (entry.content?.cursorType === 'Bottom') {
          cursor = entry.content.value;
        }
      }
    }
  }

  return { profiles, next: cursor };
}
