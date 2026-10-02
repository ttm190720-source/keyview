export async function GET() {
  return Response.json({ ok: true, service: "keyview", time: new Date().toISOString() });
}
