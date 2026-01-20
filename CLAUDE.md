# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
# Install dependencies (uses Corepack for Yarn version management)
corepack enable
yarn

# Build the project
yarn build

# Run all tests (requires environment variables - see Testing section)
yarn test

# Run a single test file
node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/profile.test.ts --runInBand

# Format code
yarn format

# Generate documentation
yarn docs:generate
```

## Testing

Tests require these environment variables:
- `TWITTER_USERNAME` - Account username
- `TWITTER_PASSWORD` - Account password
- `TWITTER_EMAIL` - Account email
- `TWITTER_COOKIES` - JSON-serialized array of cookies (optional, for authenticated session)
- `PROXY_URL` - HTTP(s) proxy for requests (optional)

Tests use Jest with ESM support and run in Node environment.

## Architecture

### Core Classes

**Scraper** (`src/scraper.ts`) - Main entry point and public API. Wraps authentication and exposes methods for fetching tweets, profiles, search results, DMs, trends, and relationships. Maintains two auth instances (`auth` and `authTrends`) that can be either guest or user auth.

**TwitterAuth** (`src/auth.ts`) - Interface defining authentication contract. Two implementations:
- `TwitterGuestAuth` - Guest token auth, auto-refreshes tokens every 3 hours
- `TwitterUserAuth` (`src/auth-user.ts`) - Full user login with cookie management, 2FA support, and subtask handlers for login flow challenges

### API Request System

**api-data.ts** - Contains hardcoded GraphQL endpoint URLs with their query parameters as templates. The `apiRequestFactory` parses these URLs to extract variables/features/fieldToggles and creates mutable `ApiRequest` objects.

**api.ts** - Core `requestApi()` function handles all HTTP requests including:
- Authentication header installation
- Rate limit handling (HTTP 429) with configurable strategies
- Cookie jar updates
- Optional `x-client-transaction-id` and `x-xp-forwarded-for` experimental headers

### Timeline Parsing

The codebase has two API response formats:
- **V1** (`timeline-v1.ts`) - Legacy format with `LegacyTweetRaw`
- **V2** (`timeline-v2.ts`) - GraphQL timeline format with nested `TimelineEntryRaw` structures

`timeline-tweet-util.ts` handles common parsing like media groups and HTML reconstruction.

`timeline-async.ts` provides the async generator pattern used throughout for paginated results.

### Bearer Tokens

Two bearer tokens exist in `api.ts`:
- `bearerToken` - Default token for guest auth
- `bearerToken2` - Used for specific endpoints (UserTweets, UserByScreenName, TweetDetail, etc.)

### Platform Abstraction

`src/platform/` provides Node.js-specific functionality like TLS cipher randomization to avoid bot detection.

### Build Output

Uses Rollup to build multiple output formats:
- `dist/default/` - Default builds (CJS/ESM)
- `dist/node/` - Node-specific builds
- `dist/cycletls/` - Optional CycleTLS integration for Cloudflare bypass
- `dist/types/` - TypeScript declarations

## Commit Convention

Uses [Conventional Commits](https://www.conventionalcommits.org). Run `yarn commit` for guided commit message creation.
