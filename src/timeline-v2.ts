import { LegacyUserRaw } from './profile';
import { parseMediaGroups, reconstructTweetHtml } from './timeline-tweet-util';
import {
  LegacyTweetRaw,
  ParseTweetResult,
  QueryTweetsResponse,
  TimelineResultRaw,
} from './timeline-v1';
import { Tweet } from './tweets';
import { isFieldDefined } from './type-util';

export interface TimelineEntryItemContentRaw {
  tweetDisplayType?: string;
  tweet_results?: {
    result: TimelineResultRaw;
  };
}

export interface TimelineEntryRaw {
  content?: {
    cursorType?: string;
    value?: string;
    items?: {
      item?: {
        itemContent?: TimelineEntryItemContentRaw;
      };
    }[];
    itemContent?: TimelineEntryItemContentRaw;
  };
}

export interface TimelineV2 {
  data?: {
    user?: {
      result?: {
        timeline_v2?: {
          timeline?: {
            instructions?: {
              entries?: TimelineEntryRaw[];
              entry?: TimelineEntryRaw;
              type?: string;
            }[];
          };
        };
      };
    };
  };
}

export interface ThreadedConversation {
  data?: {
    threaded_conversation_with_injections_v2?: {
      instructions?: {
        entries?: TimelineEntryRaw[];
        entry?: TimelineEntryRaw;
        type?: string;
      }[];
    };
  };
}

function parseLegacyTweet(
  user?: LegacyUserRaw,
  tweet?: LegacyTweetRaw,
): ParseTweetResult {
  if (tweet == null) {
    return {
      success: false,
      err: new Error('Tweet was not found in the timeline object.'),
    };
  }

  if (user == null) {
    return {
      success: false,
      err: new Error('User was not found in the timeline object.'),
    };
  }

  const hashtags = tweet.entities?.hashtags ?? [];
  const mentions = tweet.entities?.user_mentions ?? [];
  const media = tweet.extended_entities?.media ?? [];
  const pinnedTweets = new Set<string | undefined>(
    user.pinned_tweet_ids_str ?? [],
  );
  const urls = tweet.entities?.urls ?? [];
  const { photos, videos, sensitiveContent } = parseMediaGroups(media);

  if (tweet.id_str == null) {
    return {
      success: false,
      err: new Error('Tweet ID was not found in object.'),
    };
  }

  const tw: Tweet = {
    conversationId: tweet.conversation_id_str,
    id: tweet.id_str,
    hashtags: hashtags
      .filter(isFieldDefined('text'))
      .map((hashtag) => hashtag.text),
    likes: tweet.favorite_count,
    mentions: mentions.filter(isFieldDefined('id_str')).map((mention) => ({
      id: mention.id_str,
      username: mention.screen_name,
      name: mention.name,
    })),
    name: user.name,
    permanentUrl: `https://twitter.com/${user.screen_name}/status/${tweet.id_str}`,
    photos,
    replies: tweet.reply_count,
    retweets: tweet.retweet_count,
    text: tweet.full_text,
    thread: [],
    urls: urls
      .filter(isFieldDefined('expanded_url'))
      .map((url) => url.expanded_url),
    userId: tweet.user_id_str,
    username: user.screen_name,
    videos,
  };

  if (tweet.created_at != null) {
    tw.timeParsed = new Date(Date.parse(tweet.created_at));
    tw.timestamp = Math.floor(tw.timeParsed.valueOf() / 1000);
  }

  if (tweet.place?.id != null) {
    tw.place = tweet.place;
  }

  if (tweet.quoted_status_id_str != null) {
    tw.isQuoted = true;
    tw.quotedStatusId = tweet.quoted_status_id_str;
  }

  if (tweet.in_reply_to_status_id_str != null) {
    tw.isReply = true;
    tw.inReplyToStatusId = tweet.in_reply_to_status_id_str;
  }

  if (tweet.retweeted_status_id_str != null) {
    tw.isRetweet = true;
    tw.retweetedStatusId = tweet.retweeted_status_id_str;

    if (tweet.retweeted_status_result?.result != null) {
      const retweetedStatusResult = parseLegacyTweet(
        tweet.retweeted_status_result.result.core?.user_results?.result?.legacy,
        tweet.retweeted_status_result.result.legacy,
      );
      if (retweetedStatusResult.success) {
        tw.retweetedStatus = retweetedStatusResult.tweet;
      }
    }
  }

  const views = parseInt(tweet.ext_views?.count ?? '');
  if (!isNaN(views)) {
    tw.views = views;
  }

  if (pinnedTweets.has(tweet.id_str)) {
    // TODO: Update tests so this can be assigned at the tweet declaration
    tw.isPin = true;
  }

  if (sensitiveContent) {
    // TODO: Update tests so this can be assigned at the tweet declaration
    tw.sensitiveContent = true;
  }

  tw.html = reconstructTweetHtml(tweet, tw.photos, tw.videos);

  return { success: true, tweet: tw };
}

