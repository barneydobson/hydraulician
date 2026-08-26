#!/usr/bin/env python3
"""`python3 -m http.server` plus `Cache-Control: no-store`, for launch.json.

http.server sends Last-Modified and nothing else, so script freshness is left
to browser heuristics — and with eight unbundled classic scripts a partially
stale cache runs one build's main.js against another's payloads (the "rig
format v2 is newer than this build (v1)" failure). No-store costs nothing on
localhost. Not deployed: Jekyll skips dot-directories.
"""
import functools
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
    bind = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
    handler = functools.partial(NoCacheHandler, directory=".")
    with http.server.ThreadingHTTPServer((bind, port), handler) as httpd:
        print("serving . on http://%s:%d (no-store)" % (bind, port), flush=True)
        httpd.serve_forever()
