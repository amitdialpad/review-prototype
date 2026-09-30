#!/usr/bin/env python3
"""Create one review session and route-specific share links from a manifest."""

from __future__ import annotations

import argparse
import json
import re
import secrets
import sys
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


SESSION_PATTERN = re.compile(r"^[A-Za-z0-9_-]{20,128}$")
PROJECT_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,100}$")


class ManifestError(ValueError):
    pass


def nonempty_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ManifestError(f"{field} must be non-empty text")
    return value.strip()


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ManifestError(f"Unable to read {path}: {error}") from error

    if not isinstance(value, dict):
        raise ManifestError("Manifest root must be an object")
    if value.get("version") != 1:
        raise ManifestError("Manifest version must be 1")

    value["name"] = nonempty_string(value.get("name"), "name")
    project_id = nonempty_string(value.get("projectId"), "projectId")
    if not PROJECT_PATTERN.fullmatch(project_id):
        raise ManifestError("projectId contains unsupported characters")
    value["projectId"] = project_id

    router = value.get("router", "history")
    if router not in {"history", "hash"}:
        raise ManifestError("router must be history or hash")

    value["reviewParam"] = nonempty_string(value.get("reviewParam", "review"), "reviewParam")

    routes = value.get("routes")
    if not isinstance(routes, list) or not routes:
        raise ManifestError("routes must be a non-empty array")

    labels: set[str] = set()
    for index, route in enumerate(routes):
        if not isinstance(route, dict):
            raise ManifestError(f"routes[{index}] must be an object")
        label = nonempty_string(route.get("label"), f"routes[{index}].label")
        if label in labels:
            raise ManifestError(f"Duplicate route label: {label}")
        labels.add(label)
        path_value = nonempty_string(route.get("path"), f"routes[{index}].path")
        if not path_value.startswith("/") or "?" in path_value or "#" in path_value:
            raise ManifestError(f"routes[{index}].path must be an absolute app path without query or fragment")
        route["label"] = label
        route["path"] = path_value
        query = route.get("query", {})
        if not isinstance(query, dict) or not all(
            isinstance(key, str) and isinstance(item, str) for key, item in query.items()
        ):
            raise ManifestError(f"routes[{index}].query must contain only string keys and values")

    return value


def joined_path(base_path: str, route_path: str) -> str:
    return f"{base_path.rstrip('/')}/{route_path.lstrip('/')}" or "/"


def build_history_url(base_url: str, route: dict[str, Any], review_param: str, session: str) -> str:
    base = urlsplit(base_url)
    if base.fragment:
        raise ManifestError("A history-router base URL must not contain a fragment")
    query = dict(parse_qsl(base.query, keep_blank_values=True))
    query.update(route.get("query", {}))
    query[review_param] = session
    return urlunsplit((base.scheme, base.netloc, joined_path(base.path, route["path"]), urlencode(query), ""))


def build_hash_url(base_url: str, route: dict[str, Any], review_param: str, session: str) -> str:
    base = urlsplit(base_url)
    query = dict(route.get("query", {}))
    query[review_param] = session
    fragment = route["path"]
    if query:
        fragment = f"{fragment}?{urlencode(query)}"
    return urlunsplit((base.scheme, base.netloc, base.path, base.query, fragment))


def generate_links(manifest: dict[str, Any], base_url: str, session: str) -> dict[str, Any]:
    parsed_base = urlsplit(base_url)
    if parsed_base.scheme not in {"http", "https"} or not parsed_base.netloc:
        raise ManifestError("base URL must be an absolute http or https URL")
    if not SESSION_PATTERN.fullmatch(session):
        raise ManifestError("session must be 20-128 URL-safe characters")
    builder = build_hash_url if manifest.get("router", "history") == "hash" else build_history_url
    return {
        "name": manifest["name"],
        "projectId": manifest["projectId"],
        "session": session,
        "links": [
            {"label": route["label"], "url": builder(base_url, route, manifest["reviewParam"], session)}
            for route in manifest["routes"]
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--session")
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    args = parser.parse_args()
    try:
        result = generate_links(load_manifest(args.manifest), args.base_url, args.session or secrets.token_urlsafe(24))
    except ManifestError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    if args.format == "json":
        print(json.dumps(result, indent=2))
    else:
        print(f"Review: {result['name']}")
        print(f"Session: {result['session']}")
        print("Links:")
        for item in result["links"]:
            print(f"- {item['label']}: {item['url']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
