// (Nov 25, going online) "Is the app alive?" for the server's front door and uptime checks. Says nothing about any account.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
