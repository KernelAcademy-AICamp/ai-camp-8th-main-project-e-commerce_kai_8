"""기준선 후보 풀 생성 — 현재 검색으로 전 질의의 상위 결과를 모은다.

계획: docs/plans/2026-08-17-search-eval-harness.md 4단계

풀링(설계 §8.2): 22.6만 상품을 전수 판정할 수 없으므로, 비교 대상 시스템들의
상위 결과만 모아 그 풀을 판정하고 이후 단계에서 재사용한다. 0단계의 첫 풀은
현재 검색(c_search_page) 결과만으로 만들어진다.

⚠️ 미판정 처리 규칙은 **기준선을 재기 전에** 못박는다(2차 리뷰 Major 8).
나중에 정하면 신규 시스템에 유리하거나 불리하게 고르게 된다. 규칙은 아래
UNJUDGED_POLICY 상수와 산출물 meta에 함께 박아 둔다.

실행:
  python backend/eval/build_pool.py            # 풀 생성 (DB 조회)
  python backend/eval/build_pool.py --summary  # 기존 산출물 요약만
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVAL_DIR = ROOT / "docs" / "atee" / "eval"
SET_PATH = EVAL_DIR / "query-set.json"
OUT_PATH = EVAL_DIR / "pool-baseline.json"

# 시스템 구현이 바뀐 시점. 같은 이름의 산출물을 비교할 때 이것을 먼저 본다.
SYSTEM_CHANGELOG = {
    "baseline": [
        "2026-08-17: 서버 표기 폴백(자판 복원·오타 교정) 추가 — 커밋된 "
        "pool-baseline.json은 이 변경 이전 측정이라 재현되지 않는다",
        "2026-08-17: 반환에 query_used 추가, 폴백은 첫 페이지에서만 결정",
    ],
    "a": [
        "2026-08-17: is_tee를 hard filter에서 순위 감점으로",
        "2026-08-17: 서버 표기 폴백 추가, query_used 반환",
        "2026-08-17: 오타 교정을 브랜드 사전 + 자모 거리로 좁힘",
        "2026-08-17: 폴백을 첫 페이지에서만 결정 (이후 페이지는 query_used로 이어간다)",
        "2026-08-17 C-1: 티셔츠 판정을 제목 정규식에서 카테고리 순위로",
        "2026-08-17 C-2: 색 표현을 텍스트에서 빼내 색 라벨 필터로 (브랜드명 보호 포함)",
        "2026-08-17 C-3: 가격 표현을 텍스트에서 빼내 가격 범위 필터로",
        "2026-08-17 C-3 리뷰 반영: `미만` 경계·숫자 상한·5단어 절단 순서·"
        "단어 단위 자판 복원·역할어 조사 허용",
        "2026-08-18 소프트 텍스트: 브랜드·카테고리를 하드 조건으로 빼내고, 제목 "
        "단어를 전 단어 AND에서 '하드 조건이 있으면 순위 신호'로 바꿈. G6 100%→40% "
        "(waiver, 기준서 §1-1). AND 먼저 시도 후 부족할 때만 OR로 넓힘.",
        "2026-08-17 C-3 리뷰 2차: 프론트·하네스의 선행 5단어 절단 제거, "
        "자판 복원을 네 글자 이상으로 제한(xl→티 변질 차단), "
        "오타 교정이 5단어로 자르던 것 제거(6번째 이후 조건 삭제 차단)",
    ],
}

TOP_N = 20  # 판정 대상 상위 개수 — P@20·nDCG@20의 K와 같게 맞춘다

# 검색 RPC가 성별을 필수로 받는다(2026-08-22, 설정 성별 토글 계획 7단계).
# **기본값을 두지 않는다.** 한 성별을 임의로 박아 두면, 전체 성별로 만든 옛 풀과
# 말없이 비교하게 되어 개선인지 회귀인지 알 수 없다. 부를 때 명시하게 하고 산출물
# 메타에 남긴다 — 성별이 다른 풀끼리는 비교하지 않는다.
GENDER_CHOICES = ("남성", "여성")
GENDER = None  # main()이 채운다
SYSTEMS = {
    "baseline": {
        "name": "baseline-c_search_page",
        # ⚠️ **커밋된 pool-baseline.json은 이제 이 스크립트로 재현되지 않는다.**
        # 기준선(27.8%)은 v1에 표기 폴백이 없던 시점의 측정이고, 2026-08-17부터
        # v1도 서버에서 자판 복원·오타 교정을 한다. 지금 다시 만들면
        # dkelektm·아디다드가 0건이 아니게 된다. A단계 개선폭을 말할 때
        # "같은 시스템 비교"가 아님을 기억해야 한다(SYSTEM_CHANGELOG 참고).
        "sql": (
            "select r.goods_no, r.title, r.brand_name, r.price_final, r.gender, r.query_used,"
            " (select string_agg(cg.name_ko, '/' order by cg.code) from c_color_groups cg"
            "   where cg.code = any(g.color_codes)) as color_label,"
            " g.category"
            " from c_search_page(%s, null, %s, %s) with ordinality as r("
            "   goods_no, title, brand_name, price_final, thumbnail, gender, gallery,"
            "   width, height, query_used, ord)"
            " join c_goods g using (goods_no) order by r.ord"
        ),
        "args": lambda q, n: (q, n, GENDER),
    },
    # LLM 해석(부정·의도)을 얹은 경로. `a`와 같은 RPC를 부르되 질의 해석 결과를
    # 함께 넘긴다 — 해석은 라우트 핸들러가 주므로 이 시스템은 dev 서버가 떠 있어야 한다.
    "a-llm": {
        "name": "a-llm-query-plan",
        "sql": (
            "select r.goods_no, r.title, r.brand_name, r.price_final, r.gender, r.query_used,"
            " (select string_agg(cg.name_ko, '/' order by cg.code) from c_color_groups cg"
            "   where cg.code = any(g.color_codes)) as color_label,"
            " g.category"
            " from c_search_page_v2(%s, null, null, %s, %s::text[], %s::text[], %s)"
            " with ordinality as r("
            "   goods_no, title, brand_name, price_final, gender, gallery, thumbnail,"
            "   width, height, score, query_used, ord)"
            " join c_goods g using (goods_no) order by r.ord"
        ),
        "args": None,   # build()가 해석을 붙여 만든다
    },
    "a": {
        "name": "a-c_search_page_v2-pgroonga-bigram",
        "sql": (
            # 색 라벨·카테고리를 함께 가져온다. 검색이 이 값들로 거르고 순위를
            # 매기는데 채점자에게 안 보여 주면 **측정 장치가 측정 대상을 못 본다** —
            # 실제로 색 라벨이 검정인 상품들이 제목에 '검정'이 없다는 이유로
            # 등급 1을 받아, 색 필터 도입이 개선인지 회귀인지 알 수 없었다.
            # ⚠️ `with ordinality` + `order by ord`가 **필수**다. 조인은 함수가 낸
            # 순서를 보존하지 않는다. 처음에 빠뜨렸더니 풀의 순위가 뒤섞여
            # 순위에 민감한 P@20·nDCG가 조용히 달라졌다(ㅋㅂㄴ 0.95 → 0.80).
            "select r.goods_no, r.title, r.brand_name, r.price_final, r.gender, r.query_used,"
            " (select string_agg(cg.name_ko, '/' order by cg.code) from c_color_groups cg"
            "   where cg.code = any(g.color_codes)) as color_label,"
            " g.category"
            " from c_search_page_v2(%s, null, null, %s, null, null, %s) with ordinality as r("
            "   goods_no, title, brand_name, price_final, gender, gallery, thumbnail,"
            "   width, height, score, query_used, ord)"
            " join c_goods g using (goods_no) order by r.ord"
        ),
        "args": lambda q, n: (q, n, GENDER),
    },
}

UNJUDGED_POLICY = {
    "onMissingJudgment": "exclude",
    "why": (
        "미판정 상품을 0으로 세면 새 상품을 찾아오는 신규 시스템이 부당하게 불리해진다"
        "(신규 발견을 벌하는 셈). 지표에서 제외하고, 대신 미판정 비율을 항상 함께 보고해"
        "과대평가를 감시한다."
    ),
    "repoolThreshold": 0.30,
    "repoolRule": (
        "어떤 시스템의 상위 20개 중 미판정이 30%를 넘으면 그 시스템의 결과로 풀을 확장하고"
        "새로 들어온 상품만 블라인드로 추가 채점한다. 기존 판정은 재사용한다."
    ),
}

MAX_QUERY_CHARS = 60


def normalize_query(raw: str) -> str:
    """프론트·서버 공통 정규화와 같은 규칙 (use-search-state.ts normalizeQuery).

    ⚠️ **단어 수는 자르지 않는다.** 예전엔 앞 5단어만 넘겼는데, 그러면 서버가
    문장 뒤의 가격·색 조건을 볼 기회 자체가 없어져 **평가가 그 실패를 숨긴다.**
    서버는 조건을 뽑은 뒤에 텍스트 단어만 5개로 자른다(교차 리뷰 M1).
    """
    words = [w for w in re.split(r"\s+", raw[:MAX_QUERY_CHARS]) if w]
    return " ".join(words)


# 한영 자판 복원·오타 교정은 **서버(c_search_page_v2)에 있다.** 예전엔 여기에
# 파이썬으로 같은 규칙을 한 벌 더 갖고 있었는데, 그러면 평가가 재는 것과 서버가
# 실제로 하는 일이 갈린다 — 실제로 RPC 직접 호출은 `zjqjskt`가 0건이었는데
# 평가는 30건으로 재고 있었다(2026-08-17). 미러를 지우고 서버 결과를 그대로 쓴다.


def load_db_url() -> str:
    env_path = ROOT / "backend" / ".env.local"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("SUPABASE_DB_URL="):
                return line.split("=", 1)[1].strip().strip("'\"")
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        raise SystemExit("SUPABASE_DB_URL이 없습니다 (backend/.env.local 또는 환경변수)")
    return url


def build(system: str) -> dict:  # noqa: C901
    import psycopg

    spec = SYSTEMS[system]

    doc = json.loads(SET_PATH.read_text(encoding="utf-8"))
    entries = doc["entries"]

    results: list[dict] = []
    with psycopg.connect(load_db_url()) as conn:
        with conn.cursor() as cur:
            # 카탈로그 스냅샷 표기 — 판정이 어느 시점 카탈로그 기준인지 남긴다
            cur.execute("select count(*) from c_search_text")
            searchable = cur.fetchone()[0]
            cur.execute("select count(*) from c_goods")
            goods = cur.fetchone()[0]
            # 시스템이 실제로 의존하는 객체를 함께 남긴다. c_search_text 행 수만
            # 적어 두면 A 시스템 결과는 재현할 수 없다 — 오타 교정 결과가
            # c_search_vocab 내용에 따라 달라지기 때문이다.
            cur.execute("select to_regclass('c_search_docs')")
            docs_rows = None
            if cur.fetchone()[0] is not None:
                cur.execute("select count(*) from c_search_docs")
                docs_rows = cur.fetchone()[0]
            cur.execute("select to_regclass('c_search_vocab')")
            vocab_rows = None
            if cur.fetchone()[0] is not None:
                cur.execute("select count(*) from c_search_vocab")
                vocab_rows = cur.fetchone()[0]

            for e in entries:
                norm = normalize_query(e["query"])
                if spec["args"] is None:
                    # LLM 해석 경로 — 라우트 핸들러에게 묻고 그 결과를 함께 넘긴다.
                    # 확장어는 질의에 얹어 텍스트 점수로만 쓴다(하드 조건이 아니다).
                    plan = _interpret(norm)
                    # ⚠️ **프론트의 applyExpansion과 같아야 한다.** 질의에 이미 있는
                    # 낱말은 빼고 붙인다. 중복을 붙이면 pgroonga_score가 그 낱말을
                    # 두 번 세어 순위가 달라진다 — 하네스가 제품과 다른 질의를 던지면
                    # 그 측정치는 제품 얘기가 아니다. 실제로 이 누락 때문에
                    # `여성 크롭 스트라이프 반팔`이 `... 여성 크롭`으로 나갔다.
                    have = set(norm.split())
                    expand = [w for w in (plan.get("expand") or []) if w not in have]
                    q = norm + ((" " + " ".join(expand)) if expand else "")
                    cur.execute(
                        spec["sql"],
                        (q, TOP_N, plan.get("exclude") or None,
                         plan.get("exclude_colors") or None, GENDER),
                    )
                else:
                    cur.execute(spec["sql"], spec["args"](norm, TOP_N))
                rows = cur.fetchall()
                # 폴백(자판·오타)은 서버 안에서 일어난다. v1·v2 모두 query_used로
                # 알려주므로 그대로 받는다 — 여기서 다시 계산하면 평가와 서버가
                # 갈린다(예전에 파이썬 사본을 두었다가 실제로 갈렸다).
                used = rows[0][5] if rows else norm
                results.append(
                    {
                        "id": e["id"],
                        "bucket": e["bucket"],
                        "partition": e["partition"],
                        "query": e["query"],
                        "queryNorm": norm,
                        "queryUsed": used,
                        "resultCount": len(rows),
                        "candidates": [
                            {
                                "rank": i,
                                "goodsNo": r[0],
                                "title": r[1],
                                "brandName": r[2],
                                "priceFinal": r[3],
                                "gender": r[4],
                                # 아래 둘은 검색이 실제로 쓰는 값이다
                                "colorLabel": r[6],
                                "category": r[7],
                            }
                            for i, r in enumerate(rows)
                        ],
                    }
                )

    return {
        "meta": {
            "purpose": f"후보 풀 — 시스템 '{spec['name']}'의 상위 {TOP_N}건. 판정 대상이다.",
            "generatedBy": "backend/eval/build_pool.py",
            "system": spec["name"],
            # **어느 성별로 만든 풀인가.** 성별이 다르면 다른 모집단이라 지표를 나란히
            # 놓으면 안 된다. 옛 풀에는 이 값이 없다 — 그것들은 전체 성별 기준이다.
            "gender": GENDER,
            # 같은 이름이라도 구현이 바뀌면 다른 시스템이다. 언제 무엇이 바뀌었는지
            # 산출물 자체에 남긴다 — 주석은 산출물을 따라오지 않는다.
            "systemChangedAt": SYSTEM_CHANGELOG.get(system, []),
            "topN": TOP_N,
            "collectedAt": datetime.now(timezone.utc).isoformat(),
            "catalogSnapshot": {
                "c_goods_rows": goods,
                "c_search_text_rows": searchable,
                "c_search_docs_rows": docs_rows,
                "c_search_vocab_rows": vocab_rows,
                "note": (
                    "카탈로그·사전이 바뀌면 판정이 낡는다 — 재측정 시 이 수치와 비교한다. "
                    "c_search_vocab은 오타 교정 사전이라 여기 결과에 직접 영향을 준다"
                ),
            },
            "unjudgedPolicy": UNJUDGED_POLICY,
            "normalization": (
                f"앞 {MAX_QUERY_CHARS}자 → 공백 분리 (프론트와 동일). "
                "단어 수 제한은 서버가 구조화 조건을 뽑은 뒤 텍스트에만 적용한다"
            ),
        },
        "queries": results,
    }


def summarize(doc: dict) -> None:
    qs = doc["queries"]
    total = len(qs)
    zero = [q for q in qs if q["resultCount"] == 0]

    print(f"질의 {total}건 · 후보 총 {sum(q['resultCount'] for q in qs)}건")
    print(f"0건 질의: {len(zero)}건 ({len(zero) / total:.0%})")
    print()
    print("계열별 0건 비율 (G6은 0건이 정답 — 높을수록 좋다):")
    by_bucket: dict[str, list[dict]] = {}
    for q in qs:
        by_bucket.setdefault(q["bucket"], []).append(q)
    for bucket in sorted(by_bucket):
        items = by_bucket[bucket]
        z = sum(1 for q in items if q["resultCount"] == 0)
        avg = sum(q["resultCount"] for q in items) / len(items)
        flag = "  ← 정답" if bucket == "G6" else ""
        print(
            f"  {bucket}: {len(items):>3}건 중 0건 {z:>2}건 ({z / len(items):>4.0%})"
            f" · 평균 후보 {avg:>4.1f}개{flag}"
        )
    print()
    print("0건이 난 질의 (G6 제외 — 이것이 현재의 실패 목록):")
    for q in zero:
        if q["bucket"] != "G6":
            print(f"  [{q['bucket']}] {q['query']}")


def _interpret(query: str) -> dict:
    """질의 해석을 라우트 핸들러에게 묻는다 (`a-llm` 전용).

    ⚠️ **dev 서버가 떠 있어야 한다.** 키를 서버에만 두기로 했으므로 하네스가 LLM을
    직접 부르지 않는다 — 그러면 평가와 실제 경로가 갈린다(예전에 파이썬 사본을
    두었다가 실제로 갈렸다).
    """
    import json as _json
    import urllib.request as _url

    req = _url.Request(
        "http://localhost:3000/api/search/interpret",
        data=_json.dumps({"query": query}).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with _url.urlopen(req, timeout=30) as res:
            return _json.load(res)
    except Exception as exc:  # noqa: BLE001 — 해석 실패는 빈 해석과 같다
        raise SystemExit(
            f"질의 해석 실패: {exc}\n  dev 서버가 떠 있어야 한다 (cd frontend && npm run dev)"
        ) from exc


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--summary", action="store_true", help="재생성 없이 요약만")
    parser.add_argument(
        "--overwrite-baseline",
        action="store_true",
        help="커밋된 pool-baseline.json을 덮어쓴다 (아래 경고를 읽고 쓸 것)",
    )
    parser.add_argument("--system", default="baseline", choices=sorted(SYSTEMS))
    parser.add_argument(
        "--gender",
        choices=GENDER_CHOICES,
        help="검색 RPC에 실을 성별. 재생성할 때는 필수다 (성별이 다르면 다른 풀이다).",
    )
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    global GENDER
    GENDER = args.gender
    if not args.summary and GENDER is None:
        parser.error("--gender를 지정해야 한다 (남성|여성). 성별이 다르면 다른 풀이다.")

    out_path = (ROOT / args.out) if args.out else OUT_PATH
    if args.summary:
        doc = json.loads(out_path.read_text(encoding="utf-8"))
    else:
        # 커밋된 기준선은 **역사적 산출물**이다. 실수로 덮어쓰면 A단계 개선폭의
        # 비교 대상이 사라진다.
        if out_path.name == "pool-baseline.json" and not args.overwrite_baseline:
            raise SystemExit(
                "거부: pool-baseline.json은 역사적 산출물이다.\n"
                "  기준선 27.8%는 v1(c_search_page)에 표기 폴백이 없던 시점의 측정인데,\n"
                "  2026-08-17부터 v1도 서버에서 자판 복원·오타 교정을 한다. 지금 다시\n"
                "  만들면 이름은 같고 의미는 다른 결과가 되어, 같은 시스템 비교가\n"
                "  아니게 된다(SYSTEM_CHANGELOG 참고).\n"
                "  정말 새 기준선을 재려면 --overwrite-baseline과 함께 실행하고,\n"
                "  계획의 실행 기록에 '기준선을 다시 쟀다'고 남길 것."
            )
        doc = build(args.system)
        out_path.write_text(
            json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"생성: {out_path.relative_to(ROOT)}\n")

    summarize(doc)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
