import assert from "node:assert/strict";
import test from "node:test";

import { onRequest } from "../functions/api/[[path]].js";

test("Pages API proxy preserves method, query and bearer token", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (request) => {
    forwarded = request;
    return Response.json({ ok: true });
  };
  try {
    const request = new Request(
      "https://rooms.pages.dev/api/bookings/42/submit/?source=calendar",
      {
        method: "POST",
        headers: {
          authorization: "Bearer example",
          "content-type": "application/json",
          cookie: "unrelated_frontend_cookie=private",
        },
        body: JSON.stringify({ reason: "confirmed" }),
      },
    );
    const response = await onRequest({
      request,
      env: { API_ORIGIN: "https://api.example.org" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(forwarded.url, "https://api.example.org/api/bookings/42/submit/?source=calendar");
    assert.equal(forwarded.method, "POST");
    assert.equal(forwarded.headers.get("authorization"), "Bearer example");
    assert.equal(forwarded.headers.get("cookie"), null);
    assert.equal(await forwarded.json().then((body) => body.reason), "confirmed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Pages API proxy does not forward upstream cookies or external redirects", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, {
      status: 302,
      headers: {
        location: "https://untrusted.example/path",
        "set-cookie": "session=private",
      },
    });
    const response = await onRequest({
      request: new Request("https://rooms.pages.dev/api/bookings/"),
      env: { API_ORIGIN: "https://api.example.org" },
    });
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("set-cookie"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Pages API proxy fails closed without a valid HTTPS origin", async () => {
  const request = new Request("https://rooms.pages.dev/api/bookings/");
  for (const API_ORIGIN of [undefined, "http://api.example.org", "https://api.example.org/path"] ) {
    const response = await onRequest({ request, env: { API_ORIGIN } });
    assert.equal(response.status, 503);
  }
});

test("Pages API proxy rewrites an upstream redirect to the Pages origin", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, {
    status: 302,
    headers: { location: "https://api.example.org/api/bookings/" },
  });
  try {
    const response = await onRequest({
      request: new Request("https://rooms.pages.dev/api/bookings"),
      env: { API_ORIGIN: "https://api.example.org" },
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://rooms.pages.dev/api/bookings/");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
