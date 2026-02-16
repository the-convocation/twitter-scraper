/**
 * castle.ts - Local Castle.io v11 token generation for Twitter/X login flow.
 *
 * Ported from yubie-re/castleio-gen (Python, MIT license, archived May 2025)
 * to TypeScript. Generates device fingerprint tokens required by Twitter's
 * login flow to avoid error 399 ("suspicious activity").
 *
 * This generates Castle.io SDK v2.6.0 compatible tokens (version 11).
 *
 * Token structure overview:
 *   1. Collect device/browser fingerprint data (3 parts)
 *   2. Collect behavioral event data (mouse/keyboard/touch metrics)
 *   3. Apply layered XOR encryption with timestamp and UUID keys
 *   4. Prepend header (timestamp, SDK version, publisher key, UUID)
 *   5. XXTEA-encrypt the entire payload
 *   6. Base64URL-encode with version prefix and random XOR byte
 */

import debug from 'debug';

const log = debug('twitter-scraper:castle');

// ─── Field Encoding Types ────────────────────────────────────────────────────

/**
 * How a fingerprint field's value is serialized into the token.
 * Each field has a 1-byte header (5-bit index + 3-bit encoding type),
 * followed by encoding-specific body bytes.
 */
enum FieldEncoding {
  /** No body bytes (field presence alone is the signal) */
  Empty = -1,
  /** Marker field, no body bytes */
  Marker = 1,
  /** Single byte value */
  Byte = 3,
  /** XXTEA-encrypted byte array with length prefix */
  EncryptedBytes = 4,
  /** 1 or 2 byte value (2 bytes with high bit set if > 127) */
  CompactInt = 5,
  /** Single byte, value is Math.round()'d first */
  RoundedByte = 6,
  /** Raw bytes appended directly after header */
  RawAppend = 7,
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Twitter's Castle.io publishable key (32-char, without pk_ prefix) */
const TWITTER_CASTLE_PK = 'AvRa79bHyJSYSQHnRpcVtzyxetSvFerx';

/** XXTEA encryption key for the entire token */
const XXTEA_KEY = [1164413191, 3891440048, 185273099, 2746598870];

/** Per-field XXTEA key tail: field key = [fieldIndex, initTime, ...PER_FIELD_KEY_TAIL] */
const PER_FIELD_KEY_TAIL = [
  16373134, 643144773, 1762804430, 1186572681, 1164413191,
];

/** Timestamp epoch offset: seconds since ~Aug 23 2018 */
const TS_EPOCH = 1535e6;

/** SDK version 2.6.0 encoded as 16-bit: (3<<13)|(1<<11)|(6<<6)|0 = 0x6980 */
const SDK_VERSION = 0x6980;

/** Token format version byte (v11) */
const TOKEN_VERSION = 0x0b;

/**
 * Fingerprint part indices — each section is tagged with a part ID
 * in its size/index header byte.
 */
const FP_PART = {
  DEVICE: 0, // Part 1: hardware/OS/rendering fingerprint
  BROWSER: 4, // Part 2: browser environment fingerprint
  TIMING: 7, // Part 3: timing-based fingerprint
} as const;

// ─── Simulated Browser Profile ──────────────────────────────────────────────

/**
 * Simulated browser environment values embedded in the fingerprint.
 * These should match a realistic Chrome-on-Windows configuration.
 */
interface BrowserProfile {
  locale: string;
  language: string;
  timezone: string;
  screenWidth: number;
  screenHeight: number;
  /** Available screen width (excludes OS chrome like taskbars) */
  availableWidth: number;
  /** Available screen height (excludes OS chrome like taskbars) */
  availableHeight: number;
  /** WebGL ANGLE renderer string */
  gpuRenderer: string;
  /** Device memory in GB (encoded as value * 10) */
  deviceMemoryGB: number;
  /** Logical CPU core count */
  hardwareConcurrency: number;
  /** Screen color depth in bits */
  colorDepth: number;
  /** CSS device pixel ratio (encoded as value * 10) */
  devicePixelRatio: number;
}

/** Default profile: Chrome 144 on Windows 10, NVIDIA GTX 1080 Ti, 1080p */
const DEFAULT_PROFILE: BrowserProfile = {
  locale: 'en-US',
  language: 'en',
  timezone: 'America/New_York',
  screenWidth: 1920,
  screenHeight: 1080,
  availableWidth: 1920,
  availableHeight: 1032, // 1080 minus Windows taskbar (~48px)
  gpuRenderer:
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)',
  deviceMemoryGB: 8,
  hardwareConcurrency: 24,
  colorDepth: 24,
  devicePixelRatio: 1.0,
};

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

