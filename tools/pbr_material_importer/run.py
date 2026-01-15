# tools/pbr_material_importer/run.py
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path


PBR_DIR = Path("assets/public/pbr")
DOWNLOADS_DIR = Path("downloads")


@dataclass(frozen=True)
class Picked:
    slug: str
    zip_path: Path
    is_wall: bool
    basecolor: str | None
    normal_gl: str | None
    arm: str | None
    extra_files: tuple[str, ...]


def _slug_from_zip_name(zip_path: Path) -> str | None:
    name = zip_path.name
    if not name.lower().endswith(".zip"):
        return None
    base = name[: -len(".zip")]
    match = re.match(r"^(?P<slug>.+)_([0-9]+k)$", base, flags=re.IGNORECASE)
    if not match:
        return None
    return match.group("slug")


def _resolution_rank(zip_path: Path) -> int:
    base = zip_path.stem.lower()
    if base.endswith("_1k"):
        return 1
    if base.endswith("_2k"):
        return 2
    if base.endswith("_4k"):
        return 4
    return 999


def _is_wall_slug(slug: str) -> bool:
    s = slug.lower()
    if "grass" in s:
        return False
    surface = ("asphalt", "crosswalk", "paver", "paving", "terrain", "coast", "rocks", "roof", "tiles")
    strong_wall = ("wall", "cladding")
    wallish = ("brick", "plaster", "stone", "concrete", "metal", "iron", "shutter", "plate")

    if any(k in s for k in surface):
        return any(k in s for k in strong_wall)
    return any(k in s for k in wallish)


def _pick_best(names: list[str], patterns: list[re.Pattern[str]]) -> str | None:
    for pattern in patterns:
        hits = [name for name in names if pattern.search(name.lower())]
        if hits:
            hits.sort(key=lambda n: (len(n), n))
            return hits[0]
    return None


def _pick_textures(slug: str, zip_path: Path) -> Picked:
    with zipfile.ZipFile(zip_path) as z:
        names = [info.filename for info in z.infolist() if not info.is_dir()]

    preferred = [
        re.compile(rf"(^|/)textures/{re.escape(slug)}_diff_1k\.jpg$"),
        re.compile(rf"(^|/)textures/{re.escape(slug)}_albedo_1k\.jpg$"),
        re.compile(rf"(^|/)textures/{re.escape(slug)}_basecolor_1k\.jpg$"),
        re.compile(rf"(^|/)textures/{re.escape(slug)}_color_1k\.jpg$"),
        re.compile(rf"(^|/)textures/{re.escape(slug)}_diff_1k\.png$"),
        re.compile(rf"(^|/)textures/{re.escape(slug)}_albedo_1k\.png$"),
        re.compile(rf"(^|/)textures/{re.escape(slug)}_basecolor_1k\.png$"),
        re.compile(rf"(^|/)textures/{re.escape(slug)}_color_1k\.png$"),
    ]

    normal_patterns = [
        re.compile(rf"(^|/)textures/{re.escape(slug)}_nor_gl_1k\.png$"),
        re.compile(rf"(^|/)textures/{re.escape(slug)}_nor_gl_1k\.jpg$"),
        re.compile(rf"(^|/)textures/{re.escape(slug)}_normal_gl_1k\.png$"),
        re.compile(rf"(^|/)textures/{re.escape(slug)}_normal_gl_1k\.jpg$"),
    ]

    arm_patterns = [
        re.compile(rf"(^|/)textures/{re.escape(slug)}_arm_1k\.png$"),
        re.compile(rf"(^|/)textures/{re.escape(slug)}_arm_1k\.jpg$"),
        re.compile(rf"(^|/)textures/{re.escape(slug)}_orm_1k\.png$"),
        re.compile(rf"(^|/)textures/{re.escape(slug)}_orm_1k\.jpg$"),
    ]

    basecolor = _pick_best(names, preferred)
    normal_gl = _pick_best(names, normal_patterns)
    arm = _pick_best(names, arm_patterns)

    extra = []
    for name in names:
        lower = name.lower()
        if any(k in lower for k in ("license", "licence", "attribution")):
            extra.append(name)
        elif lower.endswith(".txt") and ("textures/" not in lower):
            extra.append(name)
        elif lower.endswith(".md") and ("textures/" not in lower):
            extra.append(name)

    return Picked(
        slug=slug,
        zip_path=zip_path,
        is_wall=_is_wall_slug(slug),
        basecolor=basecolor,
        normal_gl=normal_gl,
        arm=arm,
        extra_files=tuple(sorted(set(extra))),
    )


