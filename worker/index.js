// The game's Worker (Cloudflare Workers, wrangler.jsonc). The static files of
// public/ are served without it; it answers the addresses run_worker_first
// sends here, and puts the security headers on every answer of its own
import pkg from '../package.json';
import SECURITY_HEADERS from './security-headers.json';

// A copy of the answer with the security headers (public/_headers has their
// reasons and puts them on the static files)
export function withSecurityHeaders(response) {
    const answer = new Response(response.body, response);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        answer.headers.set(name, value);
    }
    return answer;
}

// The game's own page for an address nothing answers, with status 404
export async function notFound(request, env) {
    const page = await env.ASSETS.fetch(new URL('/404', request.url));
    return new Response(page.body, { status: 404, headers: page.headers });
}

async function route(request, env) {
    const { pathname } = new URL(request.url);

    // The running version: every page shows it at the bottom, and after a
    // deploy it tells which release is live
    if (request.method === 'GET' && pathname === '/api/version') {
        return Response.json({ version: pkg.version });
    }

    return notFound(request, env);
}

export default {
    async fetch(request, env) {
        return withSecurityHeaders(await route(request, env));
    },
};
