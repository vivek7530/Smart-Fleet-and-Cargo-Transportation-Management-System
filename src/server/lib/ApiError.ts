export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DUPLICATE_KEY'
  | 'UNPROCESSABLE'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_ERROR';

export interface FieldIssue {
  field: string;
  message: string;
}

/** Every deliberate failure thrown by the API is an ApiError. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly issues?: FieldIssue[];

  constructor(status: number, code: ApiErrorCode, message: string, issues?: FieldIssue[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'Bad request', code: ApiErrorCode = 'BAD_REQUEST') {
    return new ApiError(400, code, message);
  }
  static validation(message = 'The submitted data is invalid', issues?: FieldIssue[]) {
    return new ApiError(422, 'VALIDATION_ERROR', message, issues);
  }
  static unauthenticated(message = 'You must be signed in to continue', code: ApiErrorCode = 'UNAUTHENTICATED') {
    return new ApiError(401, code, message);
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'The requested resource was not found') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message = 'That action conflicts with the current state', code: ApiErrorCode = 'CONFLICT') {
    return new ApiError(409, code, message);
  }
  static internal(message = 'Something went wrong on our side') {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }
}
