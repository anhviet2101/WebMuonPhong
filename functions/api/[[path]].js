// Cloudflare Pages keeps the browser on the Pages origin while forwarding API
// requests to the separately hosted Django service.
export async function onRequest({ request, env }) {
  let origin;
  try {
    origin = new URL(env.API_ORIGIN);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    ) {
      throw new Error("Invalid API origin");
    }
  } catch {
    return Response.json({ detail: "API origin is not configured." }, { status: 503 });
  }

  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, origin);
  const upstreamRequest = new Request(target, request);
  const headers = new Headers(upstreamRequest.headers);
  headers.delete("host");
  headers.delete("cookie");

  try {
    const upstream = await fetch(new Request(upstreamRequest, {
      headers,
      redirect: "manual",
    }));
    const response = new Response(upstream.body, upstream);
    const location = upstream.headers.get("location");
    if (location) {
      const redirect = new URL(location, target);
      if (redirect.origin !== origin.origin) {
        return Response.json({ detail: "Unexpected API redirect." }, { status: 502 });
      }
      response.headers.set(
        "location",
        `${incoming.origin}${redirect.pathname}${redirect.search}${redirect.hash}`,
      );
    }
    response.headers.delete("set-cookie");
    response.headers.set("cache-control", "no-store");
    return response;
  } catch {
    return Response.json({ detail: "API temporarily unavailable." }, { status: 502 });
  }
}
