import { NextResponse, type NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { ZodError, type ZodTypeAny } from 'zod';
import { ApiError, type FieldIssue } from '../lib/ApiError';
import { logger } from '../lib/logger';
import { env } from '../config/env';

/** Success envelope: { success: true, data } */
export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

export function created<T>(data: T): NextResponse {
  return ok(data, 201);
}

/**
 * Wraps a route handler so every thrown value becomes the documented error
 * envelope: { success: false, message, code, issues? }
 */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    return toErrorResponse(error);
  }
}

export function toErrorResponse(error: unknown): NextResponse {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong on our side';
  let issues: FieldIssue[] | undefined;

  if (error instanceof ApiError) {
    status = error.status;
    code = error.code;
    message = error.message;
    issues = error.issues;
  } else if (error instanceof ZodError) {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Please correct the highlighted fields';
    issues = error.issues.map((issue) => ({ field: issue.path.join('.') || '_', message: issue.message }));
  } else if (error instanceof mongoose.Error.ValidationError) {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Please correct the highlighted fields';
    issues = Object.values(error.errors).map((err) => ({ field: err.path, message: err.message }));
  } else if (error instanceof mongoose.Error.CastError) {
    status = 400;
    code = 'BAD_REQUEST';
    message = `"${String(error.value)}" is not a valid ${error.path}`;
  } else if (isDuplicateKeyError(error)) {
    status = 409;
    code = 'DUPLICATE_KEY';
    const fields = Object.keys(error.keyPattern ?? {});
    const field = fields[0] ?? 'value';
    message = `${humanise(field)} is already in use`;
    issues = fields.map((f) => ({ field: f, message: `${humanise(f)} is already in use` }));
  }

  if (status >= 500) {
    logger.error(`${code}: ${(error as Error)?.message ?? 'unknown error'}`, (error as Error)?.stack);
  }

  return NextResponse.json(
    {
      success: false,
      message,
      code,
      ...(issues?.length ? { issues } : {}),
      ...(env.isDevelopment && status >= 500 ? { stack: (error as Error)?.stack } : {}),
    },
    { status },
  );
}

/** Parses and validates the JSON body of a request. */
export async function parseBody<T extends ZodTypeAny>(request: NextRequest, schema: T): Promise<import('zod').infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw ApiError.badRequest('The request body must be valid JSON');
  }
  return schema.parse(raw);
}

/** Parses and validates the query string. */
export function parseQuery<T extends ZodTypeAny>(request: NextRequest, schema: T): import('zod').infer<T> {
  const params: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    // Empty values mean "not provided" rather than "empty string".
    if (value !== '') params[key] = value;
  });
  return schema.parse(params);
}

interface DuplicateKeyError {
  code: number;
  keyPattern?: Record<string, unknown>;
}

function isDuplicateKeyError(error: unknown): error is DuplicateKeyError {
  return typeof error === 'object' && error !== null && (error as DuplicateKeyError).code === 11000;
}

function humanise(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
