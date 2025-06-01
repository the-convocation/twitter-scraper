# React Example

Browser usage example in React. Due to Twitter's CORS headers not allowing external websites from calling their APIs,
this requires using a CORS proxy of some kind.

## Running

First, copy `.env.example` to a new `.env.local` file, and update the environment variables to point to your
own account credentials if needed.

In the `cors-proxy` example folder, run the following command:

```bash
yarn start
```

Then, in this folder, run the following command to start the Vite development server:

```bash
yarn dev
```
