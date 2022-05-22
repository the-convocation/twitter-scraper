import { LegacyUserRaw, parseProfile, Profile } from './profile';
import { PlaceRaw, Tweet, Video } from './tweets';

export interface Hashtag {
  text?: string;
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

export function parseTweet(timeline: TimelineRaw, id: string): Tweet | null {
  const tweets = timeline.globalObjects?.tweets ?? {};
  const tweet = tweets[id];
  if (tweet == null || tweet.user_id_str == null) {
    return null;
  }

  const users = timeline.globalObjects?.users ?? {};
  const user = users[tweet.user_id_str];
  const username = user?.screen_name;
  if (user == null || username == null) {
    // TODO: change the return type to a result, and return an error; this shouldn't happen, but we don't know what data we're dealing with.
    return null;
  }

  const tw: Tweet = {
    id,
    hashtags: [],
    likes: tweet.favorite_count,
    permanentUrl: `https://twitter.com/${username}/status/${id}`,
    photos: [],
    replies: tweet.reply_count,
    retweets: tweet.retweet_count,
    text: tweet.full_text,
    urls: [],
    userId: tweet.user_id_str,
    username,
    videos: [],
  };

  if (tweet.created_at != null) {
    tw.timeParsed = new Date(Date.parse(tweet.created_at));
    tw.timestamp = Math.floor(tw.timeParsed.valueOf() / 1000);
  }

  if (tweet.place?.id != null) {
    tw.place = tweet.place;
  }

  if (tweet.quoted_status_id_str != null) {
    const quotedStatus = parseTweet(timeline, tweet.quoted_status_id_str);
    if (quotedStatus != null) {
      tw.isQuoted = true;
      tw.quotedStatus = quotedStatus;
    }
  }

  if (tweet.in_reply_to_status_id_str != null) {
    const replyStatus = parseTweet(timeline, tweet.in_reply_to_status_id_str);
    if (replyStatus != null) {
      tw.isReply = true;
      tw.inReplyToStatus = replyStatus;
    }
  }

  if (tweet.retweeted_status_id_str != null) {
    const retweetedStatus = parseTweet(timeline, tweet.retweeted_status_id_str);
    if (retweetedStatus != null) {
      tw.isRetweet = true;
      tw.retweetedStatus = retweetedStatus;
    }
  }

  const pinnedTweets = user.pinned_tweet_ids_str ?? [];
  for (const pinned of pinnedTweets) {
    if (tweet.conversation_id_str == pinned) {
      tw.isPin = true;
      break;
    }
  }

  const hashtags = tweet.entities?.hashtags ?? [];
  for (const hashtag of hashtags) {
    if (hashtag.text != null) {
      tw.hashtags.push(hashtag.text);
    }
  }

  const media = tweet.extended_entities?.media ?? [];
  for (const m of media) {
    if (m.media_url_https == null) {
      continue;
    }

    if (m.type === 'photo') {
      tw.photos.push(m.media_url_https);
    } else if (m.type === 'video' && m.id_str != null) {
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

      tw.photos.push(video.preview);
      tw.videos.push(video);
    }

    const sensitive = m.ext_sensitive_media_warning;
    if (sensitive != null) {
      tw.sensitiveContent =
        sensitive.adult_content ||
        sensitive.graphic_violence ||
        sensitive.other;
    }
  }

  const urls = tweet.entities?.urls ?? [];
  for (const url of urls) {
    if (url?.expanded_url != null) {
      tw.urls.push(url.expanded_url);
    }
  }

  // HTML parsing with regex :)
  let html = tweet.full_text ?? '';

  html = html.replace(reHashtag, (hashtag) => {
    return `<a href="https://twitter.com/hashtag/${hashtag.replace(
      '#',
      '',
    )}">${hashtag}</a>`;
  });

  html = html.replace(reUsername, (username) => {
    return `<a href="https://twitter.com/${username[0].replace('@', '')}">${
      username[0]
    }</a>`;
  });

  const foundedMedia: string[] = [];

  html = html.replace(reTwitterUrl, (tco) => {
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
  });

  for (const url of tw.photos) {
    if (foundedMedia.indexOf(url) !== -1) {
      continue;
    }

    html += `<br><img src="${url}"/>`;
  }

  html = html.replace(/\n/g, '<br>');
  tw.html = html;

  return tw;
}

export interface QueryTweetsResponse {
  tweets: Tweet[];
  next?: string;
}

export function parseTweets(timeline: TimelineRaw): QueryTweetsResponse {
  let cursor: string | undefined;
  let pinnedTweet: Tweet | undefined;
  let orderedTweets: Tweet[] = [];
  for (const instruction of timeline.timeline?.instructions ?? []) {
    const pinnedTweetId =
      instruction.pinEntry?.entry?.content?.item?.content?.tweet?.id;
    if (pinnedTweetId != null) {
      const tweet = parseTweet(timeline, pinnedTweetId);
      if (tweet != null) {
        pinnedTweet = tweet;
      }
    }

    for (const entry of instruction.addEntries?.entries ?? []) {
      const tweetId = entry.content?.item?.content?.tweet?.id;
      if (tweetId != null) {
        const tweet = parseTweet(timeline, tweetId);
        if (tweet != null) {
          orderedTweets.push(tweet);
        }
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

  if (pinnedTweet != null && orderedTweets.length > 0) {
    orderedTweets = [pinnedTweet, ...orderedTweets];
  }

  return {
    tweets: orderedTweets,
    next: cursor,
  };
}

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
      const profile = users.get(entry.content?.item?.content?.user?.id);
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
