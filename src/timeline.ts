import { LegacyUserRaw, parseProfile, Profile } from './profile';
import { PlaceRaw } from './tweet';

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
  extendedEntities?: {
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

export interface TimelineDataRawGlobalObjects {
  tweets: { [key: string]: TimelineTweetRaw };
  users: { [key: string]: LegacyUserRaw };
}

export interface TimelineDataRaw {
  instructions: {
    addEntries?: {
      entries?: {
        content?: {
          item?: {
            content?: {
              tweet?: {
                id?: string;
              };
              user?: {
                id?: string;
              };
            };
          };
          operation?: {
            cursor?: {
              value: string;
              cursorType: string;
            };
          };
          timelineModule?: {
            items?: {
              item?: {
                clientEventInfo?: {
                  details?: {
                    guideDetails?: {
                      transparentGuideDetails?: {
                        trendMetadata?: {
                          trendName: string;
                        };
                      };
                    };
                  };
                };
              };
            }[];
          };
        };
      }[];
    };
    pinEntry?: {
      entry?: {
        content?: {
          item?: {
            content?: {
              tweet?: {
                id: string;
              };
            };
          };
        };
      };
    };
    replaceEntry?: {
      entry?: {
        content?: {
          operation?: {
            cursor?: {
              value: string;
              cursorType: string;
            };
          };
        };
      };
    };
  }[];
}

export interface TimelineRaw {
  globalObjects: TimelineDataRawGlobalObjects;
  timeline: TimelineDataRaw;
}

export function parseUsers(
  timeline: TimelineRaw,
): [Profile[], string | undefined] {
  const users = new Map<string | undefined, Profile>();

  for (const id in timeline.globalObjects.users) {
    const user = parseProfile(timeline.globalObjects.users[id]);
    users.set(id, user);
  }

  let cursor: string | undefined;
  const orderedProfiles: Profile[] = [];
  for (const instruction of timeline.timeline.instructions) {
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

  return [orderedProfiles, cursor];
}