function parseResult(result?: TimelineResultRaw): ParseTweetResult {
  if (result?.legacy && result.note_tweet?.note_tweet_results?.result?.text) {
    result.legacy.full_text = result.note_tweet.note_tweet_results.result.text;
  }

  const tweetResult = parseLegacyTweet(
    result?.core?.user_results?.result?.legacy,
    result?.legacy,
  );
  if (!tweetResult.success) {
    return tweetResult;
  }

  if (!tweetResult.tweet.views && result?.views?.count) {
    const views = parseInt(result.views.count);
    if (!isNaN(views)) {
      tweetResult.tweet.views = views;
    }
  }

  if (result?.quoted_status_result?.result) {
    const quotedTweetResult = parseResult(result.quoted_status_result.result);
    if (quotedTweetResult.success) {
      tweetResult.tweet.quotedStatus = quotedTweetResult.tweet;
    }
  }

  return tweetResult;
}

export function parseTimelineTweetsV2(
  timeline: TimelineV2,
): QueryTweetsResponse {
  let cursor: string | undefined;
  const tweets: Tweet[] = [];
  const instructions =
    timeline.data?.user?.result?.timeline_v2?.timeline?.instructions ?? [];
  for (const instruction of instructions) {
    for (const entry of instruction.entries ?? []) {
      if (entry.content?.cursorType === 'Bottom') {
        cursor = entry.content.value;
        continue;
      }

      if (
        entry.content?.itemContent?.tweet_results?.result.__typename === 'Tweet'
      ) {
        const tweetResult = parseResult(
          entry.content.itemContent.tweet_results.result,
        );
        if (tweetResult.success) {
          tweets.push(tweetResult.tweet);
        }
      }
    }
  }

  return { tweets: [], next: cursor };
}

export function parseThreadedConversation(
  conversation: ThreadedConversation,
): Tweet[] {
  const tweets: Tweet[] = [];
  const instructions =
    conversation.data?.threaded_conversation_with_injections_v2?.instructions ??
    [];
  for (const instruction of instructions) {
    for (const entry of instruction.entries ?? []) {
      if (
        entry.content?.itemContent?.tweet_results?.result.__typename === 'Tweet'
      ) {
        const tweetResult = parseResult(
          entry.content.itemContent.tweet_results.result,
        );
        if (tweetResult.success) {
          if (entry.content.itemContent.tweetDisplayType === 'SelfThread') {
            tweetResult.tweet.isSelfThread = true;
          }

          tweets.push(tweetResult.tweet);
        }
      }

      for (const item of entry.content?.items ?? []) {
        if (
          item.item?.itemContent?.tweet_results?.result.__typename === 'Tweet'
        ) {
          const tweetResult = parseResult(
            item.item.itemContent.tweet_results.result,
          );
          if (tweetResult.success) {
            if (item.item.itemContent.tweetDisplayType === 'SelfThread') {
              tweetResult.tweet.isSelfThread = true;
            }

            tweets.push(tweetResult.tweet);
          }
        }
      }
    }
  }

  for (const tweet of tweets) {
    if (tweet.inReplyToStatusId) {
      for (const parentTweet of tweets) {
        if (parentTweet.id === tweet.inReplyToStatusId) {
          tweet.inReplyToStatus = parentTweet;
          break;
        }
      }
    }

    if (tweet.isSelfThread && tweet.conversationId === tweet.id) {
      for (const childTweet of tweets) {
        if (childTweet.isSelfThread && childTweet.id !== tweet.id) {
          tweet.thread.push(childTweet);
        }
      }

      if (tweet.thread.length === 0) {
        tweet.isSelfThread = false;
      }
    }
  }

  return tweets;
}
