import { gotScraping, Headers, Response } from 'got-scraping';

export const bearerToken =
  'AAAAAAAAAAAAAAAAAAAAAPYXBAAAAAAACLXUNDekMxqa8h%2F40K4moUkGsoc%3DTYfbDKbT3jJPCEVnMYqilB28NHfOPqkca3qaAxGfsyKCs0wRbw';

export type RequestApiResult<T> =
  | { success: true; deleteGuest: boolean; value: T }
  | { success: false; deleteGuest: boolean; err: Error };

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
    res = await gotScraping.get({
      url,
      headers,
    });
  } catch (err) {
    if (!(err instanceof Error)) {
      throw err;
    }

    return {
      success: false,
      deleteGuest: false,
      err: new Error('Failed to perform request.'),
    };
  }

  if (res.statusCode != 200 && res.statusCode != 403) {
    return {
      success: false,
      deleteGuest: false,
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

export interface GuestAuthentication {
  token: string;
  createdAt: Date;
}

export async function getGuestToken(
  authorization: string,
): Promise<RequestApiResult<GuestAuthentication>> {
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

    return {
      success: false,
      deleteGuest: false,
      err: new Error('Failed to request guest token.'),
    };
  }

  if (res.statusCode != 200) {
    return { success: false, deleteGuest: false, err: new Error(res.body) };
  }

  const o = JSON.parse(res.body);
  if (o == null || o['guest_token'] == null) {
    return {
      success: false,
      deleteGuest: false,
      err: new Error('guest_token not found.'),
    };
  }

  const guestToken = o['guest_token'];
  if (typeof guestToken !== 'string') {
    return {
      success: false,
      deleteGuest: false,
      err: new Error('guest_token was not a string.'),
    };
  }

  return {
    success: true,
    deleteGuest: false,
    value: { token: guestToken, createdAt: new Date() },
  };
}
