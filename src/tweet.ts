export interface Video {
  id: string;
  preview: string;
  url?: string;
}

export interface PlaceRaw {
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

export interface Tweet {
  hashtags: string[];
  html?: string;
  id?: string;
  inReplyToStatus?: Tweet;
  isQuoted?: boolean;
  isPin?: boolean;
  isReply?: boolean;
  isRetweet?: boolean;
  likes?: number;
  permanentUrl?: string;
  photos: string[];
  place?: PlaceRaw;
  quotedStatus?: Tweet;
  replies?: number;
  retweets?: number;
  retweetedStatus?: Tweet;
  text?: string;
  timeParsed?: Date;
  timestamp?: number;
  urls: string[];
  userId?: string;
  username?: string;
  videos: Video[];
  sensitiveContent?: boolean;
}
