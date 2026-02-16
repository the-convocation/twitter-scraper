import { Scraper } from './scraper';

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