def _write_file(z: zipfile.ZipFile, member: str, dest_path: Path, *, dry_run: bool) -> None:
    if dry_run:
        return
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    with z.open(member) as src, open(dest_path, "wb") as out:
        out.write(src.read())


def _import_one(picked: Picked, *, dry_run: bool) -> None:
    target_dir = PBR_DIR / picked.slug

    if not picked.basecolor or not picked.normal_gl:
        raise RuntimeError(f"Missing required maps for {picked.slug}: basecolor={picked.basecolor}, normal_gl={picked.normal_gl}")

    if dry_run:
        print(f"[dry-run] {picked.zip_path} -> {target_dir}")
        return

    base_ext = Path(picked.basecolor).suffix.lower() or ".jpg"
    normal_ext = Path(picked.normal_gl).suffix.lower() or ".jpg"
    arm_ext = Path(picked.arm).suffix.lower() if picked.arm else None

    with zipfile.ZipFile(picked.zip_path) as z:
        _write_file(z, picked.basecolor, target_dir / f"basecolor{base_ext}", dry_run=dry_run)
        _write_file(z, picked.normal_gl, target_dir / f"normal_gl{normal_ext}", dry_run=dry_run)
        if picked.arm:
            _write_file(z, picked.arm, target_dir / f"arm{arm_ext or '.jpg'}", dry_run=dry_run)
        for extra in picked.extra_files:
            safe_name = os.path.basename(extra)
            if not safe_name:
                continue
            _write_file(z, extra, target_dir / safe_name, dry_run=dry_run)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    zips = sorted(DOWNLOADS_DIR.glob("*.zip"), key=lambda p: (p.name.lower()))
    groups: dict[str, list[Path]] = {}
    for zp in zips:
        slug = _slug_from_zip_name(zp)
        if not slug:
            continue
        groups.setdefault(slug, []).append(zp)

    chosen = []
    for slug, paths in groups.items():
        best = sorted(paths, key=_resolution_rank)[0]
        chosen.append((slug, best))

    if not chosen:
        print("No material archives found under downloads/")
        return 1

    failures = 0
    imported: list[Picked] = []
    for slug, zip_path in sorted(chosen, key=lambda t: t[0]):
        try:
            picked = _pick_textures(slug, zip_path)
            if not picked.basecolor or not picked.normal_gl:
                print(f"[skip] {slug}: missing basecolor/normal_gl in {zip_path}", file=sys.stderr)
                failures += 1
                continue
            _import_one(picked, dry_run=args.dry_run)
            imported.append(picked)
            if args.dry_run:
                print(f"[dry-run] picked: base={picked.basecolor}, normal={picked.normal_gl}, arm={picked.arm}")
        except Exception as e:
            print(f"[error] {slug}: {e}", file=sys.stderr)
            failures += 1

    if not args.dry_run:
        manifest_path = PBR_DIR / "_manifest.json"
        payload = {
            "version": 1,
            "failures": failures,
            "materials": [
                {
                    "slug": p.slug,
                    "zip": str(p.zip_path),
                    "is_wall": bool(p.is_wall),
                    "basecolor": p.basecolor,
                    "normal_gl": p.normal_gl,
                    "arm": p.arm,
                    "extra_files": list(p.extra_files),
                }
                for p in imported
            ],
        }
        try:
            manifest_path.parent.mkdir(parents=True, exist_ok=True)
            manifest_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        except Exception as e:
            print(f"[warn] could not write manifest {manifest_path}: {e}", file=sys.stderr)

    if failures:
        print(f"Import completed with {failures} failure(s).", file=sys.stderr)
        return 2

    print("Import completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
