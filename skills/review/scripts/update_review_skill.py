#!/usr/bin/env python3
"""Check for and safely install the latest stable Review skill release."""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import shutil
import stat
import sys
import tempfile
import time
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any, Callable
from urllib.request import Request, urlopen


RELEASE_API = "https://api.github.com/repos/amitdialpad/review-prototype/releases/latest"
TAGS_API = "https://api.github.com/repos/amitdialpad/review-prototype/tags?per_page=100"
VERSION_PATTERN = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")
MAX_ARCHIVE_BYTES = 25 * 1024 * 1024
REQUIRED_PATHS = (
    "SKILL.md",
    "VERSION",
    "agents/openai.yaml",
    "references/feedback-loop.md",
    "references/reviewer-experience.md",
    "scripts/review_session.py",
)


class UpdateError(ValueError):
    pass


def normalized_version(value: str) -> tuple[int, int, int]:
    match = VERSION_PATTERN.fullmatch(value.strip())
    if not match:
        raise UpdateError(f"Invalid Review skill version: {value!r}")
    return tuple(int(part) for part in match.groups())


def read_version(skill_dir: Path) -> str:
    try:
        value = (skill_dir / "VERSION").read_text(encoding="utf-8").strip()
    except OSError as error:
        raise UpdateError(f"Unable to read installed Review skill version: {error}") from error
    normalized_version(value)
    return value.removeprefix("v")


def read_response(response: Any, maximum: int | None = None) -> bytes:
    data = response.read((maximum or 0) + 1) if maximum else response.read()
    if maximum and len(data) > maximum:
        raise UpdateError("Review skill release archive is unexpectedly large")
    return data


def fetch_json(url: str, opener: Callable[..., Any]) -> Any:
    request = Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "review-prototype-skill-updater"})
    with opener(request, timeout=20) as response:
        return json.loads(read_response(response).decode("utf-8"))


def fetch_latest_release(opener: Callable[..., Any] = urlopen) -> dict[str, str]:
    try:
        payload = fetch_json(RELEASE_API, opener)
        tag = payload.get("tag_name") if isinstance(payload, dict) else None
        archive = payload.get("zipball_url") if isinstance(payload, dict) else None
    except Exception as release_error:
        try:
            tags = fetch_json(TAGS_API, opener)
            stable = [
                item
                for item in tags if isinstance(tags, list) and isinstance(item, dict)
                and isinstance(item.get("name"), str)
                and VERSION_PATTERN.fullmatch(item["name"])
                and isinstance(item.get("zipball_url"), str)
            ]
            selected = max(stable, key=lambda item: normalized_version(item["name"])) if stable else None
            tag = selected.get("name") if selected else None
            archive = selected.get("zipball_url") if selected else None
        except Exception as tags_error:
            raise UpdateError(
                f"Unable to check the stable Review release: {release_error}; tag fallback failed: {tags_error}"
            ) from tags_error
    if not isinstance(tag, str) or not isinstance(archive, str):
        raise UpdateError("Latest Review release metadata is incomplete")
    normalized_version(tag)
    return {"version": tag.removeprefix("v"), "tag": tag, "archiveUrl": archive}


def update_status(skill_dir: Path, opener: Callable[..., Any] = urlopen) -> dict[str, Any]:
    current = read_version(skill_dir)
    release = fetch_latest_release(opener)
    return {
        "currentVersion": current,
        "latestVersion": release["version"],
        "tag": release["tag"],
        "updateAvailable": normalized_version(release["version"]) > normalized_version(current),
        "archiveUrl": release["archiveUrl"],
    }


def archive_members(data: bytes) -> tuple[zipfile.ZipFile, str]:
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as error:
        raise UpdateError("Stable Review release is not a valid zip archive") from error
    version_members = [name for name in archive.namelist() if name.endswith("/skills/review/VERSION")]
    if len(version_members) != 1:
        archive.close()
        raise UpdateError("Stable Review release does not contain one installable Review skill")
    return archive, version_members[0][: -len("VERSION")]


def extract_skill(data: bytes, destination: Path, expected_version: str) -> None:
    archive, prefix = archive_members(data)
    try:
        for info in archive.infolist():
            if not info.filename.startswith(prefix) or info.filename == prefix:
                continue
            relative = PurePosixPath(info.filename[len(prefix) :])
            if relative.is_absolute() or ".." in relative.parts:
                raise UpdateError("Stable Review release contains an unsafe path")
            file_type = stat.S_IFMT(info.external_attr >> 16)
            if file_type == stat.S_IFLNK:
                raise UpdateError("Stable Review release contains an unsupported symbolic link")
            target = destination.joinpath(*relative.parts)
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(info))
    finally:
        archive.close()

    for relative in REQUIRED_PATHS:
        if not (destination / relative).is_file():
            raise UpdateError(f"Stable Review release is missing {relative}")
    if read_version(destination) != expected_version:
        raise UpdateError("Stable Review release version does not match its GitHub tag")
    skill_text = (destination / "SKILL.md").read_text(encoding="utf-8")
    if "name: review" not in skill_text[:500]:
        raise UpdateError("Stable Review release has an invalid skill entrypoint")


def download_archive(url: str, opener: Callable[..., Any] = urlopen) -> bytes:
    request = Request(url, headers={"User-Agent": "review-prototype-skill-updater"})
    try:
        with opener(request, timeout=30) as response:
            return read_response(response, MAX_ARCHIVE_BYTES)
    except UpdateError:
        raise
    except Exception as error:
        raise UpdateError(f"Unable to download the stable Review release: {error}") from error


def apply_update(
    skill_dir: Path,
    status: dict[str, Any],
    *,
    opener: Callable[..., Any] = urlopen,
    backup_root: Path | None = None,
) -> dict[str, Any]:
    if not status["updateAvailable"]:
        return {**status, "updated": False, "backup": ""}
    skill_dir = skill_dir.resolve()
    parent = skill_dir.parent
    parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".review-update-", dir=parent))
    previous = parent / f".review-previous-{os.getpid()}"
    backup_root = backup_root or Path.home() / ".review-prototype" / "skill-backups"
    backup_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    backup = backup_root / f"review-{status['currentVersion']}-{int(time.time())}"
    try:
        extract_skill(download_archive(status["archiveUrl"], opener), staging, status["latestVersion"])
        os.replace(skill_dir, previous)
        try:
            os.replace(staging, skill_dir)
        except Exception:
            os.replace(previous, skill_dir)
            raise
        shutil.move(str(previous), str(backup))
    except Exception:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        if previous.exists() and not skill_dir.exists():
            os.replace(previous, skill_dir)
        raise
    return {**status, "updated": True, "backup": str(backup)}


def output(value: dict[str, Any], format_name: str) -> None:
    safe = {key: item for key, item in value.items() if key != "archiveUrl"}
    if format_name == "json":
        print(json.dumps(safe, indent=2, sort_keys=True))
        return
    if safe.get("updated"):
        print(f"Updated Review from {safe['currentVersion']} to {safe['latestVersion']}.")
        print("Start a fresh Codex conversation before using $review again.")
    elif safe["updateAvailable"]:
        print(f"Review {safe['latestVersion']} is available; installed version is {safe['currentVersion']}.")
    else:
        print(f"Review {safe['currentVersion']} is current.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--skill-dir", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--format", choices=("text", "json"), default="text")
    arguments = parser.parse_args()
    try:
        status = update_status(arguments.skill_dir)
        result = apply_update(arguments.skill_dir, status) if arguments.apply else status
        output(result, arguments.format)
        return 0
    except UpdateError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
