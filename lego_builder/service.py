"""Authenticated, bounded HTTP adapter for the real local OBJ converter.

Run ``python -m lego_builder.service`` with CONVERTER_TOKEN set. The service
accepts OBJ bytes inline, never a URL/path, and isolates conversions in a timed
child process. TLS belongs to the deployment ingress.
"""
from __future__ import annotations
import argparse
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import tempfile
import threading

from .generic import ALGORITHM

MAX_OBJ_BYTES = 80 * 1024 * 1024
MAX_REQUEST_BYTES = 160 * 1024 * 1024
MAX_LDR_BYTES = 5 * 1024 * 1024
MAX_OUTPUT_PARTS = 2500
READ_TIMEOUT_SECONDS = 20
CONVERSION_TIMEOUT_SECONDS = 180


class RequestError(ValueError):
    def __init__(self, status, code):
        super().__init__(code)
        self.status, self.code = status, code


def canonical_settings_hash(settings):
    return hashlib.sha256(json.dumps(settings, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")).hexdigest()


def _no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def validate_request(raw):
    try:
        payload = json.loads(raw.decode("utf-8"), object_pairs_hook=_no_duplicate_keys)
    except (UnicodeError, ValueError):
        raise RequestError(400, "invalid_json") from None
    expected = {"schemaVersion", "obj", "sourceObjSha256", "settingsSha256", "settings"}
    if not isinstance(payload, dict) or set(payload) != expected or type(payload["schemaVersion"]) is not int or payload["schemaVersion"] != 1:
        raise RequestError(400, "invalid_contract")
    settings = payload["settings"]
    if not isinstance(settings, dict) or set(settings) != {"targetParts", "inputUpAxis"}:
        raise RequestError(400, "invalid_settings")
    if type(settings["targetParts"]) is not int or not 100 <= settings["targetParts"] <= 2200 or settings["inputUpAxis"] not in ("x", "y", "z"):
        raise RequestError(400, "invalid_settings")
    if not isinstance(payload["obj"], str):
        raise RequestError(400, "invalid_obj")
    try:
        obj = payload["obj"].encode("utf-8")
    except UnicodeError:
        raise RequestError(400, "invalid_obj") from None
    if not obj or len(obj) > MAX_OBJ_BYTES:
        raise RequestError(413, "obj_size_limit")
    for key in ("sourceObjSha256", "settingsSha256"):
        if not isinstance(payload[key], str) or not re.fullmatch(r"[0-9a-f]{64}", payload[key]):
            raise RequestError(400, "invalid_hash")
    if not hmac.compare_digest(hashlib.sha256(obj).hexdigest(), payload["sourceObjSha256"]):
        raise RequestError(422, "source_hash_mismatch")
    if not hmac.compare_digest(canonical_settings_hash(settings), payload["settingsSha256"]):
        raise RequestError(422, "settings_hash_mismatch")
    return payload, obj


def worker(input_path, output_path, target_parts, up):
    from .generic import convert_obj
    library = Path(__file__).parent / "data" / "parts-library"
    report = convert_obj(input_path, output_path, library, target_parts, up)
    if not report.get("artifact_checks_passed"):
        return 2
    model = json.loads((Path(output_path) / "model.json").read_text())
    if len(model["placements"]) > MAX_OUTPUT_PARTS:
        return 3
    if (Path(output_path) / "model.ldr").stat().st_size > MAX_LDR_BYTES:
        return 3
    return 0


def convert_payload(payload, obj, timeout=CONVERSION_TIMEOUT_SECONDS):
    with tempfile.TemporaryDirectory(prefix="lego-converter-") as temporary:
        directory = Path(temporary)
        input_path, output_path = directory / "input.obj", directory / "result"
        input_path.write_bytes(obj)
        settings = payload["settings"]
        command = [sys.executable, "-m", "lego_builder.service", "--worker", str(input_path), str(output_path),
                   str(settings["targetParts"]), settings["inputUpAxis"]]
        # Provider/service credentials are not inherited by the geometry worker.
        environment = {key: value for key, value in os.environ.items() if key in {"PATH", "SYSTEMROOT", "PYTHONPATH", "LANG", "LC_ALL", "TMPDIR"}}
        try:
            result = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                    stderr=subprocess.DEVNULL, timeout=timeout, env=environment, check=False)
        except subprocess.TimeoutExpired:
            raise RequestError(504, "conversion_timeout") from None
        if result.returncode == 3:
            raise RequestError(422, "output_size_limit")
        if result.returncode != 0:
            raise RequestError(422, "conversion_failed")
        ldr_path = output_path / "model.ldr"
        if not ldr_path.is_file() or ldr_path.stat().st_size > MAX_LDR_BYTES:
            raise RequestError(422, "output_size_limit")
        ldr = ldr_path.read_text(encoding="utf-8")
        if sum(line.startswith("1 ") for line in ldr.splitlines()) > MAX_OUTPUT_PARTS:
            raise RequestError(422, "output_size_limit")
        return {"schemaVersion": 1, "sourceObjSha256": payload["sourceObjSha256"],
                "settingsSha256": payload["settingsSha256"], "ldr": ldr,
                "producer": {"name": "lego-builder", "version": ALGORITHM}}


class ConverterServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, token, conversion=convert_payload):
        if not isinstance(token, str) or not token.strip():
            raise ValueError("CONVERTER_TOKEN must be configured")
        self.expected_auth = ("Bearer " + token).encode("utf-8")
        self.conversion = conversion
        self.conversion_slot = threading.BoundedSemaphore(1)
        super().__init__(address, ConverterHandler)


