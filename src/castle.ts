/**
 * castle.ts - Local Castle.io v11 token generation for Twitter/X login flow.
 *
 * Ported from yubie-re/castleio-gen (Python, MIT license, archived May 2025)
 * to TypeScript. Generates device fingerprint tokens required by Twitter's
 * login flow to avoid error 399 ("suspicious activity").
 *
 * This generates Castle.io SDK v2.6.0 compatible tokens (version 11).
 */

import debug from 'debug';

const log = debug('twitter-scraper:castle');

// ─── Constants ───────────────────────────────────────────────────────────────

/** Twitter's Castle.io publishable key (32-char, without pk_ prefix) */
const TWITTER_CASTLE_PK = 'AvRa79bHyJSYSQHnRpcVtzyxetSvFerx';

/** XXTEA encryption key for the entire token */
const XXTEA_KEY = [1164413191, 3891440048, 185273099, 2746598870];

/** Per-field XXTEA key constants: key = [fieldIndex, initTime, ...these] */
const PER_FIELD_KEY_TAIL = [
  16373134, 643144773, 1762804430, 1186572681, 1164413191,
];

/** Timestamp epoch offset (seconds since ~Aug 23 2018) */
const TS_EPOCH = 1535e6;

/** SDK version 2.6.0 encoded: (3<<13)|(1<<11)|(6<<6)|0 = 0x6980 */
const SDK_VERSION = 0x6980;

/** Token format version byte (v11) */
const TOKEN_VERSION = 0x0b;

// Value encoding type IDs
const B2H = 3;
const SBA = 4; // SERIALIZED_BYTE_ARRAY
const B2H_CHK = 5; // B2H_WITH_CHECKS
const B2H_RND = 6; // B2H_ROUNDED
const APPEND = 7; // JUST_APPEND
const EMPTY = -1;
const UNK = 1;

// ─── Utility Functions ───────────────────────────────────────────────────────

function getRandomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  if (
    typeof globalThis.crypto !== 'undefined' &&
    globalThis.crypto.getRandomValues
  ) {
    globalThis.crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  return buf;
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2)
    out[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return out;
}

