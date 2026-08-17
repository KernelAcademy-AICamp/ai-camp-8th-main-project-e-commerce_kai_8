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
    # autocommit — 한 문장이 실패해도 트랜잭션이 죽어 나머지가 전부
    # "current transaction is aborted"로 무너지지 않게 한다
    with psycopg.connect(DSN, autocommit=True) as conn, conn.cursor() as c:
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
    """뜻 없는 문자열은 여전히 0건이어야 한다.

    ⚠️ **G6의 판정선이 내려갔다. 알고 내렸다.** 텍스트를 하드 AND에서 점수로
    내리면서 `샌들 슬리퍼`·`강아지 사료`처럼 **우리가 안 파는 물건을 정확히
    지목한 질의**는 결과를 갖게 된다(사람이 정함, 2026-08-17 — 앱 컨셉상
    그게 자연스럽다). 지표는 지우지 않고 waiver로 남긴다.

    여기서 지키는 것은 그보다 아래 선이다 — **뜻이 없는 입력**은 여전히 0건이다.
    이것까지 뚫리면 그건 새로운 회귀다.
    """
    for q in ("asdfasdf", "12345", "흐으으으음"):
        cur.execute("select count(*) from c_search_page_v2(%s, null, null, 20)", (q,))
        assert cur.fetchone()[0] == 0, f"{q}: 뜻 없는 입력은 0건이어야 한다"


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


# ⚠️ 스크롤 도중 검색어가 바뀌지 않는가.
#
# 폴백을 "본 검색이 0건이면"으로 판단하던 때, 그 0건이 **질의가 0건**인지
# **커서 뒤가 없을 뿐**인지 구분하지 않았다. 원문 결과가 한 페이지보다 적으면
# 2페이지에서 원문이 소진되고 폴백이 걸려 다른 질의 결과가 나왔다 —
# 실측: `타일러` 1페이지 1건 → 2페이지가 `타일레` 30건.
#
# 그 뒤 "빈 페이지에서만 존재 확인"으로 고쳤는데, v1의 확인을 PGroonga 색인으로
# **근사**한 것이 또 갈렸다: `zj`는 LIKE로 1건인데 `&@`로는 0건이라 같은 전환이
# 재현됐다. 지금은 확인 자체를 없애고 **폴백을 첫 페이지에서만 결정**한다.
#
# 아래 영문 표본(zj·tla·ekt)이 그 근사가 깨지는 자리다. 반드시 남긴다.
@pytest.mark.parametrize("query", ["타일러", "밀로티", "클로에", "zj", "tla", "ekt"])
def test_short_result_set_does_not_switch_query_on_next_page(cur, query):
    cur.execute(
        "select score, goods_no from c_search_page_v2(%s, null, null, 30)"
        " order by score, goods_no desc limit 1",
        (query,),
    )
    last = cur.fetchone()
    if last is not None:
        cur.execute(
            "select count(*) from c_search_page_v2(%s, %s::real, %s::bigint, 30)",
            (query, last[0], last[1]),
        )
        assert cur.fetchone()[0] == 0, f"{query}: v2는 소진 뒤 0건이어야 한다"

    cur.execute("select max(goods_no) from c_search_page(%s, null, 30)", (query,))
    v1_last = cur.fetchone()[0]
    assert v1_last is not None, f"{query}: v1 1페이지에 결과가 있어야 이 검사가 성립한다"
    cur.execute("select count(*) from c_search_page(%s, %s, 30)", (query, v1_last))
    assert cur.fetchone()[0] == 0, f"{query}: v1도 소진 뒤 0건이어야 한다"


# 폴백이 걸린 검색의 다음 페이지는 **응답이 준 query_used로** 이어야 한다.
# 서버는 첫 페이지에서만 폴백을 결정하므로 이것이 호출자의 계약이다.
@pytest.mark.parametrize("query,resolved", [("skdlzl", "나이키"), ("아디다드", "아디다스")])
def test_next_page_continues_with_query_used(cur, query, resolved):
    cur.execute("select distinct query_used from c_search_page(%s, null, 30)", (query,))
    assert cur.fetchone()[0] == resolved, "v1도 실제로 쓴 질의를 알려줘야 한다"

    cur.execute("select max(goods_no) from c_search_page(%s, null, 30)", (query,))
    last = cur.fetchone()[0]
    cur.execute("select count(*) from c_search_page(%s, %s, 30)", (resolved, last))
    assert cur.fetchone()[0] > 0, "계약대로 이으면 다음 페이지가 나온다"

    cur.execute(
        "select count(*) from c_search_page(%s, %s, 30) x"
        " where x.goods_no in (select goods_no from c_search_page(%s, null, 30))",
        (resolved, last, query),
    )
    assert cur.fetchone()[0] == 0, "1페이지와 겹치지 않는다"

    # 계약을 어겨 원문으로 이으면 0건이다 — 다른 질의 결과가 섞이지는 않는다
    cur.execute("select count(*) from c_search_page(%s, %s, 30)", (query, last))
    assert cur.fetchone()[0] == 0