function toHex(input: Uint8Array): string {
  return Array.from(input)
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

/** Create a Uint8Array from individual byte values */
function u8(...vals: number[]): Uint8Array {
  return new Uint8Array(vals);
}

/** Encode a 16-bit value as 2 big-endian bytes */
function be16(v: number): Uint8Array {
  return u8((v >>> 8) & 0xff, v & 0xff);
}

/** Encode a 32-bit value as 4 big-endian bytes */
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

// ─── XXTEA Encryption ───────────────────────────────────────────────────────

/**
 * Encrypt data using XXTEA (Corrected Block TEA) algorithm.
 * Used for both the overall token encryption and per-field encryption.
 */
function xxteaEncrypt(data: Uint8Array, key: number[]): Uint8Array {
  // Pad to 4-byte boundary
  const padLen = Math.ceil(data.length / 4) * 4;
  const padded = new Uint8Array(padLen);
  padded.set(data);

  const n = padLen / 4;
  // Read as little-endian 32-bit words
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

  // Write back as little-endian bytes
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = v[i] & 0xff;
    out[i * 4 + 1] = (v[i] >>> 8) & 0xff;
    out[i * 4 + 2] = (v[i] >>> 16) & 0xff;
    out[i * 4 + 3] = (v[i] >>> 24) & 0xff;
  }
  return out;
}

/** Encrypt a fingerprint field's data using per-field XXTEA key */
function fieldEncrypt(
  data: Uint8Array,
  fieldIndex: number,
  initTime: number,
): Uint8Array {
  return xxteaEncrypt(data, [
    fieldIndex,
    Math.floor(initTime),
    ...PER_FIELD_KEY_TAIL,
  ]);
}

// ─── Timestamp Encoding ─────────────────────────────────────────────────────

