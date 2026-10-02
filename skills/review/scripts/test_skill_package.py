from __future__ import annotations

import json
import re
import unittest
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


class SkillPackageTest(unittest.TestCase):
    def test_skill_version_matches_package_version(self):
        package = json.loads((REPOSITORY_ROOT / "package.json").read_text(encoding="utf-8"))
        version = (SKILL_DIR / "VERSION").read_text(encoding="utf-8").strip()
        self.assertEqual(version, package["version"])

    def test_skill_entrypoint_is_generic_and_all_local_links_exist(self):
        entrypoint = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
        self.assertNotIn("Amit", entrypoint)
        linked = re.findall(r"\]\(((?:references|scripts)/[^)]+)\)", entrypoint)
        self.assertTrue(linked)
        for relative in linked:
            self.assertTrue((SKILL_DIR / relative).is_file(), relative)

    def test_installable_skill_contains_required_resources(self):
        required = {
            "SKILL.md",
            "VERSION",
            "agents/openai.yaml",
            "references/beacon-preview.md",
            "references/feedback-loop.md",
            "references/hosting.md",
            "references/manifest.md",
            "references/reviewer-experience.md",
            "scripts/generate_review_links.py",
            "scripts/review_session.py",
            "scripts/update_review_skill.py",
        }
        present = {
            str(path.relative_to(SKILL_DIR))
            for path in SKILL_DIR.rglob("*")
            if path.is_file() and "__pycache__" not in path.parts
        }
        self.assertTrue(required.issubset(present), sorted(required - present))

    def test_dialpad_pilot_uses_shared_netlify_service(self):
        hosting = (SKILL_DIR / "references" / "hosting.md").read_text(encoding="utf-8")
        self.assertIn("https://review-prototype.netlify.app", hosting)
        self.assertIn("https://beacon-test.dialpad.design", hosting)
        self.assertIn("https://dialpad.github.io", hosting)
        self.assertNotIn("Dialpad-owned Review Prototype deployment", hosting)


if __name__ == "__main__":
    unittest.main()
