import { API_BASE_URL } from "./config";
import type { ApiErrorBody } from "./types";

const DEFAULT_TIMEOUT_MS = 15_000;

/** A non-2xx response from the API, with the fields from its error body. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field: string | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(status: number, code: string, message: string, field?: string, retryAfterMs?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
    this.retryAfterMs = retryAfterMs;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/** fetch itself failed: offline, DNS, CORS. The request may or may not have reached the server. */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super("Can't reach CashMine. Check your connection and try again.");
    this.name = "NetworkError";
    this.cause = cause;
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/** Our own client-side deadline passed. The request may or may not have reached the server. */
export class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`The request took longer than ${Math.round(timeoutMs / 1000)} seconds.`);
    this.name = "TimeoutError";
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** A human-readable message for any error thrown by this module. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong.";
}

export interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  token?: string;
  idempotencyKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

/**
 * Calls the API. GET requests that hit a 429 wait `retryAfterMs` and retry once.
 * POST requests are never retried here: whether a retry is safe is the caller's decision.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const method = options.method ?? "GET";
  try {
    return await request<T>(path, method, options);
  } catch (error) {
    if (method === "GET" && isApiError(error) && error.status === 429 && !options.signal?.aborted) {
      await sleep(error.retryAfterMs ?? 1_000);
      return request<T>(path, method, options);
    }
    throw error;
  }
}

async function request<T>(path: string, method: "GET" | "POST", options: RequestOptions): Promise<ApiResponse<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error; // the caller cancelled; not an API failure
    if (controller.signal.aborted) throw new TimeoutError(timeoutMs);
    throw new NetworkError(error);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }

  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!response.ok) throw toApiError(response, json);
  return { data: json as T, status: response.status, headers: response.headers };
}

function toApiError(response: Response, json: unknown): ApiError {
  const body = isApiErrorBody(json) ? json.error : undefined;
  const retryAfterHeader = response.headers.get("Retry-After");
  const retryAfterMs = body?.retryAfterMs ?? (retryAfterHeader ? Number(retryAfterHeader) * 1_000 : undefined);
  return new ApiError(
    response.status,
    body?.code ?? "UNKNOWN",
    body?.message ?? `Request failed with status ${response.status}.`,
    body?.field,
    retryAfterMs !== undefined && Number.isFinite(retryAfterMs) ? retryAfterMs : undefined,
  );
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as { error: unknown }).error;
  return typeof error === "object" && error !== null && "code" in error && "message" in error;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
