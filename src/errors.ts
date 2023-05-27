import { Response } from 'got-scraping';

export class APIError<T> extends Error {
  constructor(readonly response: Response<T>, message: string) {
    super(message);
  }
}
