import initCycleTLS from 'cycletls';
import { Headers } from 'headers-polyfill';
import debug from 'debug';
import {
  CHROME_USER_AGENT,
  CHROME_JA3,
  CHROME_JA4R,
  CHROME_HTTP2_FINGERPRINT,
  CHROME_HEADER_ORDER,
} from './chrome-fingerprint';

const log = debug('twitter-scraper:cycletls');

let cycleTLSInstance: Awaited<ReturnType<typeof initCycleTLS>> | null = null;

/**
 * Initialize the CycleTLS instance. This should be called once before using the fetch wrapper.
 */
export async function initCycleTLSFetch() {
  if (!cycleTLSInstance) {
    log('Initializing CycleTLS...');
    cycleTLSInstance = await initCycleTLS();
    log('CycleTLS initialized successfully');
  }
  return cycleTLSInstance;
}

/**
 * Cleanup the CycleTLS instance. Call this when you're done making requests.
 */
export function cycleTLSExit() {
  if (cycleTLSInstance) {
    log('Exiting CycleTLS...');
    cycleTLSInstance.exit();
    cycleTLSInstance = null;
  }
}

/**
 * A fetch-compatible wrapper around CycleTLS that mimics Chrome's TLS fingerprint
 * to bypass Cloudflare and other bot detection systems.
 */
export async function cycleTLSFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const instance = await initCycleTLSFetch();

  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;
  const method = (init?.method || 'GET').toUpperCase();

  log(`Making ${method} request to ${url}`);

  // Extract headers from RequestInit
  const headers: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(init.headers)) {
      init.headers.forEach(([key, value]) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, init.headers);
    }
  }

  // Convert body to string if needed
  let body: string | undefined;
  if (init?.body) {
    if (typeof init.body === 'string') {
      body = init.body;
    } else if (init.body instanceof URLSearchParams) {
      body = init.body.toString();
    } else {
      body = init.body.toString();
    }
  }

  // All Chrome fingerprint constants imported from chrome-fingerprint.ts
  const options = {
    body,
    headers,
    ja3: CHROME_JA3,
    ja4r: CHROME_JA4R,
    http2Fingerprint: CHROME_HTTP2_FINGERPRINT,
    headerOrder: CHROME_HEADER_ORDER,
    orderAsProvided: true,
    disableGrease: false,
    userAgent: headers['user-agent'] || CHROME_USER_AGENT,
  };

  try {
    const response = await instance(
      url,
      options,
      method.toLowerCase() as
        | 'get'
        | 'post'
        | 'put'
        | 'delete'
        | 'patch'
        | 'head'
        | 'options',
    );

    // Convert CycleTLS response to fetch Response
    // CycleTLS returns headers as an object
    const responseHeaders = new Headers();
    if (response.headers) {
      Object.entries(response.headers).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((v) => {
            responseHeaders.append(key, v);
          });
        } else if (typeof value === 'string') {
          responseHeaders.set(key, value);
        }
      });
    }

    // Get response body - cycletls provides helper methods, but we need the raw text
    // The response object has a text() method that returns the body as text
    let responseBody = '';
    if (typeof response.text === 'function') {
      responseBody = await response.text();
    } else if ((response as any).body) {
      responseBody = (response as any).body;
    }

    // Create a proper Response object using standard Response constructor
    const fetchResponse = new Response(responseBody, {
      status: response.status,
      statusText: '', // CycleTLS doesn't provide status text
      headers: responseHeaders,
    });

    return fetchResponse;
  } catch (error) {
    log(`CycleTLS request failed: ${error}`);
    throw error;
  }
}
