"""검색 표기 폴백(한영 자판 복원·오타 교정) 테스트. 실제 Supabase가 필요하다.

이 케이스들은 원래 프론트엔드 vitest(`hangul-keyboard.test.ts`)에 있었다. 로직을
서버로 옮기면서 함께 옮겼다 — 구현이 한 벌이면 테스트도 한 벌이어야 한다.

이 파일은 **카탈로그가 실린 실 DB**를 상대로 검색 경로 전체를 확인한다. CI에는
그런 DB가 없어 통째로 건너뛴다. 자판·오타 규칙을 고칠 때는 손으로 돌린다:

  SEARCH_TEST_DSN="$SUPABASE_DB_URL" venv/bin/python -m pytest tests/test_search_fallback.py -v

CI가 검증하는 몫은 `test_search_functions.py`가 맡는다 — 카탈로그가 필요 없는
순수 함수(자판 상태기계·자모 분해·LIKE 이스케이프)를 빈 Postgres에 올려 돌린다.
자판 상태기계 회귀는 거기서 잡힌다.
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
        ("나이킈", "나이키"),
        # 여러 단어 브랜드는 한 단어만 틀려도 고쳐야 한다 — 사전에 브랜드명
        # 전체만 넣으면 길이가 안 맞아 못 고친다
        ("무신사 스탠다그", "무신사 스탠다드"),
        ("아스트랄 프로젝숀", "아스트랄 프로젝션"),
    ],
)
def test_typo_correction(cur, query, expected):
    assert scalar(cur, "select c_search_correct_query(%s)", query) == expected


@pytest.mark.parametrize("query", ["아디다스", "무지티", "반팔 티셔츠", "ㅁㄴㅇㄹ"])
def test_typo_correction_leaves_known_and_unfixable_alone(cur, query):
    """사전에 있는 말과 고칠 수 없는 말은 모두 null — 호출자가 폴백을 건너뛴다."""
    assert scalar(cur, "select c_search_correct_query(%s)", query) is None


@pytest.mark.parametrize(
    "query,why",
    [
        ("아디다", "음절 하나가 빠진 것은 자모 거리 2다 — 거리 2를 허용하면 모자→모달이 열린다"),
        ("슬리퍼", "브랜드 어절 `슬리피`는 3음절이라 사전에 없다"),
    ],
)
def test_documented_limits_of_typo_correction(cur, query, why):
    """**못 고치는 것**을 명시한다. 지원 범위를 넓게 말하지 않기 위한 테스트다."""
    assert scalar(cur, "select c_search_correct_query(%s)", query) is None, why


# ⚠️ 이 묶음은 실제로 깨졌던 게이트를 막는다.
#
# 처음엔 교정 사전에 제목 빈출어까지 넣었다. 그 결과 `샌들 슬리퍼`가
# `샌드 슬리브`로 바뀌어 무관한 티셔츠 20건을 반환했고, 기준서의 G6(0건이
# 정답)이 100% → 93.3%로 떨어졌다 — 명시된 출시 게이트 실패였다.
#
# 지금은 ⓐ 사전을 브랜드명으로 좁히고 ⓑ 자모 단위 거리로 재고 ⓒ 2음절은
# 고치지 않는다. 이 세 가지가 각각 아래 어느 줄을 막는지 주석에 적어 둔다.
@pytest.mark.parametrize(
    "query,blocked_by",
    [
        ("샌들 슬리퍼", "브랜드 사전 — 속성어를 안 고친다"),
        ("슬리퍼", "브랜드 사전"),
        ("운동화", "브랜드 사전"),
        ("백팩", "브랜드 사전"),
        ("청바지", "브랜드 사전"),
        ("원피스", "브랜드 사전"),
        ("모자", "2음절 하한 — 브랜드 '모아'와 자모 거리 1이다"),
        ("바지", "2음절 하한"),
        ("가방", "2음절 하한"),
        ("신발", "2음절 하한"),
    ],
)
def test_other_categories_are_never_corrected_into_tshirts(cur, query, blocked_by):
    assert scalar(cur, "select c_search_correct_query(%s)", query) is None, blocked_by


def test_g6_query_that_broke_stays_at_zero(cur):
    """평가 세트의 실제 G6 질의(a-g6-08). 교정이 뚫으면 여기서 잡힌다.

    다른 품목 이름이 0건이라고 단정하지는 않는다 — `백팩 프린트 티셔츠`처럼
    제목에 그 말이 실제로 든 티셔츠가 있고, 그건 옳은 결과다. 교정이 만들어낸
    결과와 원문이 직접 맞은 결과는 다르다.
    """
    cur.execute("select count(*) from c_search_page_v2(%s, null, null, 20)", ("샌들 슬리퍼",))
    assert cur.fetchone()[0] == 0, "샌들 슬리퍼: 0건이 정답이다 (기준서 G6)"


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
