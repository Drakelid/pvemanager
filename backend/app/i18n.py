"""
Internationalization (i18n) service
Loads translations from locales/*.json files at runtime.

Each file name must match the language code (e.g. ru.json → "ru").
Adding a new language requires only dropping a new JSON file into the
locales/ directory — no code changes needed.
"""

import json
import os
from pathlib import Path
from typing import Dict, Optional
from enum import Enum


# Directory that contains *.json locale files
LOCALES_DIR = Path(__file__).parent / "locales"


class Language(str, Enum):
    """Supported languages"""
    RU = "ru"  # Russian
    EN = "en"  # English (US)


class I18nService:
    """Service for handling translations loaded from JSON locale files."""

    # {lang_code: {key: translated_string}}
    _translations: Dict[str, Dict[str, str]] = {}
    _loaded: bool = False

    # ---------------------------------------------------------------------------
    # Internal helpers
    # ---------------------------------------------------------------------------

    @classmethod
    def _load(cls) -> None:
        """Load all *.json files from LOCALES_DIR into _translations."""
        cls._translations = {}
        if not LOCALES_DIR.is_dir():
            return
        for path in sorted(LOCALES_DIR.glob("*.json")):
            lang = path.stem  # "ru", "en", ...
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                cls._translations[lang] = {str(k): str(v) for k, v in data.items()}
        cls._loaded = True

    @classmethod
    def _ensure_loaded(cls) -> None:
        if not cls._loaded:
            cls._load()

    @classmethod
    def reload(cls) -> None:
        """Force re-read of all locale files (useful after editing JSON without restart)."""
        cls._loaded = False
        cls._load()

    # ---------------------------------------------------------------------------
    # Public API  (same signatures as before — no call-sites need to change)
    # ---------------------------------------------------------------------------

    @classmethod
    def get(cls, key: str, lang: str = "ru", **kwargs) -> str:
        """
        Return the translated string for *key* in *lang*.

        Falls back to Russian, then to the raw key if nothing is found.
        Supports str.format(**kwargs) placeholders.
        """
        cls._ensure_loaded()

        lang_dict = cls._translations.get(lang) or cls._translations.get("ru") or {}
        translation = lang_dict.get(key)

        if translation is None:
            # Last resort: try any available language
            for fallback in cls._translations.values():
                if key in fallback:
                    translation = fallback[key]
                    break
            else:
                translation = key

        if kwargs:
            try:
                translation = translation.format(**kwargs)
            except KeyError:
                pass

        return translation

    @classmethod
    def get_all(cls, lang: str = "ru") -> Dict[str, str]:
        """Return all translations for *lang* as a flat {key: value} dict."""
        cls._ensure_loaded()
        return dict(cls._translations.get(lang) or cls._translations.get("ru") or {})

    @classmethod
    def add_translation(cls, key: str, ru: str, en: str) -> None:
        """
        Register an in-memory translation (does NOT write to disk).
        Useful for dynamically generated keys at runtime.
        """
        cls._ensure_loaded()
        for lang, value in (("ru", ru), ("en", en)):
            if lang not in cls._translations:
                cls._translations[lang] = {}
            cls._translations[lang][key] = value

    @classmethod
    def available_languages(cls) -> list:
        """Return list of language codes that have locale files."""
        cls._ensure_loaded()
        return sorted(cls._translations.keys())


# ---------------------------------------------------------------------------
# Convenience shortcut
# ---------------------------------------------------------------------------

def t(key: str, lang: str = "ru", **kwargs) -> str:
    """Shortcut for I18nService.get()"""
    return I18nService.get(key, lang, **kwargs)