@pytest.mark.parametrize("query", ["반팔", "후드집업"])
def test_pagination_still_continues_where_it_should(cur, query):
    """결과가 많은 질의는 v1·v2 모두 그대로 이어져야 한다."""
    cur.execute(
        "select score, goods_no from c_search_page_v2(%s, null, null, 30)"
        " order by score, goods_no desc limit 1",
        (query,),
    )
    last = cur.fetchone()
    cur.execute(
        "select count(*) from c_search_page_v2(%s, %s::real, %s::bigint, 30)",
        (query, last[0], last[1]),
    )
    assert cur.fetchone()[0] > 0, f"{query}: v2 2페이지가 이어져야 한다"

    cur.execute("select max(goods_no) from c_search_page(%s, null, 30)", (query,))
    cur.execute("select count(*) from c_search_page(%s, %s, 30)", (query, cur.fetchone()[0]))
    assert cur.fetchone()[0] > 0, f"{query}: v1 2페이지가 이어져야 한다"


# ── 색을 텍스트가 아니라 라벨로 찾는가 (C단계 2단계) ────────────────────────
#
# 제목의 색 글자는 세 가지 잡음을 끌고 온다: 로고·프린트의 색(`검정로고`가 붙은
# 흰 티셔츠), 여러 색상안 나열(`화이트 블랙`), 단어 안쪽(`블랙홀스`는 네온라임).
@pytest.mark.parametrize(
    "query,codes,rest",
    [
        ("검정 반팔", ["2"], ["반팔"]),
        ("흰 티셔츠", ["1"], ["티셔츠"]),
        ("와인색 티셔츠", ["49"], ["티셔츠"]),
        ("검정", ["2"], None),                 # 색만 말한 질의 — 텍스트 조건이 없다
        ("반팔티", None, ["반팔티"]),           # 색이 없으면 손대지 않는다
        ("ㅋㅂㄴ", None, ["ㅋㅂㄴ"]),
        # 두 단어짜리 정식 색 이름. 단어별로 보면 `그레이`(3)가 되어 24를 놓친다.
        ("라이트 그레이 반팔", ["24"], ["반팔"]),
        ("다크 블루 티", ["80"], ["티"]),
        ("카키 베이지", ["28"], None),
        # 서로 **다른 색**이 둘 이상이면 손대지 않는다 — 합집합으로 묶으면
        # `검정 로고 흰 반팔`이 검정 본체까지 통과시킨다
        ("검정 흰 반팔", None, ["검정", "흰", "반팔"]),
        # 역할어 규칙이 붙으면서 이 질의는 **포기가 아니라 정확히** 풀린다.
        # `검정`은 로고 색이라 빠지고, 본체 색은 `흰`이다.
        ("검정 로고 흰 반팔", ["1"], ["검정", "로고", "반팔"]),
        # 같은 색을 동의어로 두 번 말한 것은 포기하지 않는다
        ("검정 블랙 반팔", ["2"], ["반팔"]),
        # 뒤에 역할어가 오면 본체 색이 아니다 — `검정 로고 반팔`은 검정 로고를
        # 찾는 말이지 검정 옷을 찾는 말이 아니다
        ("검정 로고 반팔", None, ["검정", "로고", "반팔"]),
        ("흰 프린트 티셔츠", None, ["흰", "프린트", "티셔츠"]),
        # 브랜드는 띄어쓰기가 달라도 보호한다 (저장 표기는 `블랙야크`)
        ("블랙 야크 반팔", None, ["블랙", "야크", "반팔"]),
        ("브라운 브레스", None, ["브라운", "브레스"]),
    ],
)
def test_color_is_split_out_of_the_text_query(cur, query, codes, rest):
    cur.execute("select codes, rest from c_search_color_parse(c_search_split(%s))", (query,))
    got_codes, got_rest = cur.fetchone()
    assert (sorted(got_codes) if got_codes else None) == (sorted(codes) if codes else None)
    assert got_rest == rest


