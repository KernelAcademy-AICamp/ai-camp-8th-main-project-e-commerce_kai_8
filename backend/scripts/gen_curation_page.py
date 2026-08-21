"""큐레이션 화면 목업 생성 (c_goods 기준 · 반소매 티셔츠 122,896건).

큐레이션 정의는 코드가 아니라 Supabase `curations` 테이블에 있다.
트렌드가 바뀌면 그 표의 행만 고치면 화면이 통째로 다시 만들어진다.

c_goods는 PostgREST 스키마 캐시에 없어서 supabase-py로 안 읽힌다. psycopg로 직접 붙는다.
22만 행이라 전부 끌어오지 않고 규칙을 SQL WHERE로 번역해서 DB에서 거른다.

실행 (backend 디렉터리에서):
    .venv/bin/python scripts/gen_curation_page.py --seed   # 정의 적재
    .venv/bin/python scripts/gen_curation_page.py           # HTML 생성
    .venv/bin/python scripts/gen_curation_page.py --demo    # 규칙 컴파일러 자체점검
"""
import json
import re
import sys
from pathlib import Path

import psycopg

OUT = Path(__file__).parent / "큐레이션화면.html"
# 화면이 읽는 같은 데이터. 목업 HTML과 한 번에 같이 쓴다 — 둘이 어긋나면 안 된다.
#
# 원래 `curation/client`에도 같은 바이트를 썼다. 그 폴더(별개 제품 search-by-llm)를
# 지우면서 목적지가 하나로 줄었다 — 사본이 둘이면 한쪽만 고쳐져 조용히 갈라진다.
_REPO = Path(__file__).resolve().parents[2]
JSON_OUTS = [_REPO / "frontend/features/curation/data/curations.json"]
ENV = Path(__file__).resolve().parents[1] / ".env.local"
TOP_N = 9   # ponytail: 상위 9개만 노출. 상품마다 NOTES를 손으로 쓰는 비용이 크다.

# 누적 구매순으로 세우면 큐레이션이 전부 유명한 것만 보여준다. 반소매 12만 건 중
# 구매 1만 이상은 384건(0.31%)인데 화면 슬롯의 60%가 거기서 나왔다.
# 그래서 구매수는 "검증됐나"를 보는 하한선으로만 쓰고, 순서는 평점으로 정한다.
# 동점(평점 98이 흔하다)은 최신순으로 가른다 — 리뷰수로 가르면 다시 유명한 순이 된다.
MIN_BUY = 100      # 구매 100개 미만은 검증 안 된 것으로 본다 (12만 건 중 10만이 구매 0개)
MIN_REVIEW = 30    # 리뷰 30개 미만의 평점 100점은 표본이 작아서 못 믿는다
ORDER = "review_score desc nulls last, goods_no desc"
MAX_APPEAR = 2    # 한 상품이 나갈 수 있는 큐레이션 수. 앞선 큐레이션이 우선권을 갖는다

# 화면의 "N건"을 **하한 통과분**으로 세는 게시물 (사람 결정 2026-08-18).
# 기본은 하한 전 숫자인데, 반팔 카탈로그의 8할이 구매 0건이라 체형 게시물은
# "9개 보여주면서 8,830건"이 된다. 실제로 뽑을 수 있는 풀을 적는다.
# ⚠️ 여기 없는 게시물과 기준이 다르다. 나란히 비교하면 안 된다.
N_GATED = {"body_straight", "body_wave_w", "body_natural",
           "outdoor_brand", "sports_brand", "spa_brand", "women_online_brand",
           "new_arrival_watch", "outdoor_new", "women_online_new"}

# 큐레이션별 카드 게이트·정렬 덮어쓰기. 기본은 (MIN_BUY, MIN_REVIEW, ORDER).
# 기본 게이트는 "검증된 것만 보여준다"는 뜻이라, 이번 시즌에 막 들어온 것을
# 소개하는 큐레이션에는 정반대로 작동한다 — 신상은 구매·후기가 0이라 전멸한다.
# (실측: 아웃도어 브랜드 26SS 1,671건 중 기본 게이트 통과 0건.)
# 그런 큐레이션은 게이트를 풀고, 대신 review_score가 없으니 조회수로 정렬한다.
NEW_ARRIVAL_ORDER = "page_view desc nulls last, goods_no desc"
CARD_RULE = {   # key -> (min_buy, min_review, order)
    "new_arrival_watch": (0, 0, NEW_ARRIVAL_ORDER),
    "outdoor_new":       (0, 0, NEW_ARRIVAL_ORDER),
    "women_online_new":  (0, 0, NEW_ARRIVAL_ORDER),
}

# 반소매 티셔츠 = 일반(001001) + 스포츠(017016005). 긴팔·후드·나시는 뺀다.
BASE_SCOPE = "base_cat in ('001001','017016005')"

# 무신사 색 코드. c_goods.color_codes(숫자) ↔ m_raw_goods.colors(한글) 교차로 뽑았다.
COLOR = {
    "화이트": 1, "블랙": 2, "그레이": 3, "브라운": 4, "베이지": 5, "그린": 6, "블루": 7,
    "퍼플": 8, "옐로우": 9, "핑크": 10, "레드": 11, "오렌지": 12, "실버": 13, "골드": 14,
    "기타색상": 15, "데님": 16, "아이보리": 23, "라이트 그레이": 24, "다크 그레이": 25,
    "카멜": 26, "카키 베이지": 28, "샌드": 29, "카키": 30, "라이트 그린": 31, "민트": 32,
    "올리브 그린": 34, "다크 그린": 35, "네이비": 36, "스카이 블루": 37, "라벤더": 39,
    "라이트 옐로우": 44, "라이트 핑크": 45, "페일 핑크": 48, "버건디": 49, "딥레드": 51,
    "연청": 57, "브릭": 72, "다크핑크": 73, "피치": 74, "라이트 오렌지": 75,
    "다크 오렌지": 76, "오트밀": 77, "머스타드": 78, "라임": 79, "다크 블루": 80,
    "다크 네이비": 81, "라이트 브라운": 82, "다크 브라운": 83, "다크 베이지": 84,
}

# 값이 콤마로 이어붙은 컬럼("루즈,오버|사이즈"). 배열처럼 다뤄야 한다.
MULTI = {"fit", "sheer", "thickness", "touch", "elasticity", "wear_season"}
ARRAY = {"tags", "sizes"}

# 실측 치수 표(c_search_fit_measures)에서 조건으로 쓸 수 있는 컬럼.
# 백분위(_pct)는 0~1, shoulder_band는 c_search_fit_bands의 5칸 이름이다.
FIT_COLS = {"pop", "shoulder_band", "shoulder_pct", "length_pct", "chest_pct", "sleeve_pct"}
CMP = {"lte": "<=", "gte": ">=", "eq": "="}
SAFE_COL = re.compile(r"^[a-z_]+$")

# 리뷰 AI 요약. 무신사가 후기를 요약해둔 것으로, 불만 요약이 따로 들어 있다.
HAS_AI = "ai_summary is not null"
NEG = "coalesce(ai_summary->'sentimentSummary'->>'negative','')"
POS = "coalesce(ai_summary->'sentimentSummary'->>'positive','')"


