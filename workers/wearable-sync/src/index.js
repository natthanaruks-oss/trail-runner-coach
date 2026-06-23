/**
 * Optional future service. It is deliberately not referenced by the root
 * wrangler.jsonc, so the main application remains client-side/local-first.
 * Add provider credentials as Cloudflare secrets before implementing OAuth.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'trail-runner-coach-wearable-sync', providers: ['garmin', 'suunto'] });
    }
    if (url.pathname.startsWith('/oauth/')) {
      return Response.json({
        ok: false,
        code: 'provider_not_configured',
        message: 'Configure provider credentials and callback URLs before enabling OAuth.'
      }, { status: 501 });
    }
    return Response.json({ ok: false, code: 'not_found' }, { status: 404 });
  }
};