def test_black_query_returns_only_black_labelled_products(cur):
    """핵심 기준. 바꾸기 전에는 상위 20개 중 3개가 검정이 아니었다."""
    cur.execute(
        "select count(*), count(*) filter (where g.color_codes && array['2'])"
        " from c_search_page_v2('검정 반팔', null, null, 20) r"
        " join c_goods g using (goods_no)"
    )
    total, black = cur.fetchone()
    assert total == 20
    assert black == total, "색 조건이 붙은 질의는 상위 전부가 그 색이어야 한다"


def test_color_only_query_works(cur):
    """`검정`처럼 색만 말하면 텍스트 조건 없이 색으로만 찾는다."""
    cur.execute("select count(*) from c_search_page_v2('검정', null, null, 20)")
    assert cur.fetchone()[0] == 20


def test_unknown_color_words_change_nothing(cur):
    """표에 없는 색 표현은 건드리지 않는다 — 지금처럼 텍스트로 처리된다."""
    cur.execute("select codes from c_search_color_parse(array['형광연두빛'])")
    assert cur.fetchone()[0] is None


# ── 같은 색을 말하는 서로 다른 표현은 같은 결과를 준다 (2026-08-17) ──────────
# 사용자가 `주황색`·`오렌지색`·`orange`·`주황색이 들어간 티`를 넣었더니 결과가
# 전부 달랐다. 원인이 넷이었다: `-색` 변형 없음 · 영문 없음 · 정식명이 좁음 · 조사.


def test_dash_saek_variant_matches_the_formal_name(cur):
    """모든 한 단어 정식명에 `X색`이 있고, 코드가 `X`와 같아야 한다.

    손으로 고른 `-색` 항목만 넣던 시절 `오렌지색`이 **0건**이었고,
    `네이비`(36)와 `네이비색`(36,81)이 서로 달랐다.

    ⚠️ **양쪽 다 left join이어야 한다.** 처음엔 둘 다 inner join이라 `X색`이 없으면
    통과했다. 1차 교차 리뷰 뒤 `b`만 left로 고쳤는데, 2차 리뷰가 `a`도 여전히 inner라
    **정식명 `X` 자체가 빠지면 조용히 통과**한다고 짚었다. 둘 다 left join으로 둔다.

    ⚠️ **제외 목록도 명시한다.** 색으로 해석하면 안 되는 8개(데님·연청 등)는 예전엔
    "표에 `a`가 없어서 inner join에서 우연히 사라지는" 방식으로 빠졌다. 그건 검사가
    아니라 사고다 — 표에 실수로 들어와도 아무도 모른다.
    """
    cur.execute(
        "select g.name_ko, a.codes, b.codes"
        " from c_color_groups g"
        " left join c_search_color_terms a on a.term = lower(g.name_ko)"
        " left join c_search_color_terms b on b.term = lower(g.name_ko) || '색'"
        " where g.name_ko not like '%% %%'"
        "   and g.name_ko not in ('데님','연청','중청','진청','흑청','기타색상','클리어','로즈골드')"
        "   and (a.codes is null or b.codes is null or a.codes <> b.codes)"
    )
    assert cur.fetchall() == []


def test_colors_that_must_not_be_treated_as_colors_stay_out(cur):
    """색으로 해석하면 안 되는 이름은 표에 없어야 한다.

    `데님 티셔츠`의 데님은 **소재**일 가능성이 높고, `기타색상`·`클리어`·`로즈골드`는
    사용자가 색으로 치는 말이 아니다. 위 검사에서 제외했으니, 제외한 것들이 정말
    빠져 있는지는 여기서 따로 본다(교차 리뷰 ③).
    """
    cur.execute(
        "select term from c_search_color_terms"
        " where term = any(array['데님','연청','중청','진청','흑청','기타색상','클리어','로즈골드'])"
    )
    assert cur.fetchall() == []