# ── 규칙 → SQL ──────────────────────────────────────────────
# rules 예:
#   {"kw": ["래글런","링거"]}                        제목이나 태그에 키워드
#   {"color": ["화이트"], "sheer": {"any":["없음"]}}  색 + 비침
#   {"price_final": {"lte": 30000}}
# 연산자: kw / not_kw / color / color_only / any / all / not_any / in / lte / gte / eq
def compile_rules(rules):
    """규칙 스펙을 (SQL 조각, 파라미터)로. 컬럼명은 화이트리스트로만 통과시킨다."""
    where, params = [], []
    for key, spec in rules.items():
        if key == "kw":
            where.append("(" + " or ".join(
                ["title ilike %s"] * len(spec)
                + ["exists (select 1 from unnest(tags) t where t ilike %s)"] * len(spec)) + ")")
            params += [f"%{v}%" for v in spec] * 2
        elif key == "kw_title":
            # 상품명만 본다. 무신사 태그는 헐거워서 kw로 잡으면 엉뚱한 게 딸려온다
            # (고양이 태그에 "DON'T PANIC TEE", 강아지 태그에 "베이스볼 나일론"이 걸렸다).
            where.append("(" + " or ".join(["title ilike %s"] * len(spec)) + ")")
            params += [f"%{v}%" for v in spec]
        elif key == "not_kw":
            where.append("not (" + " or ".join(["title ilike %s"] * len(spec)) + ")")
            params += [f"%{v}%" for v in spec]
        elif key == "color":
            where.append("color_codes && %s")
            params.append([str(COLOR[v]) for v in spec])
        elif key == "color_only":
            where.append("color_codes <@ %s")           # 이 색들로만 이뤄진 상품
            params.append([str(COLOR[v]) for v in spec])
        elif key == "neg_free":
            # 리뷰 AI 요약이 있으면서, 불만 요약에 이 말이 안 나오는 것.
            # 요약 자체가 없으면 "불만이 없다"고 말할 수 없으므로 제외한다.
            where.append(f"({HAS_AI} and not ({NEG} ilike any(%s)))")
            params.append([f"%{v}%" for v in spec])
        elif key == "neg_kw":
            where.append(f"({HAS_AI} and {NEG} ilike any(%s))")
            params.append([f"%{v}%" for v in spec])
        elif key == "pos_kw":
            where.append(f"({HAS_AI} and {POS} ilike any(%s))")
            params.append([f"%{v}%" for v in spec])
        elif key == "fit_m":
            # 실측 치수는 c_goods에 없다. goods_no로 c_search_fit_measures를 붙인다. 예:
            #   {"fit_m": {"pop": {"eq": "여성"}, "shoulder_band": {"any": ["정어깨"]},
            #              "length_pct": {"lte": 0.35}}}
            # ⚠️ 그 표는 일반 반소매(001001)만 담고, 치수가 있는 상품만 들어 있다.
            # 이 조건을 걸면 스포츠 티(017016005)와 치수 미기재 상품은 통째로 빠진다.
            sub = []
            for col, ops in spec.items():
                if col not in FIT_COLS:
                    raise ValueError(f"치수 표에 없는 컬럼: {col}")
                for op, want in ops.items():
                    if op == "any":
                        sub.append(f"m.{col} = any(%s)")
                        params.append(list(want))
                    elif op in CMP:
                        sub.append(f"m.{col} {CMP[op]} %s")
                        params.append(want)
                    else:
                        raise ValueError(f"모르는 연산자: {op}")
            where.append("exists (select 1 from c_search_fit_measures m "
                         "where m.goods_no = c_goods.goods_no and " + " and ".join(sub) + ")")
        elif key == "no_complaint":
            where.append(f"({HAS_AI} and ({NEG} = '' or {NEG} ilike '%%만족도가 높%%'))")
        elif key in ("ai_kw", "ai_kw_not"):
            # 항목별 요약(size·fit·material·design)에 이 말이 나오는지. 예:
            #   {"ai_kw": {"type":"size", "any":["정사이즈","정핏"]}}
            sub = (f"exists (select 1 from jsonb_array_elements(ai_summary->'keywordSummaries') ks "
                   f"where ks->>'type' = %s and ks->>'summary' ilike any(%s))")
            where.append(f"({HAS_AI} and {'not ' if key.endswith('not') else ''}{sub})")
            params += [spec["type"], [f"%{v}%" for v in spec["any"]]]
        else:
            if not SAFE_COL.match(key):
                raise ValueError(f"컬럼명이 이상하다: {key}")
            col = (f"string_to_array({key}, ',')" if key in MULTI else key)
            for op, want in spec.items():
                if op == "any":
                    where.append(f"{col} && %s" if key in MULTI | ARRAY else f"{key} = any(%s)")
                    params.append(list(want))
                elif op == "all":
                    where.append(f"{col} @> %s")
                    params.append(list(want))
                elif op == "not_any":
                    # 이 값들이 **아닌** 것. ⚠️ 값이 없는 상품(설문 미기재)은 통과시킨다 —
                    # not (NULL && ...) 은 NULL이라 그냥 쓰면 미기재가 조용히 전부 탈락한다.
                    # 반소매에서 thickness·fit·touch는 36%만 채워져 있어 낙차가 크다.
                    where.append(f"coalesce(not ({col} && %s), true)"
                                 if key in MULTI | ARRAY else
                                 f"coalesce({key} <> all(%s), true)")
                    params.append(list(want))
                elif op == "in":
                    where.append(f"{key} = any(%s)")
                    params.append(list(want))
                elif op in CMP:
                    where.append(f"{key} {CMP[op]} %s")
                    params.append(want)
                else:
                    raise ValueError(f"모르는 연산자: {op}")
    return " and ".join(where) or "true", params


