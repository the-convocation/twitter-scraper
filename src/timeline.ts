import { LegacyUserRaw, parseProfile, Profile } from './profile';
import { Photo, PlaceRaw, Tweet, Video } from './tweets';

export interface Hashtag {
  text?: string;
}

export interface TimelineUserMentionBasicRaw {
  id_str?: string;
  name?: string;
  screen_name?: string;
}

export interface TimelineMediaBasicRaw {
  media_url_https?: string;
  type?: string;
  url?: string;
}

export interface TimelineUrlBasicRaw {
  expanded_url?: string;
  url?: string;
}

export interface ExtSensitiveMediaWarningRaw {
  adult_content?: boolean;
  graphic_violence?: boolean;
  other?: boolean;
}

export interface VideoVariant {
  bitrate?: number;
  url?: string;
}

export interface VideoInfo {
  variants?: VideoVariant[];
}

export interface TimelineMediaExtendedRaw {
  id_str?: string;
  media_url_https?: string;
  ext_sensitive_media_warning?: ExtSensitiveMediaWarningRaw;
  type?: string;
  url?: string;
  video_info?: VideoInfo;
}

export interface TimelineTweetRaw {
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
  in_reply_to_status_id_str?: string;
  place?: PlaceRaw;
  reply_count?: number;
  retweet_count?: number;
  retweeted_status_id_str?: string;
  quoted_status_id_str?: string;
  time?: string;
  user_id_str?: string;
  ext_views?: {
    state?: string;
    count?: string;
  };
}

export interface TimelineGlobalObjectsRaw {
  tweets?: { [key: string]: TimelineTweetRaw | undefined };
  users?: { [key: string]: LegacyUserRaw | undefined };
}

export interface TimelineDataRawCursor {
  value?: string;
  cursorType?: string;
}

export interface TimelineDataRawEntity {
  id?: string;
}

export interface TimelineDataRawModuleItem {
  clientEventInfo?: {
    details?: {
      guideDetails?: {
        transparentGuideDetails?: {
          trendMetadata?: {
            trendName?: string;
          };
        };
      };
    };
  };
}

export interface TimelineDataRawAddEntry {
  content?: {
    item?: {
      content?: {
        tweet?: TimelineDataRawEntity;
        user?: TimelineDataRawEntity;
      };
    };
    operation?: {
      cursor?: TimelineDataRawCursor;
    };
    timelineModule?: {
      items?: {
        item?: TimelineDataRawModuleItem;
      }[];
    };
  };
}

export interface TimelineDataRawPinEntry {
  content?: {
    item?: {
      content?: {
        tweet?: TimelineDataRawEntity;
      };
    };
  };
}

export interface TimelineDataRawReplaceEntry {
  content?: {
    operation?: {
      cursor?: TimelineDataRawCursor;
    };
  };
}

export interface TimelineDataRawInstruction {
  addEntries?: {
    entries?: TimelineDataRawAddEntry[];
  };
  pinEntry?: {
    entry?: TimelineDataRawPinEntry;
  };
  replaceEntry?: {
    entry?: TimelineDataRawReplaceEntry;
  };
}

export interface TimelineDataRaw {
  instructions?: TimelineDataRawInstruction[];
}

export interface TimelineRaw {
  globalObjects?: TimelineGlobalObjectsRaw;
  timeline?: TimelineDataRaw;
}

