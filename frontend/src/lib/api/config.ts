/**
 * The API base URL is resolved in the browser, so it must be a host-reachable
 * address — never the `backend` Compose service name.
 *
 * NEXT_PUBLIC_* values are inlined at build time, which is why the production
 * Docker stage takes it as a build arg.
 */
export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