# ── 초기 적재값 ──────────────────────────────────────────────
# 트렌드 축(01~04)은 조사 결과, 기능·상황 축(05~10)은 착용 데이터에서 나왔다.
SEED = [

    {"key": "baseball_raglan",
     "title": "야구 유니폼에서 내려온 래글런 소매",
     "lede": "소매가 어깨에서 끊기지 않고 목선까지 사선으로 이어진 재단. 야구 유니폼에서 나와 일상복으로 내려왔다. "
             "어깨 솔기가 없어서 팔을 올릴 때 당기지 않는다.",
     "rules": {"kw": ["래글런", "라글란", "야구", "베이스볼", "baseball"]},
     "cond_labels": ["래글런", "야구"]},

    {"key": "running",
     "title": "달릴 때 입는 땀 빨리 마르는 반팔",
     "lede": "러닝·조깅용으로 나온 기능성 반팔. 면 대신 흡한속건 소재라 땀이 배도 무거워지지 않는다. "
             "야구 티가 태그로 섞여 들어와서 따로 뺐다.",
     "rules": {"kw": ["러닝", "running", "조깅", "마라톤"],
               "not_kw": ["야구", "베이스볼", "baseball"]},
     "cond_labels": ["러닝", "흡한속건"]},

    {"key": "blokecore",
     "title": "경기장 밖에서 입는 축구 저지 티",
     "lede": "경기장 밖에서 입는 저지. 백넘버와 유니폼 그래픽이 몇 년째 일상복으로 내려오고 있다.",
     "rules": {"kw": ["저지", "유니폼", "풋볼", "사커", "백넘버"]},
     "cond_labels": ["블록코어", "저지"]},

    {"key": "dog_print",
     "title": "말티즈든 시바든 강아지 박힌 티",
     "lede": "8월 26일 세계 개의 날. 강아지 그림이 앞에 크게 들어간 것만 골랐다. "
             "견종 이름이 상품명에 박힌 게 많다.",
     "rules": {"kw_title": ["강아지", "퍼피", "puppy", "도그", "dog", "댕댕", "멍멍",
                            "말티즈", "시바", "웰시코기", "리트리버", "푸들", "비숑", "포메"]},
     "cond_labels": ["강아지", "8/26 개의 날"]},

    {"key": "cat_print",
     "title": "고양이 그림 하나로 밀고 가는 티",
     "lede": "9월 9일은 한국 고양이의 날. 박스캣, 댄싱캣, 나비고양이까지 "
             "고양이가 주인공인 것만 남겼다.",
     "rules": {"kw_title": ["고양이", "캣", "냥"]},
     "cond_labels": ["고양이", "9/9 고양이의 날"]},

    {"key": "tropical",
     "title": "서핑도 안 하면서 입는 야자수 티",
     "lede": "서핑보드, 야자수, 코코넛. 물에 안 들어가도 여름 티에 제일 많이 박히는 그림이다. "
             "휴가철 7~8월용.",
     "rules": {"kw_title": ["서핑", "서프", "surf", "하와이", "알로하", "aloha",
                            "트로피컬", "tropical", "코코넛", "팜트리", "야자",
                            "비치웨어", "휴양지", "리조트", "파라다이스", "선셋", "석양",
                            "파도", "빅웨이브"]},
     "cond_labels": ["서핑", "트로피컬"]},

    {"key": "campus_daily",
     "title": "개강해서 매일 입을 3만원 아래 무지",
     "lede": "새 학기엔 한 장이 아니라 여러 장이 필요하다. 무지·베이직 중 3만원 넘지 않는 것만. "
             "가격으로 자른 거라 꾸안꾸 쪽으로 모인다.",
     "rules": {"kw_title": ["무지", "베이직", "에센셜", "솔리드"],
               "price_final": {"lte": 30000}},
     "cond_labels": ["무지", "3만원 이하"]},

    {"key": "date_neat",
     "title": "오버핏 말고 딱 맞는 단정한 무지",
     "lede": "소개팅에 오버핏은 위험하다. 핏이 레귤러나 슬림인 무지·미니멀 중 4만원 이하만. "
             "크롭과 머슬핏은 뺐다. 몸에 맞는 게 제일 차려입은 것처럼 보인다.",
     "rules": {"kw_title": ["무지", "베이직", "에센셜", "솔리드", "미니멀"],
               "fit": {"any": ["레귤러", "슬림"]},
               # fit 컬럼은 레귤러인데 상품명은 오버핏인 게 섞인다. 이름 쪽을 믿고 뺀다.
               "not_kw": ["크롭", "크랍", "머슬", "오버핏", "오버사이즈", "오버 사이즈", "루즈"],
               "price_final": {"lte": 40000}},
     "cond_labels": ["레귤러·슬림", "4만원 이하"]},

    {"key": "quiet_detail",
     "title": "무지인데 목이 다른 꾸안꾸 티",
     "lede": "멀리서 보면 그냥 무지인데 가까이 보면 목이나 짜임이 다르다. "
             "헨리넥, 피케, 와플, 실켓처럼 티는 안 나고 손은 간 것들.",
     # 무늬가 있으면 "멀리서 보면 그냥 무지"가 깨진다 — 줄무늬 티가 커버로 올라온 적이 있다.
     "rules": {"kw_title": ["헨리넥", "모크넥", "피케", "실켓", "슬릿", "카라", "폴로", "와플"],
               "not_kw": ["스트라이프", "줄무늬", "스트라입"]},
     "cond_labels": ["헨리넥·피케", "꾸안꾸"]},

    {"key": "ringer",
     "title": "목이랑 소매 끝만 색이 다른 링거",
     "lede": "링거가 올여름 다시 올라왔다. 몸판은 단색인데 목 밴드와 소매 끝단만 다른 색으로 둘러진 것. "
             "래글런은 소매 재단 얘기라 기준이 달라서 뺐다.",
     "rules": {"kw": ["링거"]},
     "cond_labels": ["링거"]},

    {"key": "stripe",
     "title": "두 색 말고 세 색으로 가는 줄무늬 티",
     "lede": "올해 스트라이프는 두 색이 아니라 세 색이다. 굵기까지 다르게 가는 게 포인트다.",
     "rules": {"kw": ["스트라이프", "스트라입", "보더"]},
     "cond_labels": ["스트라이프"]},

    {"key": "washed",
     "title": "새 옷인데 3년 입은 척하는 워시드",
     "lede": "새 옷인데 오래 입은 것처럼 보이는 쪽. 피그먼트 염색과 워시드 가공이 여기 들어간다.",
     "rules": {"kw": ["빈티지", "워시드", "워싱", "피그먼트"]},
     "cond_labels": ["빈티지", "워시드", "피그먼트"]},

    {"key": "character",
     "title": "로고 말고 캐릭터가 크게 박힌 티",
     "lede": "그래픽 중에서도 캐릭터가 주인공인 것. 로고나 레터링만 있는 건 뺐다.",
     "rules": {"kw": ["캐릭터"], "not_kw": ["무지"]},
     "cond_labels": ["캐릭터"]},

    {"key": "white_opaque",
     "title": "안 비치는 흰 반팔 없냐길래 골랐다",
     "lede": "흰 티는 두께보다 비침이 문제다. 흰색 계열만 나오는 상품 중에서, "
             "리뷰 요약에 비침·이염·물빠짐 얘기가 한 번도 안 나온 것만 남겼다.",
     "rules": {"color_only": ["화이트", "아이보리"],
               "neg_free": ["비침", "비쳐", "이염", "물빠"]},
     "cond_labels": ["화이트", "비침 불만 없음"]},

    {"key": "summer_thin",
     "title": "진짜 얇아서 8월에도 입는 여름 반팔",
     "lede": "두께가 얇은 쪽이면서 착용 계절에 여름이 들어간 것. 둘 중 하나만으로는 8월에 못 입는다.",
     "rules": {"thickness": {"any": ["얇음", "약간 얇음"]}, "wear_season": {"any": ["여름"]}},
     "cond_labels": ["얇음", "여름"]},

    {"key": "oversized_thin",
     "title": "오버핏인데 원단은 안 두꺼운 티",
     "lede": "오버핏은 대체로 원단이 두껍다. 핏이 오버·루즈면서 두께는 얇은 쪽만 골랐다.",
     "rules": {"fit": {"any": ["오버|사이즈", "루즈"]}, "thickness": {"any": ["얇음", "약간 얇음"]}},
     "cond_labels": ["오버핏", "얇음"]},

    {"key": "new_graphic",
     "title": "작년 재고 말고 올해 나온 그래픽 티",
     "lede": "2026년 시즌으로 등록된 것 중 그래픽·프린트가 있는 것. 재고로 남은 옛날 디자인을 뺀다.",
     "rules": {"season_year": {"eq": "2026"}, "kw": ["그래픽", "프린트", "프린팅"]},
     "cond_labels": ["2026 시즌", "그래픽"]},

    {"key": "crop",
     "title": "배꼽 위에서 끝나는 짧은 크롭 티",
     "lede": "기장이 짧은 쪽. 하이웨이스트 바지랑 같이 입는 조합이 계속 늘고 있다.",
     "rules": {"kw": ["크롭", "크랍"]},
     "cond_labels": ["크롭"]},

    {"key": "no_stretch",
     "title": "빨아도 목이 안 늘어난다는 반팔",
     "lede": "리뷰 요약에 늘어남·변형·수축 얘기가 없으면서, 좋은 쪽 요약에 탄탄하다는 말이 나온 것.",
     "rules": {"neg_free": ["늘어", "변형", "줄어", "수축"],
               "pos_kw": ["탄탄", "짱짱", "형태"]},
     "cond_labels": ["늘어남 불만 없음", "탄탄함 언급"]},

    {"key": "not_hot",
     "title": "여름옷으로 나와서 진짜 안 더운 티",
     "lede": "착용 계절에 여름이 들어가면서, 리뷰 요약에 덥다·두껍다는 지적이 없는 것. "
             "여름옷으로 나왔는데 실제로는 더운 경우를 걸러낸다.",
     "rules": {"wear_season": {"any": ["여름"]}, "neg_free": ["덥", "더워", "두꺼"]},
     "cond_labels": ["여름", "덥다 불만 없음"]},

    {"key": "no_complaint",
     "title": "리뷰 수백 개인데 깔 게 안 나온 티",
     "lede": "리뷰 요약의 불만 항목이 비어 있거나 전반적으로 만족도가 높다고만 적힌 것. "
             "후기가 쌓였는데도 지적이 안 나온 쪽이다.",
     "rules": {"no_complaint": True},
     "cond_labels": ["불만 요약 없음"]},

    {"key": "true_to_size",
     "title": "평소 사이즈 그냥 시켜도 되는 반팔",
     "lede": "리뷰 사이즈 요약에 정사이즈라고 적혔고, 한 치수 올려라·내려라는 말이 안 나온 것. "
             "온라인에서 제일 자주 틀리는 게 사이즈다.",
     "rules": {"ai_kw": {"type": "size", "any": ["정사이즈", "정핏", "딱 맞", "적당"]},
               "ai_kw_not": {"type": "size", "any": ["작게 나", "크게 나", "한 치수", "한 사이즈"]}},
     "cond_labels": ["정사이즈", "치수 조정 없음"]},

    {"key": "coquette",
     "title": "프린트 말고 리본·레이스가 진짜 달린 티",
     "lede": "코케트가 반팔까지 왔다. 프린트가 아니라 리본·레이스·프릴이 실제로 달린 쪽.",
     "rules": {"kw": ["리본", "레이스", "프릴", "코케트"]},
     "cond_labels": ["코케트", "리본·레이스"]},

    {"key": "flower",
     "title": "잔꽃 말고 얼굴만 한 꽃이 박힌 티",
     "lede": "올해 프린트가 다시 커졌다. 잔꽃보다 화면을 꽉 채우는 플로럴이 눈에 띈다.",
     "rules": {"kw": ["플라워", "플로럴", "꽃"]},
     "cond_labels": ["플라워"]},

    {"key": "gorpcore",
     "title": "등산복으로 나왔는데 시내에서 입는 티",
     "lede": "고프코어. 등산이나 캠핑용으로 나온 옷을 시내에서 그냥 입는 흐름이다.",
     "rules": {"kw": ["고프", "아웃도어", "트레킹", "캠핑"]},
     "cond_labels": ["고프코어", "아웃도어"]},
    # ── 골격 체형 (계획: docs/plans/2026-08-18-curation-body-type.md) ──────────
    # 조건은 검색의 골격 체형 매핑표(query-plan.ts "골격 체형" 절)에서 옮긴 것이다.
    # 어깨·가슴·기장은 전부 **실측 백분위**다 — 설문 fit·thickness는 반소매의 36%만
    # 채워져 있어 하드 조건으로 못 쓴다. 실측이 같은 구분을 재현한다
    # (라벨별 실측 평균: 슬림 .23 / 레귤러 .47 / 루즈 .77 / 오버 .84, 2026-08-18).
    # ⚠️ fit_m은 일반 반소매(001001)만 담은 표라 스포츠 티(017016005)는 통째로 빠진다.
    # ⚠️ pop='여성'은 성별 필터가 아니라 백분위 모집단인데, 그 모집단이 gender='여성'
    #    상품만 담고 있어 결과적으로 여성 상품만 남는다(실측 확인: 후보 풀 1,939건 전부 여성).

    {"key": "body_straight",
     "title": "스트레이트 체형이 가장 잘 입는 기본 티셔츠",
     "lede": "어깨선이 실제 어깨에서 끊기고 몸통이 일자로 떨어지는 것. 상체에 두께가 있는 체형이라 "
             "잘 만든 기본 티가 제일 잘 맞는다. 아주 얇은 원단과 큰 오버핏은 둘 다 뺐다.",
     "rules": {"fit_m": {"pop": {"eq": "여성"},
                         "shoulder_band": {"any": ["정어깨"]},
                         "length_pct": {"gte": 0.25, "lte": 0.80},
                         "chest_pct": {"gte": 0.30, "lte": 0.65}},
               "thickness": {"not_any": ["얇음", "약간 얇음"]},
               # kw(제목+태그)로 걸면 셔츠가 딸려온다 — 태그 `코튼셔츠`에 "코튼"이 맞아
               # `Double button shirts top`이 티셔츠 큐레이션에 들어왔다(2026-08-18).
               # 태그로 빼려 했으나 `셔츠` 태그를 단 상품 대부분이 실제로는 티셔츠라
               # 멀쩡한 것을 같이 버린다. 제목만 보는 kw_title을 쓴다(후보 94 → 30건).
               "kw_title": ["무지", "베이직", "에센셜", "솔리드", "코튼",
                            "cotton", "basic", "essential"],
               # 실측 기장 백분위는 여성 모집단 기준이라 크롭도 중간대에 들어온다
               # (`세미 크롭 슬림 반팔티`가 기장 0.40으로 통과했다, 2026-08-18).
               # 스트레이트는 몸통이 일자로 떨어지는 기본형이라 제목 쪽을 믿고 뺀다.
               "not_kw": ["크롭", "크랍", "슬림", "머슬"]},
     "cond_labels": ["정어깨", "코튼 기본형", "얇지 않음"]},

    {"key": "body_wave_w",
     "title": "웨이브 체형 여성에게 맞는 짧고 슬림한 반팔",
     "lede": "상체가 얇고 무게중심이 아래인 체형. 상체를 작고 정돈되게 보이게 하는 짧은 기장과 "
             "몸에 붙는 실루엣이 맞는다. ⚠️ 남성 웨이브는 조건이 정반대라(어깨를 넓혀야 한다) "
             "이 게시물은 여성 기준이다.",
     "rules": {"fit_m": {"pop": {"eq": "여성"},
                         "shoulder_band": {"any": ["좁은 어깨", "정어깨"]},
                         "length_pct": {"lte": 0.35},
                         "chest_pct": {"lte": 0.40}}},
     "cond_labels": ["여성 기준", "좁은 어깨·정어깨", "짧은 기장"]},

    {"key": "body_natural",
     "title": "내추럴 체형에 균형이 맞는 오버·루즈 반팔",
     "lede": "뼈대와 관절의 존재감이 있어 옷에도 볼륨이 있어야 균형이 맞는 체형. 몸에 붙는 얇은 반팔은 "
             "골격을 더 도드라지게 한다. 극단적 드롭숄더는 어깨 위치가 사라져 오히려 좁아 보여 뺐다.",
     "rules": {"fit_m": {"pop": {"eq": "여성"},
                         "shoulder_band": {"any": ["어깨 확장", "가벼운 드롭"]},
                         "chest_pct": {"gte": 0.60},
                         "length_pct": {"gte": 0.50}},
               "thickness": {"not_any": ["얇음", "약간 얇음"]}},
     "cond_labels": ["어깨 확장·드롭", "볼륨 실루엣", "얇지 않음"]},

    # ── 트렌드 축 (2026-08-20 추가) ───────────────────────────────
    # 근거: 26SS 신상 비중(공급) + 조회/후기 격차(수요) + 8/12~8/20 후기 증가(판매).
    # 세 신호가 같은 곳을 가리킨 축만 넣었다. 재현: report_trend_diff.py
    # review_count 하한을 건 이유 — ORDER가 review_score desc라 후기 1건짜리(=100점)가
    # 맨 앞에 오기 때문. 규칙으로 막는다(기존 큐레이션에도 같은 문제가 있다).
    {"key": "muscle_fit",
     "title": "몸에 붙여 입으려고 나온 머슬핏 반팔",
     "lede": "가슴과 팔에 붙고 소매가 짧아 팔이 그대로 드러나는 컷. 헬스장 옷으로 나왔는데 "
             "여름엔 그대로 밖에서 입는다. 오버핏과 정반대 방향이라 같이 놓고 고르면 실루엣 "
             "차이가 크게 난다. 태그가 헐거워 오버핏 로고티까지 딸려와서, 상품명에 머슬핏이 "
             "박힌 것만 남겼다.",
     "rules": {"kw_title": ["머슬핏", "머슬 핏", "머슬드", "애슬릿"],
               "not_kw": ["오버핏", "오버 핏", "루즈", "세트", "SET"],
               "review_count": {"gte": 30}},
     "cond_labels": ["상품명에 머슬핏", "오버핏 제외", "후기 30개 이상"]},

    {"key": "rollup_sleeve",
     "title": "소매를 접어 박아 고정한 롤업 반팔",
     "lede": "소매 끝을 한 번 접어 올린 채로 박음질해 고정한 재단. 접힌 선에서 팔뚝이 끊겨 "
             "소매가 길게 늘어지지 않는다. 크롭 기장과 같이 나오는 경우가 많아 배꼽 위에서 "
             "끝나는 것이 섞여 있다.",
     "rules": {"kw": ["롤업", "롤 업", "rollup", "roll-up"],
               "review_count": {"gte": 30}},
     "cond_labels": ["롤업 소매", "후기 30개 이상"]},

    {"key": "off_shoulder",
     "title": "어깨를 한쪽만, 또는 양쪽 다 드러내는 티",
     "lede": "목선을 옆으로 눕히거나 한쪽 어깨만 걸치는 컷. 티셔츠인데 실루엣은 상의보다 "
             "원피스 쪽에 가깝다. 나시·민소매는 다른 옷이라 뺐고, 안에 받쳐 입도록 나온 "
             "레이어드용은 남겼다.",
     "rules": {"kw": ["오프숄더", "오프 숄더", "원숄더", "원 숄더",
                      "off-shoulder", "one-shoulder"],
               "not_kw": ["나시", "슬리브리스", "민소매"],
               "review_count": {"gte": 30}},
     "cond_labels": ["원숄더·오프숄더", "나시 제외", "후기 30개 이상"]},

    # ── 축 확장 32~50 (2026-08-20) ────────────────────────────────
    # 기존 31개가 반소매의 51%(62,787건)를 이미 덮어서, 겹침이 아니라 "축이 새로운가"로 골랐다.
    # 모수 45건 미만(밴드 21·타이다이 11·체크 19·커플 0)은 카드 9장 뽑을 선택지가 없어 뺐다.
    {"key": "slim_fit",
     "title": "오버핏 말고 몸선이 보이는 슬림핏",
     "lede": "어깨와 품이 몸에 가깝게 떨어지는 컷. 오버핏이 몇 년째 기본값이라 오히려 "
             "찾기 어려워졌다. 머슬핏만큼 붙지는 않아 운동복처럼 보이지는 않는다.",
     "rules": {"kw_title": ["슬림핏", "슬림 핏", "슬림"],
               "not_kw": ["오버핏", "오버 핏", "루즈"], "review_count": {"gte": 30}},
     "cond_labels": ["슬림핏", "오버핏 제외", "후기 30개 이상"]},

    {"key": "black_only",
     "title": "검정 하나로만 이뤄진 반팔",
     "lede": "다른 색을 섞지 않고 검정만 쓴 상품. 프린트까지 검정이라 멀리서는 무지처럼 "
             "보인다. 여름엔 더워 보이지만 땀자국이 눈에 덜 띈다.",
     "rules": {"color_only": ["블랙"], "review_count": {"gte": 30}},
     "cond_labels": ["블랙 단독", "후기 30개 이상"]},

    {"key": "premium_yarn",
     "title": "원단 이름을 앞에 붙여 파는 반팔",
     "lede": "수피마·코마사·텐셀처럼 실 이름을 상품명에 박아 파는 것들. 이름을 걸었다는 건 "
             "원단이 판매 포인트라는 뜻이다. 대신 그 이름값이 가격에 붙는다.",
     "rules": {"kw_title": ["수피마", "코마사", "supima", "텐셀", "모달"],
               "review_count": {"gte": 30}},
     "cond_labels": ["고급 원단명 표기", "후기 30개 이상"]},

    {"key": "knit_tee",
     "title": "티셔츠인데 저지가 아니라 니트로 짠 것",
     "lede": "일반 저지 원단이 아니라 실로 짠 반팔. 형태가 잡히고 목이 잘 늘어나지 않는다. "
             "대신 세탁기에 그냥 돌리면 늘어나서 세탁 표기를 봐야 한다.",
     "rules": {"kw_title": ["니트", "knit"], "review_count": {"gte": 30}},
     "cond_labels": ["니트 조직", "후기 30개 이상"]},

    {"key": "layered_tee",
     "title": "안에 하나 더 입은 것처럼 나온 레이어드",
     "lede": "밑단이나 소매에 다른 원단을 덧대 두 겹으로 보이게 만든 컷. 한 장만 입어도 "
             "겹쳐 입은 모양이 난다. 올해 신상에서 특히 많이 나온 축이다.",
     "rules": {"kw_title": ["레이어드", "레이어링"], "review_count": {"gte": 30}},
     "cond_labels": ["레이어드 디자인", "후기 30개 이상"]},

    {"key": "y2k_motif",
     "title": "하트·체리·나비가 박힌 Y2K 모티프",
     "lede": "2000년대 초 옷에 흔하던 상징들. 큰 그래픽 하나 대신 작은 무늬를 반복해 넣는 "
             "방식이다. 신상보다 오래 팔린 것이 많은 축이다.",
     "rules": {"kw_title": ["하트", "체리", "나비", "스마일"], "review_count": {"gte": 30}},
     "cond_labels": ["Y2K 모티프", "후기 30개 이상"]},

    {"key": "square_neck",
     "title": "목선을 가로로 넓게 판 스퀘어넥·보트넥",
     "lede": "둥근 라운드넥 대신 목선을 가로로 반듯하게 자른 컷. 쇄골이 드러나 목이 길어 "
             "보인다. 브이넥은 파는 방향이 반대라 따로 뒀다.",
     "rules": {"kw_title": ["스퀘어넥", "스퀘어 넥", "보트넥", "보트 넥"],
               "review_count": {"gte": 30}},
     "cond_labels": ["스퀘어·보트넥", "후기 30개 이상"]},

    {"key": "v_neck",
     "title": "라운드넥이 답답할 때 고르는 브이넥",
     "lede": "목선을 V자로 판 컷. 라운드넥보다 목이 트이고 얼굴이 길어 보인다. 깊이가 "
             "상품마다 크게 달라 상세컷으로 어디까지 파였는지 봐야 한다.",
     "rules": {"kw_title": ["브이넥", "v넥", "v-neck"], "review_count": {"gte": 30}},
     "cond_labels": ["브이넥", "후기 30개 이상"]},

    {"key": "embroidery",
     "title": "프린트가 아니라 실로 박은 자수",
     "lede": "그림을 인쇄한 게 아니라 실로 박은 것. 세탁해도 갈라지거나 벗겨지지 않는다. "
             "대신 뒷면에 자수 실이 닿아 살에 배기는 경우가 있다.",
     "rules": {"kw_title": ["자수", "엠브로", "embroider"], "review_count": {"gte": 30}},
     "cond_labels": ["자수 디테일", "후기 30개 이상"]},

    {"key": "rib_knit",
     "title": "세로로 골이 진 골지 반팔",
     "lede": "원단에 세로 골이 잡혀 몸에 감기듯 붙는다. 늘어나는 폭이 커서 사이즈를 덜 타지만 "
             "몸선이 그대로 드러난다. 올해 신상 비중이 높은 축이다.",
     "rules": {"kw_title": ["골지", "리브드"], "review_count": {"gte": 30}},
     "cond_labels": ["골지·리브 조직", "후기 30개 이상"]},

    {"key": "pastel_tone",
     "title": "채도를 낮춘 파스텔 반팔",
     "lede": "라벤더·민트·피치처럼 색을 연하게 뺀 것들. 흰 티는 비치고 검정은 더워 보일 때 "
             "중간이 된다. 색이 옅어서 땀자국과 이염이 그대로 드러나는 건 감수해야 한다.",
     "rules": {"kw_title": ["파스텔", "라벤더", "민트", "피치", "코랄"],
               "review_count": {"gte": 30}},
     "cond_labels": ["파스텔 톤", "후기 30개 이상"]},

    {"key": "lettering",
     "title": "그림 없이 글자만으로 가는 티",
     "lede": "그래픽 대신 문장이나 단어만 크게 박은 것. 무지는 심심하고 캐릭터는 부담스러울 때 "
             "중간이 된다. 영문 문구는 뜻을 한 번 확인하는 게 좋다.",
     "rules": {"kw_title": ["레터링", "타이포", "슬로건"], "review_count": {"gte": 30}},
     "cond_labels": ["레터링·타이포", "후기 30개 이상"]},

    {"key": "pocket_tee",
     "title": "가슴에 주머니 하나 달린 포켓티",
     "lede": "왼쪽 가슴에 주머니를 단 기본형. 무지인데 포인트가 하나 생긴다. 뭘 넣으면 원단이 "
             "처지므로 장식으로 보는 게 맞다. 포켓몬은 다른 옷이라 뺐다.",
     "rules": {"kw_title": ["포켓"], "not_kw": ["포켓몬"], "review_count": {"gte": 30}},
     "cond_labels": ["가슴 포켓", "포켓몬 제외", "후기 30개 이상"]},

    {"key": "cooling_fabric",
     "title": "원단부터 시원하라고 만든 냉감 반팔",
     "lede": "냉감·쿨맥스처럼 열을 빼도록 짠 원단을 쓴 것. 그냥 얇아서 시원한 것과는 방식이 "
             "다르다. 올해 신상 비중이 평균보다 높은 축이다.",
     "rules": {"kw_title": ["냉감", "쿨링", "쿨맥스", "coolmax", "아이스"],
               "review_count": {"gte": 30}},
     "cond_labels": ["냉감 원단", "후기 30개 이상"]},

    {"key": "mesh_sheer",
     "title": "구멍이 뚫려 비치는 메쉬·시스루",
     "lede": "원단에 구멍을 내거나 얇게 짜 살이 비치는 컷. 단독보다 안에 받쳐 입는 걸 전제로 "
             "나온다. 비침 정도가 상품마다 크게 달라 후기를 보는 게 빠르다.",
     "rules": {"kw_title": ["메쉬", "메시", "시스루", "펀칭"], "review_count": {"gte": 30}},
     "cond_labels": ["메쉬·시스루", "후기 30개 이상"]},

    {"key": "color_block",
     "title": "색 두세 개를 면으로 나눠 붙인 배색",
     "lede": "몸판과 소매, 또는 위아래를 다른 색으로 자른 것. 프린트 없이 색만으로 무늬를 "
             "만든다. 올해 신상 비중이 평균보다 높은 축이다.",
     "rules": {"kw_title": ["배색", "컬러블록", "블로킹"], "review_count": {"gte": 30}},
     "cond_labels": ["배색·컬러블록", "후기 30개 이상"]},

    {"key": "art_print",
     "title": "명화나 일러스트를 그대로 얹은 티",
     "lede": "로고도 캐릭터도 아니고 그림 한 장을 크게 넣은 것. 인쇄 면적이 넓어서 뒤집어 "
             "빨지 않으면 갈라진다.",
     "rules": {"kw_title": ["아트", "명화", "페인팅", "일러스트"], "review_count": {"gte": 30}},
     "cond_labels": ["아트·명화 프린트", "후기 30개 이상"]},

    {"key": "red_only",
     "title": "빨강 하나로만 이뤄진 반팔",
     "lede": "다른 색을 섞지 않고 빨강만 쓴 상품. 이 한 벌이 코디를 정해버려서 나머지를 "
             "검정이나 데님으로 맞추게 된다. 초기 세탁에서 이염이 잘 나는 색이라 따로 빤다.",
     "rules": {"color_only": ["레드"], "review_count": {"gte": 30}},
     "cond_labels": ["레드 단독", "후기 30개 이상"]},

    {"key": "bear_bunny",
     "title": "곰이나 토끼가 박힌 티",
     "lede": "강아지·고양이 다음으로 많은 동물. 캐릭터보다 그림에 가까워 나이대를 덜 탄다.",
     "rules": {"kw_title": ["곰", "베어", "토끼", "래빗", "버니"], "review_count": {"gte": 30}},
     "cond_labels": ["곰·토끼 그래픽", "후기 30개 이상"]},

    # ── 브랜드 축 51~54 (2026-08-20) ──────────────────────────────
    # 태그가 아니라 "누가 냈는가"로 본 축. 26SS 신상을 브랜드별로 세었더니 성별로
    # 갈렸다 — 남성은 아웃도어·스포츠 브랜드가 대거 진입(디스커버리 35배, 언더아머
    # 신규 200개), 여성은 SPA·온라인 여성 브랜드(미쏘 133배, 이스케이프프롬 33배).
    # ⚠️ 카드 게이트(구매 100+ · 후기 30+)를 26SS 신상은 거의 못 넘는다. 아웃도어는
    # 26SS 통과가 0건이다 — 공급만 들어오고 수요는 아직 없다는 뜻. 그래서 이 넷의
    # 카드는 "그 브랜드의 검증된 상품"이지 "그 브랜드의 신상"이 아니다.
    # 네 키를 N_GATED에 넣어 표시 건수도 게이트 기준으로 맞췄다.
    {"key": "outdoor_brand",
     "title": "산에 안 가도 입는 아웃도어 브랜드 티",
     "lede": "등산·캠핑 브랜드가 만든 반팔. 기능성 원단이라 땀이 빨리 마르고 로고가 작아 "
             "산이 아닌 데서도 티가 덜 난다. 값은 일반 티보다 높은 편이다.",
     "rules": {"brand": {"any": ["discoveryexpedition", "snowpeakapparel", "k2", "blackyak",
                                 "eider", "nepa", "kolonsport", "thenorthface", "patagonia",
                                 "salomon", "spyder", "jeep", "nationalgeographic"]}},
     "cond_labels": ["아웃도어 브랜드", "구매 100개·후기 30개 이상"]},

    {"key": "sports_brand",
     "title": "운동복 브랜드 티인데 운동은 안 할 때",
     "lede": "스포츠 브랜드가 낸 반팔. 흡한속건 원단이 기본이라 여름에 유리하고 로고 하나로 "
             "코디가 끝난다. 러닝 전용으로 나온 것은 따로 있다.",
     "rules": {"brand": {"any": ["underarmour", "adidas", "newbalance", "diadora",
                                 "dynafit", "nba", "sergiotacchini"]}},
     "cond_labels": ["스포츠 브랜드", "구매 100개·후기 30개 이상"]},

    {"key": "spa_brand",
     "title": "SPA가 올여름 대량으로 민 것",
     "lede": "스파오·미쏘·에잇세컨즈·탑텐이 낸 반팔. 값이 싸고 물량이 많아 실패해도 부담이 "
             "적다. 대신 같은 옷을 입은 사람을 만날 확률도 그만큼 높다.",
     "rules": {"brand": {"any": ["spao", "mixxo", "8seconds", "topten"]}},
     "cond_labels": ["SPA 브랜드", "구매 100개·후기 30개 이상"]},

    {"key": "women_online_brand",
     "title": "온라인 여성 브랜드가 먼저 내는 실루엣",
     "lede": "이스케이프프롬·페이지시시·일리고처럼 온라인에서 큰 여성 브랜드들. 크롭·오프숄더· "
             "셔링 같은 실루엣을 가장 먼저 내놓는 쪽이라 지금 뭐가 오는지 보기에 좋다.",
     "rules": {"brand": {"any": ["escapefrom", "pagesiisii", "illigo", "drawfitwomen",
                                 "deinet", "themorfhouse", "amesworldwide", "comieu"]}},
     "cond_labels": ["온라인 여성 브랜드", "구매 100개·후기 30개 이상"]},

    # ── 신상 축 55~57 (2026-08-20) ────────────────────────────────
    # 기본 게이트를 푼 큐레이션. CARD_RULE 에 (0, 0, 조회순) 으로 등록돼 있다.
    # 검증된 것이 아니라 "지금 막 들어온 것"을 보여주는 게 목적이라 후기가 없는 게 정상이다.
    {"key": "new_arrival_watch",
     "title": "후기는 아직 없는데 사람들이 보고 있는 신상",
     "lede": "이번 시즌에 나왔고 후기가 아직 한 줄도 없는데 조회는 1,000회를 넘긴 것들. "
             "후기는 사서 입어보고 쓰기까지 몇 주가 걸리니 늘 늦다. 그 사이의 관심만 먼저 "
             "잡은 목록이라, 검증된 물건이 아니라 지금 눈길이 몰리는 물건이다.",
     "rules": {"season_year": {"eq": "2026"}, "review_count": {"lte": 0},
               "page_view": {"gte": 1000}},
     "cond_labels": ["26SS 신상", "후기 0", "조회 1,000회 이상"]},

    {"key": "outdoor_new",
     "title": "아웃도어 브랜드가 올여름 통째로 깔아둔 것",
     "lede": "디스커버리·스노우피크·케이투 같은 등산·캠핑 브랜드가 이번 시즌 반팔을 대량으로 "
             "냈다. 아직 구매 100개를 넘긴 신상이 하나도 없을 만큼 반응은 시작 전이다. "
             "브랜드가 먼저 움직인 자리라 지금 보는 게 가장 이르다.",
     "rules": {"brand": {"any": ["discoveryexpedition", "snowpeakapparel", "k2", "blackyak",
                                 "eider", "nepa", "kolonsport", "thenorthface", "patagonia",
                                 "salomon", "spyder"]},
               "season_year": {"eq": "2026"}, "review_count": {"lte": 5}},
     "cond_labels": ["아웃도어 브랜드", "26SS 신상", "후기 5개 이하"]},

    {"key": "women_online_new",
     "title": "온라인 여성 브랜드가 이번 시즌 새로 낸 것",
     "lede": "이스케이프프롬·페이지시시·일리고가 26SS에 낸 반팔. 크롭·오프숄더·셔링 같은 "
             "실루엣을 가장 먼저 내놓는 쪽이라, 다음 시즌에 흔해질 모양이 여기 먼저 나온다.",
     "rules": {"brand": {"any": ["escapefrom", "pagesiisii", "illigo", "drawfitwomen",
                                 "deinet", "themorfhouse", "amesworldwide", "comieu"]},
               "season_year": {"eq": "2026"}, "review_count": {"lte": 5}},
     "cond_labels": ["온라인 여성 브랜드", "26SS 신상", "후기 5개 이하"]},
]

