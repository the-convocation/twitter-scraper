import { Scraper } from './scraper';
import { mutationEndpoints } from './api-data';
import { getScraper } from './test-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockJsonResponse(body: unknown, status = 200): Response {
  const headers = {
    get: (name: string) =>
      name.toLowerCase() === 'content-type' ? 'application/json' : null,
    getSetCookie: () => [] as string[],
  };
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

interface CapturedRequest {
  url: string;
  method: string;
  body: Record<string, unknown>;
  contentType: string | null;
}

/**
 * Builds a Scraper with a mock fetch that:
 *  - answers guest/activate automatically
 *  - answers media/upload automatically (returns media_id_string 'mock_media_id')
 *  - captures every other request and returns { data: {} }
 *
 * Returns the scraper and an array of captured mutation requests.
 */
async function createMockScraper(): Promise<{
  scraper: Scraper;
  captured: CapturedRequest[];
}> {
  const captured: CapturedRequest[] = [];

  const mockFetch = async (
    url: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const urlStr = typeof url === 'string' ? url : (url as URL).toString();

    if (urlStr.includes('guest/activate')) {
      return mockJsonResponse({ guest_token: 'mock_guest_token' });
    }

    if (urlStr.includes('media/upload')) {
      return mockJsonResponse({ media_id_string: 'mock_media_id' });
    }

    // Extract content-type header regardless of how headers is typed
    let contentType: string | null = null;
    const rawHeaders = init?.headers;
    if (
      rawHeaders &&
      typeof (rawHeaders as { get?: unknown }).get === 'function'
    ) {
      contentType = (rawHeaders as { get: (k: string) => string | null }).get(
        'content-type',
      );
    } else if (rawHeaders && typeof rawHeaders === 'object') {
      const rec = rawHeaders as Record<string, string>;
      contentType = rec['content-type'] ?? rec['Content-Type'] ?? null;
    }

    captured.push({
      url: urlStr,
      method: (init?.method ?? 'GET').toUpperCase(),
      body: JSON.parse((init?.body as string | undefined) ?? '{}'),
      contentType,
    });

    return mockJsonResponse({ data: {} });
  };

  const scraper = new Scraper({
    fetch: mockFetch as typeof fetch,
  });

  await scraper.setCookies([]);

  return { scraper, captured };
}

// ---------------------------------------------------------------------------
// mutationEndpoints constants
// ---------------------------------------------------------------------------

describe('mutationEndpoints', () => {
  test('CreateTweet queryId is embedded in the URL', () => {
    expect(mutationEndpoints.CreateTweet.url).toContain(
      mutationEndpoints.CreateTweet.queryId,
    );
    expect(mutationEndpoints.CreateTweet.url).toContain('CreateTweet');
  });
});

// ---------------------------------------------------------------------------
// sendTweet
// ---------------------------------------------------------------------------

describe('sendTweet', () => {
  test('sends POST to CreateTweet URL with correct queryId', async () => {
    const { scraper, captured } = await createMockScraper();
    await scraper.sendTweet('Hello world!');

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe(mutationEndpoints.CreateTweet.url);
    expect(captured[0].method).toBe('POST');
    expect(captured[0].body.queryId).toBe(
      mutationEndpoints.CreateTweet.queryId,
    );
  });

  test('includes tweet_text in variables', async () => {
    const { scraper, captured } = await createMockScraper();
    await scraper.sendTweet('My test tweet');

    const vars = captured[0].body.variables as Record<string, unknown>;
    expect(vars.tweet_text).toBe('My test tweet');
    expect(vars.disallowed_reply_options).toBeNull();
  });

  test('sets reply when replyToTweetId is provided', async () => {
    const { scraper, captured } = await createMockScraper();
    await scraper.sendTweet('Replying!', '1234567890123456789');

    const vars = captured[0].body.variables as Record<string, unknown>;
    expect(vars.reply).toEqual({
      in_reply_to_tweet_id: '1234567890123456789',
    });
  });

  test('does not set reply when replyToTweetId is omitted', async () => {
    const { scraper, captured } = await createMockScraper();
    await scraper.sendTweet('Plain tweet');

    const vars = captured[0].body.variables as Record<string, unknown>;
    expect(vars.reply).toBeUndefined();
  });

  test('sets card_uri when hideLinkPreview is true', async () => {
    const { scraper, captured } = await createMockScraper();
    await scraper.sendTweet('No preview', undefined, undefined, true);

    const vars = captured[0].body.variables as Record<string, unknown>;
    expect(vars.card_uri).toBe('tombstone://card');
  });

  test('does not set card_uri when hideLinkPreview is false', async () => {
    const { scraper, captured } = await createMockScraper();
    await scraper.sendTweet('With preview', undefined, undefined, false);

    const vars = captured[0].body.variables as Record<string, unknown>;
    expect(vars.card_uri).toBeUndefined();
  });

  test('uploads media and populates media_entities', async () => {
    const { scraper, captured } = await createMockScraper();
    await scraper.sendTweet('With image', undefined, [
      { data: Buffer.from('fake-image'), mediaType: 'image/jpeg' },
    ]);

    // One media/upload request + one mutation request
    expect(captured).toHaveLength(1); // media/upload is handled silently by mock
    const vars = captured[0].body.variables as Record<string, unknown>;
    const media = vars.media as Record<string, unknown>;
    expect(media.media_entities).toEqual([
      { media_id: 'mock_media_id', tagged_users: [] },
    ]);
  });

  test('uploads multiple media items', async () => {
    const { scraper, captured } = await createMockScraper();
    await scraper.sendTweet('Two images', undefined, [
      { data: Buffer.from('img1'), mediaType: 'image/jpeg' },
      { data: Buffer.from('img2'), mediaType: 'image/png' },
    ]);

    const vars = captured[0].body.variables as Record<string, unknown>;
    const media = vars.media as Record<string, unknown>;
    expect((media.media_entities as unknown[]).length).toBe(2);
  });

  test('sends content-type application/json', async () => {
    const { scraper, captured } = await createMockScraper();
    await scraper.sendTweet('Hello');

    expect(captured[0].contentType).toBe('application/json');
  });
});

// ---------------------------------------------------------------------------
// Integration tests — only run when TWITTER_TEST_MUTATIONS=true is set
// ---------------------------------------------------------------------------

const testMutation = process.env['TWITTER_TEST_MUTATIONS'] ? test : test.skip;

testMutation(
  'scraper can send a tweet',
  async () => {
    const scraper = await getScraper();
    const tweet = await scraper.sendTweet(
      `[automated test] ${new Date().toISOString()}`,
    );
    console.log('[sendTweet] result:', JSON.stringify(tweet, null, 2));
    expect(tweet).not.toBeNull();
    expect(tweet?.id).toBeDefined();
    expect(tweet?.text).toBeDefined();
  },
  30000,
);

testMutation(
  'scraper can send a reply',
  async () => {
    const scraper = await getScraper();
    const parent = await scraper.sendTweet(
      `[automated test - parent] ${new Date().toISOString()}`,
    );
    console.log('[sendTweet/parent] result:', JSON.stringify(parent, null, 2));
    expect(parent).not.toBeNull();
    expect(parent?.id).toBeDefined();

    const reply = await scraper.sendTweet(
      `[automated test - reply] ${new Date().toISOString()}`,
      parent!.id,
    );
    console.log('[sendTweet/reply] result:', JSON.stringify(reply, null, 2));
    expect(reply).not.toBeNull();
    expect(reply?.inReplyToStatusId).toBe(parent!.id);
  },
  30000,
);
