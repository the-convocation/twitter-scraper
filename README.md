# twitter-scraper
[![Documentation badge](https://img.shields.io/badge/docs-here-informational)](https://the-convocation.github.io/twitter-scraper/)

A port of [n0madic/twitter-scraper](https://github.com/n0madic/twitter-scraper) to Node.js.

> Twitter's API is annoying to work with, and has lots of limitations — luckily their frontend (JavaScript) has it's own API, which I reverse-engineered. No API rate limits. No tokens needed. No restrictions. Extremely fast.
>
> You can use this library to get the text of any user's Tweets trivially.

Note that some API operations, such as search, require logging in with a real user account.
Refer to the [original README](https://github.com/n0madic/twitter-scraper) for details.

## Installation
This package requires Node.js v16.0.0 or greater.

NPM:
```sh
npm install @the-convocation/twitter-scraper
```

Yarn:
```sh
yarn add @the-convocation/twitter-scraper
```

TypeScript types have been bundled with the distribution.

## Contributing
We use [Conventional Commits](https://www.conventionalcommits.org), and enforce this with precommit checks.