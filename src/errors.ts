export class ApiError extends Error {
  constructor(readonly response: Response, readonly data: any) {
    super(
      `Response status: ${response.status} | response: ${JSON.stringify(
        response,
      )} | data: ${JSON.stringify(data)}`,
    );
  }

  static async fromResponse(response: Response) {
    // Try our best to parse the result, but don't bother if we can't
    let data: string | object | undefined = undefined;
    try {
      if (response.headers.get('content-type')?.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }
    } catch {
      try {
        data = await response.text();
      } catch {}
    }

    return new ApiError(response, data);
  }
}

export class AuthenticationError extends Error {
  constructor(message?: string) {
    super(message || 'Authentication failed');
    this.name = 'AuthenticationError';
  }
}

export interface TwitterApiErrorPosition {
  line: number;
  column: number;
}

export interface TwitterApiErrorTraceInfo {
  trace_id: string;
}

export interface TwitterApiErrorExtensions {
  code?: number;
  kind?: string;
  name?: string;
  source?: string;
  tracing?: TwitterApiErrorTraceInfo;
}

export interface TwitterApiErrorRaw extends TwitterApiErrorExtensions {
  message?: string;
  locations?: TwitterApiErrorPosition[];
  path?: string[];
  extensions?: TwitterApiErrorExtensions;
}
