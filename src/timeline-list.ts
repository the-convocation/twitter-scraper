import { QueryTweetsResponse } from './timeline-v1';
import { SearchEntryRaw, parseAndPush } from './timeline-v2';
import { Tweet } from './tweets';

export interface ListTimeline {
  data?: {
    list?: {
      tweets_timeline?: {
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

export function parseListTimelineTweets(
  timeline: ListTimeline,
): QueryTweetsResponse {
  let bottomCursor: string | undefined;
  let topCursor: string | undefined;
  const tweets: Tweet[] = [];
  const instructions =
    timeline.data?.list?.tweets_timeline?.timeline
      ?.instructions ?? [];
  for (const instruction of instructions) {
    const entries = instruction.entries ?? [];

    for (const entry of entries) {
      const entryContent = entry.content;
      if (!entryContent) continue;

      if (entryContent.cursorType === 'Bottom') {
        bottomCursor = entryContent.value;
        continue;
      } else if (entryContent.cursorType === 'Top') {
        topCursor = entryContent.value;
        continue;
      }

      const idStr = entry.entryId;
      if (!idStr.startsWith('tweet')) {
        continue;
      }

      if (entryContent.itemContent) {
        parseAndPush(tweets, entryContent.itemContent, idStr);
      }
    }
  }

  return { tweets, next: bottomCursor, previous: topCursor };
}