function encodeTimestampBytes(ms: number): Uint8Array {
  let t = Math.floor(ms / 1000 - TS_EPOCH);
  t = Math.max(Math.min(t, 268435455), 0); // Clamp to 28-bit unsigned
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

/**
 * Derive an XOR key from a hex string by slicing, rotating, and XOR-ing.
 * Used for the two-layer XOR encryption of fingerprint data.
 */
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

// ─── Custom Float Encoding ──────────────────────────────────────────────────

/**
 * Encode a floating-point value into a compact format with configurable
 * exponent and mantissa bit widths. Used for behavioral metric encoding.
 */
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

/**
 * Encode a behavioral float value for the token.
 * Values 0-15 use a 2-bit exponent / 4-bit mantissa format.
 * Values > 15 use a 4-bit exponent / 3-bit mantissa format.
 */
function encodeFloatVal(v: number): number {
  const n = Math.max(v, 0);
  if (n <= 15) return 64 | customFloatEncode(2, 4, n + 1);
  return 128 | customFloatEncode(4, 3, n - 14);
}

// ─── Field Serialization ────────────────────────────────────────────────────

/**
 * Serialize a single fingerprint field into its binary representation.
 *
 * Format: [header byte] [optional body bytes]
 * Header: upper 5 bits = field index, lower 3 bits = encoding type
 *
 * @param index - Field index (0-31) within the fingerprint part
 * @param encoding - How the value should be serialized
 * @param val - The field value (number or byte array)
 * @param initTime - Init timestamp (required for EncryptedBytes encoding)
 */
function encodeField(
  index: number,
  encoding: FieldEncoding,
  val: number | Uint8Array,
  initTime?: number,
): Uint8Array {
  // Header byte: field index in upper 5 bits, encoding type in lower 3 bits
  // Note: FieldEncoding.Empty = -1, and 7 & -1 = 7 in JS bitwise
  const hdr = u8(((31 & index) << 3) | (7 & encoding));

  if (encoding === FieldEncoding.Empty || encoding === FieldEncoding.Marker)
    return hdr;

  let body: Uint8Array;
  switch (encoding) {
    case FieldEncoding.Byte:
      body = u8(val as number);
      break;
    case FieldEncoding.RoundedByte:
      body = u8(Math.round(val as number));
      break;
    case FieldEncoding.CompactInt: {
      const v = val as number;
      body = v <= 127 ? u8(v) : be16((1 << 15) | (32767 & v));
      break;
    }
    case FieldEncoding.EncryptedBytes: {
      const enc = fieldEncrypt(val as Uint8Array, index, initTime!);
      body = concat(u8(enc.length), enc);
      break;
    }
    case FieldEncoding.RawAppend:
      body = val instanceof Uint8Array ? val : u8(val as number);
      break;
    default:
      body = new Uint8Array(0);
  }
  return concat(hdr, body);
}

// ─── Bit Encoding Helpers ───────────────────────────────────────────────────

/** Pack a list of set-bit positions into a fixed-size byte array (big-endian) */
function encodeBits(bits: number[], byteSize: number): Uint8Array {
  const numBytes = byteSize / 8;
  const arr = new Uint8Array(numBytes);
  for (const bit of bits) {
    const bi = numBytes - 1 - Math.floor(bit / 8);
    if (bi >= 0 && bi < numBytes) arr[bi] |= 1 << bit % 8;
  }
  return arr;
}

/**
 * Encode screen dimensions. If screen and available dimensions match,
 * uses a compact 2-byte form with high bit set; otherwise 4 bytes.
 */
function screenDimBytes(screen: number, avail: number): Uint8Array {
  const r = 32767 & screen;
  const e = 65535 & avail;
  return r === e ? be16(32768 | r) : concat(be16(r), be16(e));
}

/** Convert boolean array to a packed integer bitfield */
function boolsToBin(arr: boolean[], totalBits: number): number {
  const e = arr.length > totalBits ? arr.slice(0, totalBits) : arr;
  const c = e.length;
  let r = 0;
  for (let i = c - 1; i >= 0; i--) {
    if (e[i]) r |= 1 << (c - i - 1);
  }
  if (c < totalBits) r <<= totalBits - c;
  return r;
}

// ─── Codec Playability ──────────────────────────────────────────────────────

/**
 * Encode media codec support as a 2-byte bitfield.
 * Values: 0 = unsupported, 1 = maybe, 2 = probably
 */
function encodeCodecPlayability(): Uint8Array {
  const codecs = {
    webm: 2, // VP8/VP9
    mp4: 2, // H.264
    ogg: 0, // Theora (Chrome dropped support)
    aac: 2, // AAC audio
    xm4a: 1, // M4A container
    wav: 2, // PCM audio
    mpeg: 2, // MP3 audio
    ogg2: 2, // Vorbis audio
  };
  const bits = Object.values(codecs)
    .map((c) => c.toString(2).padStart(2, '0'))
    .join('');
  return be16(parseInt(bits, 2));
}

// ─── Timezone Utilities ─────────────────────────────────────────────────────

/** Known timezone enum values for compact encoding in fingerprint Part 2 */
const TIMEZONE_ENUM: Record<string, number> = {
  'America/New_York': 0,
  'America/Sao_Paulo': 1,
  'America/Chicago': 2,
  'America/Los_Angeles': 3,
  'America/Mexico_City': 4,
  'Asia/Shanghai': 5,
};

/**
 * Compute timezone offset and DST difference for fingerprinting.
 * Returns values as (minutes / 15) encoded as unsigned bytes.
 */
function getTimezoneInfo(tz: string): { offset: number; dstDiff: number } {
  const knownOffsets: Record<string, { offset: number; dstDiff: number }> = {
    'America/New_York': { offset: 20, dstDiff: 4 },
    'America/Chicago': { offset: 24, dstDiff: 4 },
    'America/Los_Angeles': { offset: 32, dstDiff: 4 },
    'America/Denver': { offset: 28, dstDiff: 4 },
    'America/Sao_Paulo': { offset: 12, dstDiff: 4 },
    'America/Mexico_City': { offset: 24, dstDiff: 4 },
    'Asia/Shanghai': { offset: 246, dstDiff: 0 },
    'Asia/Tokyo': { offset: 220, dstDiff: 0 },
    'Europe/London': { offset: 0, dstDiff: 4 },
    'Europe/Berlin': { offset: 252, dstDiff: 4 },
    UTC: { offset: 0, dstDiff: 0 },
  };

  try {
    const now = new Date();
    const jan = new Date(now.getFullYear(), 0, 1);
    const jul = new Date(now.getFullYear(), 6, 1);

    const getOffset = (date: Date, zone: string) => {
      const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
      const local = new Date(date.toLocaleString('en-US', { timeZone: zone }));
      return (utc.getTime() - local.getTime()) / 60000;
    };

    const currentOffset = getOffset(now, tz);
    const janOffset = getOffset(jan, tz);
    const julOffset = getOffset(jul, tz);
    const dstDifference = Math.abs(janOffset - julOffset);

    return {
      offset: Math.floor(currentOffset / 15) & 0xff,
      dstDiff: Math.floor(dstDifference / 15) & 0xff,
    };
  } catch {
    return knownOffsets[tz] || { offset: 20, dstDiff: 4 };
  }
}

// ─── Fingerprint Part 1: Device & Rendering ─────────────────────────────────

/**
 * Build device/rendering fingerprint fields (Part 1).
 * Contains hardware info, screen dimensions, browser features,
 * canvas/WebGL render hashes, and the user agent string.
 */
function buildDeviceFingerprint(
  initTime: number,
  profile: BrowserProfile,
  userAgent: string,
): Uint8Array {
  const tz = getTimezoneInfo(profile.timezone);
  const { Byte, EncryptedBytes, CompactInt, RoundedByte, RawAppend } =
    FieldEncoding;

  // Field 12 (user agent) uses manual XXTEA encryption with RawAppend
  const encryptedUA = fieldEncrypt(textEnc(userAgent), 12, initTime);
  const uaPayload = concat(u8(1), u8(encryptedUA.length), encryptedUA);

  const fields: Uint8Array[] = [
    encodeField(0, Byte, 1), // Platform: Win32
    encodeField(1, Byte, 0), // Vendor: Google Inc.
    encodeField(2, EncryptedBytes, textEnc(profile.locale), initTime), // Locale
    encodeField(3, RoundedByte, profile.deviceMemoryGB * 10), // Device memory (GB * 10)
    encodeField(
      4,
      RawAppend,
      concat(
        // Screen dimensions (width + height)
        screenDimBytes(profile.screenWidth, profile.availableWidth),
        screenDimBytes(profile.screenHeight, profile.availableHeight),
      ),
    ),
    encodeField(5, CompactInt, profile.colorDepth), // Screen color depth
    encodeField(6, CompactInt, profile.hardwareConcurrency), // CPU logical cores
    encodeField(7, RoundedByte, profile.devicePixelRatio * 10), // Pixel ratio (* 10)
    encodeField(8, RawAppend, u8(tz.offset, tz.dstDiff)), // Timezone offset info
    encodeField(9, RawAppend, u8(0x02, 0x7d, 0x5f, 0xc9, 0xa7)), // MIME type hash
    encodeField(10, RawAppend, u8(0x05, 0x72, 0x93, 0x02, 0x08)), // Browser plugins hash
    encodeField(
      11,
      RawAppend, // Browser feature flags
      concat(u8(12), encodeBits([0, 1, 2, 3, 4, 5, 6], 16)),
    ),
    encodeField(12, RawAppend, uaPayload), // User agent (encrypted)
    encodeField(13, EncryptedBytes, textEnc('54b4b5cf'), initTime), // Canvas font hash
    encodeField(
      14,
      RawAppend, // Media input devices
      concat(u8(3), encodeBits([0, 1, 2], 8)),
    ),
    // Fields 15 (DoNotTrack) and 16 (JavaEnabled) intentionally omitted
    encodeField(17, Byte, 0), // productSub type
    encodeField(18, EncryptedBytes, textEnc('c6749e76'), initTime), // Canvas circle hash
    encodeField(19, EncryptedBytes, textEnc(profile.gpuRenderer), initTime), // WebGL renderer
    encodeField(
      20,
      EncryptedBytes, // Epoch locale string
      textEnc('12/31/1969, 7:00:00 PM'),
      initTime,
    ),
    encodeField(
      21,
      RawAppend, // WebDriver flags (none set)
      concat(u8(8), encodeBits([], 8)),
    ),
    encodeField(22, CompactInt, 33), // eval.toString() length
    // Field 23 (navigator.buildID) intentionally omitted (Chrome doesn't have it)
    encodeField(24, CompactInt, 12549), // Max recursion depth
    encodeField(25, Byte, 0), // Recursion error message type
    encodeField(26, Byte, 1), // Recursion error name type
    encodeField(27, CompactInt, 4644), // Stack trace string length
    encodeField(28, RawAppend, u8(0x00)), // Touch support metric
    encodeField(29, Byte, 3), // Undefined call error type
    encodeField(30, RawAppend, u8(0x5d, 0xc5, 0xab, 0xb5, 0x88)), // Navigator props hash
    encodeField(31, RawAppend, encodeCodecPlayability()), // Codec playability
  ];

  const data = concat(...fields);
  const sizeIdx = ((7 & FP_PART.DEVICE) << 5) | (31 & fields.length);
  return concat(u8(sizeIdx), data);
}

// ─── Fingerprint Part 2: Browser Environment ────────────────────────────────

/**
 * Build browser environment fingerprint (Part 2).
 * Contains timezone, language info, Chrome-specific feature flags,
 * and various browser environment checks.
 */
function buildBrowserFingerprint(
  profile: BrowserProfile,
  initTime: number,
): Uint8Array {
  const { Byte, EncryptedBytes, CompactInt, Marker, RawAppend } = FieldEncoding;

  // Use compact enum encoding for known timezones, encrypted string otherwise
  const timezoneField =
    profile.timezone in TIMEZONE_ENUM
      ? encodeField(1, Byte, TIMEZONE_ENUM[profile.timezone])
      : encodeField(1, EncryptedBytes, textEnc(profile.timezone), initTime);

  const fields: Uint8Array[] = [
    encodeField(0, Byte, 0), // Constant marker
    timezoneField, // Timezone
    encodeField(
      2,
      EncryptedBytes, // Language list
      textEnc(`${profile.locale},${profile.language}`),
      initTime,
    ),
    encodeField(6, CompactInt, 0), // Expected property count
    encodeField(
      10,
      RawAppend, // Castle data bitfield
      concat(u8(4), encodeBits([1, 2, 3], 8)),
    ),
    encodeField(12, CompactInt, 80), // Negative error string length
    encodeField(13, RawAppend, u8(9, 0, 0)), // Driver check values
    encodeField(
      17,
      RawAppend, // Chrome feature flags
      concat(u8(0x0d), encodeBits([1, 5, 8, 9, 10], 16)),
    ),
    encodeField(18, Marker, 0), // Device logic expected
    encodeField(21, RawAppend, u8(0, 0, 0, 0)), // Class properties count
    encodeField(22, EncryptedBytes, textEnc(profile.locale), initTime), // User locale (secondary)
    encodeField(
      23,
      RawAppend, // Worker capabilities
      concat(u8(2), encodeBits([0], 8)),
    ),
    encodeField(
      24,
      RawAppend, // Inner/outer dimension diff
      concat(be16(0), be16(randInt(10, 30))),
    ),
  ];

  const data = concat(...fields);
  const sizeIdx = ((7 & FP_PART.BROWSER) << 5) | (31 & fields.length);
  return concat(u8(sizeIdx), data);
}

// ─── Fingerprint Part 3: Timing ─────────────────────────────────────────────

/**
 * Build timing fingerprint (Part 3).
 * Contains Castle SDK initialization timing data.
 */
function buildTimingFingerprint(initTime: number): Uint8Array {
  const minute = new Date(initTime).getUTCMinutes();

  const fields: Uint8Array[] = [
    encodeField(3, FieldEncoding.CompactInt, 1), // Time since window.open (ms)
    encodeField(4, FieldEncoding.CompactInt, minute), // Castle init time (minutes)
  ];

  const data = concat(...fields);
  const sizeIdx = ((7 & FP_PART.TIMING) << 5) | (31 & fields.length);
  return concat(u8(sizeIdx), data);
}

// ─── Event Log ──────────────────────────────────────────────────────────────

/** DOM event type IDs used in the simulated event log */
const EventType = {
  CLICK: 0,
  FOCUS: 5,
  BLUR: 6,
  ANIMATIONSTART: 18,
  MOUSEMOVE: 21,
  MOUSELEAVE: 25,
  MOUSEENTER: 26,
  RESIZE: 27,
} as const;

/** Flag bit set on events that include a target element ID */
const HAS_TARGET_FLAG = 128;

/** Target element ID for "unknown element" */
const TARGET_UNKNOWN = 63;

/**
 * Generate a simulated DOM event log.
 * Produces a realistic-looking sequence of mouse, keyboard, and focus events.
 */
function generateEventLog(): Uint8Array {
  const simpleEvents = [
    EventType.MOUSEMOVE,
    EventType.ANIMATIONSTART,
    EventType.MOUSELEAVE,
    EventType.MOUSEENTER,
    EventType.RESIZE,
  ];
  const targetedEvents: number[] = [
    EventType.CLICK,
    EventType.BLUR,
    EventType.FOCUS,
  ];
  const allEvents = [...simpleEvents, ...targetedEvents];

  const count = randInt(30, 70);
  const eventBytes: number[] = [];

  for (let i = 0; i < count; i++) {
    const eventId = allEvents[randInt(0, allEvents.length - 1)];
    if (targetedEvents.includes(eventId)) {
      eventBytes.push(eventId | HAS_TARGET_FLAG);
      eventBytes.push(TARGET_UNKNOWN);
    } else {
      eventBytes.push(eventId);
    }
  }

  // Format: [2-byte total length] [0x00] [2-byte event count] [event bytes...]
  const inner = concat(u8(0), be16(count), new Uint8Array(eventBytes));
  return concat(be16(inner.length), inner);
}

// ─── Behavioral Metrics ─────────────────────────────────────────────────────

/**
 * Build the behavioral bitfield indicating which input types were detected.
 * Simulates a user who used mouse and keyboard (no touch).
 */
function buildBehavioralBitfield(): Uint8Array {
  const flags = new Array(15).fill(false);
  flags[2] = true; // Has click events
  flags[3] = true; // Has keydown events
  flags[5] = true; // Has backspace key
  flags[6] = true; // Not a touch device
  flags[9] = true; // Has mouse movement
  flags[11] = true; // Has focus events
  flags[12] = true; // Has scroll events

  const packedBits = boolsToBin(flags, 16);
  // Encode with type prefix: (6 << 20) | (2 << 16) | value
  const encoded = (6 << 20) | (2 << 16) | (65535 & packedBits);
  return u8((encoded >>> 16) & 0xff, (encoded >>> 8) & 0xff, encoded & 0xff);
}

/** Sentinel: metric not available (e.g., touch metrics on desktop) */
const NO_DATA = -1;

/**
 * Generate simulated behavioral float metrics.
 * Each value represents a statistical measurement of user input patterns
 * (mouse movement angles, key timing, click durations, etc.)
 */
function buildFloatMetrics(): Uint8Array {
  // NO_DATA (-1) encodes as 0x00 (metric not available)
  const metrics: number[] = [
    // ── Mouse & key timing ──
    randFloat(40, 50), //  0: Mouse angle vector mean
    NO_DATA, //  1: Touch angle vector (no touch device)
    randFloat(70, 80), //  2: Key same-time difference
    NO_DATA, //  3: (unused)
    randFloat(60, 70), //  4: Mouse down-to-up time mean
    NO_DATA, //  5: (unused)
    0, //  6: (zero placeholder)
    0, //  7: Mouse click time difference

    // ── Duration distributions ──
    randFloat(60, 80), //  8: Mouse down-up duration median
    randFloat(5, 10), //  9: Mouse down-up duration std deviation
    randFloat(30, 40), // 10: Key press duration median
    randFloat(2, 5), // 11: Key press duration std deviation

    // ── Touch metrics (all disabled for desktop) ──
    NO_DATA,
    NO_DATA,
    NO_DATA,
    NO_DATA, // 12-15
    NO_DATA,
    NO_DATA,
    NO_DATA,
    NO_DATA, // 16-19

    // ── Mouse trajectory analysis ──
    randFloat(150, 180), // 20: Mouse movement angle mean
    randFloat(3, 6), // 21: Mouse movement angle std deviation
    randFloat(150, 180), // 22: Mouse movement angle mean (500ms window)
    randFloat(3, 6), // 23: Mouse movement angle std (500ms window)
    randFloat(0, 2), // 24: Mouse position deviation X
    randFloat(0, 2), // 25: Mouse position deviation Y
    0,
    0, // 26-27: (zero placeholders)

    // ── Touch sequential/gesture metrics (disabled) ──
    NO_DATA,
    NO_DATA, // 28-29
    NO_DATA,
    NO_DATA, // 30-31

    // ── Key pattern analysis ──
    0,
    0, // 32-33: Letter-digit transition ratio
    0,
    0, // 34-35: Digit-invalid transition ratio
    0,
    0, // 36-37: Double-invalid transition ratio

    // ── Mouse vector differences ──
    1.0,
    0, // 38-39: Mouse vector diff (mean, std)
    1.0,
    0, // 40-41: Mouse vector diff 2 (mean, std)
    randFloat(0, 4), // 42: Mouse vector diff (500ms mean)
    randFloat(0, 3), // 43: Mouse vector diff (500ms std)

    // ── Rounded movement metrics ──
    randFloat(25, 50), // 44: Mouse time diff (rounded mean)
    randFloat(25, 50), // 45: Mouse time diff (rounded std)
    randFloat(25, 50), // 46: Mouse vector diff (rounded mean)
    randFloat(25, 30), // 47: Mouse vector diff (rounded std)

    // ── Speed change analysis ──
    randFloat(0, 2), // 48: Mouse speed change mean
    randFloat(0, 1), // 49: Mouse speed change std
    randFloat(0, 1), // 50: Mouse vector 500ms aggregate

    // ── Trailing ──
    1, // 51: Universal flag
    0, // 52: Terminator
  ];

  const out = new Uint8Array(metrics.length);
  for (let i = 0; i < metrics.length; i++) {
    out[i] = metrics[i] === NO_DATA ? 0 : encodeFloatVal(metrics[i]);
  }
  return out;
}

/**
 * Generate simulated event count integers.
 * Each value represents how many times a specific DOM event type occurred.
 */
function buildEventCounts(): Uint8Array {
  const counts: number[] = [
    randInt(100, 200), //  0: mousemove events
    randInt(1, 5), //  1: keyup events
    randInt(1, 5), //  2: click events
    0, //  3: touchstart events (none on desktop)
    randInt(0, 5), //  4: keydown events
    0, //  5: touchmove events (none)
    0, //  6: mousedown-mouseup pairs
    0, //  7: vector diff samples
    randInt(0, 5), //  8: wheel events
    randInt(0, 11), //  9: (internal counter)
    randInt(0, 1), // 10: (internal counter)
  ];
  // Append the count of entries as a trailing byte
  return concat(new Uint8Array(counts), u8(counts.length));
}

/** Combine all behavioral metrics into a single byte sequence */
function buildBehavioralData(): Uint8Array {
  return concat(
    buildBehavioralBitfield(),
    buildFloatMetrics(),
    buildEventCounts(),
  );
}

// ─── Token Assembly ─────────────────────────────────────────────────────────

function buildTokenHeader(
  uuid: string,
  publisherKey: string,
  initTime: number,
): Uint8Array {
  const timestamp = fromHex(encodeTimestampEncrypted(initTime));
  const version = be16(SDK_VERSION);
  const pkBytes = textEnc(publisherKey);
  const uuidBytes = fromHex(uuid);
  return concat(timestamp, version, pkBytes, uuidBytes);
}

/**
 * Generate a Castle.io v11 token for Twitter's login flow.
 *
 * The token embeds a simulated browser fingerprint and behavioral data,
 * encrypted with XXTEA and layered XOR, to satisfy Twitter's anti-bot
 * checks during the login flow.
 *
 * @param userAgent - The user agent string to embed in the fingerprint.
 *   Should match the UA used for HTTP requests.
 * @returns Object with `token` (the Castle request token) and `cuid` (for __cuid cookie)
 */
export function generateLocalCastleToken(userAgent: string): {
  token: string;
  cuid: string;
} {
  const now = Date.now();
  const profile = DEFAULT_PROFILE;

  // Simulate page load: init_time is 2-30 minutes before current time
  const initTime = now - randFloat(2 * 60 * 1000, 30 * 60 * 1000);

  log('Generating local Castle.io v11 token');

  // ── Step 1: Collect fingerprint data ──
  const deviceFp = buildDeviceFingerprint(initTime, profile, userAgent);
  const browserFp = buildBrowserFingerprint(profile, initTime);
  const timingFp = buildTimingFingerprint(initTime);
  const eventLog = generateEventLog();
  const behavioral = buildBehavioralData();

  // Concatenate all parts with 0xFF terminator
  const fingerprintData = concat(
    deviceFp,
    browserFp,
    timingFp,
    eventLog,
    behavioral,
    u8(0xff),
  );

  // ── Step 2: First XOR layer (timestamp-derived key) ──
  const sendTime = Date.now();
  const timestampKey = encodeTimestampEncrypted(sendTime);
  const xorPass1 = deriveAndXor(
    timestampKey,
    4,
    timestampKey[3],
    fingerprintData,
  );

  // ── Step 3: Second XOR layer (UUID-derived key) ──
  const tokenUuid = toHex(getRandomBytes(16));
  const withTimestampPrefix = concat(fromHex(timestampKey), xorPass1);
  const xorPass2 = deriveAndXor(
    tokenUuid,
    8,
    tokenUuid[9],
    withTimestampPrefix,
  );

  // ── Step 4: Build header (timestamp, SDK version, publisher key, UUID) ──
  const header = buildTokenHeader(tokenUuid, TWITTER_CASTLE_PK, initTime);

  // ── Step 5: XXTEA encrypt the full payload ──
  const plaintext = concat(header, xorPass2);
  const encrypted = xxteaEncrypt(plaintext, XXTEA_KEY);

  // ── Step 6: Prepend version and padding info ──
  const paddingBytes = encrypted.length - plaintext.length;
  const versioned = concat(u8(TOKEN_VERSION, paddingBytes), encrypted);

  // ── Step 7: Random-byte XOR + length checksum ──
  const randomByte = getRandomBytes(1)[0];
  const checksum = (versioned.length * 2) & 0xff;
  const withChecksum = concat(versioned, u8(checksum));
  const xored = xorBytes(withChecksum, u8(randomByte));
  const finalPayload = concat(u8(randomByte), xored);

  // ── Step 8: Base64URL encode ──
  const token = base64url(finalPayload);

  log(`Generated castle token: ${token.length} chars, cuid: ${tokenUuid}`);

  return { token, cuid: tokenUuid };
}
