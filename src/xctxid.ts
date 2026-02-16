import fetch from 'cross-fetch';
import debug from 'debug';
import { CHROME_SEC_CH_UA, CHROME_USER_AGENT } from './api';

const log = debug('twitter-scraper:xctxid');

// @ts-expect-error import type annotation ("the current file is a CommonJS module")
type LinkeDOM = typeof import('linkedom');

let linkedom: LinkeDOM | null = null;
async function linkedomImport(): Promise<LinkeDOM> {
  if (!linkedom) {
    const mod = await import('linkedom');
    linkedom = mod;
    return mod;
  }
  return linkedom;
}

async function parseHTML(html: string): Promise<Window & typeof globalThis> {
  if (typeof window !== 'undefined') {
    const { defaultView } = new DOMParser().parseFromString(html, 'text/html');
    if (!defaultView) {
      throw new Error('Failed to get defaultView from parsed HTML.');
    }
    return defaultView;
  } else {
    const { DOMParser } = await linkedomImport();
    return new DOMParser().parseFromString(html, 'text/html').defaultView;
  }
}

// Copied from https://github.com/Lqm1/x-client-transaction-id/blob/main/utils.ts with minor tweaks to support us passing a custom fetch function
async function handleXMigration(fetchFn: typeof fetch): Promise<Document> {
  // Set headers to mimic a browser request
  const headers = {
    accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'accept-language': 'ja',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    priority: 'u=0, i',
    'sec-ch-ua': CHROME_SEC_CH_UA,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'user-agent': CHROME_USER_AGENT,
  };

  // Fetch X.com homepage
  const response = await fetchFn('https://x.com', {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch X homepage: ${response.statusText}`);
  }

  const htmlText = await response.text();

  // Parse HTML using linkedom
  let dom = await parseHTML(htmlText);
  let document = dom.window.document;

  // Check for migration redirection links
  const migrationRedirectionRegex = new RegExp(
    '(http(?:s)?://(?:www\\.)?(twitter|x){1}\\.com(/x)?/migrate([/?])?tok=[a-zA-Z0-9%\\-_]+)+',
    'i',
  );

  const metaRefresh = document.querySelector("meta[http-equiv='refresh']");
  const metaContent = metaRefresh
    ? metaRefresh.getAttribute('content') || ''
    : '';

  const migrationRedirectionUrl =
    migrationRedirectionRegex.exec(metaContent) ||
    migrationRedirectionRegex.exec(htmlText);

  if (migrationRedirectionUrl) {
    // Follow redirection URL
    const redirectResponse = await fetchFn(migrationRedirectionUrl[0]);

    if (!redirectResponse.ok) {
      throw new Error(
        `Failed to follow migration redirection: ${redirectResponse.statusText}`,
      );
    }

    const redirectHtml = await redirectResponse.text();
    dom = await parseHTML(redirectHtml);
    document = dom.window.document;
  }

  // Handle migration form if present
  const migrationForm =
    document.querySelector("form[name='f']") ||
    document.querySelector("form[action='https://x.com/x/migrate']");

  if (migrationForm) {
    const url =
      migrationForm.getAttribute('action') || 'https://x.com/x/migrate';
    const method = migrationForm.getAttribute('method') || 'POST';

    // Collect form input fields
    const requestPayload = new FormData();

    const inputFields = migrationForm.querySelectorAll('input');
    for (const element of Array.from(inputFields)) {
      const name = element.getAttribute('name');
      const value = element.getAttribute('value');
      if (name && value) {
        requestPayload.append(name, value);
      }
    }

    // Submit form using POST request
    const formResponse = await fetchFn(url, {
      method: method,
      body: requestPayload,
      headers,
    });

    if (!formResponse.ok) {
      throw new Error(
        `Failed to submit migration form: ${formResponse.statusText}`,
      );
    }

    const formHtml = await formResponse.text();
    dom = await parseHTML(formHtml);
    document = dom.window.document;
  }

  // Return final DOM document
  return document;
}

// Cache for the x.com document to avoid repeated fetches.
// The document is needed to generate transaction IDs but doesn't change frequently.
// We cache the Promise (not the result) to prevent concurrent calls from all fetching separately.
//
// NOTE: This cache is module-level and shared across ALL Scraper instances in the process.
// If multiple Scraper instances use different fetch functions or auth contexts, they will
// still share the same cached document. This is acceptable because the document content
// (JS bundle hashes for transaction ID generation) is the same regardless of auth state.
let cachedDocumentPromise: Promise<Document> | null = null;
let cachedDocumentTimestamp = 0;
const DOCUMENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Clear the cached x.com document. Useful for testing or when the cached
 * document may be stale (e.g., after a long-running process).
 */
export function clearDocumentCache(): void {
  cachedDocumentPromise = null;
  cachedDocumentTimestamp = 0;
}

async function getCachedDocument(fetchFn: typeof fetch): Promise<Document> {
  const now = Date.now();
  if (
    !cachedDocumentPromise ||
    now - cachedDocumentTimestamp > DOCUMENT_CACHE_TTL
  ) {
    log('Fetching fresh x.com document for transaction ID generation');
    cachedDocumentTimestamp = now;
    // Store the Promise immediately so concurrent calls share the same fetch
    cachedDocumentPromise = handleXMigration(fetchFn).catch((err) => {
      // On failure, clear the cache so the next call retries
      cachedDocumentPromise = null;
      throw err;
    });
  } else {
    log('Using cached x.com document for transaction ID generation');
  }
  return cachedDocumentPromise;
}

let ClientTransaction:
  | typeof import('x-client-transaction-id')['ClientTransaction']
  | null = null;
async function clientTransaction(): Promise<
  typeof import('x-client-transaction-id')['ClientTransaction']
> {
  if (!ClientTransaction) {
    const mod = await import('x-client-transaction-id');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ClientTransaction = mod.ClientTransaction as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mod.ClientTransaction as any;
  }
  return ClientTransaction;
}

export async function generateTransactionId(
  url: string,
  fetchFn: typeof fetch,
  method: 'GET' | 'POST',
) {
  const parsedUrl = new URL(url);
  const path = parsedUrl.pathname;

  log(`Generating transaction ID for ${method} ${path}`);

  const document = await getCachedDocument(fetchFn);
  const ClientTransactionClass = await clientTransaction();
  const transaction = await ClientTransactionClass.create(document);
  const transactionId = await transaction.generateTransactionId(method, path);
  log(`Transaction ID: ${transactionId}`);

  return transactionId;
}