@pytest.mark.parametrize(
    "formal,common",
    [
        ("그레이", "회색"), ("브라운", "갈색"), ("그린", "초록"), ("블루", "파란"),
        ("퍼플", "보라"), ("옐로우", "노랑"), ("핑크", "분홍"), ("레드", "빨강"),
        ("오렌지", "주황"), ("네이비", "남색"),
    ],
)
def test_formal_name_has_the_same_width_as_the_everyday_word(cur, formal, common):
    """외래어 정식명과 한국어 일상어는 같은 말이다 — 후보가 달라선 안 된다."""
    cur.execute(
        "select (select codes from c_search_color_terms where term = %s),"
        "       (select codes from c_search_color_terms where term = %s)",
        (formal, common),
    )
    a, b = cur.fetchone()
    assert a is not None and sorted(a) == sorted(b)


@pytest.mark.parametrize("narrow,wider", [("아이보리", "크림"), ("라임", "연두")])
def test_hypernyms_are_not_aligned(cur, narrow, wider):
    """일상어가 **상위어**면 맞추지 않는다 — 맞추면 좁게 지목할 길이 사라진다."""
    cur.execute(
        "select (select codes from c_search_color_terms where term = %s),"
        "       (select codes from c_search_color_terms where term = %s)",
        (narrow, wider),
    )
    a, b = cur.fetchone()
    assert sorted(a) != sorted(b)


@pytest.mark.parametrize(
    "query,rest",
    [
        # 조사가 붙어도 색이다. 붙기 전에는 `주황색이`가 제목 조건이 되어 0건이었다
        ("주황색이 들어간 티", ["들어간", "티"]),
        ("주황색을 찾아", ["찾아"]),
        ("주황색으로", None),
        ("주황색의 반팔", ["반팔"]),
        # 영문도 같은 색이다. 대소문자는 가리지 않는다
        ("orange 반팔", ["반팔"]),
        ("ORANGE 반팔", ["반팔"]),
        # `-색` 변형과 흔한 오표기
        ("오렌지색 반팔", ["반팔"]),
        ("오랜지색 반팔", ["반팔"]),
    ],
)
def test_every_way_of_saying_orange_gives_the_same_condition(cur, query, rest):
    cur.execute("select codes, rest from c_search_color_parse(c_search_split(%s))", (query,))
    codes, got_rest = cur.fetchone()
    assert sorted(codes) == ["12", "75", "76"]
    assert got_rest == rest


@pytest.mark.parametrize(
    "word,reason",
    [
        # 브랜드로 저장된 말은 조사를 떼지 않는다. `카멜로`는 실재하는 브랜드인데
        # `로`를 떼면 `카멜`(색)이 된다 — 카탈로그에서 이 가드가 실제로 막는 유일한 말이다
        ("카멜로", "브랜드 이름이 조사로 끝나는 모양일 수 있다"),
        # 조사처럼 보이지만 조사가 아닌 끝소리
        ("블루종", "옷 종류이지 파란색이 아니다"),
    ],
)
def test_josa_stripping_does_not_invent_colors(cur, word, reason):
    """⚠️ 이 가드는 **브랜드 목록에 있는 말만** 지킨다.

    목록에 없으면서 조사로 끝나는 모양인 말(`골드만` 등)은 여전히 색으로 읽힌다.
    티셔츠 카탈로그에서 그런 말이 질의로 들어올 일이 드물어 감수한 대가이고,
    브랜드가 늘면 가드가 자동으로 함께 넓어진다.
    """
    cur.execute("select codes from c_search_color_parse(array[%s])", (word,))
    assert cur.fetchone()[0] is None, reason


def test_query_used_is_re_inputtable(cur):
    """query_used는 **그대로 다시 넣을 수 있는 질의**여야 한다.

    한때 `반팔 [색:2]`처럼 표시용 문자열을 돌려줬는데, RPC가 해석하는 문법이
    아니라 색 질의의 2페이지가 전부 0건이 됐다. 무한 스크롤 제품에서 치명적이다.
    """
    cur.execute(
        "select score, goods_no, query_used from c_search_page_v2('검정 반팔', null, null, 5)"
        " order by score, goods_no desc limit 1"
    )
    score, goods_no, used = cur.fetchone()
    assert used == "검정 반팔"
    cur.execute(
        "select count(*) from c_search_page_v2(%s, %s::real, %s::bigint, 5)",
        (used, score, goods_no),
    )
    assert cur.fetchone()[0] == 5, "돌려준 질의로 다음 페이지가 이어져야 한다"


