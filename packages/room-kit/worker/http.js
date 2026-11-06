// The frame of a game's Worker (Cloudflare Workers): what every answer of a
// game gets, whatever the address. The game gives its own addresses (route)
// and its version; the frame answers /api/version, a HEAD as the GET it asks
// about, an address nothing answers with the game's 404 page, and a failure
// with JSON the page can read - and puts the security headers on everything
// but an accepted socket. The static files of public/ are served without the
// Worker: their headers come from the copy of public/_headers.
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

// The game's own page for an address nothing answers (its public/404.html),
// with status 404
export async function notFound(request, env) {
    const page = await env.ASSETS.fetch(new URL('/404', request.url));
    return new Response(page.body, { status: 404, headers: page.headers });
}

// The answer to a request: the version, or the game's route's, or its 404 page.
// The route gets the method a HEAD asks about (fetch below leaves the body out)
async function answer(request, env, route, version) {
    const { pathname } = new URL(request.url);
    const method = request.method === 'HEAD' ? 'GET' : request.method;

    // The running version (the game's package.json): every page shows it at
    // the bottom, and after a deploy it tells which release is live
    if (method === 'GET' && pathname === '/api/version') {
        return Response.json({ version });
    }
    return (await route(request, env, { method, pathname })) || notFound(request, env);
}

// A game's Worker: `export default gameWorker({ route, version })`. route is
// async (request, env, { method, pathname }) => a Response, or nothing for an
// address that is not the game's. Should it fail, the page still gets JSON it
// can read, with the headers, not Cloudflare's error page
export function gameWorker({ route, version }) {
    return {
        async fetch(request, env) {
            let response;
            try {
                response = await answer(request, env, route, version);
            } catch (error) {
                console.error(`Error answering ${request.method} ${new URL(request.url).pathname}:`, error);
                response = Response.json({ success: false }, { status: 500 });
            }
            // An accepted socket is no page: its answer goes back as it is
            if (response.webSocket) return response;
            if (request.method === 'HEAD') response = new Response(null, response);
            return withSecurityHeaders(response);
        },
    };
}
