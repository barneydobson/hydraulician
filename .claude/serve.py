#!/usr/bin/env python3
"""Static server for development — same as `python3 -m http.server`, plus
`Cache-Control: no-store` on everything.

`http.server` sends only `Last-Modified`: no `Cache-Control`, no `ETag`. With
no explicit freshness a browser falls back to a HEURISTIC — a fraction of how
long the file had been sitting unchanged — so a file that has been stable for
a while can be served from cache for a long time after you edit it. That is
survivable for a single file. It is not survivable here, because the app is
eight separate classic scripts with no bundler: the browser can revalidate the
ones you have been editing all morning and keep a stale `js/main.js`, and then
`js/exercises-rigs.js` (rig format v2) is read by a `js/main.js` that only
knows v1 and every rig refuses to load. That mixed state is invisible from the
server side and survives an ordinary reload.

No-store means every request is a real request. It costs nothing on localhost.

Used by .claude/launch.json. Nothing here ships: Jekyll skips dot-directories,
so .claude/ is not part of the Pages build.
"""
import functools
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
    bind = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
    handler = functools.partial(NoCacheHandler, directory=".")
    with http.server.ThreadingHTTPServer((bind, port), handler) as httpd:
        print("serving . on http://%s:%d (no-store)" % (bind, port), flush=True)
        httpd.serve_forever()
