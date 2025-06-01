import proxy from 'express-http-proxy';
import express from 'express';
import setCookie from 'set-cookie-parser';
import libCookie from 'cookie';

const handlers: proxy.ProxyOptions = {
  proxyReqOptDecorator(proxyReqOpts) {
    const originalHeaders = structuredClone(proxyReqOpts.headers);
    for (const header in originalHeaders) {
      if (['origin', 'referer', 'host'].includes(header)) {
        delete proxyReqOpts.headers[header];
      }
    }

    console.log(proxyReqOpts);

    return proxyReqOpts;
  },
  userResHeaderDecorator(headers, userReq) {
    headers['access-control-allow-origin'] = 'http://localhost:5173';
    headers['access-control-allow-credentials'] = 'true';

    headers['access-control-allow-headers'] = Object.keys(headers)
      .concat([
        'authorization',
        'content-type',
        'x-twitter-client-language',
        'x-twitter-auth-type',
        'x-guest-token',
        'x-twitter-active-user',
        'x-rate-limit-remaining',
        'x-rate-limit-reset',
        'x-csrf-token',
      ])
      .join(', ');

    if (headers['location']) {
      console.log(`Removing Location header: ${headers['location']}`);
      delete headers['location'];
    }

    if (headers['set-cookie']) {
      const origin = new URL(userReq.headers['origin']);
      headers['set-cookie'] = headers['set-cookie'].flatMap((header) => {
        const cookie = setCookie.parse(header);
        return cookie.map((c) =>
          libCookie.serialize(c.name, c.value, {
            domain: `.${origin.hostname}`,
            path: '/',
            expires: c.expires,
          }),
        );
      });
    }

    console.log(headers);

    return headers;
  },
  userResDecorator(_proxyRes, proxyResData, userReq, userRes) {
    if (
      userReq.method === 'OPTIONS' ||
      (userReq.statusCode >= 300 && userRes.statusCode < 400)
    ) {
      // Disable redirects, always return OK on OPTIONS
      userRes.statusCode = 200;
    }

    return proxyResData;
  },
};

const api = express();
api.use('/', proxy('https://api.x.com', handlers));
api.listen(5174);

const web = express();
web.use('/', proxy('https://x.com', handlers));
web.listen(5175);
