"""Download the official geometry library into an explicit local cache.

The complete archive is a discovery/rendering dependency, not a repository asset.
Generated candidates retain checksummed copies of only their used dependencies.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import tempfile
import urllib.request
import zipfile

URL = "https://library.ldraw.org/library/updates/complete.zip"
MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
MAX_EXPANDED_BYTES = 2 * 1024 * 1024 * 1024


def extract(archive, destination):
    """Check all entries before creating a fresh library directory."""
    destination = Path(destination)
    if destination.exists():
        raise FileExistsError(f"Choose a new destination: {destination}")
    with zipfile.ZipFile(archive) as bundle:
        total = 0
        for entry in bundle.infolist():
            path = PurePosixPath(entry.filename.replace("\\", "/"))
            if path.is_absolute() or ".." in path.parts or ":" in entry.filename:
                raise ValueError(f"Unsafe archive entry: {entry.filename}")
            if stat.S_ISLNK(entry.external_attr >> 16):
                raise ValueError(f"Unexpected symlink: {entry.filename}")
            total += entry.file_size
            if total > MAX_EXPANDED_BYTES:
                raise ValueError("Expanded library exceeds size limit")
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=destination.parent, prefix=".ldraw-") as temporary:
            temporary = Path(temporary)
            bundle.extractall(temporary)
            root = temporary / "ldraw"
            if not (root / "parts").is_dir() or not (root / "p").is_dir():
                raise ValueError("Archive does not contain an official LDraw library")
            root.rename(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("outputs/ldraw-library/ldraw"))
    parser.add_argument("--archive", type=Path, help="Use an already downloaded official ZIP")
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output already exists; use a new directory")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=args.output.parent, prefix=".download-") as temporary:
        archive = args.archive or Path(temporary) / "complete.zip"
        if args.archive is None:
            with urllib.request.urlopen(URL, timeout=60) as response, archive.open("wb") as output:
                total = 0
                while block := response.read(1024 * 1024):
                    total += len(block)
                    if total > MAX_ARCHIVE_BYTES:
                        raise ValueError("Library archive exceeds size limit")
                    output.write(block)
        if archive.stat().st_size > MAX_ARCHIVE_BYTES:
            raise ValueError("Library archive exceeds size limit")
        with archive.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        extract(archive, args.output)
        manifest = {"source_url": URL, "archive_sha256": digest,
                    "archive_bytes": archive.stat().st_size,
                    "parts": len(list((args.output / "parts").glob("*.dat"))),
                    "note": "The upstream complete archive changes; this hash identifies the downloaded version."}
        (args.output / "download-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        print(json.dumps({"library": str(args.output), **manifest}, indent=2))


if __name__ == "__main__":
    main()
