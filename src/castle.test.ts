import {
  generateLocalCastleToken,
  xxteaEncrypt,
  encodeField,
  FieldEncoding,
  customFloatEncode,
  encodeFloatVal,
  encodeTimestampBytes,
} from './castle';
import { CHROME_USER_AGENT } from './api';

// ─── XXTEA Encryption ─────────────────────────────────────────────────────

describe('xxteaEncrypt', () => {
  it('should produce deterministic output for identical inputs', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const key = [0x01234567, 0x89abcdef, 0xfedcba98, 0x76543210];

    const result1 = xxteaEncrypt(data, key);
    const result2 = xxteaEncrypt(data, key);
    expect(result1).toEqual(result2);
  });

  it('should produce output different from input', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const key = [0x01234567, 0x89abcdef, 0xfedcba98, 0x76543210];

    const result = xxteaEncrypt(data, key);
    // At least some bytes should differ
    let differences = 0;
    for (let i = 0; i < data.length; i++) {
      if (result[i] !== data[i]) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });

  it('should produce different output for different inputs (avalanche)', () => {
    const data1 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const data2 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 9]); // 1 bit diff
    const key = [0x01234567, 0x89abcdef, 0xfedcba98, 0x76543210];

    const result1 = xxteaEncrypt(data1, key);
    const result2 = xxteaEncrypt(data2, key);
    expect(result1).not.toEqual(result2);
  });

  it('should produce different output for different keys', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const key1 = [0x01234567, 0x89abcdef, 0xfedcba98, 0x76543210];
    const key2 = [0x01234567, 0x89abcdef, 0xfedcba98, 0x76543211];

    const result1 = xxteaEncrypt(data, key1);
    const result2 = xxteaEncrypt(data, key2);
    expect(result1).not.toEqual(result2);
  });

  it('should pad output to 4-byte boundary', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]); // 5 bytes → pads to 8
    const key = [1, 2, 3, 4];
    const result = xxteaEncrypt(data, key);
    expect(result.length % 4).toBe(0);
    expect(result.length).toBe(8);
  });

  it('should return padded input unchanged when n <= 1 (4 bytes or less)', () => {
    const data = new Uint8Array([1, 2, 3, 4]); // exactly 1 word
    const key = [1, 2, 3, 4];
    const result = xxteaEncrypt(data, key);
    // n <= 1 returns padded, which is identical to input for 4-byte aligned data
    expect(result).toEqual(data);
  });

  it('should handle all-zero data and key', () => {
    const data = new Uint8Array(8); // 8 zero bytes
    const key = [0, 0, 0, 0];
    const result = xxteaEncrypt(data, key);
    expect(result.length).toBe(8);
    // Even with all zeros, encryption should produce non-zero output
    // (DELTA accumulates across rounds)
    const allZero = result.every((b) => b === 0);
    expect(allZero).toBe(false);
  });

  it('should handle large inputs', () => {
    const data = new Uint8Array(256).fill(0xab);
    const key = [1, 2, 3, 4];
    const result = xxteaEncrypt(data, key);
    expect(result.length).toBe(256);
  });
});

// ─── Timestamp Encoding ──────────────────────────────────────────────────

describe('encodeTimestampBytes', () => {
  it('should encode a known timestamp correctly', () => {
    // TS_EPOCH = 1535e6, so ms = (TS_EPOCH + 100) * 1000 should yield t = 100
    const ms = (1535e6 + 100) * 1000;
    const result = encodeTimestampBytes(ms);
    expect(result.length).toBe(4);
    // t = 100 = 0x00000064, big-endian
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(0);
    expect(result[3]).toBe(100);
  });

  it('should clamp to 0 for timestamps before epoch', () => {
    const ms = 0; // way before TS_EPOCH
    const result = encodeTimestampBytes(ms);
    // Should be clamped to 0
    expect(result).toEqual(new Uint8Array([0, 0, 0, 0]));
  });

  it('should clamp to max 28-bit value for far-future timestamps', () => {
    // 268435455 = 0x0FFFFFFF (max 28-bit unsigned)
    const ms = (1535e6 + 268435455 + 1000) * 1000;
    const result = encodeTimestampBytes(ms);
    // Should be clamped to 0x0FFFFFFF
    expect(result[0]).toBe(0x0f);
    expect(result[1]).toBe(0xff);
    expect(result[2]).toBe(0xff);
    expect(result[3]).toBe(0xff);
  });

  it('should return 4 bytes for current timestamps', () => {
    const result = encodeTimestampBytes(Date.now());
    expect(result.length).toBe(4);
  });
});