# ── 손으로 쓰는 상품 한마디 (goods_no: 글) ────────────────────
# 한 상품이라도 채우면 그 큐레이션 상세는 2열 그리드 대신 1열 매거진으로 바뀐다.
NOTES = {
    "4874594": "목과 소매 끝단만 남색으로 두른 기본형. 링거를 처음 사는 사람이 제일 많이 고르는 쪽이다.",
    "6197077": "가슴에 아치형 레터링이 크게 들어간다. 링거에 빈티지 워싱까지 겹쳐서 새 옷 티가 덜 난다.",
    "3182421": "링거가 아니라 래글런. 어깨에서 소매로 넘어가는 선이 곡선이라 팔이 좁아 보인다.",
}


CARD_COLS = ("goods_no, title, brand_name, brand, price_final, thumbnail, "
             "review_count, review_score, purchase_total, tags, similar_no, gender")


def connect():
    url = re.search(r"^SUPABASE_DB_URL=(.+)$", ENV.read_text(encoding="utf-8"), re.M)
    return psycopg.connect(url.group(1).strip().strip("\"'"))


def seed(cur):
    cur.execute("delete from curations")
    for i, c in enumerate(SEED, 1):          # ord = SEED 리스트 순서
        # created_at = 적재 시각. 예전엔 손으로 적은 날짜를 넣어 주간 연재처럼 보이게 했다.
        cur.execute(
            "insert into curations (key,title,lede,rules,cond_labels,ord,created_at) "
            "values (%s,%s,%s,%s,%s,%s,now())",
            (c["key"], c["title"], c["lede"], json.dumps(c["rules"], ensure_ascii=False),
             c["cond_labels"], i))
    print(f"curations {len(SEED)}건 적재 완료")


