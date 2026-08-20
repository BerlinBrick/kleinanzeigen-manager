"""
Reverse-proxy shim for the kleinanzeigen-bot-ui Next.js monolith.

The Emergent ingress routes `/api/*` to port 8001 and everything else to 3000.
This Next.js app serves BOTH its UI and its `/api/*` routes on a single port
(3000). This shim runs on 8001 and forwards incoming `/api/*` (and any other)
requests to the Next.js server on localhost:3000 so the app works end-to-end
behind the platform ingress.
"""
import os
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import Response, StreamingResponse

NEXT_ORIGIN = os.environ.get("NEXT_ORIGIN", "http://127.0.0.1:3000")

app = FastAPI(title="kb-ui-proxy")

# Long timeout: bot/messaging endpoints can be slow; streaming endpoints (logs) stay open.
_client = httpx.AsyncClient(base_url=NEXT_ORIGIN, timeout=httpx.Timeout(600.0), follow_redirects=False)

_HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "content-encoding",
    "content-length",
}


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy(path: str, request: Request):
    url = httpx.URL(path="/" + path, query=request.url.query.encode("utf-8"))

    fwd_headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}
    body = await request.body()

    req = _client.build_request(
        request.method,
        url,
        headers=fwd_headers,
        content=body if body else None,
    )
    upstream = await _client.send(req, stream=True)

    resp_headers = {
        k: v for k, v in upstream.headers.items() if k.lower() not in _HOP_BY_HOP
    }
    content_type = upstream.headers.get("content-type", "")

    # Stream server-sent events / large responses without buffering.
    if "text/event-stream" in content_type:
        async def event_stream():
            try:
                async for chunk in upstream.aiter_raw():
                    yield chunk
            finally:
                await upstream.aclose()

        return StreamingResponse(
            event_stream(),
            status_code=upstream.status_code,
            headers=resp_headers,
            media_type=content_type or None,
        )

    content = await upstream.aread()
    await upstream.aclose()
    return Response(
        content=content,
        status_code=upstream.status_code,
        headers=resp_headers,
        media_type=content_type or None,
    )