# B1(재입력 불가한 query_used)이 무한 스크롤 출시 차단급이었으므로, 단순한 한 경우가
# 아니라 실제로 갈리는 갈래를 모두 고정한다.
@pytest.mark.parametrize(
    "query,size",
    [
        ("검정 반팔", 5),          # 색 + 텍스트
        ("검정", 5),               # 색만 — 텍스트 조건이 없다
        ("rjawjd qksvkf", 5),      # 색 + 자판 폴백
        ("검정 아디다드", 5),        # 색 + 오타 폴백
        ("ㅋㅂㄴ", 5),              # 초성 갈래
        ("검정 반팔", 60),          # 크기 상한
    ],
)
def test_query_used_carries_every_branch_to_the_next_page(cur, query, size):
    cur.execute(
        "select score, goods_no, query_used from c_search_page_v2(%s, null, null, %s)"
        " order by score, goods_no desc limit 1",
        (query, size),
    )
    row = cur.fetchone()
    assert row is not None, f"{query}: 1페이지에 결과가 있어야 한다"
    score, goods_no, used = row
    cur.execute(
        "select count(*) from c_search_page_v2(%s, %s::real, %s::bigint, %s)",
        (used, score, goods_no, size),
    )
    assert cur.fetchone()[0] > 0, f"{query}: 돌려준 질의로 다음 페이지가 이어져야 한다"
    cur.execute(
        "select count(*) from c_search_page_v2(%s, %s::real, %s::bigint, %s) p2"
        " where p2.goods_no in (select goods_no from c_search_page_v2(%s, null, null, %s))",
        (used, score, goods_no, size, query, size),
    )
    assert cur.fetchone()[0] == 0, f"{query}: 1페이지와 겹치면 안 된다"


@pytest.mark.parametrize("typed,restored", [("rjawjd qksvkf", "검정 반팔")])
def test_color_is_parsed_after_keyboard_restore(cur, typed, restored):
    """색 해석을 후보마다 하지 않으면, 자판으로 친 같은 말이 색 조건을 못 탄다."""
    cur.execute("select query_used from c_search_page_v2(%s, null, null, 1)", (typed,))
    assert cur.fetchone()[0] == restored
    cur.execute(
        "select count(*), count(*) filter (where g.color_codes && array['2'])"
        " from c_search_page_v2(%s, null, null, 20) r join c_goods g using (goods_no)",
        (typed,),
    )
    total, black = cur.fetchone()
    assert black == total, "자판 입력도 정상 입력과 같은 색 조건을 타야 한다"


# 색 표현이 **브랜드명의 일부**인 경우가 있다. 색으로 빼내면 브랜드를 못 찾는다 —
# `하이퍼 데님`은 실제로 0건이 됐다. 여러 단어짜리 브랜드는 색 추출을 건너뛴다.
@pytest.mark.parametrize(
    "query",
    [
        "톰 브라운", "브라운 스튜디오", "하이퍼 데님", "올리브 데 올리브", "블랙 퍼플",
        # 브랜드에 조건어를 붙이는 정상 사용 — 질의 전체가 브랜드일 때만 막으면 깨진다
        "톰 브라운 반팔", "하이퍼 데님 반팔", "샌드 사운드 반팔",
    ],
)
def test_multiword_brand_names_are_not_split_by_color(cur, query):
    cur.execute("select codes from c_search_color_parse(c_search_split(%s))", (query,))
    assert cur.fetchone()[0] is None, f"{query}: 브랜드명 안의 색은 색이 아니다"


@pytest.mark.parametrize("query", ["톰 브라운", "브라운 스튜디오", "하이퍼 데님", "블랙 퍼플"])
def test_brand_queries_still_return_products(cur, query):
    """색 추출로 브랜드가 사라지지 않는지. `하이퍼 데님`은 실제로 0건이 됐었다.

    조건어를 붙인 형태(`하이퍼 데님 반팔`)는 여기서 세지 않는다 — 그 브랜드
    상품 3개의 제목에 `반팔`이 없어서 0건인 것이 정상이고, 색과 무관하다.
    """
    cur.execute("select count(*) from c_search_page_v2(%s, null, null, 20)", (query,))
    assert cur.fetchone()[0] > 0


