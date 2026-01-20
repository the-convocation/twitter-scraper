import { Cookie, CookieJar } from 'tough-cookie';

async function check() {
  const cookiesStr = process.env['TWITTER_COOKIES'];
  if (!cookiesStr) {
    console.log("TWITTER_COOKIES not found in environment");
    return;
  }

  console.log("Raw TWITTER_COOKIES length:", cookiesStr.length);
  // Check for common issues
  if (cookiesStr.startsWith("'") || cookiesStr.startsWith('"')) {
    console.log("WARNING: value starts with quote!");
  }

  let parsed;
  try {
    parsed = JSON.parse(cookiesStr);
    console.log("JSON Parse Success. Items:", parsed.length);
  } catch (e) {
    console.log("JSON Parse Failed:", e.message);
    return;
  }

  const jar = new CookieJar();
  const twUrl = 'https://x.com';

  for (const c of parsed) {
    try {
      const cookie = Cookie.fromJSON(c);
      if (!cookie) {
         console.log("Failed to create cookie from:", JSON.stringify(c));
         continue;
      }
      console.log(`Setting cookie: ${cookie.key} (Domain: ${cookie.domain}, Path: ${cookie.path})`);
      await jar.setCookie(cookie, twUrl);
    } catch (e) {
      console.log("Error setting cookie:", e.message);
    }
  }

  const gotCookies = await jar.getCookies(twUrl);
  console.log("\nCookies retrieved for " + twUrl + ":");
  gotCookies.forEach(c => console.log(`- ${c.key}`));

  const cookieStr = await jar.getCookieString(twUrl);
  const isLoggedIn = cookieStr.includes('ct0=');
  console.log("\nIs Logged In (ct0 present)?", isLoggedIn);
}

check();