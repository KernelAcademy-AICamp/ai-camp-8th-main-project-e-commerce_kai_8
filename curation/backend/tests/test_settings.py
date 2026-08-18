import pytest

from settings import naver_credentials, supabase_credentials


def test_naver_credentials_reads_env(monkeypatch):
    monkeypatch.setenv("NAVER_CLIENT_ID", "id123")
    monkeypatch.setenv("NAVER_CLIENT_SECRET", "sec456")
    assert naver_credentials() == ("id123", "sec456")


def test_naver_credentials_missing_raises(monkeypatch):
    monkeypatch.delenv("NAVER_CLIENT_ID", raising=False)
    monkeypatch.delenv("NAVER_CLIENT_SECRET", raising=False)
    with pytest.raises(RuntimeError):
        naver_credentials()


def test_supabase_credentials_reads_env(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_abc")
    assert supabase_credentials() == ("https://x.supabase.co", "sb_secret_abc")