function textEnc(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function u8(...vals: number[]): Uint8Array {
  return new Uint8Array(vals);
}

function be16(v: number): Uint8Array {
  return u8((v >>> 8) & 0xff, v & 0xff);
}

function be32(v: number): Uint8Array {
  return u8((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
}

function xorBytes(data: Uint8Array, key: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
  return out;
}

function xorNibbles(nibbles: string, keyNibble: string): string {
  const k = parseInt(keyNibble, 16);
  return nibbles
    .split('')
    .map((n) => (parseInt(n, 16) ^ k).toString(16))
    .join('');
}

function base64url(data: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data).toString('base64url');
  }
  let bin = '';
  for (let i = 0; i < data.length; i++) bin += String.fromCharCode(data[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── XXTEA ──────────────────────────────────────────────────────────────────

function xxteaEncrypt(data: Uint8Array, key: number[]): Uint8Array {
  const padLen = Math.ceil(data.length / 4) * 4;
  const padded = new Uint8Array(padLen);
  padded.set(data);

  const n = padLen / 4;
  const v = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    v[i] =
      (padded[i * 4] |
        (padded[i * 4 + 1] << 8) |
        (padded[i * 4 + 2] << 16) |
        (padded[i * 4 + 3] << 24)) >>>
      0;
  }

  if (n <= 1) return padded;

  const k = new Uint32Array(key.map((x) => x >>> 0));
  const DELTA = 0x9e3779b9;
  const u = n - 1;
  let sum = 0;
  let z = v[u];
  let y: number;
  let rounds = 6 + Math.floor(52 / (u + 1));

  while (rounds-- > 0) {
    sum = (sum + DELTA) >>> 0;
    const e = (sum >>> 2) & 3;
    for (let p = 0; p < u; p++) {
      y = v[p + 1];
      const mx =
        ((((z >>> 5) ^ (y << 2)) >>> 0) + (((y >>> 3) ^ (z << 4)) >>> 0)) ^
        (((sum ^ y) >>> 0) + ((k[(p & 3) ^ e] ^ z) >>> 0));
      v[p] = (v[p] + mx) >>> 0;
      z = v[p];
    }
    y = v[0];
    const mx =
      ((((z >>> 5) ^ (y << 2)) >>> 0) + (((y >>> 3) ^ (z << 4)) >>> 0)) ^
      (((sum ^ y) >>> 0) + ((k[(u & 3) ^ e] ^ z) >>> 0));
    v[u] = (v[u] + mx) >>> 0;
    z = v[u];
  }

  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = v[i] & 0xff;
    out[i * 4 + 1] = (v[i] >>> 8) & 0xff;
    out[i * 4 + 2] = (v[i] >>> 16) & 0xff;
    out[i * 4 + 3] = (v[i] >>> 24) & 0xff;
  }
  return out;
}

function fieldEncrypt(
  data: Uint8Array,
  index: number,
  initTime: number,
): Uint8Array {
  return xxteaEncrypt(data, [
    index,
    Math.floor(initTime),
    ...PER_FIELD_KEY_TAIL,
  ]);
}

// ─── Timestamp Encoding ─────────────────────────────────────────────────────

function encodeTimestampBytes(ms: number): Uint8Array {
  let t = Math.floor(ms / 1000 - TS_EPOCH);
  t = Math.max(Math.min(t, 268435455), 0);
  return be32(t);
}

function xorAndAppendKey(buf: Uint8Array, key: number): string {
  const hex = toHex(buf);
  const keyNib = (key & 0xf).toString(16);
  return xorNibbles(hex.substring(1), keyNib) + keyNib;
}

function encodeTimestampEncrypted(ms: number): string {
  const tsBytes = encodeTimestampBytes(ms);
  const slice = parseInt(Math.floor(ms).toString().slice(-3)) || 0;
  const sliceBytes = be16(slice);
  const k = randInt(0, 15);
  return xorAndAppendKey(tsBytes, k) + xorAndAppendKey(sliceBytes, k);
}

// ─── Key Derivation ─────────────────────────────────────────────────────────

function deriveAndXor(
  keyHex: string,
  sliceLen: number,
  rotChar: string,
  data: Uint8Array,
): Uint8Array {
  const sub = keyHex.substring(0, sliceLen).split('');
  if (sub.length === 0) return data;
  const rot = parseInt(rotChar, 16) % sub.length;
  const rotated = sub.slice(rot).concat(sub.slice(0, rot)).join('');
  return xorBytes(data, fromHex(rotated));
}

// ─── CustomFloat Encoding ───────────────────────────────────────────────────

function customFloatEncode(
  expBits: number,
  manBits: number,
  value: number,
): number {
  if (value === 0) return 0;
  let n = Math.abs(value);
  let exp = 0;
  while (2 <= n) {
    n /= 2;
    exp++;
  }
  while (n < 1 && n > 0) {
    n *= 2;
    exp--;
  }
  exp = Math.min(exp, (1 << expBits) - 1);
  const frac = n - Math.floor(n);
  let mantissa = 0;
  if (frac > 0) {
    let pos = 1;
    let tmp = frac;
    while (tmp !== 0 && pos <= manBits) {
      tmp *= 2;
      const bit = Math.floor(tmp);
      mantissa |= bit << (manBits - pos);
      tmp -= bit;
      pos++;
    }
  }
  return (exp << manBits) | mantissa;
}

function encodeFloatVal(v: number): number {
  const n = Math.max(v, 0);
  if (n <= 15) return 64 | customFloatEncode(2, 4, n + 1);
  return 128 | customFloatEncode(4, 3, n - 14);
}

// ─── FP Value Processing ────────────────────────────────────────────────────

function fpVal(
  index: number,
  type: number,
  val: number | Uint8Array,
  initTime?: number,
): Uint8Array {
  // Header byte: field index in upper 5 bits, type in lower 3 bits
  // Note: EMPTY=-1, 7 & -1 = 7 in both Python and JS bitwise
  const hdr = u8(((31 & index) << 3) | (7 & type));

  if (type === EMPTY || type === UNK) return hdr;

  let body: Uint8Array;
  switch (type) {
    case B2H:
      body = u8(val as number);
      break;
    case B2H_RND:
      body = u8(Math.round(val as number));
      break;
    case B2H_CHK: {
      const v = val as number;
      body = v <= 127 ? u8(v) : be16((1 << 15) | (32767 & v));
      break;
    }
    case SBA: {
      const enc = fieldEncrypt(val as Uint8Array, index, initTime!);
      body = concat(u8(enc.length), enc);
      break;
    }
    case APPEND:
      body = val instanceof Uint8Array ? val : u8(val as number);
      break;
    default:
      body = new Uint8Array(0);
  }
  return concat(hdr, body);
}

// ─── Encoding Helpers ───────────────────────────────────────────────────────

function encodeBits(bits: number[], byteSize: number): Uint8Array {
  const numBytes = byteSize / 8;
  const arr = new Uint8Array(numBytes);
  for (const bit of bits) {
    const bi = numBytes - 1 - Math.floor(bit / 8);
    if (bi >= 0 && bi < numBytes) arr[bi] |= 1 << bit % 8;
  }
  return arr;
}

function screenDimBytes(screen: number, avail: number): Uint8Array {
  const r = 32767 & screen;
  const e = 65535 & avail;
  return r === e ? be16(32768 | r) : concat(be16(r), be16(e));
}

function boolsToBin(arr: boolean[], t: number): number {
  const e = arr.length > t ? arr.slice(0, t) : arr;
  const c = e.length;
  let r = 0;
  for (let i = c - 1; i >= 0; i--) {
    if (e[i]) r |= 1 << (c - i - 1);
  }
  if (c < t) r <<= t - c;
  return r;
}

// ─── Fingerprint Part 1 ────────────────────────────────────────────────────

function getFpOne(
  initTime: number,
  userAgent: string,
  locale: string,
  screenW: number,
  screenH: number,
  availW: number,
  availH: number,
  gpu: string,
  timezone: string,
): Uint8Array {
  // Compute timezone offset
  const tzInfo = getTimezoneDiff(timezone);

  // Encrypt user agent separately (uses JUST_APPEND with manual XXTEA)
  const uaEnc = fieldEncrypt(textEnc(userAgent), 12, initTime);
  const uaPayload = concat(u8(1), u8(uaEnc.length), uaEnc);

  const fields: Uint8Array[] = [
    fpVal(0, B2H, 1), // Platform: Win32
    fpVal(1, B2H, 0), // Vendor: Google Inc
    fpVal(2, SBA, textEnc(locale), initTime), // Locale
    fpVal(3, B2H_RND, 80), // Device memory: 8GB*10
    fpVal(
      4,
      APPEND,
      concat(screenDimBytes(screenW, availW), screenDimBytes(screenH, availH)),
    ),
    fpVal(5, B2H_CHK, 24), // Screen depth
    fpVal(6, B2H_CHK, 24), // Hardware concurrency
    fpVal(7, B2H_RND, 10), // Pixel ratio: 1.0*10
    fpVal(8, APPEND, u8(tzInfo.offset, tzInfo.dstDiff)), // Timezone
    fpVal(9, APPEND, u8(0x02, 0x7d, 0x5f, 0xc9, 0xa7)), // MIME hash
    fpVal(10, APPEND, u8(0x05, 0x72, 0x93, 0x02, 0x08)), // Plugins hash
    fpVal(11, APPEND, concat(u8(12), encodeBits([0, 1, 2, 3, 4, 5, 6], 16))), // Browser features
    fpVal(12, APPEND, uaPayload), // User agent
    fpVal(13, SBA, textEnc('54b4b5cf'), initTime), // Font render hash
    fpVal(14, APPEND, concat(u8(3), encodeBits([0, 1, 2], 8))), // Media input
    // Fields 15 (DoNotTrack) and 16 (JavaEnabled) are NOT included
    fpVal(17, B2H, 0), // Product sub
    fpVal(18, SBA, textEnc('c6749e76'), initTime), // Circle render hash
    fpVal(19, SBA, textEnc(gpu), initTime), // Graphics card
    fpVal(20, SBA, textEnc('12/31/1969, 7:00:00 PM'), initTime), // Epoch locale
    fpVal(21, APPEND, concat(u8(8), encodeBits([], 8))), // WebDriver flags (none)
    fpVal(22, B2H_CHK, 33), // eval.toString().length
    // Field 23 (NavigatorBuildID) is NOT included
    fpVal(24, B2H_CHK, 12549), // Max recursion limit
    fpVal(25, B2H, 0), // Recursion error message enum
    fpVal(26, B2H, 1), // Recursion error name enum
    fpVal(27, B2H_CHK, 4644), // Stack trace strlen
    fpVal(28, APPEND, u8(0x00)), // Touch metric
    fpVal(29, B2H, 3), // Undefined call err
    fpVal(30, APPEND, u8(0x5d, 0xc5, 0xab, 0xb5, 0x88)), // Navigator props hash
    fpVal(31, APPEND, encodePlayability()), // Codec playability
  ];

  const data = concat(...fields);
  const sizeIdx = ((7 & 0) << 5) | (31 & fields.length);
  return concat(u8(sizeIdx), data);
}

function encodePlayability(): Uint8Array {
  // webm=2, mp4=2, ogg=0, aac=2, xm4a=1, wav=2, mpeg=2, ogg2=2
  const codecs = [2, 2, 0, 2, 1, 2, 2, 2];
  const bits = codecs.map((c) => c.toString(2).padStart(2, '0')).join('');
  const val = parseInt(bits, 2);
  return be16(val);
}

function getTimezoneDiff(tz: string): { offset: number; dstDiff: number } {
  // Known timezone offsets (offset_minutes/15, dst_diff_minutes/15)
  const known: Record<string, { offset: number; dstDiff: number }> = {
    'America/New_York': { offset: 20, dstDiff: 4 },
    'America/Chicago': { offset: 24, dstDiff: 4 },
    'America/Los_Angeles': { offset: 32, dstDiff: 4 },
    'America/Denver': { offset: 28, dstDiff: 4 },
    'America/Sao_Paulo': { offset: 12, dstDiff: 4 },
    'America/Mexico_City': { offset: 24, dstDiff: 4 },
    'Asia/Shanghai': { offset: 246, dstDiff: 0 }, // -480/15 = -32 → unsigned: 256-32=224... hmm
    'Asia/Tokyo': { offset: 220, dstDiff: 0 },
    'Europe/London': { offset: 0, dstDiff: 4 },
    'Europe/Berlin': { offset: 252, dstDiff: 4 },
    UTC: { offset: 0, dstDiff: 0 },
  };

  // Try to compute dynamically
  try {
    const now = new Date();
    const jan = new Date(now.getFullYear(), 0, 1);
    const jul = new Date(now.getFullYear(), 6, 1);

    const getOff = (d: Date, zone: string) => {
      const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
      const local = new Date(d.toLocaleString('en-US', { timeZone: zone }));
      return (utc.getTime() - local.getTime()) / 60000;
    };

    const curOff = getOff(now, tz);
    const janOff = getOff(jan, tz);
    const julOff = getOff(jul, tz);
    const diff = Math.abs(janOff - julOff);
    return {
      offset: Math.floor(curOff / 15) & 0xff,
      dstDiff: Math.floor(diff / 15) & 0xff,
    };
  } catch {
    return known[tz] || { offset: 20, dstDiff: 4 };
  }
}

// ─── Fingerprint Part 2 ────────────────────────────────────────────────────

const TZ_ENUM: Record<string, number> = {
  'America/New_York': 0,
  'America/Sao_Paulo': 1,
  'America/Chicago': 2,
  'America/Los_Angeles': 3,
  'America/Mexico_City': 4,
  'Asia/Shanghai': 5,
};

function getFpTwo(
  timezone: string,
  locale: string,
  language: string,
  initTime: number,
): Uint8Array {
  const tzField =
    timezone in TZ_ENUM
      ? fpVal(1, B2H, TZ_ENUM[timezone])
      : fpVal(1, SBA, textEnc(timezone), initTime);

  const fields: Uint8Array[] = [
    fpVal(0, B2H, 0), // Constant
    tzField, // Timezone
    fpVal(2, SBA, textEnc(`${locale},${language}`), initTime), // Language array
    fpVal(6, B2H_CHK, 0), // Expected property strings
    fpVal(10, APPEND, concat(u8(4), encodeBits([1, 2, 3], 8))), // Castle data bitfield
    fpVal(12, B2H_CHK, 80), // Negative error length
    fpVal(13, APPEND, u8(9, 0, 0)), // Driver check
    fpVal(17, APPEND, concat(u8(0x0d), encodeBits([1, 5, 8, 9, 10], 16))), // Chrome features
    fpVal(18, UNK, 0), // Device logic expected
    fpVal(21, APPEND, u8(0, 0, 0, 0)), // Class properties count
    fpVal(22, SBA, textEnc(locale), initTime), // User locale 2
    fpVal(23, APPEND, concat(u8(2), encodeBits([0], 8))), // Worker bitset
    fpVal(24, APPEND, concat(be16(0), be16(randInt(10, 30)))), // Inner/outer dims diff
  ];

  const data = concat(...fields);
  const sizeIdx = ((7 & 4) << 5) | (31 & fields.length);
  return concat(u8(sizeIdx), data);
}

// ─── Fingerprint Part 3 ────────────────────────────────────────────────────

function getFpThree(initTime: number): Uint8Array {
  const minute = new Date(initTime).getUTCMinutes();
  const fields: Uint8Array[] = [
    fpVal(3, B2H_CHK, 1), // Time since window open
    fpVal(4, B2H_CHK, minute), // Castle init time minutes
  ];
  const data = concat(...fields);
  const sizeIdx = ((7 & 7) << 5) | (31 & fields.length);
  return concat(u8(sizeIdx), data);
}

// ─── Event Log ──────────────────────────────────────────────────────────────

function generateEventLog(): Uint8Array {
  const SIMPLE = [21, 18, 25, 26, 27]; // MOUSEMOVE, ANIMATIONSTART, MOUSELEAVE, MOUSEENTER, RESIZE
  const TARGET = [0, 6, 5]; // CLICK, BLUR, FOCUS
  const ALL = [...SIMPLE, ...TARGET];

  const count = randInt(30, 70);
  const events: number[] = [];
  for (let i = 0; i < count; i++) {
    const id = ALL[randInt(0, ALL.length - 1)];
    if (TARGET.includes(id)) {
      events.push(id | 128); // has_target flag
      events.push(63); // target: unknown element
    } else {
      events.push(id);
    }
  }

  const evtBytes = new Uint8Array(events);
  // Format: [2-byte total length] [0x00] [2-byte count] [event bytes...]
  const inner = concat(u8(0), be16(count), evtBytes);
  return concat(be16(inner.length), inner);
}

// ─── Behavioral Event Values ────────────────────────────────────────────────

function getBehavioralBitfield(): Uint8Array {
  const bits = new Array(15).fill(false);
  bits[2] = true; // click > 0
  bits[3] = true; // keydown > 0
  bits[5] = true; // backspace
  bits[6] = true; // not-touch
  bits[9] = true;
  bits[11] = true;
  bits[12] = true;
  const binNum = boolsToBin(bits, 16);
  const encoded = (6 << 20) | (2 << 16) | (65535 & binNum);
  return u8((encoded >>> 16) & 0xff, (encoded >>> 8) & 0xff, encoded & 0xff);
}

function getFloatValues(): Uint8Array {
  const vals = [
    randFloat(40, 50), // Mouse angle vector
    -1, // Touch angle vector
    randFloat(70, 80), // Key same time diff
    -1,
    randFloat(60, 70), // Mouse down-up time
    -1,
    0,
    0, // Mouse click time diff
    randFloat(60, 80), // Mouse down-up median
    randFloat(5, 10), // Mouse down-up deviation
    randFloat(30, 40), // Key click down median
    randFloat(2, 5), // Key click down deviation
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1, // Special key diffs
    randFloat(150, 180), // Mouse vector angle
    randFloat(3, 6),
    randFloat(150, 180), // Mouse vector angle 500
    randFloat(3, 6),
    randFloat(0, 2), // Mouse deviation
    randFloat(0, 2),
    0,
    0,
    -1,
    -1, // Touch sequential
    -1,
    -1, // Touch start-end-cancel
    0,
    0, // Key letter-digit
    0,
    0, // Key digit-invalid
    0,
    0, // Key double-invalid
    1.0,
    0, // Mouse vector diff
    1.0,
    0, // Mouse vector diff 2
    randFloat(0, 4), // Mouse vector diff 500
    randFloat(0, 3),
    randFloat(25, 50), // Mouse time diff rounded
    randFloat(25, 50),
    randFloat(25, 50), // Mouse vector diff rounded
    randFloat(25, 30),
    randFloat(0, 2), // Mouse speed change
    randFloat(0, 1),
    randFloat(0, 1), // Mouse vector 500
    1, // Universal
    0,
  ];

  const out = new Uint8Array(vals.length);
  for (let i = 0; i < vals.length; i++) {
    out[i] = vals[i] === -1 ? 0 : encodeFloatVal(vals[i]);
  }
  return out;
}

function getEventInts(): Uint8Array {
  const ints = [
    randInt(100, 200), // mousemove
    randInt(1, 5), // keyup
    randInt(1, 5), // click
    0, // touchstart
    randInt(0, 5), // keydown
    0, // touchmove
    0, // mousedown-mouseup
    0, // vector diff
    randInt(0, 5), // wheel
    randInt(0, 11), // unk1
    randInt(0, 1), // unk2
  ];
  return concat(new Uint8Array(ints), u8(ints.length));
}

function getFpEventValues(): Uint8Array {
  return concat(getBehavioralBitfield(), getFloatValues(), getEventInts());
}

// ─── Token Assembly ─────────────────────────────────────────────────────────

function buildHeader(uuid: string, pk: string, initTime: number): Uint8Array {
  const ts = fromHex(encodeTimestampEncrypted(initTime));
  const ver = be16(SDK_VERSION);
  const pkBytes = textEnc(pk);
  const uuidBytes = fromHex(uuid);
  return concat(ts, ver, pkBytes, uuidBytes);
}

/**
 * Generate a Castle.io v11 token for Twitter's login flow.
 *
 * @param userAgent - The user agent string to embed in the fingerprint
 * @returns Object with `token` (the Castle request token) and `cuid` (for __cuid cookie)
 */
export function generateLocalCastleToken(userAgent: string): {
  token: string;
  cuid: string;
} {
  const now = Date.now();
  // init_time: 2-30 minutes before current time (simulates page load delay)
  const initTime = now - randFloat(2 * 60 * 1000, 30 * 60 * 1000);

  const locale = 'en-US';
  const language = 'en';
  const timezone = 'America/New_York';
  const screenW = 1920;
  const screenH = 1080;
  const availW = 1920;
  const availH = 1032;
  const gpu =
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)';

  log('Generating local Castle.io v11 token');

  // 1. Collect fingerprint data
  const fpOne = getFpOne(
    initTime,
    userAgent,
    locale,
    screenW,
    screenH,
    availW,
    availH,
    gpu,
    timezone,
  );
  const fpTwo = getFpTwo(timezone, locale, language, initTime);
  const fpThree = getFpThree(initTime);
  const fpEventLog = generateEventLog();
  const fpEvents = getFpEventValues();

  const fpData = concat(fpOne, fpTwo, fpThree, fpEventLog, fpEvents, u8(0xff));

  // 2. First XOR encryption (timestamp-derived key)
  const sendTime = Date.now();
  const fpDataKey = encodeTimestampEncrypted(sendTime);
  const encrypted1 = deriveAndXor(fpDataKey, 4, fpDataKey[3], fpData);

  // 3. Second XOR encryption (UUID-derived key)
  const tokenUuid = toHex(getRandomBytes(16));
  const withKeyPrefix = concat(fromHex(fpDataKey), encrypted1);
  const encrypted2 = deriveAndXor(tokenUuid, 8, tokenUuid[9], withKeyPrefix);

  // 4. Build header
  const header = buildHeader(tokenUuid, TWITTER_CASTLE_PK, initTime);

  // 5. XXTEA encrypt
  const plaintext = concat(header, encrypted2);
  const xteaCipher = xxteaEncrypt(plaintext, XXTEA_KEY);

  // 6. Add version and padding bytes
  const padding = xteaCipher.length - plaintext.length;
  const withVersion = concat(u8(TOKEN_VERSION, padding), xteaCipher);

  // 7. Final random byte XOR + checksum
  const randomByte = getRandomBytes(1)[0];
  const checksum = (withVersion.length * 2) & 0xff;
  const payload = concat(withVersion, u8(checksum));
  const xored = xorBytes(payload, u8(randomByte));
  const final = concat(u8(randomByte), xored);

  // 8. Base64URL encode
  const token = base64url(final);

  log(`Generated castle token: ${token.length} chars, cuid: ${tokenUuid}`);

  return { token, cuid: tokenUuid };
}
