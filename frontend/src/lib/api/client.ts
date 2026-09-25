import { apiBaseUrl } from "./config";

const TOKEN_KEY = "cargotrack.token";

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Storage unavailable (private mode); the session lasts until reload.
  }
}

/** Fired when the API rejects the token, so the auth context can sign out. */
export const UNAUTHORIZED_EVENT = "cargotrack:unauthorized";

/**
 * An API error with the server's own words. The backend answers
 * `{ message, error, guard? }`; `message` is a string or, for validation
 * failures, a list of strings.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: Record<string, unknown> | null,
  ) {
    super(message);
  }

  /** The payment guard that refused a transition, e.g. "deposit". */
  get guard(): string | undefined {
    return typeof this.body?.guard === "string" ? this.body.guard : undefined;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Multipart upload; takes precedence over `body`. */
  form?: FormData;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = getToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let body: BodyInit | undefined;

  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${apiBaseUrl}/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
  });

  if (!response.ok) {
    const parsed = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const raw = parsed?.message;
    const message = Array.isArray(raw)
      ? raw.join("; ")
      : typeof raw === "string"
        ? raw
        : `Request failed (${response.status})`;

    if (response.status === 401 && token) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }

    throw new ApiError(response.status, message, parsed);
  }

  return response;
}

/** JSON request. Returns undefined for 204 No Content. */
export async function api<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await send(path, options);

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/**
 * Downloads a protected file. A plain <a href> cannot carry the bearer
 * token, so the bytes are fetched and handed to the browser as a blob.
 */
export async function download(path: string, fallbackName: string) {
  const response = await send(path, {});
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
