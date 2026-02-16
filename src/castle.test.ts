import { generateLocalCastleToken } from './castle';
import { CHROME_USER_AGENT } from './api';

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