const reHashtag = /\B(\#\S+\b)/g;
const reTwitterUrl = /https:(\/\/t\.co\/([A-Za-z0-9]|[A-Za-z]){10})/g;
const reUsername = /\B(\@\S{1,15}\b)/g;

type NonNullableField<T, K extends keyof T> = {
  [P in K]-?: T[P];
} & T;

function isFieldDefined<T, K extends keyof T>(key: K) {
  return function (value: T): value is NonNullableField<T, K> {
    return isDefined(value[key]);
  };
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value != null;
}

type ParseTweetResult =
  | { success: true; tweet: Tweet }
  | { success: false; err: Error };

export function parseTweet(
  timeline: TimelineRaw,
  id: string,
): ParseTweetResult {
  const tweets = timeline.globalObjects?.tweets ?? {};
  const tweet = tweets[id];
  if (tweet?.user_id_str == null) {
    return {
      success: false,
      err: new Error(`Tweet "${id}" was not found in the timeline object.`),
    };
  }

  const users = timeline.globalObjects?.users ?? {};
  const user = users[tweet.user_id_str];
  if (user?.screen_name == null) {
    return {
      success: false,
      err: new Error(`User "${tweet.user_id_str}" has no username data.`),
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

  const tw: Tweet = {
    id,
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
    permanentUrl: `https://twitter.com/${user.screen_name}/status/${id}`,
    photos,
    replies: tweet.reply_count,
    retweets: tweet.retweet_count,
    text: tweet.full_text,
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
    const quotedStatusResult = parseTweet(timeline, tweet.quoted_status_id_str);
    if (quotedStatusResult.success) {
      tw.isQuoted = true;
      tw.quotedStatus = quotedStatusResult.tweet;
    }
  }

  if (tweet.in_reply_to_status_id_str != null) {
    const replyStatusResult = parseTweet(
      timeline,
      tweet.in_reply_to_status_id_str,
    );
    if (replyStatusResult.success) {
      tw.isReply = true;
      tw.inReplyToStatus = replyStatusResult.tweet;
    }
  }

  if (tweet.retweeted_status_id_str != null) {
    const retweetedStatusResult = parseTweet(
      timeline,
      tweet.retweeted_status_id_str,
    );
    if (retweetedStatusResult.success) {
      tw.isRetweet = true;
      tw.retweetedStatus = retweetedStatusResult.tweet;
    }
  }

  const views = parseInt(tweet.ext_views?.count ?? '');
  if (!isNaN(views)) {
    tw.views = views;
  }

  if (pinnedTweets.has(tweet.conversation_id_str)) {
    // TODO: Update tests so this can be assigned at the tweet declaration
    tw.isPin = true;
  }

  if (sensitiveContent) {
    // TODO: Update tests so this can be assigned at the tweet declaration
    tw.sensitiveContent = true;
  }

  // HTML parsing with regex :)
  let html = tweet.full_text ?? '';

  const foundedMedia: string[] = [];

  html = html.replace(reHashtag, linkHashtagHtml);
  html = html.replace(reUsername, linkUsernameHtml);
  html = html.replace(reTwitterUrl, unwrapTcoUrlHtml(tweet, foundedMedia));

  for (const { url } of tw.photos) {
    if (foundedMedia.indexOf(url) !== -1) {
      continue;
    }

    html += `<br><img src="${url}"/>`;
  }

  for (const { preview: url } of tw.videos) {
    if (foundedMedia.indexOf(url) !== -1) {
      continue;
    }

    html += `<br><img src="${url}"/>`;
  }

  html = html.replace(/\n/g, '<br>');
  tw.html = html;

  return { success: true, tweet: tw };
}

function parseMediaGroups(media: TimelineMediaExtendedRaw[]): {
  sensitiveContent?: boolean;
  photos: Photo[];
  videos: Video[];
} {
  const photos: Photo[] = [];
  const videos: Video[] = [];
  let sensitiveContent: boolean | undefined = undefined;

  for (const m of media
    .filter(isFieldDefined('id_str'))
    .filter(isFieldDefined('media_url_https'))) {
    if (m.type === 'photo') {
      photos.push({
        id: m.id_str,
        url: m.media_url_https,
      });
    } else if (m.type === 'video') {
      videos.push(parseVideo(m));
    }

    const sensitive = m.ext_sensitive_media_warning;
    if (sensitive != null) {
      sensitiveContent =
        sensitive.adult_content ||
        sensitive.graphic_violence ||
        sensitive.other;
    }
  }

  return { sensitiveContent, photos, videos };
}

function parseVideo(
  m: NonNullableField<TimelineMediaExtendedRaw, 'id_str' | 'media_url_https'>,
): Video {
  const video: Video = {
    id: m.id_str,
    preview: m.media_url_https,
  };

  let maxBitrate = 0;
  const variants = m.video_info?.variants ?? [];
  for (const variant of variants) {
    const bitrate = variant.bitrate;
    if (bitrate != null && bitrate > maxBitrate && variant.url != null) {
      let variantUrl = variant.url;
      const stringStart = 0;
      const tagSuffixIdx = variantUrl.indexOf('?tag=10');
      if (tagSuffixIdx !== -1) {
        variantUrl = variantUrl.substring(stringStart, tagSuffixIdx + 1);
      }

      video.url = variantUrl;
      maxBitrate = bitrate;
    }
  }

  return video;
}

function linkHashtagHtml(hashtag: string) {
  return `<a href="https://twitter.com/hashtag/${hashtag.replace(
    '#',
    '',
  )}">${hashtag}</a>`;
}

function linkUsernameHtml(username: string) {
  return `<a href="https://twitter.com/${username[0].replace('@', '')}">${
    username[0]
  }</a>`;
}

function unwrapTcoUrlHtml(tweet: TimelineTweetRaw, foundedMedia: string[]) {
  return function (tco: string) {
    for (const entity of tweet.entities?.urls ?? []) {
      if (tco === entity.url && entity.expanded_url != null) {
        return `<a href="${entity.expanded_url}">${tco}</a>`;
      }
    }

    for (const entity of tweet.extended_entities?.media ?? []) {
      if (tco === entity.url && entity.media_url_https != null) {
        foundedMedia.push(entity.media_url_https);
        return `<br><a href="${tco}"><img src="${entity.media_url_https}"/></a>`;
      }
    }

    return tco;
  };
}

/**
 * A paginated tweets API response. The `next` field can be used to fetch the next page of results.
 */
export interface QueryTweetsResponse {
  tweets: Tweet[];
  next?: string;
}

export function parseTweets(timeline: TimelineRaw): QueryTweetsResponse {
  let cursor: string | undefined;
  let pinnedTweet: Tweet | undefined;
  let orderedTweets: Tweet[] = [];
  for (const instruction of timeline.timeline?.instructions ?? []) {
    const { pinEntry, addEntries, replaceEntry } = instruction;

    // Handle pin instruction
    const pinnedTweetId = pinEntry?.entry?.content?.item?.content?.tweet?.id;
    if (pinnedTweetId != null) {
      const tweetResult = parseTweet(timeline, pinnedTweetId);
      if (tweetResult.success) {
        pinnedTweet = tweetResult.tweet;
      }
    }

    // Handle add instructions
    for (const { content } of addEntries?.entries ?? []) {
      const tweetId = content?.item?.content?.tweet?.id;
      if (tweetId != null) {
        const tweetResult = parseTweet(timeline, tweetId);
        if (tweetResult.success) {
          orderedTweets.push(tweetResult.tweet);
        }
      }

      const operation = content?.operation;
      if (operation?.cursor?.cursorType === 'Bottom') {
        cursor = operation?.cursor?.value;
      }
    }

    // Handle replace instruction
    const operation = replaceEntry?.entry?.content?.operation;
    if (operation?.cursor?.cursorType === 'Bottom') {
      cursor = operation.cursor.value;
    }
  }

  if (pinnedTweet != null && orderedTweets.length > 0) {
    orderedTweets = [pinnedTweet, ...orderedTweets];
  }

  return {
    tweets: orderedTweets,
    next: cursor,
  };
}

/**
 * A paginated profiles API response. The `next` field can be used to fetch the next page of results.
 */
export interface QueryProfilesResponse {
  profiles: Profile[];
  next?: string;
}

export function parseUsers(timeline: TimelineRaw): QueryProfilesResponse {
  const users = new Map<string | undefined, Profile>();

  const userObjects = timeline.globalObjects?.users ?? {};
  for (const id in userObjects) {
    const legacy = userObjects[id];
    if (legacy == null) {
      continue;
    }

    const user = parseProfile(legacy);
    users.set(id, user);
  }

  let cursor: string | undefined;
  const orderedProfiles: Profile[] = [];
  for (const instruction of timeline.timeline?.instructions ?? []) {
    for (const entry of instruction.addEntries?.entries ?? []) {
      const userId = entry.content?.item?.content?.user?.id;
      const profile = users.get(userId);
      if (profile != null) {
        orderedProfiles.push(profile);
      }

      const operation = entry.content?.operation;
      if (operation?.cursor?.cursorType === 'Bottom') {
        cursor = operation?.cursor?.value;
      }
    }

    const operation = instruction.replaceEntry?.entry?.content?.operation;
    if (operation?.cursor?.cursorType === 'Bottom') {
      cursor = operation.cursor.value;
    }
  }

  return {
    profiles: orderedProfiles,
    next: cursor,
  };
}
