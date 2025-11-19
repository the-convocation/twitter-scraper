import fetch from 'cross-fetch';
import debug from 'debug';

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
    'sec-ch-ua':
      '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
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
    const redirectResponse = await fetch(migrationRedirectionUrl[0]);

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
    const formResponse = await fetch(url, {
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
  const document = await handleXMigration(fetchFn);
  const ClientTransactionClass = await clientTransaction();
  const transaction = await ClientTransactionClass.create(document);
  const transactionId = await transaction.generateTransactionId(method, path);
  log(`Transaction ID: ${transactionId}`);

  return transactionId;
}
