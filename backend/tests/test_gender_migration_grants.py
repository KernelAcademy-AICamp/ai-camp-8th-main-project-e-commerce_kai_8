"""성별 마이그레이션의 권한 회수가 파일에 실제로 있는지 본다 — DB 없이 도는 검사.

지우고 다시 만든 함수는 권한이 기본값으로 돌아간다. PostgreSQL은 새 함수의 실행 권한을
**PUBLIC에 준다.** 회수를 빠뜨리면 anon이 부를 수 있는 상태로 조용히 열린다.

그리고 `revoke ... from public`만으로는 Supabase에서 anon·authenticated가 남는다 —
역할을 명시해야 한다. 이 저장소가 예전에 겪은 실수라 규칙으로 굳혔다.

DB가 필요 없으므로 CI에서 **실제로 돈다**(test_account_delete는 DSN이 없으면 통째로 skip된다).
"""

from pathlib import Path

import pytest

MIGRATIONS = Path(__file__).resolve().parents[1] / "supabase" / "migrations"

GENDER_MIGRATION = "20260822100000_gender_exact_filter.sql"
GENDER_FUNCTIONS = [
    "c_feed_page(bigint, bigint, int, text)",
    "c_mix_page(jsonb, jsonb, bigint[], bigint, int, boolean, text)",
    "c_similar_page(bigint, int, text)",
    "c_search_page(text, bigint, int, text)",
    "c_search_page_v2(text, real, bigint, int, text[], text[], text)",
]

PREF_MIGRATION = "20260822200000_gender_preference.sql"
PREF_FUNCTIONS = [
    "c_gender_get()",
    "c_gender_put(text, timestamptz)",
]


def read(name: str) -> str:
    path = MIGRATIONS / name
    if not path.exists():
        pytest.fail(f"마이그레이션이 아직 없다: {name}")
    return path.read_text(encoding="utf-8")


@pytest.mark.parametrize("signature", GENDER_FUNCTIONS)
def test_피드_검색_함수는_회수_뒤_부여한다(signature):
    text = read(GENDER_MIGRATION)
    revoke = f"revoke all on function {signature} from public, anon, authenticated;"
    grant = f"grant execute on function {signature} to anon, authenticated;"
    assert revoke in text, f"회수가 없다: {signature}"
    assert grant in text, f"부여가 없다: {signature}"
    assert text.index(revoke) < text.index(grant), f"회수가 부여보다 뒤다: {signature}"


@pytest.mark.parametrize("signature", PREF_FUNCTIONS)
def test_계정_설정_함수는_로그인_사용자에게만_준다(signature):
    """비회원 설정은 기기에만 둔다 — anon에는 주지 않는다."""
    text = read(PREF_MIGRATION)
    revoke = f"revoke all on function {signature} from public, anon, authenticated;"
    grant = f"grant execute on function {signature} to authenticated;"
    assert revoke in text, f"회수가 없다: {signature}"
    assert grant in text, f"부여가 없다: {signature}"
    assert f"grant execute on function {signature} to anon" not in text, (
        f"anon에 주면 안 된다: {signature}"
    )


def test_성별_설정_테이블은_RLS를_켜고_직접_접근을_막는다():
    text = read(PREF_MIGRATION)
    assert "alter table c_gender_prefs enable row level security;" in text
    assert (
        "revoke all on table c_gender_prefs from public, anon, authenticated;" in text
    )
