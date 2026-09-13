"""Read a complete official LDraw library without proprietary application APIs.

Triangle geometry, lines, aliases and recursive subfiles use the published
R @ vertex + translation convention. Textures are not sampled: a TEXMAP
fallback is preferred when provided. This adapter establishes geometry and
provenance; it does not establish physical connectors or part/color availability.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
import tempfile
from pathlib import Path, PurePosixPath
import re
from urllib.parse import quote

import numpy as np

PARSER_VERSION = "official-ldraw-recursive-v1"
MAX_FILE_BYTES = 32 * 1024 * 1024
MAX_PART_TRIANGLES = 2_000_000
MAX_DEPTH = 64


class LDrawError(ValueError):
    """Missing, unsafe or malformed source geometry."""


@dataclass(frozen=True)
class PartGeometry:
    vertices: np.ndarray  # (triangle, vertex, xyz); local LDraw coordinates
    colors: np.ndarray  # one code per triangle; 16 is inherited instance color
    lines: np.ndarray  # (line, endpoint, xyz)
    line_colors: np.ndarray
    conditional_lines: np.ndarray  # (line, endpoint/control point, xyz)
    conditional_colors: np.ndarray
    sources: dict
    warnings: tuple[str, ...] = ()

    @property
    def bounds(self):
        if not len(self.vertices):
            return np.zeros((2, 3), dtype=float)
        return np.array([self.vertices.min(axis=(0, 1)), self.vertices.max(axis=(0, 1))])

    @property
    def triangle_count(self):
        return len(self.vertices)


def _color_code(value):
    try:
        code = int(value, 16) if value.lower().startswith("0x") else int(value)
    except ValueError as exc:
        raise LDrawError(f"Invalid LDraw color: {value}") from exc
    if code < 0:
        raise LDrawError(f"Invalid LDraw color: {value}")
    return code


def _numbers(tokens, count, context):
    if len(tokens) != count:
        raise LDrawError(f"{context}: expected {count} numeric coordinates")
    try:
        values = np.asarray(tokens, dtype=np.float64)
    except ValueError as exc:
        raise LDrawError(f"{context}: invalid numeric value") from exc
    if not np.isfinite(values).all():
        raise LDrawError(f"{context}: non-finite geometry")
    return values


class LDrawLibrary:
    def __init__(self, root):
        self.root = Path(root).resolve()
        if not (self.root / "parts").is_dir() or not (self.root / "p").is_dir():
            raise LDrawError(f"Expected complete official LDraw root with parts/ and p/: {self.root}")
        self._file_index = None
        self._part_index = None
        self._source_cache = {}
        self._geometry_cache = {}
        self._colors = None

    def resolve(self, part_id, relative_to=None):
        """Resolve numeric IDs, aliases, s/subparts and p/48 primitives safely."""
        name = str(part_id).strip().replace("\\", "/")
        path = PurePosixPath(name)
        if not name or path.is_absolute() or ".." in path.parts or ":" in name or "\x00" in name:
            raise LDrawError(f"Unsafe LDraw reference: {part_id!r}")
        if not path.suffix:
            name += ".dat"
        prefer_index = name != name.lower()
        candidates = []
        if relative_to is not None:
            relative_to = Path(relative_to).resolve()
            if not relative_to.is_relative_to(self.root):
                raise LDrawError("Relative resolution origin is outside the library")
            candidates.append(relative_to.parent / name)
        if name.lower().startswith(("parts/", "p/", "models/")):
            candidates.append(self.root / name)
        candidates.extend(self.root / prefix / name for prefix in ("parts", "p", "models", ""))
        for candidate in candidates:
            if candidate.is_file() and not prefer_index:
                resolved = candidate.resolve()
                if not resolved.is_relative_to(self.root):
                    raise LDrawError(f"LDraw dependency leaves library: {part_id}")
                return resolved
        if self._file_index is None:
            self._file_index = {str(p.relative_to(self.root)).lower(): p for p in self.root.rglob("*") if p.is_file()}
        for candidate in candidates:
            key = str(candidate.relative_to(self.root)).lower()
            if key in self._file_index:
                result = self._file_index[key].resolve()
                if not result.is_relative_to(self.root):
                    raise LDrawError(f"LDraw dependency leaves library: {part_id}")
                return result
        raise LDrawError(f"Missing LDraw dependency: {part_id}")

    def _source(self, path):
        stat = path.stat()
        stamp = (stat.st_size, stat.st_mtime_ns)
        cached = self._source_cache.get(path)
        if cached is not None and cached[0] == stamp:
            return cached[1], cached[2]
        if stat.st_size > MAX_FILE_BYTES:
            raise LDrawError(f"LDraw source exceeds {MAX_FILE_BYTES} bytes: {path.name}")
        raw = path.read_bytes()
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = raw.decode("cp1252")
        lines = text.splitlines()
        first = next((line.strip() for line in lines if line.strip()), "")
        relative = path.relative_to(self.root).as_posix()
        author = next((line.strip()[10:].strip() for line in lines if line.strip().startswith("0 Author:")), None)
        license_text = next((line.strip()[11:].strip() for line in lines if line.strip().startswith("0 !LICENSE ")), None)
        info = {"path": relative, "sha256": hashlib.sha256(raw).hexdigest(),
                "name": first[2:].strip() if first.startswith("0 ") else path.stem,
                "author": author, "license": license_text,
                "source_url": "https://library.ldraw.org/library/official/" + quote(relative, safe="/"),
                "bytes": len(raw)}
        self._source_cache[path] = (stamp, text, info)
        return text, info

    def part_info(self, part_id):
        path = self.resolve(part_id)
        _, info = self._source(path)
        return {"id": path.stem, **info}

    def search(self, query, limit=50):
        """Search real part filenames and titles; excludes primitive/subpart entries."""
        if self._part_index is None:
            self._part_index = []
            for path in sorted(p for p in (self.root / "parts").iterdir() if p.is_file() and p.suffix.lower() == ".dat"):
                with path.open("rb") as stream:
                    first = stream.readline(8192).decode("utf-8-sig", errors="replace").strip()
                self._part_index.append({"id": path.stem, "name": first[2:].strip() if first.startswith("0 ") else path.stem,
                                         "path": path.relative_to(self.root).as_posix()})
        words = query.casefold().split()
        return [part for part in self._part_index if all(word in (part["id"] + " " + part["name"]).casefold() for word in words)][:max(0, limit)]

    def geometry(self, part_id):
        return self._geometry(self.resolve(part_id), ())

    def _geometry(self, path, ancestors):
        if path in ancestors:
            chain = " -> ".join(p.name for p in (*ancestors, path))
            raise LDrawError(f"Cyclic LDraw dependency: {chain}")
        if len(ancestors) >= MAX_DEPTH:
            raise LDrawError("LDraw recursion depth exceeds the configured bound")
        cached = self._geometry_cache.get(path)
        if cached is not None and all(self._source(self.root / name)[1]["sha256"] == info["sha256"] for name, info in cached.sources.items()):
            return cached
        text, info = self._source(path)
        sources = {info["path"]: info}
        triangles, colors, edges, edge_colors, conditional, conditional_colors = [], [], [], [], [], []
        warnings = set()
        clockwise, invert_next = False, False
        texmap, texmap_fallback = False, False
        has_fallback = any(line.strip().startswith("0 !TEXMAP FALLBACK") for line in text.splitlines())
        triangle_count = 0
        for number, raw in enumerate(text.splitlines(), 1):
            line = raw.strip()
            if not line:
                continue
            context = f"{info['path']}:{number}"
            if line.startswith("0 !:"):
                line = line[4:].strip()
            tokens = line.split()
            if tokens[0] == "0":
                if len(tokens) > 2 and tokens[1] == "BFC":
                    if "CW" in tokens:
                        clockwise = True
                    if "CCW" in tokens:
                        clockwise = False
                    if "INVERTNEXT" in tokens:
                        invert_next = True
                if len(tokens) > 2 and tokens[1] == "!TEXMAP":
                    warnings.add("Texture images are not sampled; explicit fallback geometry is preferred.")
                    if tokens[2] in ("START", "NEXT"):
                        texmap, texmap_fallback = True, False
                    elif tokens[2] == "FALLBACK":
                        texmap_fallback = True
                    elif tokens[2] == "END":
                        texmap = False
                continue
            if texmap and has_fallback and not texmap_fallback:
                continue
            kind = tokens[0]
            if kind not in ("1", "2", "3", "4", "5"):
                raise LDrawError(f"{context}: unsupported geometry command {kind}")
            if len(tokens) < 2:
                raise LDrawError(f"{context}: missing color")
            color = _color_code(tokens[1])
            if kind == "1":
                tokens = line.split(maxsplit=14)
                if len(tokens) != 15:
                    raise LDrawError(f"{context}: malformed type-1 reference")
                transform = _numbers(tokens[2:14], 12, context)
                translation, matrix = transform[:3], transform[3:].reshape(3, 3)
                child = self._geometry(self.resolve(tokens[14], path), (*ancestors, path))
                vertices = child.vertices @ matrix.T + translation
                if invert_next:
                    vertices = vertices[:, [0, 2, 1], :]
                invert_next = False
                triangles.append(vertices)
                edge_color = 24 if color == 16 else -(color + 1)
                def inherit(codes):
                    return np.where(codes == 16, color, np.where(codes == 24, edge_color, codes))
                colors.append(inherit(child.colors))
                edges.append(child.lines @ matrix.T + translation)
                edge_colors.append(inherit(child.line_colors))
                conditional.append(child.conditional_lines @ matrix.T + translation)
                conditional_colors.append(inherit(child.conditional_colors))
                sources.update(child.sources)
                warnings.update(child.warnings)
                triangle_count += len(vertices)
            else:
                count = {"2": 6, "3": 9, "4": 12, "5": 12}[kind]
                vertices = _numbers(tokens[2:], count, context).reshape(-1, 3)
                if kind in ("3", "4"):
                    split = vertices[None, :, :] if kind == "3" else np.asarray([vertices[[0, 1, 2]], vertices[[0, 2, 3]]])
                    if clockwise:
                        split = split[:, [0, 2, 1], :]
                    triangles.append(split)
                    colors.append(np.full(len(split), color))
                    triangle_count += len(split)
                elif kind == "2":
                    edges.append(vertices[None, :, :]); edge_colors.append(np.asarray([color]))
                else:
                    conditional.append(vertices[None, :, :]); conditional_colors.append(np.asarray([color]))
            if triangle_count > MAX_PART_TRIANGLES:
                raise LDrawError(f"Part exceeds {MAX_PART_TRIANGLES:,} expanded triangles")
        def combine(chunks, shape, dtype):
            result = np.concatenate(chunks).astype(dtype) if chunks else np.empty(shape, dtype=dtype)
            result.setflags(write=False)
            return result
        result = PartGeometry(combine(triangles, (0, 3, 3), np.float32), combine(colors, (0,), np.int64),
                              combine(edges, (0, 2, 3), np.float32), combine(edge_colors, (0,), np.int64),
                              combine(conditional, (0, 4, 3), np.float32), combine(conditional_colors, (0,), np.int64),
                              sources, tuple(sorted(warnings)))
        self._geometry_cache[path] = result
        return result

    def color(self, code):
        code = int(code)
        if code < 0:
            parent = self.color(-code - 1)
            edge = parent["edge"]
            rgb = [int(edge[i:i+2], 16)/255 for i in (1, 3, 5)] if edge.startswith("#") else self.color(int(edge))["rgb"]
            return {"code": code, "name": "Edge of " + parent["name"], "rgb": rgb, "alpha": 1.0, "edge": edge}
        if code & 0xF000000 == 0x2000000:
            value = code & 0xFFFFFF
            return {"code": code, "name": f"Direct #{value:06X}", "rgb": [((value >> shift) & 255) / 255 for shift in (16, 8, 0)], "alpha": 1.0, "edge": "#333333"}
        if self._colors is None:
            self._colors = {}
            path = self.resolve("LDConfig.ldr")
            text, _ = self._source(path)
            for line in text.splitlines():
                match = re.match(r"0\s+!COLOUR\s+(.*?)\s+CODE\s+(\d+)\s+VALUE\s+#([0-9A-Fa-f]{6})\s+EDGE\s+(\S+)(.*)", line.strip())
                if not match:
                    continue
                name, raw_code, rgb, edge, rest = match.groups()
                alpha = re.search(r"\bALPHA\s+(\d+)", rest)
                self._colors[int(raw_code)] = {"code": int(raw_code), "name": name.replace("_", " "),
                    "rgb": [int(rgb[index:index + 2], 16) / 255 for index in (0, 2, 4)],
                    "alpha": int(alpha.group(1)) / 255 if alpha else 1.0, "edge": edge}
        if code not in self._colors:
            raise LDrawError(f"Color {code} is not defined in official LDConfig.ldr")
        return dict(self._colors[code])

    def manifest(self, part_ids):
        part_ids = sorted(set(str(part_id) for part_id in part_ids))
        sources = {}
        for part_id in sorted(set(part_ids)):
            sources.update(self.geometry(part_id).sources)
        path = self.resolve("LDConfig.ldr")
        _, info = self._source(path)
        sources[info["path"]] = info
        return {"parser_version": PARSER_VERSION, "sources": sources,
                "geometry_scope": "Recursive official triangle/quad geometry, lines, BFC winding and type-1 transforms; no physical connector validation.",
                "part_ids": sorted(set(str(part_id) for part_id in part_ids))}


    def copy_used_parts(self, part_ids, destination):
        """Vendor the exact recursive source closure into a new directory.

        No root library is redistributed implicitly. An existing destination is
        rejected; callers decide how to review or replace an earlier subset.
        """
        destination = Path(destination)
        if destination.exists():
            raise FileExistsError(f"LDraw subset destination already exists: {destination}")
        manifest = self.manifest(part_ids)
        for name in ("CAreadme.txt", "CAlicense.txt", "CAlicense4.txt", "Readme.txt"):
            path = self.root / name
            if path.is_file():
                _, info = self._source(path)
                manifest["sources"][info["path"]] = info
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".ldraw-subset-", dir=destination.parent) as staging:
            stage = Path(staging) / "subset"
            stage.mkdir()
            # Keep both directories even for a tiny fixture with no primitives.
            (stage / "parts").mkdir(); (stage / "p").mkdir()
            for relative, info in manifest["sources"].items():
                target = stage / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                raw = (self.root / relative).read_bytes()
                if hashlib.sha256(raw).hexdigest() != info["sha256"]:
                    raise LDrawError(f"Library changed while copying: {relative}")
                target.write_bytes(raw)
            (stage / "source-manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
            os.rename(stage, destination)
        return manifest