def load(cur):
    cur.execute("select key,title,lede,rules,cond_labels,created_at "
                "from curations where active order by ord")
    rows = [dict(zip(("key", "title", "lede", "rules", "cond", "at"), r))
            for r in cur.fetchall()]
    if not rows:
        sys.exit("curations 테이블이 비었다. --seed 를 먼저 실행해라.")
    return rows


def strip_variant(title):
    """상품명에서 색상·팩 수 같은 옵션 표기를 지운다. 색만 다른 옷을 한 옷으로 묶는 열쇠."""
    t = re.sub(r"\[[^\]]*\]|\([^)]*\)", " ", title)
    t = re.sub(r"[_\-]\s*\d*\s*(color|컬러|colors)\b", " ", t, flags=re.I)
    return re.sub(r"\s+", " ", t).strip().lower()


def dedupe_variants(rows, limit, appear=None):
    """같은 옷 색상만 다른 것(similar_no 공유)은 앞선 하나만 남기고 다음 순위로 채운다.

    similar_no = 0 은 묶음이 없다는 뜻이라, 그때는 브랜드 + 색상 표기를 지운
    상품명으로 묶는다 ("... 티셔츠 [블랙]" 과 "... 티셔츠 (화이트)" 는 한 옷이다).
    rows 는 CARD_COLS 순서(0=goods_no, 10=similar_no)를 전제한다.

    appear 를 넘기면 큐레이션을 가로질러 같은 상품이 MAX_APPEAR 개를 넘게
    나오지 않도록 막는다. 겹침 자체는 정상이다 — 링거이면서 크롭인 티는 둘 다
    맞다. 다만 리뷰 조건만 있는 큐레이션("안 덥다", "정사이즈")은 생김새를 안 봐서
    좋은 상품을 전부 빨아들인다. 그래서 상한만 둔다.
    """
    seen, out = set(), []
    for r in rows:
        ks = {("t", r[2] or r[3], strip_variant(r[1]))}
        if r[10]:
            ks.add(("s", r[10]))
        if ks & seen or (appear is not None and appear.get(r[0], 0) >= MAX_APPEAR):
            continue
        seen |= ks; out.append(r)
        if appear is not None:
            appear[r[0]] = appear.get(r[0], 0) + 1
        if len(out) == limit:
            break
    return out


