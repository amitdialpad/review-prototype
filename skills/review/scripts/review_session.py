#!/usr/bin/env python3
"""Register review sessions, fetch unhandled comments, and record verified fixes."""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen


SESSION_PATTERN = re.compile(r"^[A-Za-z0-9_-]{20,128}$")
PROJECT_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,100}$")
STATE_ENV = "REVIEW_PROTOTYPE_STATE_DIR"


class SessionError(ValueError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def state_directory() -> Path:
    override = os.environ.get(STATE_ENV)
    return Path(override).expanduser() if override else Path.home() / ".review-prototype" / "sessions"


def ensure_state_directory() -> Path:
    directory = state_directory()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    return directory


def atomic_private_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.chmod(0o600)
    os.replace(temporary, path)
    path.chmod(0o600)


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SessionError(f"Unable to read {path}: {error}") from error
    if not isinstance(value, dict):
        raise SessionError(f"{path} must contain a JSON object")
    return value


def read_private_receipt(path: Path) -> dict[str, Any]:
    try:
        path.chmod(0o600)
    except OSError as error:
        raise SessionError(f"Unable to secure private review receipt {path}: {error}") from error
    return read_json(path)


def load_manifest(path: Path) -> dict[str, Any]:
    manifest = read_json(path)
    if manifest.get("version") != 1:
        raise SessionError("Manifest version must be 1")
    project_id = manifest.get("projectId")
    if not isinstance(project_id, str) or not PROJECT_PATTERN.fullmatch(project_id):
        raise SessionError("Manifest projectId is invalid")
    if manifest.get("router") not in {"history", "hash"}:
        raise SessionError("Manifest router must be history or hash")
    routes = manifest.get("routes")
    if not isinstance(routes, list) or not routes:
        raise SessionError("Manifest needs at least one route")
    return manifest


def validate_session(session_id: str) -> str:
    if not SESSION_PATTERN.fullmatch(session_id):
        raise SessionError("Session token must contain 20-128 URL-safe characters")
    return session_id


def apply_query(url: str, query: dict[str, Any]) -> str:
    parts = urlsplit(url)
    values = dict(parse_qsl(parts.query, keep_blank_values=True))
    values.update({str(key): str(value) for key, value in query.items()})
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(values), parts.fragment))


def generated_links(manifest: dict[str, Any], base_url: str, session_id: str) -> list[dict[str, str]]:
    base = urlsplit(base_url)
    if base.scheme not in {"http", "https"} or not base.netloc:
        raise SessionError("Base URL must be an absolute HTTP(S) URL")
    review_param = str(manifest.get("reviewParam") or "review")
    links = []
    for route in manifest["routes"]:
        path = route.get("path")
        label = route.get("label")
        if not isinstance(path, str) or not path.startswith("/") or not isinstance(label, str):
            raise SessionError("Every route needs a label and absolute path")
        query = {**route.get("query", {}), review_param: session_id}
        if manifest["router"] == "hash":
            fragment = apply_query(f"https://placeholder.invalid{path}", query)
            route_parts = urlsplit(fragment)
            url = urlunsplit((base.scheme, base.netloc, base.path, base.query, f"{route_parts.path}?{route_parts.query}"))
        else:
            joined = f"{base.path.rstrip('/')}/{path.lstrip('/')}" or "/"
            url = apply_query(urlunsplit((base.scheme, base.netloc, joined, base.query, "")), query)
        links.append({"label": label, "url": url})
    return links


def review_value(url: str, router: str, review_param: str) -> str:
    parts = urlsplit(url)
    if router == "hash":
        fragment = urlsplit(f"https://placeholder.invalid/{parts.fragment.lstrip('#')}")
        return dict(parse_qsl(fragment.query, keep_blank_values=True)).get(review_param, "")
    return dict(parse_qsl(parts.query, keep_blank_values=True)).get(review_param, "")


def validate_exact_review_url(url: str, base_url: str, manifest: dict[str, Any], session_id: str) -> None:
    exact = urlsplit(url)
    base = urlsplit(base_url)
    if exact.scheme not in {"http", "https"} or (exact.scheme, exact.netloc) != (base.scheme, base.netloc):
        raise SessionError("Every exact review URL must use the deployed preview origin")
    if manifest["router"] == "history" and not exact.path.startswith(f"{base.path.rstrip('/')}/"):
        raise SessionError("Every exact review URL must remain beneath the deployed preview base path")
    review_param = str(manifest.get("reviewParam") or "review")
    if review_value(url, manifest["router"], review_param) != session_id:
        raise SessionError("Every exact review URL must contain the registered session token")


def git_value(repo_root: Path, *arguments: str) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", str(repo_root), *arguments],
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return ""


