import { Scraper } from './scraper';
import { Mention, Tweet } from './tweets';

test('scraper can get tweet', async () => {
  const expected: Tweet = {
    conversationId: '1328684389388185600',
    html: `That thing you didn’t Tweet but wanted to but didn’t but got so close but then were like nah. <br><br>We have a place for that now—Fleets! <br><br>Rolling out to everyone starting today. <br><a href=\"https://t.co/auQAHXZMfH\"><img src=\"https://pbs.twimg.com/amplify_video_thumb/1328684333599756289/img/cP5KwbIXbGunNSBy.jpg\"/></a>`,
    id: '1328684389388185600',
    hashtags: [],
    mentions: [],
    name: 'Twitter',
    permanentUrl: 'https://twitter.com/Twitter/status/1328684389388185600',
    photos: [],
    text: 'That thing you didn’t Tweet but wanted to but didn’t but got so close but then were like nah. \n\nWe have a place for that now—Fleets! \n\nRolling out to everyone starting today. https://t.co/auQAHXZMfH',
    thread: [],
    timeParsed: new Date(Date.UTC(2020, 10, 17, 13, 0, 18, 0)),
    timestamp: 1605618018,
    urls: [],
    userId: '783214',
    username: 'Twitter',
    videos: [
      {
        id: '1328684333599756289',
        preview:
          'https://pbs.twimg.com/amplify_video_thumb/1328684333599756289/img/cP5KwbIXbGunNSBy.jpg',
        url: 'https://video.twimg.com/amplify_video/1328684333599756289/vid/960x720/PcL8yv8KhgQ48Qpt.mp4?tag=13',
      },
    ],
    isQuoted: false,
    isReply: false,
    isRetweet: false,
    isPin: false,
    sensitiveContent: false,
  };

  const scraper = new Scraper();
  const actual = await scraper.getTweet('1328684389388185600');
  delete actual?.likes;
  delete actual?.replies;
  delete actual?.retweets;
  delete actual?.views;
  expect(expected).toEqual(actual);
});

test('scraper can get tweets without logging in', async () => {
  const scraper = new Scraper();

  const sampleSize = 5;
  const tweets = scraper.getTweets('elonmusk', sampleSize);

  let counter = 0;
  for await (const tweet of tweets) {
    if (tweet?.permanentUrl) {
      counter++;
    }
  }

  expect(counter).toBe(sampleSize);
});

test('scraper can get latest tweet', async () => {
  const scraper = new Scraper();

  // OLD APPROACH (without retweet filtering)
  const tweets = scraper.getTweets('elonmusk', 1);
  const expected = (await tweets.next()).value;

  // NEW APPROACH
  const latest = (await scraper.getLatestTweet(
    'elonmusk',
    expected?.isRetweet || false,
  )) as Tweet;

  expect(expected?.permanentUrl).toEqual(latest?.permanentUrl);
}, 30000);

test('scraper can get user mentions in tweets', async () => {
  const expected: Mention[] = [
    {
      id: '7018222',
      username: 'davidmcraney',
      name: 'David McRaney',
    },
  ];

  const scraper = new Scraper();
  const tweet = await scraper.getTweet('1554522888904101890');
  expect(expected).toEqual(tweet?.mentions);
});

test('scraper can get tweet quotes and replies', async () => {
  const expected: Tweet = {
    conversationId: '1237110546383724547',
    html: `The Easiest Problem Everyone Gets Wrong <br><br>[new video] --&gt; <a href=\"https://youtu.be/ytfCdqWhmdg\">https://t.co/YdaeDYmPAU</a> <br><a href=\"https://t.co/iKu4Xs6o2V\"><img src=\"https://pbs.twimg.com/media/ESsZa9AXgAIAYnF.jpg\"/></a>`,
    id: '1237110546383724547',
    hashtags: [],
    mentions: [],
    name: 'Vsauce2',
    permanentUrl: 'https://twitter.com/VsauceTwo/status/1237110546383724547',
    photos: [
      {
        id: '1237110473486729218',
        url: 'https://pbs.twimg.com/media/ESsZa9AXgAIAYnF.jpg',
      },
    ],
    text: 'The Easiest Problem Everyone Gets Wrong \n\n[new video] --&gt; https://t.co/YdaeDYmPAU https://t.co/iKu4Xs6o2V',
    thread: [],
    timeParsed: new Date(Date.UTC(2020, 2, 9, 20, 18, 33, 0)),
    timestamp: 1583785113,
    urls: ['https://youtu.be/ytfCdqWhmdg'],
    userId: '978944851',
    username: 'VsauceTwo',
    videos: [],
    isQuoted: false,
    isReply: false,
    isRetweet: false,
    isPin: false,
    sensitiveContent: false,
  };

  const scraper = new Scraper();
  const quote = await scraper.getTweet('1237110897597976576');
  expect(quote?.isQuoted).toBeTruthy();
  delete quote?.quotedStatus?.likes;
  delete quote?.quotedStatus?.replies;
  delete quote?.quotedStatus?.retweets;
  delete quote?.quotedStatus?.views;
  expect(expected).toEqual(quote?.quotedStatus);

  const reply = await scraper.getTweet('1237111868445134850');
  expect(reply?.isReply).toBeTruthy();
  if (reply != null) {
    reply.isReply = false;
  }
  delete reply?.inReplyToStatus?.likes;
  delete reply?.inReplyToStatus?.replies;
  delete reply?.inReplyToStatus?.retweets;
  delete reply?.inReplyToStatus?.views;
  expect(expected).toEqual(reply?.inReplyToStatus);
});

