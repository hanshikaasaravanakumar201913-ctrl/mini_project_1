"""Export all Medora UI translation keys and metadata into a reviewer-friendly JSON file.

Bundles the live TypeScript modules (`frontend/src/i18n/translations.ts` and
`frontend/src/i18n/languages.ts`) using Node + esbuild so the exported JSON stays
100% synchronized with production builds, then writes `docs/translation_review_export.json`.

Usage:
    python backend/scripts/export_translations_for_review.py
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIR = REPO_ROOT / "frontend"
OUTPUT_PATH = REPO_ROOT / "docs" / "translation_review_export.json"


def _resolve_node_executable() -> str:
    node_in_path = shutil.which("node")
    if node_in_path:
        return node_in_path
    fallback_candidates = [
        Path(r"C:\Users\Adox\tools\node-v26.13.0-win-x64\node.exe"),
        Path(r"C:\Program Files\nodejs\node.exe"),
    ]
    for candidate in fallback_candidates:
        if candidate.exists():
            return str(candidate)
    raise RuntimeError(
        "Node.js executable not found on PATH or standard install directories. "
        "Add Node.js to PATH before running this exporter."
    )


def _extract_frontend_i18n_payload() -> dict:
    node_exe = _resolve_node_executable()
    esbuild_entry = (FRONTEND_DIR / "node_modules" / "esbuild" / "lib" / "main.js").as_posix()
    translations_ts = (FRONTEND_DIR / "src" / "i18n" / "translations.ts").as_posix()
    languages_ts = (FRONTEND_DIR / "src" / "i18n" / "languages.ts").as_posix()

    with tempfile.TemporaryDirectory(prefix="medora-i18n-export-") as tmpdir:
        tmp_path = Path(tmpdir)
        trans_bundle = (tmp_path / "translations.mjs").as_posix()
        lang_bundle = (tmp_path / "languages.mjs").as_posix()
        runner_js = tmp_path / "extract.mjs"
        runner_js.write_text(
            "\n".join(
                [
                    f"import esbuild from {json.dumps('file:///' + esbuild_entry)};",
                    f"await esbuild.build({{ entryPoints: [{json.dumps(translations_ts)}], bundle: true, platform: 'node', format: 'esm', outfile: {json.dumps(trans_bundle)} }});",
                    f"await esbuild.build({{ entryPoints: [{json.dumps(languages_ts)}], bundle: true, platform: 'node', format: 'esm', outfile: {json.dumps(lang_bundle)} }});",
                    f"const tMod = await import({json.dumps('file:///' + trans_bundle)});",
                    f"const lMod = await import({json.dumps('file:///' + lang_bundle)});",
                    "console.log(JSON.stringify({",
                    "  languages: lMod.SUPPORTED_LANGUAGES,",
                    "  coverage: tMod.getTranslationCoverageReport(),",
                    "  translations: tMod.translations,",
                    "}));",
                ]
            ),
            encoding="utf-8",
        )
        proc = subprocess.run(
            [node_exe, str(runner_js)],
            cwd=str(FRONTEND_DIR),
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
        if proc.returncode != 0:
            raise RuntimeError(
                f"Failed to bundle frontend i18n modules (exit {proc.returncode}):\n{proc.stderr}"
            )
        return json.loads(proc.stdout)


def build_review_export() -> dict:
    payload = _extract_frontend_i18n_payload()
    translations: dict[str, dict[str, str]] = payload["translations"]
    languages: list[dict] = payload["languages"]
    coverage: list[dict] = payload["coverage"]

    en_dict = translations.get("en", {})
    all_keys = list(en_dict.keys())
    lang_codes = [lang["code"] for lang in languages]

    entries = []
    for key in all_keys:
        localized_values = {}
        for code in lang_codes:
            localized_values[code] = translations.get(code, {}).get(key, "")
        entries.append(
            {
                "key": key,
                "english_source": en_dict[key],
                "translations": localized_values,
                "reviewer_notes": "",
                "approved_by_native_reviewer": {
                    code: False for code in lang_codes if code != "en"
                },
            }
        )

    export_doc = {
        "schema_version": "1.0",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "total_keys": len(all_keys),
        "language_count": len(languages),
        "review_instructions": {
            "purpose": (
                "Structured multilingual review export for external native-language "
                "validation of Medora UI strings."
            ),
            "honesty_note": (
                "English, Tamil, and Hindi underwent structured codebase audit to remove "
                "English transliterations; Tamil, Hindi, Telugu, Kannada, Malayalam, Bengali, "
                "Marathi, Gujarati, Punjabi, Odia, Urdu, and Assamese values authored in this "
                "repository await sign-off from external native speakers and medical reviewers."
            ),
            "priority_languages": ["te", "kn", "ta", "hi", "ur"],
            "rules": [
                "Verify natural idiomatic phrasing and grammatical correctness.",
                "Reject English words transliterated into regional scripts for standard UI terms.",
                "Preserve exact interpolation placeholders such as {count}, {name}, {days}.",
                "Keep recognized international medicine brand names and mg/ml units clear.",
                "Verify right-to-left punctuation and reading order for Urdu (ur).",
            ],
        },
        "languages": languages,
        "coverage_summary": coverage,
        "entries": entries,
    }
    return export_doc


def main() -> None:
    export_doc = build_review_export()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(export_doc, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"Exported {export_doc['total_keys']} keys across {export_doc['language_count']} "
        f"languages to {OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()
