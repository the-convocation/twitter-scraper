import { LegacyUserRaw } from './profile';
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
  instructions?: {
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
              value?: string;
              cursorType?: string;
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
                          trendName?: string;
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
                id?: string;
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
              value?: string;
              cursorType?: string;
            };
          };
        };
      };
    };
  }[];
}

export interface TimelineRaw {
  globalObjects?: TimelineDataRawGlobalObjects;
  timeline?: TimelineDataRaw;
}