def receipt_path(session_id: str) -> Path:
    return ensure_state_directory() / f"{validate_session(session_id)}.json"


@contextmanager
def receipt_lock(session_id: str):
    lock_path = ensure_state_directory() / f".{validate_session(session_id)}.lock"
    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        os.fchmod(descriptor, 0o600)
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def register_session(arguments: argparse.Namespace) -> dict[str, Any]:
    manifest = load_manifest(Path(arguments.manifest).resolve())
    session_id = validate_session(arguments.session)
    repo_root = Path(arguments.repo_root).resolve()
    path = receipt_path(session_id)
    links = generated_links(manifest, arguments.base_url, session_id)
    if arguments.review_url:
        if len(arguments.review_url) != len(links):
            raise SessionError("The number of --review-url values must match the manifest routes")
        for item, exact_url in zip(links, arguments.review_url, strict=True):
            validate_exact_review_url(exact_url, arguments.base_url, manifest, session_id)
            item["url"] = exact_url
    requested_commit = arguments.commit or git_value(repo_root, "rev-parse", "HEAD")
    deployed_commit = git_value(repo_root, "rev-parse", "--verify", f"{requested_commit}^{{commit}}")
    if not requested_commit or not deployed_commit:
        raise SessionError("The deployed commit must identify a commit in the prototype repository")
    with receipt_lock(session_id):
        existing = read_private_receipt(path) if path.exists() else {}
        now = utc_now()
        receipt = {
            "schemaVersion": 1,
            "name": manifest.get("name") or manifest["projectId"],
            "projectId": manifest["projectId"],
            "sessionId": session_id,
            "apiUrl": arguments.api_url.rstrip("/"),
            "baseUrl": arguments.base_url,
            "links": links,
            "repoRoot": str(repo_root),
            "repository": arguments.repository or git_value(repo_root, "remote", "get-url", "origin"),
            "branch": arguments.branch or git_value(repo_root, "branch", "--show-current"),
            "pullRequest": arguments.pull_request,
            "pullRequestUrl": arguments.pull_request_url or "",
            "deployedCommit": deployed_commit,
            "reviewPrototypeVersion": arguments.review_prototype_version or "",
            "createdAt": existing.get("createdAt") or now,
            "updatedAt": now,
            "handledComments": existing.get("handledComments")
            if isinstance(existing.get("handledComments"), dict)
            else {},
        }
        atomic_private_json(path, receipt)
    return receipt


def load_receipts() -> list[dict[str, Any]]:
    directory = ensure_state_directory()
    receipts = []
    for path in directory.glob("*.json"):
        try:
            receipt = read_private_receipt(path)
            validate_session(str(receipt.get("sessionId") or ""))
            receipts.append(receipt)
        except SessionError:
            continue
    return receipts


def select_receipt(session_id: str | None = None, repo_root: str | None = None) -> dict[str, Any]:
    receipts = load_receipts()
    if session_id:
        matches = [item for item in receipts if item.get("sessionId") == validate_session(session_id)]
    else:
        matches = receipts
        if repo_root:
            requested = Path(repo_root).resolve()
            git_root = git_value(requested, "rev-parse", "--show-toplevel")
            resolved = str(Path(git_root).resolve()) if git_root else ""
        else:
            resolved = ""
        if resolved:
            repository_matches = [item for item in matches if item.get("repoRoot") == resolved]
            if not repository_matches:
                raise SessionError("No active review session matches the current repository")
            matches = repository_matches
            branch = git_value(Path(resolved), "branch", "--show-current")
            if branch:
                branch_matches = [item for item in matches if item.get("branch") == branch]
                if not branch_matches:
                    raise SessionError("No active review session matches the current branch")
                matches = branch_matches
        elif len(matches) > 1:
            raise SessionError("Multiple review sessions exist; pass --session from the exact review URL")
    if not matches:
        raise SessionError("No active review session was found")
    # Activity such as recording a handled comment must not reactivate an older review round.
    return max(matches, key=lambda item: str(item.get("createdAt") or item.get("updatedAt") or ""))


def comments_endpoint(receipt: dict[str, Any]) -> str:
    return (
        f"{str(receipt['apiUrl']).rstrip('/')}/v1/projects/{quote(str(receipt['projectId']), safe='')}"
        f"/sessions/{quote(str(receipt['sessionId']), safe='')}/comments"
    )


