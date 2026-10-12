import http.server, socketserver, threading, os, json, re, functools
from playwright.sync_api import sync_playwright

ROOT = os.environ.get('SITE_ROOT', os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')))
HARNESS = os.path.dirname(os.path.abspath(__file__))
PORT = 8123
BASE = f'http://127.0.0.1:{PORT}'

VIEWPORTS = {
    'movil':   dict(width=375, height=812),
    'tablet':  dict(width=768, height=1024),
    'escritorio': dict(width=1366, height=900),
}

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

_srv = None
def start_server():
    global _srv
    if _srv: return
    handler = functools.partial(Quiet, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    _srv = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=_srv.serve_forever, daemon=True).start()

STUB = open(os.path.join(HARNESS, 'fb-stub.js')).read()
EMAILJS_STUB = "window.emailjs={init(){},send:async()=>({status:200,text:'OK'})};"

class Probe:
    """Recoge errores de consola, errores de página, peticiones fallidas y llamadas a Apps Script."""
    def __init__(self):
        self.console_errors = []
        self.page_errors = []
        self.failed = []
        self.apps_script = []   # payloads JSON enviados al Apps Script
        self.not_found = []

def attach(context, page, probe):
    def on_console(m):
        if m.type == 'error':
            probe.console_errors.append(m.text[:300])
    page.on('console', on_console)
    page.on('pageerror', lambda e: probe.page_errors.append(str(e)[:300]))
    page.on('response', lambda r: probe.not_found.append((r.status, r.url)) if r.status >= 400 and r.url.startswith(BASE) else None)

    def route(r):
        url = r.request.url
        if url.startswith(BASE):
            return r.continue_()
        if 'gstatic.com/firebasejs' in url:
            body = STUB if url.endswith('firebase-app-compat.js') else '/* stub */'
            return r.fulfill(status=200, content_type='application/javascript', body=body)
        if 'fonts.googleapis.com' in url:
            return r.fulfill(status=200, content_type='text/css', body='/* fonts offline */')
        if 'fonts.gstatic.com' in url:
            return r.abort()
        if 'unpkg.com/leaflet@1.9.4/dist/leaflet.css' in url:
            return r.fulfill(status=200, content_type='text/css', body=open(f'{HARNESS}/node_modules/leaflet/dist/leaflet.css').read())
        if 'unpkg.com/leaflet@1.9.4/dist/leaflet.js' in url:
            return r.fulfill(status=200, content_type='application/javascript', body=open(f'{HARNESS}/node_modules/leaflet/dist/leaflet.js').read())
        if 'emailjs' in url:
            return r.fulfill(status=200, content_type='application/javascript', body=EMAILJS_STUB)
        if 'script.google.com' in url:
            try:
                probe.apps_script.append(json.loads(r.request.post_data or '{}'))
            except Exception:
                probe.apps_script.append({'_raw': r.request.post_data})
            return r.fulfill(status=200, content_type='text/plain', body='ok')
        probe.failed.append(url[:140])
        return r.abort()
    context.route('**/*', route)

def launch(pw, vp='escritorio', **kw):
    b = pw.chromium.launch()
    ctx = b.new_context(viewport=VIEWPORTS[vp], locale='es-CO', **kw)
    page = ctx.new_page()
    probe = Probe()
    attach(ctx, page, probe)
    return b, ctx, page, probe
