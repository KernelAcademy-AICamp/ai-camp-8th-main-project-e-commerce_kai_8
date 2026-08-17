"""검색 순수 함수 테스트 — **CI에서 실제로 도는 몫.**

`test_search_fallback.py`는 카탈로그가 실린 실 DB가 필요해 CI에서 건너뛴다.
그러면 자판 상태기계 같은 핵심 로직의 회귀를 아무도 못 잡는다(리뷰 M5).

이 파일은 카탈로그가 필요 없는 함수만 **빈 Postgres**에 올려서 확인한다.
CI는 postgres 서비스 컨테이너를 띄우고 PG_TEST_DSN을 준다.

로컬 실행:
  PG_TEST_DSN="postgresql://postgres:postgres@127.0.0.1:5432/postgres" \
    venv/bin/python -m pytest tests/test_search_functions.py -v
"""
import os
import re
from pathlib import Path

import pytest

psycopg = pytest.importorskip("psycopg")

DSN = os.environ.get("PG_TEST_DSN")
pytestmark = pytest.mark.skipif(not DSN, reason="PG_TEST_DSN 미설정 — Postgres 필요")

MIGRATIONS = Path(__file__).resolve().parents[1] / "supabase" / "migrations"


def extract(path: str, start: str, end: str) -> str:
    """마이그레이션 파일에서 함수 정의 구간만 떼어 온다.

    정의를 여기 베껴 두면 마이그레이션과 갈려서, 테스트는 통과하는데 서버는
    틀리게 된다. 그래서 마이그레이션 파일에서 떼어 온다.

    다만 **배포되는 것과 완전히 같지는 않다** — 권한문(`revoke`)은 걷어내고
    함수의 고정 `search_path`는 테스트 스키마로 바꾼다. 여기서 확인하는 것은
    "이 함수들이 빈 DB에서 자립해 올바른 값을 내는가"이지 배포 SQL 동치가 아니다.

    ⚠️ 끝 표식은 **필수**다. 예전엔 생략하면 파일 끝까지 가져왔는데, 그 파일
    끝에 카탈로그를 건드리는 DDL이 붙어 있어 빈 DB에서 setup부터 깨졌다.
    끝 표식은 시작 지점 **이후**에서 찾는다 — 같은 문구가 앞쪽 주석에 다시
    나오면 범위가 조용히 달라진다.
    """
    text = (MIGRATIONS / path).read_text(encoding="utf-8")
    i = text.index(start)
    j = text.index(end, i + len(start))
    return text[i:j]


@pytest.fixture(scope="module")
def cur():
    with psycopg.connect(DSN, autocommit=True) as conn, conn.cursor() as c:
        # 격리 스키마에서 돈다. CI는 빈 Postgres를 주지만 로컬에서 실 DB를
        # 가리키면 기존 함수를 덮어써 버린다 — 그러면 "빈 DB에서도 되는가"를
        # 검증하지 못한 채 통과한다(리뷰 B2가 잡은 실패가 정확히 그것이었다).
        c.execute("drop schema if exists search_fn_test cascade")
        c.execute("create schema search_fn_test")

        # levenshtein(fuzzystrmatch)이 어느 스키마에 있는지는 환경마다 다르다 —
        # Supabase는 `extensions`, 맨 Postgres는 `public`. 찾아서 경로에 넣는다.
        c.execute(
            "select n.nspname from pg_proc p"
            " join pg_namespace n on n.oid = p.pronamespace"
            " where p.proname = 'levenshtein' limit 1"
        )
        row = c.fetchone()
        if row is None:
            c.execute("create extension fuzzystrmatch with schema search_fn_test")
            ext_schema = "search_fn_test"
        else:
            ext_schema = row[0]
        c.execute(f"set search_path = search_fn_test, {ext_schema}, pg_catalog")
        # 카탈로그가 필요 없는 함수만 올린다. revoke 대상 역할(anon 등)이 없는
        # 빈 Postgres이므로 revoke 줄은 걷어낸다.
        chunks = [
            extract(
                "20260817150000_search_chosung.sql",
                "create or replace function c_chosung",
                "revoke all on function c_chosung",
            ),
            extract(
                "20260817700000_search_qwerty.sql",
                "create or replace function c_compose_hangul",
                "-- 역할을 명시해서 지운다",
            ),
            extract(
                "20260817600000_search_typo.sql",
                "create or replace function c_jamo",
                "revoke all on function c_jamo",
            ),
            extract(
                "20260817800000_v1_search_fallback.sql",
                "create or replace function c_like_all_patterns",
                "revoke all on function c_like_all_patterns",
            ),
        ]
        for chunk in chunks:
            # 주석을 걷어낸 실행문만 본다 — 주석에는 c_search_docs 얘기가 나온다
            statements = re.sub(r"--[^\n]*", "", chunk)
            assert "c_search_docs" not in statements, (
                "카탈로그 테이블을 건드리는 SQL이 섞였다 — 이 테스트는 빈 DB에서 돈다"
            )
            sql = re.sub(r"^revoke .*$", "", chunk, flags=re.MULTILINE)
            # 함수 본문에 `set search_path = public, ...`이 박혀 있다. 그대로
            # 두면 함수가 자기 스키마가 아니라 public의 실물을 빌려 써서,
            # 이 테스트가 실 DB에서만 통과하고 빈 CI에서는 깨진다. 치환해서
            # **테스트 스키마 안에서 자립하는지**를 실제로 확인한다.
            sql = sql.replace("set search_path = public,", "set search_path = search_fn_test,")
            c.execute(sql)
        yield c
        c.execute("drop schema if exists search_fn_test cascade")