def build(cur, curations):
    out, appear = [], {}   # appear: 상품이 지금까지 몇 개 큐레이션에 들어갔나
    covers = set()         # 목록 카드에 쓰인 첫 상품. 카드 썸네일이 겹치면 안 된다
    for c in curations:
        where, params = compile_rules(c["rules"])
        min_buy, min_rev, order = CARD_RULE.get(c["key"], (MIN_BUY, MIN_REVIEW, ORDER))
        gate = (f" and purchase_total >= {min_buy} and review_count >= {min_rev}"
                if c["key"] in N_GATED else "")
        cur.execute(f"select count(*) from c_goods where {BASE_SCOPE} and {where}{gate}", params)
        n = cur.fetchone()[0]
        cur.execute(f"""select {CARD_COLS} from c_goods where {BASE_SCOPE} and {where}
                        and purchase_total >= {min_buy} and review_count >= {min_rev}
                        order by {order} limit {TOP_N * 5}""", params)
        rows = dedupe_variants(cur.fetchall(), TOP_N, appear)
        # g(성별)는 화면에서 "내 성별 것만" 거르는 데 쓴다
        # (계획 2026-08-21-curation-gender-filter). 빈 값은 안 싣는다 — 미상은 안 거른다.
        items = [{"t": r[1], "b": r[2] or r[3], "p": r[4], "img": r[5],
                  "rc": r[6] or 0, "rs": r[7], "buy": r[8] or 0,
                  "u": f"https://www.musinsa.com/products/{r[0]}",
                  "tg": [t for t in (r[9] or []) if 1 < len(t) <= 7][:3],
                  **({"g": r[11]} if r[11] else {}),
                  "note": NOTES.get(str(r[0]), "")} for r in rows]
        # 목록 카드는 첫 상품 이미지를 쓴다. 앞선 큐레이션이 이미 쓴 상품이면 뺀다
        # (9개를 채우려고 다음 순위를 끌어오지 않는다 — 사람 결정 2026-08-20).
        while items and items[0]["u"] in covers:
            items.pop(0)
        if items:
            covers.add(items[0]["u"])
        out.append({**{k: c[k] for k in ("key", "title", "cond")},
                    "lede": c["lede"] or "", "n": n, "items": items,
                    "sort": "조회순" if order == NEW_ARRIVAL_ORDER else "평점순",
                    "date": c["at"].strftime("%Y.%m.%d")})
    return out


