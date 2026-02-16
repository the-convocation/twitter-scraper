import initCycleTLS from 'cycletls';
import { Headers } from 'headers-polyfill';
import debug from 'debug';
import { CHROME_USER_AGENT } from './api';

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

  // Chrome 144 HTTP/2 fingerprint - mimics exact HTTP/2 settings frame
  // Format: SETTINGS|window_size|unknown|priority_order
  const http2Fingerprint = '1:65536;2:0;4:6291456;6:262144|15663105|0|m,a,s,p';

  // JA4r fingerprint (Chrome 144)
  // Format: t13d1516h2_CIPHERS_EXTENSIONS_SIG_ALGS
  const ja4r =
    't13d1516h2_002f,0035,009c,009d,1301,1302,1303,c013,c014,c02b,c02c,c02f,c030,cca8,cca9_0005,000a,000b,000d,0012,0017,001b,0023,002b,002d,0033,44cd,fe0d,ff01_0403,0804,0401,0503,0805,0501,0806,0601';

  // Exact header order that Chrome 144 uses (lowercase, critical for fingerprinting)
  const headerOrder = [
    // HTTP/2 pseudo-headers (Chrome 144 order: method, authority, scheme, path)
    ':method',
    ':authority',
    ':scheme',
    ':path',
    // Chrome Client Hints (mandatory for modern detection bypass)
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    // Standard browser headers
    'upgrade-insecure-requests',
    'user-agent',
    'accept',
    'origin',
    'sec-fetch-site',
    'sec-fetch-mode',
    'sec-fetch-user',
    'sec-fetch-dest',
    'referer',
    'accept-encoding',
    'accept-language',
    'priority',
    // Authentication headers
    'authorization',
    'x-csrf-token',
    'x-guest-token',
    'x-twitter-auth-type',
    'x-twitter-active-user',
    'x-twitter-client-language',
    'x-client-transaction-id',
    'x-xp-forwarded-for',
    // POST-specific
    'content-type',
    'cookie',
  ];

  // Use Chrome 144 JA3 fingerprint with HTTP/2 and header ordering
  const options = {
    body,
    headers,
    // TLS fingerprinting (Chrome 144 - captured from real browser via tls.peet.ws)
    ja3: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-10-35-16-11-51-27-65037-43-45-18-23-5-65281-13-17613,4588-29-23-24,0',
    ja4r,
    // HTTP/2 fingerprinting (Chrome 144)
    http2Fingerprint,
    // Exact header ordering (critical for fingerprint evasion)
    headerOrder,
    orderAsProvided: true,
    // Ensure GREASE values are enabled (prevents fingerprinting)
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