def test_single_word_that_is_both_brand_and_color_stays_a_color(cur):
    """`네이비`는 브랜드(상품 9개)이자 색(20,873개)이다. 색으로 둔다 — 대가를 알고 고른다.

    코드가 `36` 하나였는데 `36,81`이 됐다 — 정식명 `네이비`를 일상어 `남색`과 같은
    넓이로 맞추면서 다크 네이비(81)가 함께 들어왔다 (2026-08-17).
    """
    cur.execute("select codes from c_search_color_parse(c_search_split('네이비'))")
    assert sorted(cur.fetchone()[0]) == ["36", "81"]


# ── 가격을 텍스트가 아니라 조건으로 (C단계 3단계) ──────────────────────────
#
# `3만원`·`이하`는 제목에 실릴 수 없는 말이라, 텍스트로 두면 하나만 섞여도 0건이
# 된다. 가격을 말하는 dev 질의 4개가 전부 그랬다.
# 순수 파서 케이스(`미만` 경계·조사·큰 수)는 test_search_functions.py로 옮겼다 —
# 카탈로그가 필요 없어 CI에서 실제로 돈다. 여기서는 **검색 경로 전체**만 본다.
@pytest.mark.parametrize(
    "query,pmin,pmax,code",
    [
        ("블랙 오버핏 반팔티 3만원 이하", None, 30000, ["2"]),
        ("3만원 이하 흰 반팔티", None, 30000, ["1"]),
        ("2만원대 남성 오버핏 반팔", 20000, 29999, None),
        # `네이비`는 이제 다크 네이비(81)까지 받는다 — 일상어 `남색`과 넓이를 맞췄다
        ("네이비 라운드넥 반팔 3만원 이하", None, 30000, ["36", "81"]),
    ],
)
def test_price_and_color_conditions_are_never_violated(cur, query, pmin, pmax, code):
    """이 네 질의의 상위 20개에 **가격·색** 위반이 없어야 한다.

    ⚠️ 성별은 세지 않는다. 성별은 이 계획의 범위 밖이고(가입 정보 기반 고정
    필터로 다룬다) 검색이 구조화 조건으로 보장하지도 않는다. 기준서 G4의
    하드 조건 전체를 보장한다고 읽히지 않게 이름을 좁혔다.
    """
    cur.execute(
        "select count(*),"
        " count(*) filter (where %s::int is not null and g.price_final > %s::int),"
        " count(*) filter (where %s::int is not null and g.price_final < %s::int),"
        " count(*) filter (where %s::text[] is not null and not (g.color_codes && %s::text[]))"
        " from c_search_page_v2(%s, null, null, 20) r join c_goods g using (goods_no)",
        (pmax, pmax, pmin, pmin, code, code, query),
    )
    total, over, under, wrong_color = cur.fetchone()
    assert total > 0, f"{query}: 결과가 있어야 한다 (바꾸기 전에는 0건이었다)"
    assert (over, under, wrong_color) == (0, 0, 0)


def test_structured_conditions_survive_the_five_word_cap(cur):
    """구조화 해석 **전에** 5단어로 자르면 문장 뒤의 가격이 조용히 사라진다.

    `여름에 입을 검정 반팔티 3만원 이하`는 여섯 번째 단어 `이하`가 잘려 나가
    가격 조건이 없어졌었다(교차 리뷰 M3). 지원한다고 선언한 문법이 문장 뒤에
    놓이면 지원되지 않는 셈이다.
    """
    q = "여름에 입을 검정 반팔티 3만원 이하"
    cur.execute("select codes, rest from c_search_color_parse(c_search_split(%s))", (q,))
    codes, rest = cur.fetchone()
    assert codes == ["2"], "여섯 단어짜리 질의에서도 색을 읽어야 한다"
    cur.execute("select min_price, max_price from c_search_price_parse(%s)", (rest,))
    assert cur.fetchone() == (None, 30000), "가격도 읽어야 한다"


def test_keyboard_restore_works_when_the_query_also_has_a_price(cur):
    """자판 복원이 질의 전체를 요구하면 가격이 섞였을 때 통째로 막힌다."""
    cur.execute("select query_used from c_search_page_v2(%s, null, null, 1)", ("rjawjd qksvkf 3만원 이하",))
    assert cur.fetchone()[0] == "검정 반팔 3만원 이하"


