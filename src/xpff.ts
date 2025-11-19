import debug from 'debug';

const log = debug('twitter-scraper:xpff');

let isoCrypto: Crypto | null = null;

async function getCrypto(): Promise<Crypto> {
  if (isoCrypto != null) {
    return isoCrypto;
  }

  // In Node.js, the global `crypto` object is only available from v19.0.0 onwards.
  // For earlier versions, we need to import the 'crypto' module.
  if (typeof crypto === 'undefined') {
    log('Global crypto is undefined, importing from crypto module...');
    const { webcrypto } = await import('crypto');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isoCrypto = webcrypto as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return webcrypto as any;
  }
  isoCrypto = crypto;
  return crypto;
}

async function sha256(message: string): Promise<Uint8Array> {
  const msgBuffer = new TextEncoder().encode(message);
  const crypto = await getCrypto();
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return new Uint8Array(hashBuffer);
}

// https://stackoverflow.com/a/40031979
function buf2hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

// Adapted from https://github.com/dsekz/twitter-x-xp-forwarded-for-header
export class XPFFHeaderGenerator {
  constructor(private readonly seed: string) {}

  private async deriveKey(guestId: string): Promise<Uint8Array> {
    const combined = `${this.seed}${guestId}`;
    const result = await sha256(combined);
    return result;
  }

  async generateHeader(plaintext: string, guestId: string): Promise<string> {
    log(`Generating XPFF key for guest ID: ${guestId}`);
    const key = await this.deriveKey(guestId);
    const crypto = await getCrypto();
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.importKey(
      'raw',
      key as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['encrypt'],
    );
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
      },
      cipher,
      new TextEncoder().encode(plaintext),
    );

    // Combine nonce and encrypted data
    const combined = new Uint8Array(nonce.length + encrypted.byteLength);
    combined.set(nonce);
    combined.set(new Uint8Array(encrypted), nonce.length);
    const result = buf2hex(combined.buffer);

    log(`XPFF header generated for guest ID ${guestId}: ${result}`);

    return result;
  }
}

const xpffBaseKey =
  '0e6be1f1e21ffc33590b888fd4dc81b19713e570e805d4e5df80a493c9571a05';

function xpffPlain(): string {
  const timestamp = Date.now();
  return JSON.stringify({
    navigator_properties: {
      hasBeenActive: 'true',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      webdriver: 'false',
    },
    created_at: timestamp,
  });
}

export async function generateXPFFHeader(guestId: string): Promise<string> {
  const generator = new XPFFHeaderGenerator(xpffBaseKey);
  const plaintext = xpffPlain();
  return generator.generateHeader(plaintext, guestId);
}
