/**
 * Chrome version-dependent fingerprint constants.
 *
 * IMPORTANT: All constants in this file are tied to a specific Chrome version
 * (currently Chrome 144 on Windows 10). When bumping the Chrome version:
 *   1. Update CHROME_USER_AGENT with the new version string
 *   2. Update CHROME_SEC_CH_UA with the matching Client Hints
 *   3. Update CHROME_JA3 fingerprint (capture via tls.peet.ws)
 *   4. Update CHROME_JA4R fingerprint
 *   5. Update CHROME_HTTP2_FINGERPRINT settings frame
 *   6. Review CHROME_HEADER_ORDER if Chrome changes header ordering
 *   7. Update castle.ts DEFAULT_PROFILE if Chrome version affects fingerprint fields
 *
 * All values must be consistent with each other and match a real Chrome release.
 */

/**
 * User-Agent string matching Chrome 144 on Windows 10.
 * Must be consistent across all requests and match the TLS fingerprint.
 */
export const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36';

/**
 * Chrome Client Hints header matching the Chrome 144 user-agent.
 */
export const CHROME_SEC_CH_UA =
  '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"';

/**
 * JA3 TLS fingerprint for Chrome 144.
 * Captured from a real Chrome 144 browser session via tls.peet.ws.
 */
export const CHROME_JA3 =
  '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-10-35-16-11-51-27-65037-43-45-18-23-5-65281-13-17613,4588-29-23-24,0';

/**
 * JA4r fingerprint for Chrome 144.
 * Format: t13d1516h2_CIPHERS_EXTENSIONS_SIG_ALGS
 */
export const CHROME_JA4R =
  't13d1516h2_002f,0035,009c,009d,1301,1302,1303,c013,c014,c02b,c02c,c02f,c030,cca8,cca9_0005,000a,000b,000d,0012,0017,001b,0023,002b,002d,0033,44cd,fe0d,ff01_0403,0804,0401,0503,0805,0501,0806,0601';

/**
 * Chrome 144 HTTP/2 fingerprint - mimics exact HTTP/2 SETTINGS frame.
 * Format: SETTINGS|window_size|unknown|priority_order
 */
export const CHROME_HTTP2_FINGERPRINT =
  '1:65536;2:0;4:6291456;6:262144|15663105|0|m,a,s,p';

/**
 * Exact header order that Chrome 144 uses.
 * Header ordering is critical for HTTP/2 fingerprint evasion — servers can detect
 * non-browser clients by checking if headers arrive in a non-standard order.
 */
export const CHROME_HEADER_ORDER = [
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