def scalar(cur, sql, *args):
    cur.execute(sql, args)
    return cur.fetchone()[0]


# ── 한영 자판 복원 ──────────────────────────────────────────────────────────
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
        ("nike", "ㅜㅑㅏㄷ"),          # 음절이 안 만들어진다 — 폴백 대상이 아니다
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


# ── 자모 분해 ───────────────────────────────────────────────────────────────
# 오타 교정이 음절이 아니라 자모 거리로 재는 근거. 이 값이 틀리면 `모자`가
# `모달`로 고쳐지는 식으로 다른 품목이 딸려 온다.
@pytest.mark.parametrize(
    "word,jamo",
    [
        ("아디다스", "ㅇㅏㄷㅣㄷㅏㅅㅡ"),
        ("커버낫", "ㅋㅓㅂㅓㄴㅏㅅ"),
        ("모자", "ㅁㅗㅈㅏ"),
        ("값", "ㄱㅏㅄ"),              # 겹받침
        ("무지 티", "ㅁㅜㅈㅣ ㅌㅣ"),   # 공백 유지
        ("nike", "nike"),              # 한글이 아니면 그대로
    ],
)
def test_jamo_decomposition(cur, word, jamo):
    assert scalar(cur, "select c_jamo(%s)", word) == jamo


@pytest.mark.parametrize(
    "a,b,syllable_dist,jamo_dist",
    [
        ("아디다드", "아디다스", 1, 1),   # 진짜 오타 — 자모로도 1
        ("커버났", "커버낫", 1, 1),       # 진짜 오타
        ("모자", "모달", 1, 2),           # 다른 물건 — 자모로는 2라 걸러진다
        ("슬리퍼", "슬리브", 1, 2),       # 다른 물건
        ("백팩", "백씨", 1, 3),           # 다른 물건
    ],
)
def test_jamo_distance_separates_typos_from_other_words(cur, a, b, syllable_dist, jamo_dist):
    """음절 거리로는 전부 1이라 구분이 안 된다 — 자모 거리라야 갈린다."""
    assert scalar(cur, "select levenshtein(%s, %s)", a, b) == syllable_dist
    assert scalar(cur, "select levenshtein(c_jamo(%s), c_jamo(%s))", a, b) == jamo_dist


# ── 초성 ────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "text,chosung",
    [
        ("나이키", "ㄴㅇㅋ"),
        ("커버낫 반팔", "ㅋㅂㄴ ㅂㅍ"),
        ("nike 티", " ㅌ"),   # 한글이 아닌 글자는 버리고 공백은 남는다
    ],
)
def test_chosung(cur, text, chosung):
    assert scalar(cur, "select c_chosung(%s)", text) == chosung


# ── LIKE 이스케이프 (v1 경로) ────────────────────────────────────────────────
def test_like_patterns_escape_wildcards(cur):
    """사용자가 친 %와 _가 와일드카드로 해석되면 전체 스캔이 된다."""
    # 리터럴로 쓰면 psycopg가 %_를 자리표시자로 읽는다 — 값으로 넘긴다
    got = scalar(cur, "select c_like_all_patterns(array[%s])", "50%_할인")
    assert got == [r"%50\%\_할인%"]


def test_like_patterns_lowercase_each_word(cur):
    got = scalar(cur, "select c_like_all_patterns(array[%s, %s])", "Nike", "Tee")
    assert got == ["%nike%", "%tee%"]
