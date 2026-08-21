"""품질 게이트: c_similar_page(이진 후보→정밀 재정렬)를 전수 정밀 검색과 비교.

설계 §3 게이트 — 무작위 앵커 40개 기준 Recall@30 ≥ 0.9 (상품 단위, 서빙 경로 그대로).
실행: python gate_recall.py   (SUPABASE_DB_URL 필요, 전체 적재·인덱스 생성 후)

성별 하드 필터(2026-08-22, 설정 성별 토글 계획 7단계) 이후로는 **정답과 서빙을 같은
성별로 맞춰서** 잰다. 서빙만 성별로 거르고 정답은 전체 성별로 두면, ANN이 잘 찾아와도
정답 쪽 상위 30개가 대부분 다른 성별이라 recall이 인위적으로 떨어진다 — 검색 품질이
나빠진 것처럼 보이지만 실제로는 잣대가 어긋난 것이다.

그래서 앵커는 성별이 남성/여성인 상품 중에서 고르고, 그 앵커의 성별을 정답 질의와
RPC 양쪽에 똑같이 건다. 게이트가 재는 것은 "그 성별 안에서 ANN이 전수 검색을 얼마나
따라잡는가"가 된다.
"""

import os
import random
import statistics
import time

import psycopg

K = 30
N_ANCHORS = 40

conn = psycopg.connect(os.environ["SUPABASE_DB_URL"])
cur = conn.cursor()

# 앵커는 성별이 분명한 상품에서만 고른다 (공용·미상은 서빙에서 아예 빠진다)
cur.execute("""
    select v.goods_no, d.gender
    from c_img_vecs v
    join c_thumb_dims d on d.goods_no = v.goods_no
    where v.slot = 0 and d.width > 0 and d.gender in ('남성', '여성')
    order by random() limit %s
""", (N_ANCHORS,))
anchors = cur.fetchall()
random.seed(42)

recalls, lats = [], []
for i, (gid, gender) in enumerate(anchors):
    # 기준: 전수 정밀 (서빙과 **같은 필터**·상품 중복 제거, 인덱스 미사용)
    cur.execute("""
        with anchor as (
          select emb from c_img_vecs where goods_no=%s order by slot limit 1
        ), best as (
          select distinct on (v.goods_no) v.goods_no,
                 v.emb <#> (select emb from anchor) as dist
          from c_img_vecs v
          where v.img_type in (0,1) and v.goods_no <> %s
            and exists (select 1 from c_thumb_dims d
                        where d.goods_no = v.goods_no and d.width > 0 and d.gender = %s)
          order by v.goods_no, dist
        )
        select goods_no from best order by dist limit %s
    """, (gid, gid, gender, K))
    truth = {r[0] for r in cur.fetchall()}

    # 서빙 경로 그대로 (RPC) — 같은 성별을 건다
    t0 = time.time()
    cur.execute("select goods_no from c_similar_page(%s, %s, %s)", (gid, K, gender))
    got = {r[0] for r in cur.fetchall()}
    lats.append((time.time() - t0) * 1000)

    recalls.append(len(got & truth) / K)
    print(f"{i + 1}/{N_ANCHORS} anchor={gid}({gender}) recall={recalls[-1]:.2f} "
          f"{lats[-1]:.0f}ms", flush=True)

result = {
    "recall_mean": round(statistics.mean(recalls), 3),
    "recall_min": round(min(recalls), 3),
    "p50_ms": round(statistics.median(lats), 1),
    "p95_ms": round(sorted(lats)[int(len(lats) * 0.95) - 1], 1),
    "pass": statistics.mean(recalls) >= 0.9,
}
print(result)
