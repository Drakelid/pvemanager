"""Smoke tests for ``app.crypto`` field-level encryption helpers."""

from __future__ import annotations

import importlib

import pytest


@pytest.fixture(scope="module")
def crypto():
    return importlib.import_module("app.crypto")


class TestEncryptDecryptRoundtrip:
    @pytest.mark.smoke
    def test_roundtrip_simple_string(self, crypto):
        token = crypto.encrypt_value("hunter2")
        assert token != "hunter2"
        assert crypto.decrypt_value(token) == "hunter2"

    @pytest.mark.smoke
    def test_roundtrip_unicode(self, crypto):
        secret = "пароль-密码-🔐"
        assert crypto.decrypt_value(crypto.encrypt_value(secret)) == secret

    def test_empty_value_passthrough(self, crypto):
        assert crypto.encrypt_value("") == ""
        assert crypto.decrypt_value("") == ""
        assert crypto.encrypt_value(None) is None
        assert crypto.decrypt_value(None) is None

    def test_each_call_produces_unique_ciphertext(self, crypto):
        # Fernet embeds a random IV — same plaintext should encrypt differently.
        a = crypto.encrypt_value("same")
        b = crypto.encrypt_value("same")
        assert a != b
        assert crypto.decrypt_value(a) == crypto.decrypt_value(b) == "same"


class TestLegacyPlaintextFallback:
    def test_decrypt_invalid_token_returns_input(self, crypto):
        # Legacy/un-encrypted rows must not blow up — fall through to plaintext.
        assert crypto.decrypt_value("plain-value-not-fernet") == "plain-value-not-fernet"


class TestNoFernetKey:
    def test_encrypt_passthrough_without_key(self, crypto, monkeypatch):
        # ``settings`` is imported lazily inside ``_get_fernet`` — patch the live
        # singleton on the config module instead.
        from app import config as app_config

        monkeypatch.setattr(app_config.settings, "FERNET_KEY", None, raising=False)
        monkeypatch.setattr(crypto, "_warned_no_key", False, raising=False)
        assert crypto.encrypt_value("plain") == "plain"
        assert crypto.decrypt_value("plain") == "plain"


class TestEncryptedStringColumn:
    def test_bind_and_result_processors(self, crypto):
        col = crypto.EncryptedString(255)
        bound = col.process_bind_param("topsecret", dialect=None)
        assert bound != "topsecret"
        assert col.process_result_value(bound, dialect=None) == "topsecret"

    def test_bind_and_result_handle_none(self, crypto):
        col = crypto.EncryptedString(255)
        assert col.process_bind_param(None, dialect=None) is None
        assert col.process_result_value(None, dialect=None) is None
