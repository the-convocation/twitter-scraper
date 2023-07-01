export class ApiError extends Error {
  constructor(readonly response: Response, message: string) {
    super(message);
  }
}
