import { Cookie } from 'tough-cookie';
import { Scraper } from './scraper';

describe('setCookies', () => {
  it('should normalize cookie objects with leading-dot domains', async () => {
    const scraper = new Scraper();
    const cookie = Cookie.fromJSON({
      key: 'ct0',
      value: 'test_csrf_token',
      domain: '.x.com',
    });
    expect(cookie).not.toBeNull();

    // Domain starts with a dot — setCookies should strip it
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(cookie!.domain).toBe('.x.com');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await scraper.setCookies([cookie!]);

    const cookies = await scraper.getCookies();
    const ct0 = cookies.find((c) => c.key === 'ct0');
    expect(ct0).toBeDefined();
    expect(ct0?.domain).toBe('x.com');
    expect(ct0?.value).toBe('test_csrf_token');
  });

  it('should parse string cookies correctly', async () => {
    const scraper = new Scraper();
    await scraper.setCookies([
      'ct0=abc123; Domain=x.com; Path=/',
      'auth_token=xyz789; Domain=x.com; Path=/; HttpOnly',
    ]);

    const cookies = await scraper.getCookies();
    expect(cookies.find((c) => c.key === 'ct0')?.value).toBe('abc123');
    expect(cookies.find((c) => c.key === 'auth_token')?.value).toBe('xyz789');
  });

  it('should skip null cookies gracefully', async () => {
    const scraper = new Scraper();
    // Array contains null/undefined entries that should be skipped
    await scraper.setCookies([
      null as unknown as string,
      'ct0=test_value; Domain=x.com; Path=/',
      undefined as unknown as string,
    ]);

    const cookies = await scraper.getCookies();
    expect(cookies).toHaveLength(1);
    expect(cookies[0].key).toBe('ct0');
    expect(cookies[0].value).toBe('test_value');
  });
});

test('scraper uses request transform when provided', async () => {
  const scraper = new Scraper({
    transform: {
      // Should throw "TypeError: Only absolute URLs are supported"
      request: () => [''],
    },
  });

  await expect(scraper.getLatestTweet('twitter')).rejects.toThrowError(
    TypeError,
  );
});

test('scraper uses response transform when provided', async () => {
  const scraper = new Scraper({
    transform: {
      response: (response) =>
        new Proxy(response, {
          get(target, p, receiver) {
            if (p === 'status') {
              return 400;
            }

            if (p === 'ok') {
              return false;
            }

            return Reflect.get(target, p, receiver);
          },
        }),
    },
  });

  await expect(scraper.getLatestTweet('twitter')).rejects.toThrowError();
});