test('scraper can get retweet', async () => {
  const expected: Tweet = {
    conversationId: '1359151057872580612',
    html: `We’ve seen an increase in attacks against Asian communities and individuals around the world. It’s important to know that this isn’t new; throughout history, Asians have experienced violence and exclusion. However, their diverse lived experiences have largely been overlooked.`,
    id: '1359151057872580612',
    hashtags: [],
    mentions: [],
    name: 'Twitter Together',
    permanentUrl:
      'https://twitter.com/TwitterTogether/status/1359151057872580612',
    photos: [],
    text: 'We’ve seen an increase in attacks against Asian communities and individuals around the world. It’s important to know that this isn’t new; throughout history, Asians have experienced violence and exclusion. However, their diverse lived experiences have largely been overlooked.',
    thread: [],
    timeParsed: new Date(Date.UTC(2021, 1, 9, 14, 43, 58, 0)),
    timestamp: 1612881838,
    urls: [],
    userId: '773578328498372608',
    username: 'TwitterTogether',
    videos: [],
    isQuoted: false,
    isReply: false,
    isRetweet: false,
    isPin: false,
    sensitiveContent: false,
  };

  const scraper = new Scraper();
  const retweet = await scraper.getTweet('1362849141248974853');
  expect(retweet?.isRetweet).toBeTruthy();
  delete retweet?.retweetedStatus?.likes;
  delete retweet?.retweetedStatus?.replies;
  delete retweet?.retweetedStatus?.retweets;
  delete retweet?.retweetedStatus?.views;
  expect(expected).toEqual(retweet?.retweetedStatus);
});

test('scraper can get tweet views', async () => {
  const expected: Tweet = {
    conversationId: '1606055187348688896',
    html: `Replies and likes don’t tell the whole story. We’re making it easier to tell *just* how many people have seen your Tweets with the addition of view counts, shown right next to likes. Now on iOS and Android, web coming soon.<br><br><a href=\"https://help.twitter.com/using-twitter/view-counts\">https://t.co/hrlMQyXJfx</a>`,
    id: '1606055187348688896',
    hashtags: [],
    mentions: [],
    name: 'Twitter Support',
    permanentUrl:
      'https://twitter.com/TwitterSupport/status/1606055187348688896',
    photos: [],
    text: 'Replies and likes don’t tell the whole story. We’re making it easier to tell *just* how many people have seen your Tweets with the addition of view counts, shown right next to likes. Now on iOS and Android, web coming soon.\n\nhttps://t.co/hrlMQyXJfx',
    thread: [],
    timeParsed: new Date(Date.UTC(2022, 11, 22, 22, 32, 50, 0)),
    timestamp: 1671748370,
    urls: ['https://help.twitter.com/using-twitter/view-counts'],
    userId: '17874544',
    username: 'TwitterSupport',
    videos: [],
    isQuoted: false,
    isReply: false,
    isRetweet: false,
    isPin: false,
    sensitiveContent: false,
  };

  const scraper = new Scraper();
  const actual = await scraper.getTweet('1606055187348688896');
  expect(actual?.views).toBeTruthy();
  delete actual?.likes;
  delete actual?.replies;
  delete actual?.retweets;
  delete actual?.views;
  expect(expected).toEqual(actual);
});

test('scraper can get tweet thread', async () => {
  const scraper = new Scraper();
  const tweet = await scraper.getTweet('1665602315745673217');
  expect(tweet).not.toBeNull();
  expect(tweet?.isSelfThread).toBeTruthy();
  expect(tweet?.thread.length).toStrictEqual(7);
});
