"""환경변수 로더. backend/.env.local(git 무시)에서 시크릿을 읽는다."""
import os

from dotenv import load_dotenv

# import 시 .env.local을 한 번 로드(이미 설정된 os.environ은 덮지 않음).
load_dotenv(".env.local")


def _require(key: str) -> str:
    value = os.environ.get(key)
    if not value:
        raise RuntimeError(f"환경변수 {key} 없음 — backend/.env.local 확인")
    return value


def naver_credentials() -> tuple[str, str]:
    return _require("NAVER_CLIENT_ID"), _require("NAVER_CLIENT_SECRET")


def supabase_credentials() -> tuple[str, str]:
    return _require("SUPABASE_URL"), _require("SUPABASE_SECRET_KEY")


def nvidia_credentials() -> tuple[str, str]:
    base_url = os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
    return base_url, _require("NVIDIA_API_KEY")