// ─── Custom Float Encoding ───────────────────────────────────────────────

describe('customFloatEncode', () => {
  it('should return 0 for value 0', () => {
    expect(customFloatEncode(4, 3, 0)).toBe(0);
    expect(customFloatEncode(2, 4, 0)).toBe(0);
  });

  it('should encode value 1.0 with no mantissa (1.0 has frac=0)', () => {
    // 1.0: exp=0, mantissa=0 → 0
    const result = customFloatEncode(4, 3, 1.0);
    expect(result).toBe(0);
  });

  it('should encode value 2.0 correctly', () => {
    // 2.0: n=2 → divide by 2 once → n=1, exp=1, frac=0, mantissa=0
    // result = (1 << 3) | 0 = 8
    const result = customFloatEncode(4, 3, 2.0);
    expect(result).toBe(8);
  });

  it('should encode value 1.5 correctly', () => {
    // 1.5: exp=0, frac=0.5, mantissa with 3 bits: 0.5*2=1 → bit at pos 1 → 1<<(3-1) = 4
    const result = customFloatEncode(4, 3, 1.5);
    expect(result).toBe(4);
  });

  it('should clamp exponent to max for very large values', () => {
    // With 4 exp bits, max exp = 15
    const result = customFloatEncode(4, 3, 1e20);
    const exp = result >> 3;
    expect(exp).toBeLessThanOrEqual(15);
  });
});

describe('encodeFloatVal', () => {
  it('should handle 0 input (clamped from negative by Math.max)', () => {
    // encodeFloatVal clamps to 0 via Math.max, then encodes 0+1=1 in 2/4 format
    // The NO_DATA sentinel (-1) is handled by the caller (buildFloatMetrics),
    // not by encodeFloatVal itself.
    const result = encodeFloatVal(0);
    // 0 → n=0, n<=15 → 64 | customFloatEncode(2, 4, 1) = 64 | 0 = 64
    expect(result).toBe(64);
  });

  it('should use 2/4 format for values <= 15', () => {
    const result = encodeFloatVal(5);
    // Should have bit 6 set (64 | ...)
    expect(result & 0x40).toBe(64);
    expect(result & 0x80).toBe(0); // bit 7 should NOT be set
  });

  it('should use 4/3 format for values > 15', () => {
    const result = encodeFloatVal(100);
    // Should have bit 7 set (128 | ...)
    expect(result & 0x80).toBe(128);
  });

  it('should produce values in byte range', () => {
    for (const v of [0, 1, 5, 10, 15, 16, 50, 100, 200]) {
      const result = encodeFloatVal(v);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(255);
    }
  });
});

// ─── Field Serialization ─────────────────────────────────────────────────

