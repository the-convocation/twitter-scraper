import { Scraper } from './scraper';
import { Mention, Tweet } from './tweets';

test('scraper can get tweet', async () => {
  const expected: Tweet = {
    conversationId: '1585338303800578049',
    html: `We’re updating Twitter’s sounds to help make them pleasing to more people, including those with sensory sensitivities. Here’s more on how we did it:<br><a href=\"https://blog.twitter.com/en_us/topics/product/2022/designing-accessible-sounds-story-behind-our-new-chirps\">https://t.co/7FKWk7NzHM</a>`,
    id: '1585338303800578049',
    hashtags: [],
    mentions: [],
    name: 'A11y',
    permanentUrl: 'https://twitter.com/XA11y/status/1585338303800578049',
    photos: [],
    text: 'We’re updating Twitter’s sounds to help make them pleasing to more people, including those with sensory sensitivities. Here’s more on how we did it:\nhttps://t.co/7FKWk7NzHM',
    thread: [],
    timeParsed: new Date(Date.UTC(2022, 9, 26, 18, 31, 20, 0)),
    timestamp: 1666809080,
    urls: [
      'https://blog.twitter.com/en_us/topics/product/2022/designing-accessible-sounds-story-behind-our-new-chirps',
    ],
    userId: '1631299117',
    username: 'XA11y',
    videos: [],
    isQuoted: false,
    isReply: false,
    isRetweet: false,
    isPin: false,
    sensitiveContent: false,
  };

  const scraper = new Scraper();
  const actual = await scraper.getTweet('1585338303800578049');
  delete actual?.likes;
  delete actual?.replies;
  delete actual?.retweets;
  delete actual?.views;
  expect(actual).toEqual(expected);
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

test('scraper can get first tweet matching query', async () => {
  const scraper = new Scraper();

  const timeline = scraper.getTweets('elonmusk');
  const latestQuote = await scraper.getTweetWhere(timeline, { isQuoted: true });

  expect(latestQuote?.isQuoted).toBeTruthy();
});

test('scraper can get all tweets matching query', async () => {
  const scraper = new Scraper();

  // Sample size of 20 should be enough without taking long.
  const timeline = scraper.getTweets('elonmusk', 20);
  const retweets = await scraper.getTweetsWhere(
    timeline,
    (tweet) => tweet.isRetweet === true,
  );

  expect(retweets).toBeTruthy();

  for (const tweet of retweets) {
    expect(tweet.isRetweet).toBe(true);
  }
}, 20000);

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
  const retweet = await scraper.getTweet('1685032881872330754');
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
    name: 'Support',
    permanentUrl: 'https://twitter.com/Support/status/1606055187348688896',
    photos: [],
    text: 'Replies and likes don’t tell the whole story. We’re making it easier to tell *just* how many people have seen your Tweets with the addition of view counts, shown right next to likes. Now on iOS and Android, web coming soon.\n\nhttps://t.co/hrlMQyXJfx',
    thread: [],
    timeParsed: new Date(Date.UTC(2022, 11, 22, 22, 32, 50, 0)),
    timestamp: 1671748370,
    urls: ['https://help.twitter.com/using-twitter/view-counts'],
    userId: '17874544',
    username: 'Support',
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
