// For some reason using Parameters<typeof fetch> reduces the request transform function to
// `(url: string) => string` in tests.
export type FetchParameters = [input: RequestInfo | URL, init?: RequestInit];
