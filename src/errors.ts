export class ApiError extends Error {
  constructor(readonly response: Response, message: string) {
    super(message);
  }
}

interface Position {
  line: number;
  column: number;
}

interface TraceInfo {
  trace_id: string;
}

interface TwitterApiErrorExtensions {
  code?: number;
  kind?: string;
  name?: string;
  source?: string;
  tracing?: TraceInfo;
}

export interface TwitterApiErrorRaw extends TwitterApiErrorExtensions {
  message?: string;
  locations?: Position[];
  path?: string[];
  extensions?: TwitterApiErrorExtensions;
}
