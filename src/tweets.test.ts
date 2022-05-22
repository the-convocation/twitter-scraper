import { Scraper } from './scraper';
import { Tweet } from './tweets';

test('scraper can get tweet', async () => {
  const expected: Tweet = {
    html: `That thing you didn’t Tweet but wanted to but didn’t but got so close but then were like nah. <br><br>We have a place for that now—Fleets! <br><br>Rolling out to everyone starting today. <br><a href=\"https://t.co/auQAHXZMfH\"><img src=\"https://pbs.twimg.com/amplify_video_thumb/1328684333599756289/img/cP5KwbIXbGunNSBy.jpg\"/></a>`,
    id: '1328684389388185600',
    hashtags: [],
    permanentUrl: 'https://twitter.com/Twitter/status/1328684389388185600',
    photos: [
      'https://pbs.twimg.com/amplify_video_thumb/1328684333599756289/img/cP5KwbIXbGunNSBy.jpg',
    ],
    text: 'That thing you didn’t Tweet but wanted to but didn’t but got so close but then were like nah. \n\nWe have a place for that now—Fleets! \n\nRolling out to everyone starting today. https://t.co/auQAHXZMfH',
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
  };

  const scraper = new Scraper();
  const actual = await scraper.getTweet('1328684389388185600', false);
  delete actual?.likes;
  delete actual?.replies;
  delete actual?.retweets;
  expect(expected).toEqual(actual);
});
