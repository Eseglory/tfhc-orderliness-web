import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const COOKIE = 'tfhc_pwa_device';
const apiOrigin = () => process.env.PWA_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';
function sameOrigin(request: NextRequest) {
  try {
    const origin = new URL(request.headers.get('origin') || '');
    // Next may normalize nextUrl to localhost behind a proxy. The browser's
    // Host header identifies this request's public origin; never trust an
    // arbitrary client-supplied forwarded host for this security decision.
    return ['http:', 'https:'].includes(origin.protocol) && origin.host === request.headers.get('host') &&
      request.headers.get('sec-fetch-site') !== 'cross-site';
  } catch { return false; }
}
async function handle(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ message: 'Same-origin request required' }, { status: 403 });
  const { action } = await context.params;
  if (!['session', 'sync', 'metrics'].includes(action)) return new NextResponse(null, { status: 404 });
  if (request.method === 'DELETE' && action !== 'session') return new NextResponse(null, { status: 405 });
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 8192) return new NextResponse(null, { status: 413 });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (action === 'session' && request.method === 'POST') {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) return new NextResponse(null, { status: 401 });
    headers.Authorization = auth;
  } else if (action !== 'metrics') {
    headers['X-PWA-Grant'] = request.cookies.get(COOKIE)?.value || '';
  }
  const body = request.method === 'DELETE' ? undefined : await request.text();
  if ((body?.length || 0) > 8192) return new NextResponse(null, { status: 413 });
  try {
    const upstream = await fetch(`${apiOrigin()}/pwa/${action}`, { method: request.method, headers, body: body || undefined,
      cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const data = await upstream.json().catch(() => ({}));
    const response = NextResponse.json(action === 'session' && upstream.ok && request.method === 'POST'
      ? { enabled: true, expiresAt: data.expiresAt } : data, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } });
    const cookie = { httpOnly: true, sameSite: 'strict' as const, secure: request.headers.get('origin')?.startsWith('https://') === true, path: '/api/pwa' };
    if (action === 'session' && upstream.ok && request.method === 'POST') {
      response.cookies.set(COOKIE, data.grant, { ...cookie, expires: new Date(data.expiresAt) });
    }
    if (request.method === 'DELETE' || upstream.status === 401) response.cookies.set(COOKIE, '', { ...cookie, maxAge: 0 });
    return response;
  } catch { return NextResponse.json({ message: 'Service temporarily unavailable' }, { status: 503 }); }
}
export const POST = handle;
export const DELETE = handle;