def test_search_docs_price_matches_the_catalog(cur):
    """가격은 색인에 복사해 두고 거른다 — 카탈로그와 갈리면 **하드 조건이 깨진다.**

    재수집 뒤 파생 테이블을 다시 만들지 않으면 "3만원 이하"로 통과한 상품이
    응답에서는 3만원을 넘을 수 있다. 자동 동기화가 없으므로 여기서 감시한다.
    """
    cur.execute(
        "select count(*) from c_search_docs s join c_goods g using (goods_no)"
        " where s.price_final <> g.price_final"
    )
    assert cur.fetchone()[0] == 0, (
        "c_search_docs.price_final이 카탈로그와 다르다 — "
        "20260817200000을 다시 돌려야 한다(backend/README.md 갱신 계약)"
    )


# ── 브랜드 사전 (소프트 텍스트 조각 1단계) ─────────────────────────────────
#
# 다음 단계에서 제목 단어를 하드 AND에서 점수로 내린다. 브랜드를 먼저 빼내지 않으면
# `커버낫 반팔`이 `반팔`만 맞은 5만 건과 섞인다.


def test_brand_dictionary_is_built_from_the_catalog_not_the_typo_vocab(cur):
    """정본은 `c_search_docs.brand`다. `c_search_vocab`은 오타 교정용이라 정본이 아니다.

    vocab에는 브랜드가 아닌 항목이 241개 섞여 있고 실제 브랜드 4,347개 중 3,989개만
    담는다. 하드 필터의 근거로 쓰면 안 된다(교차 리뷰 2차 ②).
    """
    cur.execute(
        "select count(*) from c_search_brand_terms t"
        " where not exists (select 1 from c_search_docs d where d.brand = t.brand)"
    )
    assert cur.fetchone()[0] == 0, "사전의 brand는 모두 실제 카탈로그 브랜드여야 한다"


@pytest.mark.parametrize(
    "word,reason",
    [
        # 그 브랜드 상품은 9개인데 그 말이 든 문서가 7,305개다. 색으로 남겨야 한다
        ("네이비", "색이지 브랜드가 아니다"),
        # 티셔츠를 말할 때 쓰는 일상어이자 우연히 브랜드명이기도 한 말들
        ("무지", "무지 티셔츠의 무지다"),
        ("레이스", "소재·디테일을 말하는 말이다"),
        ("시그니처", "상품명에 흔히 붙는 말이다"),
        ("오리지널", "상품명에 흔히 붙는 말이다"),
    ],
)
def test_words_that_are_also_everyday_words_are_not_brands(cur, word, reason):
    cur.execute("select count(*) from c_search_brand_terms where term = %s", (word,))
    assert cur.fetchone()[0] == 0, reason


@pytest.mark.parametrize(
    "word",
    # 비율 임계값(0.5)을 썼다면 카고브로스·컬럼비아·반스가, 0.7이면 무신사 스탠다드가
    # 탈락했다. 절대 기준으로 바꾼 뒤 전부 살아남는지 고정한다.
    ["커버낫", "데상트", "컬럼비아", "반스", "카고브로스", "무신사 스탠다드", "나이키", "트립션"],
)
def test_real_brands_survive(cur, word):
    cur.execute("select brand from c_search_brand_terms where term = lower(%s)", (word,))
    row = cur.fetchone()
    assert row is not None and row[0] == word


@pytest.mark.parametrize(
    "query,brand,rest",
    [
        # 긴 구문을 먼저 본다 — 단어별로 보면 `무신사`가 먼저 걸려 `스탠다드`가 남는다
        ("무신사 스탠다드 반팔", "무신사 스탠다드", ["반팔"]),
        # 공백을 뗀 형태도 받는다
        ("무신사스탠다드 반팔", "무신사 스탠다드", ["반팔"]),
        ("커버낫 반팔", "커버낫", ["반팔"]),
        ("데상트 민소매", "데상트", ["민소매"]),
        # 브랜드만 말한 질의는 나머지가 없다
        ("트립션", "트립션", None),
        # 색으로 남겨야 하는 말은 브랜드로 걸리지 않는다
        ("네이비 반팔", None, ["네이비", "반팔"]),
        # 서로 다른 브랜드가 둘이면 손대지 않는다 — 합집합은 사용자가 말한 것이 아니다
        ("커버낫 나이키 반팔", None, ["커버낫", "나이키", "반팔"]),
        # 사전에 없는 말은 아무것도 하지 않는다
        ("여름 반팔티", None, ["여름", "반팔티"]),
    ],
)
def test_brand_is_split_out_of_the_text_query(cur, query, brand, rest):
    cur.execute("select brand, rest from c_search_brand_parse(c_search_split(%s))", (query,))
    got_brand, got_rest = cur.fetchone()
    assert got_brand == brand
    assert got_rest == rest


