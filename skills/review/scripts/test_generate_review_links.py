#!/usr/bin/env python3

import importlib.util
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("generate_review_links.py")
SPEC = importlib.util.spec_from_file_location("generate_review_links", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class GenerateReviewLinksTest(unittest.TestCase):
    def manifest(self, router="history"):
        return {
            "version": 1,
            "name": "Billing review",
            "projectId": "billing-review",
            "router": router,
            "reviewParam": "review",
            "routes": [
                {"label": "Summary", "path": "/settings/billing/summary", "query": {"tab": "current"}},
                {"label": "Usage", "path": "/settings/billing/credits-usage", "query": {}},
            ],
        }

    def test_history_routes_share_session_and_keep_preview_prefix(self):
        result = MODULE.generate_links(
            self.manifest(),
            "https://beacon-test.dialpad.design/pr-preview-120/",
            "550e8400-e29b-41d4-a716-446655440000",
        )
        self.assertEqual(
            result["links"][0]["url"],
            "https://beacon-test.dialpad.design/pr-preview-120/settings/billing/summary?tab=current&review=550e8400-e29b-41d4-a716-446655440000",
        )
        self.assertIn("review=550e8400-e29b-41d4-a716-446655440000", result["links"][1]["url"])

    def test_hash_router_places_token_inside_fragment(self):
        result = MODULE.generate_links(
            self.manifest(router="hash"),
            "https://example.test/house-of-air/",
            "550e8400-e29b-41d4-a716-446655440000",
        )
        self.assertEqual(
            result["links"][0]["url"],
            "https://example.test/house-of-air/#/settings/billing/summary?tab=current&review=550e8400-e29b-41d4-a716-446655440000",
        )

    def test_invalid_base_and_session_are_rejected(self):
        with self.assertRaises(MODULE.ManifestError):
            MODULE.generate_links(self.manifest(), "/local", "550e8400-e29b-41d4-a716-446655440000")
        with self.assertRaises(MODULE.ManifestError):
            MODULE.generate_links(self.manifest(), "https://example.test", "short")


if __name__ == "__main__":
    unittest.main()