describe('encodeField', () => {
  it('should encode Empty field as single header byte', () => {
    const result = encodeField(5, FieldEncoding.Empty, 0);
    expect(result.length).toBe(1);
    // Header: (5 << 3) | (7 & -1) = 40 | 7 = 47
    expect(result[0]).toBe(47);
  });

  it('should encode Marker field as single header byte', () => {
    const result = encodeField(3, FieldEncoding.Marker, 0);
    expect(result.length).toBe(1);
    // Header: (3 << 3) | (7 & 1) = 24 | 1 = 25
    expect(result[0]).toBe(25);
  });

  it('should encode Byte field as header + 1 byte', () => {
    const result = encodeField(0, FieldEncoding.Byte, 42);
    expect(result.length).toBe(2);
    // Header: (0 << 3) | (7 & 3) = 3
    expect(result[0]).toBe(3);
    expect(result[1]).toBe(42);
  });

  it('should encode RoundedByte field with rounding', () => {
    const result = encodeField(1, FieldEncoding.RoundedByte, 3.7);
    expect(result.length).toBe(2);
    // Header: (1 << 3) | (7 & 6) = 8 | 6 = 14
    expect(result[0]).toBe(14);
    expect(result[1]).toBe(4); // Math.round(3.7) = 4
  });

  it('should encode CompactInt with single byte for values <= 127', () => {
    const result = encodeField(2, FieldEncoding.CompactInt, 100);
    expect(result.length).toBe(2);
    // Header: (2 << 3) | (7 & 5) = 16 | 5 = 21
    expect(result[0]).toBe(21);
    expect(result[1]).toBe(100);
  });

  it('should encode CompactInt with two bytes for values > 127', () => {
    const result = encodeField(2, FieldEncoding.CompactInt, 200);
    expect(result.length).toBe(3); // header + 2 bytes
    expect(result[0]).toBe(21);
    // be16((1 << 15) | (32767 & 200)) = be16(32968)
    // 32968 = 0x80C8
    expect(result[1]).toBe(0x80);
    expect(result[2]).toBe(0xc8);
  });

  it('should encode RawAppend with byte array', () => {
    const val = new Uint8Array([0xde, 0xad]);
    const result = encodeField(10, FieldEncoding.RawAppend, val);
    // Header: (10 << 3) | (7 & 7) = 80 | 7 = 87
    expect(result[0]).toBe(87);
    expect(result[1]).toBe(0xde);
    expect(result[2]).toBe(0xad);
  });

  it('should encode EncryptedBytes with initTime', () => {
    const val = new TextEncoder().encode('hello');
    const result = encodeField(13, FieldEncoding.EncryptedBytes, val, 1000);
    // Header: (13 << 3) | (7 & 4) = 104 | 4 = 108
    expect(result[0]).toBe(108);
    // Next byte is the encrypted data length
    expect(result[1]).toBeGreaterThan(0);
    // Total should be header + length byte + encrypted data
    expect(result.length).toBe(2 + result[1]);
  });

  it('should throw when EncryptedBytes used without initTime', () => {
    const val = new TextEncoder().encode('hello');
    expect(() => encodeField(0, FieldEncoding.EncryptedBytes, val)).toThrow(
      'initTime is required',
    );
  });
});

// ─── Token Generation (Integration) ─────────────────────────────────────

describe('Castle.io token generation', () => {
  it('should generate a valid token and cuid', () => {
    const result = generateLocalCastleToken(CHROME_USER_AGENT);

    // Token should be a non-empty Base64URL string
    expect(result.token).toBeDefined();
    expect(result.token.length).toBeGreaterThan(100);
    // Base64URL chars only (no +, /, or =)
    expect(result.token).toMatch(/^[A-Za-z0-9_-]+$/);

    // CUID should be 32 hex chars
    expect(result.cuid).toBeDefined();
    expect(result.cuid).toMatch(/^[0-9a-f]{32}$/);
  });

  it('should generate unique tokens each time', () => {
    const r1 = generateLocalCastleToken(CHROME_USER_AGENT);
    const r2 = generateLocalCastleToken(CHROME_USER_AGENT);

    // Tokens should differ (random elements)
    expect(r1.token).not.toEqual(r2.token);
    // CUIDs should differ
    expect(r1.cuid).not.toEqual(r2.cuid);
  });

  it('should generate reasonably sized tokens', () => {
    const result = generateLocalCastleToken(CHROME_USER_AGENT);

    // Token should be between 500 and 2000 chars (v11 tokens are ~800-1200)
    expect(result.token.length).toBeGreaterThan(500);
    expect(result.token.length).toBeLessThan(2000);
  });
});
