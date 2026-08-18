"""체형 3종 후보 확인 (읽기 전용 · SEED 넣기 전 눈으로 보는 용도).

**큐레이션 공통 규칙은 gen_curation_page.py에서 그대로 가져온다** — 구매·리뷰 하한,
정렬, 9개 상한, 색상 변형 접기(dedupe_variants), 큐레이션 간 중복 상한(MAX_APPEAR).
여기서 다시 정하면 화면과 어긋난다.

체형 조건만 여기서 정한다. 조건은 실측 치수 백분위(c_search_fit_measures)를 쓴다 —
설문 컬럼(fit·thickness)은 후보 풀의 36%만 채워져 있어 하드 조건으로 못 쓰고,
실측이 fit 라벨을 그대로 재현한다(슬림 .23 / 레귤러 .47 / 루즈 .77 / 오버 .84).

백분위 숫자의 출처: docs/plans/2026-08-18-curation-body-type.md "백분위 숫자는 어디서 나왔나"

실행: python3 scripts/probe_body_type.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from gen_curation_page import (BASE_SCOPE, CARD_COLS, MAX_APPEAR, MIN_BUY,  # noqa: E402
                               MIN_REVIEW, ORDER, TOP_N, connect, dedupe_variants)

# 매핑표(query-plan.ts)의 스트레이트 expand = 레귤러·무지·코튼. 실측은 무늬를 못 가른다.
PLAIN_TAG = ['무지티', '무지', '기본티', '기본티셔츠', '베이직']
PLAIN_TITLE = ['무지', '베이직', '에센셜', '솔리드', '플레인', '코튼', 'cotton', 'basic', 'essential']
IS_PLAIN = ("(" + " or ".join(f"g.title ilike '%{w}%'" for w in PLAIN_TITLE)
            + " or exists (select 1 from unnest(g.tags) tg where "
            + " or ".join(f"tg = '{w}'" for w in PLAIN_TAG) + "))")

# 얇음 제외 — 설문값이 없는 상품(64%)은 통과시킨다. not NULL 로 조용히 떨어뜨리면 안 된다.
NOT_THIN = "coalesce(not (string_to_array(g.thickness,',') && array['얇음','약간 얇음']), true)"

TYPES = [
    # 어깨선이 실제 어깨에 맞고 몸통이 일자로 떨어지는 것.
    # 가슴 .30~.65 = 레귤러(.47) 대역. 슬림(.23)·루즈(.77)를 양쪽에서 뺀다.
    ("스트레이트", f"""m.shoulder_band = '정어깨'
      and m.length_pct between 0.25 and 0.80
      and m.chest_pct between 0.30 and 0.65
      and {NOT_THIN} and {IS_PLAIN}"""),
    # 상체가 얇고 무게중심이 아래. 짧은 기장 + 몸에 붙는 실루엣(가슴 슬림 대역).
    ("웨이브(여성)", """m.shoulder_band in ('좁은 어깨','정어깨')
      and m.length_pct <= 0.35
      and m.chest_pct <= 0.40
      and g.gender <> '남성'"""),
    # 뼈대 존재감이 있어 옷에 볼륨이 있어야 균형. 루즈·오버 대역.
    # 극단적 드롭(.92↑)은 어깨 위치가 사라져 오히려 좁아 보이므로 밴드에서 이미 빠진다.
    ("내추럴", f"""m.shoulder_band in ('어깨 확장','가벼운 드롭')
      and m.chest_pct >= 0.60 and m.length_pct >= 0.50
      and {NOT_THIN}"""),
]

# gen_curation_page의 CARD_COLS는 c_goods를 별칭 없이 쓴다. 조인에 맞춰 g.를 붙인다.
COLS = ", ".join(f"g.{c.strip()}" for c in CARD_COLS.split(","))

with connect() as conn, conn.cursor() as cur:
    appear, picks = {}, {}
    for name, cond in TYPES:
        q = (f"from c_goods g join c_search_fit_measures m "
             f"on m.goods_no = g.goods_no and m.pop = '여성' "
             f"where {BASE_SCOPE.replace('base_cat', 'g.base_cat')} and {cond}")
        # 후보 수는 **하한 통과분**으로 센다(사람 결정 2026-08-18).
        # gen_curation_page.build()는 하한 전 숫자를 세는데, 반팔 카탈로그의 8할이
        # 구매 0건이라 "9개 보여주면서 8,830건"이 된다. 체형 게시물은 실제로 뽑을 수
        # 있는 풀을 표기한다. ⚠️ 기존 24개 게시물과 기준이 다르다.
        cur.execute(f"select count(*) {q} and g.purchase_total >= {MIN_BUY} "
                    f"and g.review_count >= {MIN_REVIEW}")
        total = cur.fetchone()[0]
        cur.execute(f"""select {COLS}, m.shoulder_band,
                        round(m.chest_pct::numeric,2), round(m.length_pct::numeric,2) {q}
                        and g.purchase_total >= {MIN_BUY} and g.review_count >= {MIN_REVIEW}
                        order by {ORDER.replace('review_score', 'g.review_score')
                                       .replace('goods_no', 'g.goods_no')}
                        limit {TOP_N * 5}""")
        raw = cur.fetchall()
        rows = dedupe_variants(raw, TOP_N, appear)
        picks[name] = {r[0] for r in rows}
        print(f"\n■ {name} — 후보 {total}건 · 상위 {len(raw)}개에서 변형 접고 {len(rows)}개")
        for i, r in enumerate(rows, 1):
            print(f"  {i}. {r[1]} / {r[2] or r[3]} / {r[4]:,}원 · 평점 {r[7]} · 리뷰 {r[6]:,}")
            print(f"     {r[11]} · 가슴 {r[12]} · 기장 {r[13]} · https://www.musinsa.com/products/{r[0]}")

    names = list(picks)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            dup = picks[names[i]] & picks[names[j]]
            assert not dup, f"{names[i]}·{names[j]} 겹침: {dup}"
    print(f"\n겹침 없음 ✓ (MAX_APPEAR={MAX_APPEAR} 적용)")