CSS = """
:root{--ink:#0a0a0a;--paper:#fff;--line:#0a0a0a;--mute:#8c8c8c;--blue:#1f43d8;
      --sans:'Helvetica Neue','Apple SD Gothic Neo',sans-serif;
      --mono:ui-monospace,'SF Mono',Menlo,monospace}
*{box-sizing:border-box}
body{margin:0;background:#c8c8c4;font-family:var(--sans);color:var(--ink);
     display:flex;justify-content:center;padding:28px 12px}
.phone{width:390px;height:800px;background:var(--paper);overflow:hidden;
       display:flex;flex-direction:column;border:1px solid var(--line)}
:focus-visible{outline:2px solid var(--ink);outline-offset:1px}

.top{flex-shrink:0;border-bottom:1px solid var(--line);overflow:hidden;
     transition:height .18s ease,border-bottom-width .18s ease}
.top.hide{height:0!important;border-bottom-width:0}
.logo{font-size:27px;font-weight:900;letter-spacing:-.095em;line-height:1;color:#777;
      -webkit-text-stroke:.6px currentColor;height:32px;display:flex;align-items:center;
      padding:0 14px;border-bottom:1px solid #dcdcdc}
.tabs{display:flex}
.tab{flex:1;font-size:12.5px;letter-spacing:.01em;line-height:1;text-transform:uppercase;
     color:#c4c4c4;background:none;border:0;padding:9px 0 7px;font-family:inherit;cursor:pointer;
     border-bottom:2px solid transparent;margin-bottom:-1px}
.tab.on{color:var(--ink);border-bottom-color:var(--ink)}
@media(prefers-reduced-motion:reduce){.top{transition:none}}

.body{flex:1;overflow-y:auto;overscroll-behavior:contain}
.body::-webkit-scrollbar{display:none}
.screen{display:none}.screen.on{display:block}

.cur{border-bottom:1px solid var(--line);padding:16px 0 18px;cursor:pointer;width:100%;
     background:none;border-left:0;border-right:0;border-top:0;text-align:left;
     font-family:inherit;color:inherit;display:block}
.strip{display:flex;gap:1px;background:var(--line);border-top:1px solid var(--line);
       border-bottom:1px solid var(--line);margin-bottom:12px}
.strip img{flex:1;width:25%;aspect-ratio:1/1;object-fit:cover;background:#eee;display:block}
.curhd{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:0 14px}
.curhd h2{font-size:21px;font-weight:800;letter-spacing:-.042em;line-height:1.2;margin:0}
.lede{font-size:12.5px;line-height:1.7;color:#4a4a4a;letter-spacing:-.012em;
      padding:9px 14px 0;margin:0}
.cond{display:flex;flex-wrap:wrap;gap:4px;padding:11px 14px 0}
.cd{background:#ececec;color:#4a4a4a;font-family:var(--mono);font-size:11px;letter-spacing:.02em;padding:3px 7px}

.back{display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;
      border-bottom:1px solid var(--line);padding:9px 14px;cursor:pointer;font-family:var(--mono);
      font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink);text-align:left}
.dethd{padding:16px 14px 0}
.dethd h2{font-size:24px;font-weight:800;letter-spacing:-.045em;line-height:1.22;margin:0}
.detmeta{font-family:var(--mono);font-size:9.5px;color:var(--mute);letter-spacing:.06em;
         padding:12px 14px 14px}
.pgrid{display:grid;gap:1px;background:var(--line);border-top:1px solid var(--line)}
.item{background:var(--paper);padding-bottom:18px;text-decoration:none;color:inherit;display:block}
.item img{width:100%;aspect-ratio:1/1;object-fit:cover;background:#eee;display:block}
.item>:not(img){padding-left:14px;padding-right:14px}
.item .b{font-size:11px;letter-spacing:.02em;padding-top:10px}
.item .t{font-size:15px;font-weight:700;color:var(--blue);line-height:1.3;padding-top:1px;
         display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.item .p{font-family:var(--mono);font-size:11px}
.item .note{font-size:12.5px;line-height:1.75;color:#3a3a3a;letter-spacing:-.012em;padding-top:7px}
.item .ckw{display:flex;align-items:center;gap:9px;padding-top:12px}
.ck{display:inline-block;background:#c0c0c0;color:#0a0a0a;font-family:var(--mono);
    font-size:9px;letter-spacing:.11em;padding:5px 13px;
    box-shadow:inset -1px -1px #0a0a0a,inset 1px 1px #fff,
               inset -2px -2px #808080,inset 2px 2px #dfdfdf}
.item:active .ck{box-shadow:inset -1px -1px #fff,inset 1px 1px #0a0a0a,
                            inset -2px -2px #dfdfdf,inset 2px 2px #808080}
.pgrid.long{grid-template-columns:1fr}
.pgrid.long .item>:not(img){padding-left:14px;padding-right:14px}
.pgrid.long .item .t{font-size:15px;font-weight:700;-webkit-line-clamp:2}

.bottom{flex-shrink:0;display:flex;border-top:1px solid var(--line)}
.bt{flex:1;text-align:center;padding:13px 0 20px;font-family:var(--mono);font-size:9px;
    letter-spacing:.09em;color:var(--mute);text-transform:uppercase;border-right:1px solid var(--line)}
.bt:last-child{border-right:0}
.bt.on{color:var(--ink)}
"""