def fetch_comments(
    receipt: dict[str, Any],
    *,
    include_handled: bool = False,
    opener: Callable[..., Any] = urlopen,
) -> list[dict[str, Any]]:
    request = Request(comments_endpoint(receipt), headers={"Accept": "application/json"})
    try:
        with opener(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as error:  # urllib surfaces several transport-specific exception types.
        raise SessionError(f"Unable to fetch review comments: {error}") from error
    comments = payload.get("comments") if isinstance(payload, dict) else None
    if not isinstance(comments, list):
        raise SessionError("Review service returned an invalid comments response")
    if any(not isinstance(item, dict) or not isinstance(item.get("id"), str) for item in comments):
        raise SessionError("Review service returned a malformed comment entry")
    normalized = comments
    normalized.sort(key=lambda item: str(item.get("createdAt") or ""))
    if include_handled:
        return normalized
    handled = receipt.get("handledComments") if isinstance(receipt.get("handledComments"), dict) else {}
    return [item for item in normalized if item["id"] not in handled]


def record_handled(receipt: dict[str, Any], comment_ids: list[str], commit: str) -> dict[str, Any]:
    if not comment_ids:
        raise SessionError("At least one --comment-id is required")
    path = receipt_path(str(receipt["sessionId"]))
    with receipt_lock(str(receipt["sessionId"])):
        latest = read_private_receipt(path) if path.exists() else receipt
        handled = latest.get("handledComments") if isinstance(latest.get("handledComments"), dict) else {}
        now = utc_now()
        for comment_id in comment_ids:
            handled[comment_id] = {"status": "implemented", "commit": commit, "handledAt": now}
        latest["handledComments"] = handled
        latest["deployedCommit"] = commit
        latest["updatedAt"] = now
        atomic_private_json(path, latest)
    return latest


def validate_record(
    receipt: dict[str, Any],
    comment_ids: list[str],
    commit: str,
    *,
    opener: Callable[..., Any] = urlopen,
) -> None:
    repo_root = Path(str(receipt.get("repoRoot") or "."))
    verified_commit = git_value(repo_root, "rev-parse", "--verify", f"{commit}^{{commit}}")
    if not verified_commit:
        raise SessionError("--commit must identify a commit in the registered prototype repository")
    available_ids = {item["id"] for item in fetch_comments(receipt, include_handled=True, opener=opener)}
    unknown = sorted(set(comment_ids) - available_ids)
    if unknown:
        raise SessionError(f"Cannot record comment IDs that were not returned by the review service: {', '.join(unknown)}")


def output(value: Any, format_name: str) -> None:
    if format_name == "json":
        print(json.dumps(value, indent=2, sort_keys=True))
        return
    if isinstance(value, dict) and "comments" in value:
        comments = value["comments"]
        print(f"Review: {value['session']['name']}")
        print(f"Unhandled comments: {len(comments)}")
        for comment in comments:
            print(f"- [{comment.get('authorName', 'Unknown')}] {comment.get('scope', '')}: {comment.get('message', '')}")
        return
    print(json.dumps(value, indent=2, sort_keys=True))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    register = subparsers.add_parser("register", help="Register a deployed review session")
    register.add_argument("--manifest", required=True)
    register.add_argument("--base-url", required=True)
    register.add_argument("--api-url", required=True)
    register.add_argument("--session", required=True)
    register.add_argument("--repo-root", default=".")
    register.add_argument("--review-url", action="append")
    register.add_argument("--repository")
    register.add_argument("--branch")
    register.add_argument("--pull-request", type=int)
    register.add_argument("--pull-request-url")
    register.add_argument("--commit")
    register.add_argument("--review-prototype-version")
    register.add_argument("--format", choices=("json", "text"), default="text")

    comments = subparsers.add_parser("comments", help="Fetch unhandled review comments")
    comments.add_argument("--session")
    comments.add_argument("--repo-root", default=".")
    comments.add_argument("--all", action="store_true")
    comments.add_argument("--format", choices=("json", "text"), default="text")

    record = subparsers.add_parser("record", help="Record comments after a verified deployment")
    record.add_argument("--session")
    record.add_argument("--repo-root", default=".")
    record.add_argument("--comment-id", action="append", required=True)
    record.add_argument("--commit", required=True)
    record.add_argument("--format", choices=("json", "text"), default="text")

    show = subparsers.add_parser("show", help="Show the selected private review receipt")
    show.add_argument("--session")
    show.add_argument("--repo-root", default=".")
    show.add_argument("--format", choices=("json", "text"), default="text")
    return parser


def main() -> int:
    arguments = build_parser().parse_args()
    try:
        if arguments.command == "register":
            value = register_session(arguments)
        else:
            receipt = select_receipt(arguments.session, arguments.repo_root)
            if arguments.command == "comments":
                value = {"session": receipt, "comments": fetch_comments(receipt, include_handled=arguments.all)}
            elif arguments.command == "record":
                validate_record(receipt, arguments.comment_id, arguments.commit)
                value = record_handled(receipt, arguments.comment_id, arguments.commit)
            else:
                value = receipt
        output(value, arguments.format)
        return 0
    except SessionError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
