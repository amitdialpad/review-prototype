from __future__ import annotations

import argparse
import importlib.util
import io
import json
import os
import stat
import subprocess
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).with_name("review_session.py")
SPEC = importlib.util.spec_from_file_location("review_session", MODULE_PATH)
assert SPEC and SPEC.loader
review_session = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(review_session)


class Response:
    def __init__(self, value):
        self.value = value

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self):
        return json.dumps(self.value).encode()


class ReviewSessionTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.state = Path(self.temporary.name) / "state"
        self.repo = Path(self.temporary.name) / "repo"
        self.repo.mkdir()
        subprocess.run(["git", "init", "-q", str(self.repo)], check=True)
        (self.repo / "README.md").write_text("fixture\n", encoding="utf-8")
        subprocess.run(["git", "-C", str(self.repo), "add", "README.md"], check=True)
        subprocess.run(
            [
                "git",
                "-C",
                str(self.repo),
                "-c",
                "user.name=Review Test",
                "-c",
                "user.email=review@example.invalid",
                "commit",
                "-q",
                "-m",
                "fixture",
            ],
            check=True,
        )
        self.commit = subprocess.run(
            ["git", "-C", str(self.repo), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        self.branch = subprocess.run(
            ["git", "-C", str(self.repo), "branch", "--show-current"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        self.manifest = Path(self.temporary.name) / "review-prototype.json"
        self.manifest.write_text(
            json.dumps(
                {
                    "version": 1,
                    "name": "Demo",
                    "projectId": "demo-project",
                    "router": "history",
                    "reviewParam": "review",
                    "routes": [{"label": "Overview", "path": "/overview", "query": {"state": "ready"}}],
                }
            )
        )
        self.session = "550e8400-e29b-41d4-a716-446655440000"
        self.environment = patch.dict(os.environ, {review_session.STATE_ENV: str(self.state)})
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def arguments(self):
        return argparse.Namespace(
            manifest=str(self.manifest),
            base_url="https://prototype.example/pr-preview-1/",
            api_url="https://comments.example",
            session=self.session,
            repo_root=str(self.repo),
            review_url=None,
            repository="example/prototype",
            branch=self.branch,
            pull_request=1,
            pull_request_url="https://github.com/example/prototype/pull/1",
            commit=self.commit,
            review_prototype_version="0.2.0",
            format="json",
        )

    def test_registers_private_restart_safe_receipt(self):
        receipt = review_session.register_session(self.arguments())
        self.assertIn(f"review={self.session}", receipt["links"][0]["url"])
        path = self.state / f"{self.session}.json"
        self.assertTrue(path.exists())
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.state.stat().st_mode), 0o700)
        self.assertEqual(review_session.select_receipt(repo_root=str(self.repo))["sessionId"], self.session)

    def test_fetches_only_unhandled_comments_and_records_verified_commit(self):
        receipt = review_session.register_session(self.arguments())
        payload = {
            "comments": [
                {"id": "two", "createdAt": "2026-01-02T00:00:00Z", "message": "Second"},
                {"id": "one", "createdAt": "2026-01-01T00:00:00Z", "message": "First"},
                {
                    "id": "done",
                    "createdAt": "2026-01-03T00:00:00Z",
                    "message": "Already accepted",
                    "status": "done",
                    "resolvedAt": "2026-01-04T00:00:00Z",
                },
                {
                    "id": "reopened",
                    "createdAt": "2026-01-05T00:00:00Z",
                    "message": "Needs work again",
                    "status": "open",
                    "resolvedAt": "2026-01-04T00:00:00Z",
                },
            ]
        }

        def opener(*_, **__):
            return Response(payload)

        self.assertEqual(
            [item["id"] for item in review_session.fetch_comments(receipt, opener=opener)],
            ["one", "two", "reopened"],
        )
        review_session.record_handled(receipt, ["one"], "def456")
        selected = review_session.select_receipt(self.session)
        self.assertEqual(
            [item["id"] for item in review_session.fetch_comments(selected, opener=opener)],
            ["two", "reopened"],
        )
        self.assertEqual(
            [item["id"] for item in review_session.fetch_comments(selected, include_handled=True, opener=opener)],
            ["one", "two", "done", "reopened"],
        )
        self.assertEqual(selected["handledComments"]["one"]["commit"], "def456")

    def test_preserves_exact_review_url_when_registering_existing_session(self):
        arguments = self.arguments()
        exact = f"https://prototype.example/pr-preview-1/custom?scenario=mixed&review={self.session}"
        arguments.review_url = [exact]
        receipt = review_session.register_session(arguments)
        self.assertEqual(receipt["links"], [{"label": "Overview", "url": exact}])

    def test_rejects_an_unknown_deployed_commit(self):
        arguments = self.arguments()
        arguments.commit = "not-a-real-commit"
        with self.assertRaisesRegex(review_session.SessionError, "deployed commit"):
            review_session.register_session(arguments)

    def test_rejects_exact_review_url_with_a_different_session(self):
        arguments = self.arguments()
        arguments.review_url = [
            "https://prototype.example/pr-preview-1/custom?review=another-session-token-12345"
        ]
        with self.assertRaisesRegex(review_session.SessionError, "registered session token"):
            review_session.register_session(arguments)

    def test_does_not_fall_back_to_another_repository(self):
        review_session.register_session(self.arguments())
        other = Path(self.temporary.name) / "other"
        other.mkdir()

        def git_value(repo_root, *arguments):
            if arguments == ("rev-parse", "--show-toplevel"):
                return str(repo_root)
            if arguments == ("branch", "--show-current"):
                return "prototype/other"
            return ""

        with patch.object(review_session, "git_value", side_effect=git_value):
            with self.assertRaisesRegex(review_session.SessionError, "current repository"):
                review_session.select_receipt(repo_root=str(other))

    def test_recording_an_old_round_does_not_make_it_active_again(self):
        old_arguments = self.arguments()
        old_arguments.session = "old-review-round-session-token-0001"
        with patch.object(review_session, "utc_now", return_value="2026-01-01T00:00:00Z"):
            old_receipt = review_session.register_session(old_arguments)

        new_arguments = self.arguments()
        new_arguments.session = "new-review-round-session-token-0002"
        with patch.object(review_session, "utc_now", return_value="2026-01-02T00:00:00Z"):
            review_session.register_session(new_arguments)

        with patch.object(review_session, "utc_now", return_value="2026-01-03T00:00:00Z"):
            review_session.record_handled(old_receipt, ["old-comment"], "verified-old-commit")

        def git_value(repo_root, *arguments):
            if arguments == ("rev-parse", "--show-toplevel"):
                return str(self.repo)
            if arguments == ("branch", "--show-current"):
                return self.branch
            return ""

        with patch.object(review_session, "git_value", side_effect=git_value):
            selected = review_session.select_receipt(repo_root=str(self.repo))
        self.assertEqual(selected["sessionId"], new_arguments.session)

    def test_rejects_invalid_comment_responses(self):
        receipt = review_session.register_session(self.arguments())

        def opener(*_, **__):
            return Response({"notComments": []})

        with self.assertRaisesRegex(review_session.SessionError, "invalid comments response"):
            review_session.fetch_comments(receipt, opener=opener)

    def test_rejects_malformed_comment_entries(self):
        receipt = review_session.register_session(self.arguments())

        def opener(*_, **__):
            return Response({"comments": [{"message": "Missing id"}]})

        with self.assertRaisesRegex(review_session.SessionError, "malformed comment entry"):
            review_session.fetch_comments(receipt, opener=opener)

    def test_requires_an_explicit_session_outside_git_when_multiple_exist(self):
        review_session.register_session(self.arguments())
        arguments = self.arguments()
        arguments.session = "another-review-session-token-0002"
        review_session.register_session(arguments)
        with self.assertRaisesRegex(review_session.SessionError, "pass --session"):
            review_session.select_receipt(repo_root=str(Path(self.temporary.name) / "not-a-repo"))

    def test_repairs_receipt_permissions_when_loading(self):
        review_session.register_session(self.arguments())
        path = self.state / f"{self.session}.json"
        path.chmod(0o644)
        review_session.select_receipt(self.session)
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)

    def test_validates_recorded_ids_and_commit(self):
        receipt = review_session.register_session(self.arguments())

        def opener(*_, **__):
            return Response({"comments": [{"id": "real-comment"}]})

        with patch.object(review_session, "git_value", return_value="verified-commit"):
            review_session.validate_record(receipt, ["real-comment"], "abc123", opener=opener)
            with self.assertRaisesRegex(review_session.SessionError, "not returned"):
                review_session.validate_record(receipt, ["invented-comment"], "abc123", opener=opener)

        with patch.object(review_session, "git_value", return_value=""):
            with self.assertRaisesRegex(review_session.SessionError, "identify a commit"):
                review_session.validate_record(receipt, ["real-comment"], "not-a-commit", opener=opener)

    def test_record_merges_with_latest_receipt_state(self):
        stale = review_session.register_session(self.arguments())
        latest = review_session.select_receipt(self.session)
        latest["handledComments"] = {"other": {"status": "implemented", "commit": "first"}}
        review_session.atomic_private_json(review_session.receipt_path(self.session), latest)

        review_session.record_handled(stale, ["new"], "second")
        selected = review_session.select_receipt(self.session)
        self.assertEqual(set(selected["handledComments"]), {"other", "new"})

    def test_concurrent_records_are_serialized_and_merged(self):
        receipt = review_session.register_session(self.arguments())
        original_read = review_session.read_private_receipt
        activity_lock = threading.Lock()
        active_reads = 0
        maximum_active_reads = 0

        def slow_read(path):
            nonlocal active_reads, maximum_active_reads
            with activity_lock:
                active_reads += 1
                maximum_active_reads = max(maximum_active_reads, active_reads)
            try:
                time.sleep(0.05)
                return original_read(path)
            finally:
                with activity_lock:
                    active_reads -= 1

        with patch.object(review_session, "read_private_receipt", side_effect=slow_read):
            with ThreadPoolExecutor(max_workers=2) as executor:
                futures = [
                    executor.submit(review_session.record_handled, receipt, ["left-comment"], "left-commit"),
                    executor.submit(review_session.record_handled, receipt, ["right-comment"], "right-commit"),
                ]
                for future in futures:
                    future.result()

        selected = review_session.select_receipt(self.session)
        self.assertEqual(maximum_active_reads, 1)
        self.assertEqual(set(selected["handledComments"]), {"left-comment", "right-comment"})


if __name__ == "__main__":
    unittest.main()
