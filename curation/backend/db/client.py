"""Supabase 연결(적재용). secret 키 사용 — 서버 전용."""
from supabase import Client, create_client

from settings import supabase_credentials


def get_client() -> Client:
    url, secret_key = supabase_credentials()
    return create_client(url, secret_key)
