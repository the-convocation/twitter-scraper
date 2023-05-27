import { Response } from 'got-scraping';

export class ApiError<T> extends Error {
  constructor(readonly response: Response<T>, message: string) {
    super(message);
  }
}