@pytest.mark.parametrize(
    "query,brand",
    [("데상트 민소매", "데상트"), ("커버낫 후드", "커버낫"), ("트립션 반팔", "트립션")],
)
def test_brand_plus_attribute_no_longer_returns_zero(cur, query, brand):
    """이 조각의 이유. 세 질의 모두 0건이었다 — 데상트에 민소매가 74개 있는데
    제목에 `민소매`가 든 것이 0개라서다.

    1단계에서는 파서만 만들고 이 테스트가 **여전히 0건임을 고정**했다.
    2단계에서 후보 자격을 바꿔 실제로 풀렸다.
    """
    cur.execute("select brand from c_search_brand_parse(c_search_split(%s))", (query,))
    assert cur.fetchone()[0] == brand
    cur.execute(
        "select count(*), count(*) filter (where g.brand_name = %s)"
        " from c_search_page_v2(%s, null, null, 20) r join c_goods g using (goods_no)",
        (brand, query),
    )
    total, same = cur.fetchone()
    assert total == 20, "하드 조건만으로도 후보 자격이 된다"
    assert same == total, "브랜드는 하드 조건이라 상위가 전부 그 브랜드여야 한다"


# ── 카테고리 말을 하드 조건으로 (소프트 텍스트 4단계) ──────────────────────
#
# `반팔`·`민소매`는 제목 단어가 아니라 카탈로그의 정본 값이다. 제목만 보면
# 민소매는 실제의 2.9%만 찾는다.


@pytest.mark.parametrize(
    "query,category",
    [("민소매", "001011"), ("반팔", "001001"), ("긴팔", "001010"),
     ("피케", "001003"), ("후드", "001004"),
     ("데상트 민소매", "001011"), ("검정 민소매", "001011"), ("커버낫 후드", "001004")],
)
def test_category_word_becomes_a_hard_condition(cur, query, category):
    cur.execute(
        "select count(*), count(*) filter (where g.category = %s)"
        " from c_search_page_v2(%s, null, null, 20) r join c_goods g using (goods_no)",
        (category, query),
    )
    total, same = cur.fetchone()
    assert total == 20
    assert same == total, f"{query}: 상위 20이 전부 {category}여야 한다"


def test_title_word_that_contradicts_the_category_does_not_surface(cur):
    """제목에 `반팔`이 있지만 반팔 티셔츠가 아닌 상품이 3,216개 있다.

    카테고리를 정본으로 쓰면 이것들이 `반팔` 상위에 오지 않는다.
    """
    cur.execute(
        "select count(*) from c_search_page_v2('반팔', null, null, 20) r"
        " join c_goods g using (goods_no) where g.category <> '001001'"
    )
    assert cur.fetchone()[0] == 0


@pytest.mark.parametrize("query", ["피케 반팔", "후드 민소매"])
def test_two_different_categories_are_left_alone(cur, query):
    """하드 조건은 AND라서 둘을 걸면 공집합이 된다. 색·브랜드와 같은 규칙 —
    합집합으로 묶으면 사용자가 말한 것과 달라지므로 **모르면 손대지 않는다.**
    """
    cur.execute("select ranks from c_search_category_parse(c_search_split(%s))", (query,))
    assert cur.fetchone()[0] is None
    cur.execute("select count(*) from c_search_page_v2(%s, null, null, 20)", (query,))
    assert cur.fetchone()[0] > 0, "카테고리를 포기해도 텍스트로 답이 나와야 한다"


def test_category_rank_mapping_is_one_to_one(cur):
    """검색은 `codes`가 아니라 `ranks`(cat_rank)로 건다 — c_search_docs에 category
    열이 없기 때문이다. 대응이 1:1이 아니게 되면 `피케` 질의가 모르는 카테고리까지
    끌어온다(c_category_rank가 미지의 값을 1로 떨어뜨린다).
    """
    cur.execute(
        "select count(*) from ("
        "  select c_category_rank(category) r from"
        "    (select distinct category from c_goods where category is not null) g"
        "  group by 1 having count(*) > 1) x"
    )
    assert cur.fetchone()[0] == 0, "카테고리↔cat_rank 대응이 깨졌다"
