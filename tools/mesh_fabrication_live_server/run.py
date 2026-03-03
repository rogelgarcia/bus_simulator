#!/usr/bin/env python3
"""Serve mesh fabrication screen + live mesh endpoint with HTTP conditional responses."""

from __future__ import annotations

import argparse
import functools
import hashlib
import json
from datetime import datetime, timezone
from email.utils import format_datetime, parsedate_to_datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


DEFAULT_MESH_PATH = Path("assets/public/mesh_fabrication/handoff/mesh.live.v1.json")
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
MESH_ENDPOINT = "/api/mesh/current"


def build_etag(mesh_path: Path) -> str:
    payload = mesh_path.read_bytes()
    digest = hashlib.sha1(payload).hexdigest()
    return f"\"{digest}\""


def to_http_date(ts_seconds: float) -> str:
    dt = datetime.fromtimestamp(ts_seconds, tz=timezone.utc)
    return format_datetime(dt, usegmt=True)


def parse_http_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


class MeshFabricationHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory: str, mesh_file: Path, **kwargs):
        self._mesh_file = mesh_file
        super().__init__(*args, directory=directory, **kwargs)

    def do_GET(self) -> None:  # noqa: N802 (stdlib signature)
        parsed = urlparse(self.path)
        if parsed.path == MESH_ENDPOINT:
            self._serve_mesh_payload()
            return
        super().do_GET()

    def _serve_mesh_payload(self) -> None:
        if not self._mesh_file.exists():
            self._send_json(
                HTTPStatus.SERVICE_UNAVAILABLE,
                {"error": "mesh file missing", "path": str(self._mesh_file)}
            )
            return

        stat = self._mesh_file.stat()
        etag = build_etag(self._mesh_file)
        last_modified = to_http_date(stat.st_mtime)

        if_none_match = self.headers.get("If-None-Match")
        if if_none_match and etag in [token.strip() for token in if_none_match.split(",")]:
            self._send_not_modified(etag, last_modified)
            return

        if_modified_since = parse_http_date(self.headers.get("If-Modified-Since"))
        if if_modified_since is not None:
            resource_time = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).replace(microsecond=0)
            if resource_time <= if_modified_since.replace(microsecond=0):
                self._send_not_modified(etag, last_modified)
                return

        payload = self._mesh_file.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("ETag", etag)
        self.send_header("Last-Modified", last_modified)
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def _send_not_modified(self, etag: str, last_modified: str) -> None:
        self.send_response(HTTPStatus.NOT_MODIFIED)
        self.send_header("ETag", etag)
        self.send_header("Last-Modified", last_modified)
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

    def _send_json(self, status: HTTPStatus, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"host to bind (default: {DEFAULT_HOST})")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"port to bind (default: {DEFAULT_PORT})")
    parser.add_argument(
        "--root",
        default=".",
        help="repo root to serve static files from (default: current working directory)"
    )
    parser.add_argument(
        "--mesh-file",
        default=str(DEFAULT_MESH_PATH),
        help=f"mesh handoff file path relative to --root (default: {DEFAULT_MESH_PATH})"
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = Path(args.root).resolve()
    mesh_file = (root / args.mesh_file).resolve()

    handler = functools.partial(
        MeshFabricationHandler,
        directory=str(root),
        mesh_file=mesh_file
    )
    with ThreadingHTTPServer((args.host, args.port), handler) as server:
        print(f"[MeshFabServer] Serving static root: {root}")
        print(f"[MeshFabServer] Mesh file: {mesh_file}")
        print(f"[MeshFabServer] Screen URL: http://{args.host}:{args.port}/screens/mesh_fabrication.html")
        print(f"[MeshFabServer] Mesh API: http://{args.host}:{args.port}{MESH_ENDPOINT}")
        server.serve_forever()


if __name__ == "__main__":
    main()
