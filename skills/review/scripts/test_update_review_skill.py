from __future__ import annotations

import importlib.util
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("update_review_skill.py")
SPEC = importlib.util.spec_from_file_location("update_review_skill", MODULE_PATH)
assert SPEC and SPEC.loader
update_review_skill = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(update_review_skill)


class Response:
    def __init__(self, value: bytes):
        self.value = value

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, size: int = -1):
        return self.value if size < 0 else self.value[:size]


def release_archive(version: str) -> bytes:
    output = io.BytesIO()
    prefix = "amitdialpad-review-prototype-test/skills/review/"
    with zipfile.ZipFile(output, "w") as archive:
        files = {
            "SKILL.md": "---\nname: review\ndescription: Test fixture.\n---\n# Review\n",
            "VERSION": f"{version}\n",
            "agents/openai.yaml": "interface:\n  display_name: Review\n",
            "references/feedback-loop.md": "# Feedback\n",
            "references/reviewer-experience.md": "# Experience\n",
            "scripts/review_session.py": "print('fixture')\n",
        }
        for path, value in files.items():
            archive.writestr(f"{prefix}{path}", value)
    return output.getvalue()


class UpdateReviewSkillTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.skill = self.root / "skills" / "review"
        self.skill.mkdir(parents=True)
        (self.skill / "VERSION").write_text("0.3.2\n", encoding="utf-8")
        (self.skill / "keep.txt").write_text("old skill\n", encoding="utf-8")
        self.archive = release_archive("0.3.4")

    def opener(self, request, **_):
        url = request.full_url
        if url == update_review_skill.RELEASE_API:
            payload = {"tag_name": "v0.3.4", "zipball_url": "https://example.test/review.zip"}
            return Response(json.dumps(payload).encode())
        if url == "https://example.test/review.zip":
            return Response(self.archive)
        raise AssertionError(url)

    def test_detects_new_stable_release(self):
        status = update_review_skill.update_status(self.skill, self.opener)
        self.assertTrue(status["updateAvailable"])
        self.assertEqual(status["currentVersion"], "0.3.2")
        self.assertEqual(status["latestVersion"], "0.3.4")

    def test_falls_back_to_highest_stable_tag_when_no_release_exists(self):
        def opener(request, **_):
            if request.full_url == update_review_skill.RELEASE_API:
                raise OSError("no GitHub release")
            if request.full_url == update_review_skill.TAGS_API:
                payload = [
                    {"name": "preview", "zipball_url": "https://example.test/preview.zip"},
                    {"name": "v0.2.7", "zipball_url": "https://example.test/027.zip"},
                    {"name": "v0.3.2", "zipball_url": "https://example.test/032.zip"},
                ]
                return Response(json.dumps(payload).encode())
            raise AssertionError(request.full_url)

        release = update_review_skill.fetch_latest_release(opener)
        self.assertEqual(release["version"], "0.3.2")
        self.assertEqual(release["archiveUrl"], "https://example.test/032.zip")

    def test_replaces_skill_and_keeps_private_backup(self):
        status = update_review_skill.update_status(self.skill, self.opener)
        backup_root = self.root / "backups"
        result = update_review_skill.apply_update(
            self.skill,
            status,
            opener=self.opener,
            backup_root=backup_root,
        )
        self.assertTrue(result["updated"])
        self.assertEqual(update_review_skill.read_version(self.skill), "0.3.4")
        self.assertTrue((Path(result["backup"]) / "keep.txt").exists())
        self.assertFalse((self.skill / "keep.txt").exists())

    def test_does_not_replace_current_version(self):
        (self.skill / "VERSION").write_text("0.3.4\n", encoding="utf-8")
        status = update_review_skill.update_status(self.skill, self.opener)
        result = update_review_skill.apply_update(self.skill, status, opener=self.opener)
        self.assertFalse(result["updated"])
        self.assertTrue((self.skill / "keep.txt").exists())


if __name__ == "__main__":
    unittest.main()