JS = r"""
const DATA = __DATA__;
const $ = s => document.querySelector(s);
const won = n => (n||0).toLocaleString('ko-KR');
const ERR = 'this.style.background="#eee";this.removeAttribute("src")';
const img = u => `<img src="${u}" alt="" loading=lazy onerror='${ERR}'>`;

const VIEWS = {
 feed: () => DATA.map((c,i)=>`<button class=cur data-i="${i}">
    <div class=strip>${c.items.slice(0,4).map(x=>img(x.img)).join('')}</div>
    <div class=curhd><h2>${c.title}</h2></div>
    <p class=lede>${c.lede}</p>
    <div class=cond>${c.cond.map(t=>`<span class=cd>${t}</span>`).join('')}</div>
  </button>`).join('')
};

function render(v){
  $('#list').innerHTML = VIEWS[v]();
  $('#list').querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>openDetail(DATA[b.dataset.i]));
}

function openDetail(c){
  $('#detail').innerHTML = `
    <button class=back id=goback>← 큐레이션</button>
    <div class=dethd><h2>${c.title}</h2></div>
    <p class=lede>${c.lede}</p>
    <div class=cond>${c.cond.map(t=>`<span class=cd>${t}</span>`).join('')}</div>
    <div class=detmeta>${c.date} · ${won(c.n)}건 중 ${c.sort} ${c.items.length}건</div>
    <div class=pgrid>${c.items.map(x=>`<a class=item href="${x.u}" target=_blank rel=noopener>
      ${img(x.img)}
      <div class=b>${x.b}</div><div class=t>${x.t}</div>
      ${x.note?`<p class=note>${x.note}</p>`:''}
      <div class=ckw><span class=p>${won(x.p)}원</span><span class=ck>CHECKOUT</span></div>
    </a>`).join('')}</div>`;
  $('#goback').onclick = () => show('curlist');
  show('detail');
}

function show(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('on', s.id===id));
  $('.body').scrollTop = 0;
}

render('feed');

// 내리면 상단 접힘, 올리면 나옴 (top은 window.top과 겹쳐서 bar로)
const scroller = $('.body'), bar = $('.top');
bar.style.height = bar.offsetHeight + 'px';
let last = 0;
scroller.onscroll = () => {
  const y = scroller.scrollTop;
  bar.classList.toggle('hide', y > 60 && y > last);
  last = y;
};
"""

PAGE = """<!doctype html><html lang=ko><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>큐레이션 화면 목업</title><style>%s</style></head><body>
<div class=phone>
  <div class=top>
    <div class=logo>EaTie</div>
    <div class=tabs><button class=tab>Browse</button><button class="tab on">For You</button></div>
  </div>
  <div class=body>
    <div class="screen on" id=curlist>
      <div id=list></div>
    </div>
    <div class=screen id=detail></div>
  </div>
  <div class=bottom>
    <div class="bt on">Home</div><div class=bt>Search</div><div class=bt>Saved</div>
    <div class=bt>Shop</div><div class=bt>Me</div>
  </div>
</div>
<script>%s</script></body></html>
"""


def demo():
    """자체 점검: 규칙이 의도한 SQL로 번역되는지."""
    # 색만 다른 옷은 similar_no가 0이어도 한 옷으로 묶인다 (r = CARD_COLS 순서)
    def row(no, title, brand, sim=0):
        return (no, title, brand, brand, 0, "", 0, 0, 0, [], sim, "남성")
    picked = dedupe_variants([row(1, "포켓 티셔츠 (그레이)", "노이어"),
                              row(2, "포켓 티셔츠 (블루)", "노이어"),
                              row(3, "포켓 티셔츠 [블랙]", "다른브랜드"),
                              row(4, "소로나 크롭 - 3COLOR", "테이크이지"),
                              row(5, "소로나 크롭", "테이크이지")], 9)
    assert [r[0] for r in picked] == [1, 3, 4], picked

    w, p = compile_rules({"kw": ["래글런"]})
    assert "title ilike %s" in w and "unnest(tags)" in w, w
    assert p == ["%래글런%", "%래글런%"], p

    w, p = compile_rules({"color": ["화이트"]})
    assert w == "color_codes && %s" and p == [["1"]], (w, p)

    w, p = compile_rules({"sheer": {"any": ["없음"]}})
    assert w == "string_to_array(sheer, ',') && %s", w   # 콤마 이어붙은 값 대응

    w, p = compile_rules({"price_final": {"lte": 30000}})
    assert w == "price_final <= %s" and p == [30000], (w, p)

    w, _ = compile_rules({"season_year": {"eq": "2026"}, "kw": ["그래픽"]})
    assert " and " in w, w

    # 설문 미기재(NULL)가 not_any에서 조용히 탈락하면 안 된다
    w, p = compile_rules({"thickness": {"not_any": ["얇음"]}})
    assert w.startswith("coalesce(not (") and w.endswith(", true)"), w
    assert p == [["얇음"]], p

    # 요약이 없는 상품이 "불만 없음"으로 새어 나오면 안 된다
    w, p = compile_rules({"neg_free": ["비침"]})
    assert "ai_summary is not null" in w and w.count("not (") == 1, w
    assert p == [["%비침%"]], p

    # 치수 표 통로: goods_no로 상관 서브쿼리를 걸고, 파라미터 순서가 조건 순서와 맞아야 한다
    w, p = compile_rules({"fit_m": {"pop": {"eq": "여성"},
                                    "shoulder_band": {"any": ["좁은 어깨", "정어깨"]},
                                    "length_pct": {"lte": 0.35}}})
    assert w == ("exists (select 1 from c_search_fit_measures m "
                 "where m.goods_no = c_goods.goods_no and m.pop = %s "
                 "and m.shoulder_band = any(%s) and m.length_pct <= %s)"), w
    assert p == ["여성", ["좁은 어깨", "정어깨"], 0.35], p

    try:
        compile_rules({"fit_m": {"shoulder_pct; drop table c_goods": {"eq": 1}}})
        raise AssertionError("치수 컬럼 검증이 안 걸렸다")
    except ValueError:
        pass

    try:
        compile_rules({"price; drop table c_goods": {"eq": 1}})
        raise AssertionError("컬럼명 검증이 안 걸렸다")
    except ValueError:
        pass
    print("demo ok")


def main():
    with connect() as conn, conn.cursor() as cur:
        if "--seed" in sys.argv:
            seed(cur)
            conn.commit()
            return
        data = build(cur, load(cur))
    js = JS.replace("__DATA__", json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    OUT.write_text(PAGE % (CSS, js), encoding="utf-8")
    payload = json.dumps(data, ensure_ascii=False, indent=1) + "\n"
    for out in JSON_OUTS:
        # 두 앱 중 한쪽만 체크아웃된 상태에서도 돌아야 한다.
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(payload, encoding="utf-8")
    for c in data:
        print(f"{c['n']:>7,}건  {c['title']}")
    print("\n".join(f"→ {p}" for p in [OUT, *JSON_OUTS]))


if __name__ == "__main__":
    demo() if "--demo" in sys.argv else main()
