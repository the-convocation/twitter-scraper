import { gotScraping, Headers, Response } from 'got-scraping';

export const bearerToken =
  'AAAAAAAAAAAAAAAAAAAAAPYXBAAAAAAACLXUNDekMxqa8h%2F40K4moUkGsoc%3DTYfbDKbT3jJPCEVnMYqilB28NHfOPqkca3qaAxGfsyKCs0wRbw';

type RequestApiResult<T> =
  | { success: true; deleteGuest: boolean; value: T }
  | { success: false; err: Error };

export async function requestApi<T>(
  url: string,
  authorization: string,
  xGuestToken: string,
  cookie: string,
  xCsrfToken: string,
): Promise<RequestApiResult<T>> {
  const headers: Headers = {
    Authorization: `Bearer ${authorization}`,
    'X-Guest-Token': xGuestToken,
  };

  if (cookie != '' && xCsrfToken != '') {
    headers['Cookie'] = cookie;
    headers['x-csrf-token'] = xCsrfToken;
  }

  let res: Response<string>;
  try {
    res = await gotScraping.post({
      url,
      headers,
    });
  } catch (err) {
    if (!(err instanceof Error)) {
      throw err;
    }

    return {
      success: false,
      err: new Error('Failed to perform request.'),
    };
  }

  if (res.statusCode != 200 && res.statusCode != 403) {
    return {
      success: false,
      err: new Error(`Response status: ${res.statusCode}`),
    };
  }

  const value: T = JSON.parse(res.body);
  if (res.headers['x-rate-limit-incoming'] == '0') {
    return { success: true, deleteGuest: true, value };
  } else {
    return { success: true, deleteGuest: false, value };
  }
}

type GuestAuthenticationResult =
  | { success: true; token: string; createdAt: Date }
  | { success: false; err: Error };

export async function getGuestToken(
  authorization: string,
): Promise<GuestAuthenticationResult> {
  let res: Response<string>;
  try {
    res = await gotScraping.post({
      url: 'https://api.twitter.com/1.1/guest/activate.json',
      headers: {
        Authorization: `Bearer ${authorization}`,
      },
    });
  } catch (err) {
    if (!(err instanceof Error)) {
      throw err;
    }

    return { success: false, err: new Error('Failed to request guest token.') };
  }

  if (res.statusCode != 200) {
    return { success: false, err: new Error(res.body) };
  }

  const o = JSON.parse(res.body);
  if (o == null || o['guest_token'] == null) {
    return { success: false, err: new Error('guest_token not found.') };
  }

  const guestToken = o['guest_token'];
  if (typeof guestToken !== 'string') {
    return { success: false, err: new Error('guest_token was not a string.') };
  }

  return { success: true, token: guestToken, createdAt: new Date() };
}
