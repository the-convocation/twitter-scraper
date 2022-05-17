import { Profile } from './profile';
import { Scraper } from './scraper';

test('scraper can get profile', async () => {
  const expected: Profile = {
    avatar:
      'https://pbs.twimg.com/profile_images/436075027193004032/XlDa2oaz_normal.jpeg',
    banner: 'https://pbs.twimg.com/profile_banners/106037940/1541084318',
    biography: 'nothing',
    isPrivate: false,
    isVerified: false,
    joined: new Date(Date.UTC(2010, 0, 18, 8, 49, 30, 0)),
    location: 'Ukraine',
    name: 'Nomadic',
    pinnedTweetIds: [],
    url: 'https://twitter.com/nomadic_ua',
    userId: '106037940',
    username: 'nomadic_ua',
    website: 'https://nomadic.name',
  };

  const scraper = new Scraper();

  const actual = await scraper.getProfile('nomadic_ua');
  expect(actual.avatar).toEqual(expected.avatar);
  expect(actual.banner).toEqual(expected.banner);
  expect(actual.biography).toEqual(expected.biography);
  expect(actual.isPrivate).toEqual(expected.isPrivate);
  expect(actual.isVerified).toEqual(expected.isVerified);
  expect(actual.joined).toEqual(expected.joined);
  expect(actual.location).toEqual(expected.location);
  expect(actual.name).toEqual(expected.name);
  expect(actual.pinnedTweetIds).toEqual(expected.pinnedTweetIds);
  expect(actual.url).toEqual(expected.url);
  expect(actual.userId).toEqual(expected.userId);
  expect(actual.username).toEqual(expected.username);
  expect(actual.website).toEqual(expected.website);
});
