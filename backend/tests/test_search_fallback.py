"""검색 표기 폴백(한영 자판 복원·오타 교정) 테스트. 실제 Supabase가 필요하다.

이 케이스들은 원래 프론트엔드 vitest(`hangul-keyboard.test.ts`)에 있었다. 로직을
서버로 옮기면서 함께 옮겼다 — 구현이 한 벌이면 테스트도 한 벌이어야 한다.

⚠️ **이 파일은 CI에서 돌지 않는다.** CI에 DB가 없어 `SEARCH_TEST_DSN`이 비고
통째로 건너뛴다. 자판·오타 규칙을 고칠 때는 손으로 돌려야 한다:

  SEARCH_TEST_DSN="$SUPABASE_DB_URL" venv/bin/python -m pytest tests/test_search_fallback.py -v
"""
import os

import pytest

psycopg = pytest.importorskip("psycopg")

DSN = os.environ.get("SEARCH_TEST_DSN")
pytestmark = pytest.mark.skipif(not DSN, reason="SEARCH_TEST_DSN 미설정 — 실제 DB 필요")


@pytest.fixture(scope="module")
def cur():
    with psycopg.connect(DSN) as conn, conn.cursor() as c:
        yield c


def scalar(cur, sql, *args):
    cur.execute(sql, args)
    return cur.fetchone()[0]


# 두벌식 자판으로 친 한글. 자판 배열이 정해져 있어 답이 하나다.
@pytest.mark.parametrize(
    "keys,expected",
    [
        ("skdlzl", "나이키"),
        ("wprtlalrtm", "젝시믹스"),   # 겹받침(ㄱㅅ)을 앞서 합치면 '제ㄳㅣ미ㄳㅡ'가 된다
        ("xmflqtus", "트립션"),
        ("dkelektm", "아디다스"),
        ("zjqjskt", "커버낫"),
        ("qksvkf", "반팔"),
        ("dhqjvlt", "오버핏"),
        ("qksvkf xl", "반팔 티"),      # 공백은 유지한다
        ("antlstk tmxosekem", "무신사 스탠다드"),
    ],
)
def test_qwerty_to_hangul(cur, keys, expected):
    assert scalar(cur, "select c_qwerty_to_hangul(%s)", keys) == expected


@pytest.mark.parametrize(
    "query,reason",
    [
        ("나이키", "이미 한글이라 손대지 않는다"),
        ("MLB", "자판에 없는 글자가 섞였다"),
        ("r", "한 글자는 대상이 아니다"),
        ("rrrr", "자모만 나와 한글 음절이 안 만들어진다"),
        ("nike", "ㅜㅑㅏㄷ — 자판 글자지만 음절이 안 된다"),
    ],
)
def test_restore_returns_null_when_not_applicable(cur, query, reason):
    assert scalar(cur, "select c_restore_hangul_typing(%s)", query) is None, reason


def test_restore_applies_to_mistyped(cur):
    assert scalar(cur, "select c_restore_hangul_typing(%s)", "skdlzl") == "나이키"


# 어휘 사전 편집거리 교정. 사전에 있는 말은 오타가 아니므로 건드리지 않는다.
@pytest.mark.parametrize(
    "query,expected",
    [
        ("아디다드", "아디다스"),
        ("커버났", "커버낫"),
    ],
)
def test_typo_correction(cur, query, expected):
    assert scalar(cur, "select c_search_correct_query(%s)", query) == expected


@pytest.mark.parametrize("query", ["아디다스", "무지티", "반팔 티셔츠", "ㅁㄴㅇㄹ"])
def test_typo_correction_leaves_known_and_unfixable_alone(cur, query):
    """사전에 있는 말과 고칠 수 없는 말은 모두 null — 호출자가 폴백을 건너뛴다."""
    assert scalar(cur, "select c_search_correct_query(%s)", query) is None


# 검색 경로 전체. 폴백은 **원문이 0건일 때만** 걸린다.
@pytest.mark.parametrize(
    "query,expected_used",
    [
        ("zjqjskt", "커버낫"),      # 자판
        ("아디다드", "아디다스"),     # 오타
        ("나이키", "나이키"),        # 결과가 있으면 원문 그대로
        ("ㅋㅂㄴ", "ㅋㅂㄴ"),        # 초성 갈래는 폴백을 타지 않는다
    ],
)
def test_search_reports_query_actually_used(cur, query, expected_used):
    cur.execute("select query_used from c_search_page_v2(%s, null, null, 1)", (query,))
    row = cur.fetchone()
    assert row is not None, f"{query}: 결과가 있어야 한다"
    assert row[0] == expected_used


def test_fallback_does_not_hijack_a_query_that_already_works(cur):
    """멀쩡한 질의를 교정하면 사용자 의도를 덮어쓴다 — 결과가 있으면 그게 의도다."""
    cur.execute("select count(*) from c_search_page_v2('반팔', null, null, 30)")
    assert cur.fetchone()[0] == 30
    assert scalar(cur, "select c_search_correct_query(%s)", "반팔") is None
