import { assert, assertEquals, assertRejects } from "@std/assert";
import {
  type AccessTokenDeps,
  accessTokenFor,
  buildConsentUrl,
  CALENDAR_API,
  exchangeCode,
  GOOGLE_TOKEN_URL,
  GoogleError,
  listCalendars,
  missingScopes,
  readIdToken,
  ReconnectNeededError,
  SCOPE_CALENDAR_LIST,
  SCOPE_EVENTS,
  type StoredAccount,
} from "./google.ts";
import { fakeFetch, idToken } from "./testing.ts";

const cfg = {
  clientId: "cid",
  clientSecret: "csecret",
  redirectUri: "http://cb",
};

Deno.test("consent URL asks for offline access, consent, PKCE and the minimum scopes", () => {
  const url = new URL(
    buildConsentUrl(cfg, {
      state: "n1",
      codeChallenge: "ch",
      loginHint: "a@x.com",
    }),
  );
  const p = url.searchParams;
  assertEquals(p.get("access_type"), "offline");
  assertEquals(p.get("prompt"), "consent");
  assertEquals(p.get("state"), "n1");
  assertEquals(p.get("code_challenge"), "ch");
  assertEquals(p.get("code_challenge_method"), "S256");
  assertEquals(p.get("login_hint"), "a@x.com");
  assertEquals(p.get("redirect_uri"), "http://cb");
  assertEquals(
    p.get("scope"),
    `openid email ${SCOPE_EVENTS} ${SCOPE_CALENDAR_LIST}`,
  );
});

Deno.test("exchangeCode sends the verifier and returns tokens", async () => {
  const f = fakeFetch({
    [GOOGLE_TOKEN_URL]: () =>
      Response.json({
        access_token: "at",
        expires_in: 3599,
        refresh_token: "rt",
        scope: "s",
      }),
  });
  const tokens = await exchangeCode(cfg, "code-1", "verifier-1", f);
  assertEquals(tokens.refresh_token, "rt");
  const body = new URLSearchParams(f.calls[0]!.body);
  assertEquals(body.get("code_verifier"), "verifier-1");
  assertEquals(body.get("grant_type"), "authorization_code");
});

Deno.test("exchangeCode surfaces Google error codes", async () => {
  const f = fakeFetch({
    [GOOGLE_TOKEN_URL]: () =>
      Response.json({ error: "invalid_grant" }, { status: 400 }),
  });
  const err = await assertRejects(
    () => exchangeCode(cfg, "c", "v", f),
    GoogleError,
  );
  assertEquals(err.code, "invalid_grant");
});

Deno.test("readIdToken extracts sub and email", () => {
  assertEquals(readIdToken(idToken({ sub: "123", email: "a@x.com" })), {
    sub: "123",
    email: "a@x.com",
  });
});

Deno.test("missingScopes reports unticked boxes on the consent screen", () => {
  assertEquals(
    missingScopes(`openid ${SCOPE_EVENTS} ${SCOPE_CALENDAR_LIST}`),
    [],
  );
  assertEquals(missingScopes(`openid ${SCOPE_CALENDAR_LIST}`), [SCOPE_EVENTS]);
});

Deno.test("listCalendars follows pages and maps fields", async () => {
  const f = fakeFetch({
    [`${CALENDAR_API}/users/me/calendarList`]: (req) =>
      req.url.searchParams.get("pageToken")
        ? Response.json({
          items: [{
            id: "work",
            summary: "Work",
            summaryOverride: "Job",
            accessRole: "reader",
          }],
        })
        : Response.json({
          items: [
            {
              id: "me@x.com",
              summary: "Me",
              backgroundColor: "#9fe1e7",
              primary: true,
              accessRole: "owner",
            },
          ],
          nextPageToken: "p2",
        }),
  });
  const cals = await listCalendars("at", f);
  assertEquals(f.calls.length, 2);
  assertEquals(f.calls[0]!.headers.get("authorization"), "Bearer at");
  assertEquals(cals, [
    {
      google_calendar_id: "me@x.com",
      summary: "Me",
      color: "#9fe1e7",
      is_primary: true,
      access_role: "owner",
    },
    {
      google_calendar_id: "work",
      summary: "Job",
      color: null,
      is_primary: false,
      access_role: "reader",
    },
  ]);
});

function tokenDeps(account: StoredAccount | null, fetchFn = fakeFetch({})) {
  const log: string[] = [];
  const deps: AccessTokenDeps = {
    cfg,
    fetchFn,
    now: () => new Date("2026-10-20T10:00:00Z"),
    getAccount: () => Promise.resolve(account),
    saveAccessToken: (enc, exp) => {
      log.push(`save ${enc} ${exp}`);
      return Promise.resolve();
    },
    markReconnectNeeded: () => {
      log.push("reconnect_needed");
      return Promise.resolve();
    },
    encrypt: (s) => Promise.resolve(`enc(${s})`),
    decrypt: (s) => Promise.resolve(s.replace(/^enc\((.*)\)$/, "$1")),
  };
  return { deps, log };
}

Deno.test("accessTokenFor reuses a token that is still valid", async () => {
  const { deps, log } = tokenDeps({
    refresh_token_enc: "enc(rt)",
    access_token_enc: "enc(at)",
    access_expires_at: "2026-10-20T10:30:00Z",
    status: "ok",
  });
  assertEquals(await accessTokenFor(deps), "at");
  assertEquals(log, []);
});

Deno.test("accessTokenFor refreshes an expired token and stores it encrypted", async () => {
  const f = fakeFetch({
    [GOOGLE_TOKEN_URL]: () =>
      Response.json({ access_token: "new", expires_in: 3600, scope: "" }),
  });
  const { deps, log } = tokenDeps(
    {
      refresh_token_enc: "enc(rt)",
      access_token_enc: "enc(old)",
      access_expires_at: "2026-10-20T10:00:30Z",
      status: "ok",
    },
    f,
  );
  assertEquals(await accessTokenFor(deps), "new");
  assertEquals(
    new URLSearchParams(f.calls[0]!.body).get("refresh_token"),
    "rt",
  );
  assertEquals(log, ["save enc(new) 2026-10-20T11:00:00.000Z"]);
});

Deno.test("accessTokenFor marks the account on invalid_grant", async () => {
  const f = fakeFetch({
    [GOOGLE_TOKEN_URL]: () =>
      Response.json({ error: "invalid_grant" }, { status: 400 }),
  });
  const { deps, log } = tokenDeps(
    {
      refresh_token_enc: "enc(rt)",
      access_token_enc: null,
      access_expires_at: null,
      status: "ok",
    },
    f,
  );
  await assertRejects(() => accessTokenFor(deps), ReconnectNeededError);
  assertEquals(log, ["reconnect_needed"]);
});

Deno.test("accessTokenFor does not call Google for an account needing reconnect", async () => {
  const f = fakeFetch({});
  const { deps } = tokenDeps(
    {
      refresh_token_enc: "enc(rt)",
      access_token_enc: null,
      access_expires_at: null,
      status: "reconnect_needed",
    },
    f,
  );
  await assertRejects(() => accessTokenFor(deps), ReconnectNeededError);
  assert(f.calls.length === 0);
});
