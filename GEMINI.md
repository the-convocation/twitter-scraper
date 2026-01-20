# Twitter Scraper

## Project Overview

This project is a Node.js library for scraping Twitter (X). It is a port of the `n0madic/twitter-scraper` library, designed to work without API keys by reverse-engineering the Twitter frontend API.

**Key Features:**
*   **Authentication:** Supports guest and user login (username/password/email/2FA).
*   **Functionality:** Scrapes profiles, tweets, search results, trends, and relationships (followers/following).
*   **Resilience:** Includes built-in rate limit handling and supports proxy configuration.
*   **Bypass:** Optional integration with `cycletls` to bypass Cloudflare bot detection.
*   **Universal:** Works in Node.js and Edge runtimes (with some caveats for browser usage due to CORS).

## Architecture

The project is structured as a modular TypeScript library.

*   **Core:** `src/scraper.ts` exports the main `Scraper` class, which acts as a facade for various functional modules.
*   **Auth:** `src/auth.ts` and `src/auth-user.ts` handle guest and user authentication logic, including cookie management via `tough-cookie`.
*   **API:** `src/api.ts` manages low-level API requests and response types.
*   **Modules:** Specific scraping logic is divided into files like `src/tweets.ts`, `src/profile.ts`, `src/search.ts`, etc.
*   **Build:** Uses `rollup` with `esbuild` to bundle for CommonJS and ESM, targeting both Node.js and browser environments (with separate builds).

## Building and Running

### Prerequisites
*   Node.js v16+ (Runtime), Node.js v18+ (Dev/Build)
*   Yarn (via Corepack)

### Commands

*   **Install Dependencies:**
    ```bash
    yarn install
    ```

*   **Build Project:**
    Compiles TypeScript to `dist/` using Rollup.
    ```bash
    yarn build
    ```

*   **Run Tests:**
    Runs Jest unit tests.
    ```bash
    yarn test
    ```
    *Note: Tests require valid Twitter credentials in environment variables (see `README.md`).*

*   **Lint & Format:**
    ```bash
    yarn lint-staged # Runs eslint and prettier on staged files
    # or manually:
    yarn format
    ```

*   **Generate Documentation:**
    ```bash
    yarn docs:generate
    ```

## Development Conventions

*   **Language:** TypeScript (Strict mode enabled).
*   **Style:** Prettier and ESLint are enforced.
*   **Commits:** Follows [Conventional Commits](https://www.conventionalcommits.org) (e.g., `feat:`, `fix:`, `chore:`).
*   **Testing:** Jest is used for testing. Tests are located in `src/*.test.ts` or `test/*.test.ts`.
*   **Package Management:** Uses `yarn` with `yarn.lock`.
