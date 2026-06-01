/**
 * Cloudflare Pages Function — /api/ak
 * Proxy vers la nouvelle API Airport Keeper
 * GET /api/ak?airport=LFOB&flow=ARR&from=...&to=...
 */

const AK_BASE  = "https://api.app.airport-keeper.com/flights/v1/airport";
const AK_TOKEN = "eyJhbGciOiJIUzUxMiJ9.eyJ1c2VybmFtZSI6ImJ2YV9leHQiLCJhaXJwb3J0cyI6IkxGT0IiLCJzdWIiOiJidmFfZXh0In0.e2xErOZw1uM89Zu-B_BlWslpk9SODToq7wVKPB6FU6yqVjDo3SxDnqY2GRtKbujvcR55xMrPQfoinN_rl1rGGw";

export async function onRequestGet({ request }) {
  const url    = new URL(request.url);
  const airport = url.searchParams.get("airport") || "LFOB";
  const flow    = url.searchParams.get("flow")    || "DEP";
  const from    = url.searchParams.get("from")    || "";
  const to      = url.searchParams.get("to")      || "";

  const apiUrl = `${AK_BASE}?airport=${encodeURIComponent(airport)}&flow=${encodeURIComponent(flow)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  try {
    const resp = await fetch(apiUrl, {
      headers: {
        "Authorization": `Bearer ${AK_TOKEN}`,
        "Accept": "application/json",
      },
    });

    const data = await resp.json();

    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