class ConverterHandler(BaseHTTPRequestHandler):
    server_version = "LEGOConverter"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        # Never log uploads, hashes, bearer credentials or request bodies.
        return

    def setup(self):
        super().setup()
        self.connection.settimeout(READ_TIMEOUT_SECONDS)

    def respond(self, status, payload):
        raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Connection", "close")
        self.send_header("Cache-Control", "no-store")
        if status == 429:
            self.send_header("Retry-After", "5")
        self.end_headers()
        self.wfile.write(raw)
        self.close_connection = True

    def do_GET(self):
        if self.path == "/health":
            self.respond(200, {"status": "ok", "producer": "lego-builder", "version": ALGORITHM})
        else:
            self.respond(404, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/convert":
            self.respond(404, {"error": "not_found"})
            return
        authorization = self.headers.get_all("Authorization", [])
        auth = (authorization[0] if len(authorization) == 1 else "").encode("utf-8")
        if not hmac.compare_digest(auth, self.server.expected_auth):
            self.respond(401, {"error": "unauthorized"})
            return
        if not self.server.conversion_slot.acquire(blocking=False):
            self.respond(429, {"error": "converter_busy"})
            return
        try:
            if self.headers.get("Transfer-Encoding"):
                raise RequestError(400, "transfer_encoding_not_supported")
            lengths = self.headers.get_all("Content-Length", [])
            if len(lengths) != 1:
                raise RequestError(411, "content_length_required")
            try:
                length = int(lengths[0])
            except ValueError:
                raise RequestError(400, "invalid_content_length") from None
            if length <= 0 or length > MAX_REQUEST_BYTES:
                raise RequestError(413, "request_size_limit")
            if self.headers.get_content_type() != "application/json":
                raise RequestError(415, "application_json_required")
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise RequestError(400, "truncated_request")
            payload, obj = validate_request(raw)
            result = self.server.conversion(payload, obj)
            self.respond(200, result)
        except RequestError as exc:
            self.respond(exc.status, {"error": exc.code})
        except (socket.timeout, TimeoutError):
            self.respond(408, {"error": "request_timeout"})
        except (OSError, ValueError, TypeError, KeyError):
            self.respond(500, {"error": "conversion_service_error"})
        finally:
            self.server.conversion_slot.release()


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv[:1] == ["--worker"]:
        if len(argv) != 5:
            return 2
        return worker(argv[1], argv[2], int(argv[3]), argv[4])
    parser = argparse.ArgumentParser(description="Authenticated real OBJ-to-LEGO HTTP converter")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8080")))
    args = parser.parse_args(argv)
    token = os.environ.get("CONVERTER_TOKEN", "")
    if not token.strip():
        parser.error("CONVERTER_TOKEN must be configured")
    server = ConverterServer((args.host, args.port), token)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
