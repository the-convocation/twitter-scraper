import { PlatformExtensions, genericPlatform } from './platform-interface';

export * from './platform-interface';

declare const PLATFORM_NODE: boolean;

export class Platform implements PlatformExtensions {
  async randomizeCiphers() {
    const platform = await Platform.importPlatform();
    await platform?.randomizeCiphers();
  }

  private static async importPlatform(): Promise<null | PlatformExtensions> {
    if (PLATFORM_NODE) {
      const { platform } = await import('./node/index.js');
      return platform as PlatformExtensions;
    }

    return genericPlatform;
  }
}
