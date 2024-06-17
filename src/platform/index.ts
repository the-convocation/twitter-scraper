import { PlatformExtensions, genericPlatform } from './platform-interface';

export * from './platform-interface';

declare const PLATFORM_NODE: boolean;
declare const PLATFORM_NODE_JEST: boolean;

export class Platform implements PlatformExtensions {
  async randomizeCiphers() {
    const platform = await Platform.importPlatform();
    await platform?.randomizeCiphers();
  }

  private static async importPlatform(): Promise<null | PlatformExtensions> {
    if (PLATFORM_NODE) {
      const { platform } = await import('./node/index.js');
      return platform as PlatformExtensions;
    } else if (PLATFORM_NODE_JEST) {
      // Jest gets unhappy when using an await import here, so we just use require instead.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { platform } = require('./node');
      return platform as PlatformExtensions;
    }

    return genericPlatform;
  }
}
