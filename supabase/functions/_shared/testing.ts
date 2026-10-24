// Test helpers: Google is faked in tests, never called (plan section 14).
import type { FetchFn } from "./google.ts";

export interface RecordedRequest {
  url: URL;
  method: string;
  headers: Headers;
  body: string;
}

type Route = (req: RecordedRequest) => Response | Promise<Response>;

/** A fetch that answers by URL prefix and records every request it sees. */
export function fakeFetch(
  routes: Record<string, Route>,
): FetchFn & { calls: RecordedRequest[] } {
  const calls: RecordedRequest[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    const req: RecordedRequest = {
      url,
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: init?.body ? String(init.body) : "",
    };
    calls.push(req);
    const key = Object.keys(routes)
      .filter((prefix) => url.toString().startsWith(prefix))
      .sort((a, b) => b.length - a.length)[0];
    if (!key) throw new Error(`unexpected request to ${url}`);
    return await routes[key]!(req);
  };
  return Object.assign(fn as FetchFn, { calls });
}

export function idToken(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(
      /=+$/,
      "",
    );
  return `${b64({ alg: "RS256" })}.${b64(claims)}.signature`;
}
