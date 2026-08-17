"""품질 게이트: c_similar_page(이진 후보→정밀 재정렬)를 전수 정밀 검색과 비교.

설계 §3 게이트 — 무작위 앵커 40개 기준 Recall@30 ≥ 0.9 (상품 단위, 서빙 경로 그대로).
실행: python gate_recall.py   (SUPABASE_DB_URL 필요, 전체 적재·인덱스 생성 후)
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

cur.execute(
    "select goods_no from c_img_vecs where slot=0 order by random() limit %s",
    (N_ANCHORS,))
anchors = [r[0] for r in cur.fetchall()]
random.seed(42)

recalls, lats = [], []
for i, gid in enumerate(anchors):
    # 기준: 전수 정밀 (서빙과 같은 필터·상품 중복 제거, 인덱스 미사용)
    cur.execute("""
        with anchor as (
          select emb from c_img_vecs where goods_no=%s order by slot limit 1
        ), best as (
          select distinct on (v.goods_no) v.goods_no,
                 v.emb <#> (select emb from anchor) as dist
          from c_img_vecs v
          where v.img_type in (0,1) and v.goods_no <> %s
          order by v.goods_no, dist
        )
        select goods_no from best order by dist limit %s
    """, (gid, gid, K))
    truth = {r[0] for r in cur.fetchall()}

    # 서빙 경로 그대로 (RPC)
    t0 = time.time()
    cur.execute("select goods_no from c_similar_page(%s, %s)", (gid, K))
    got = {r[0] for r in cur.fetchall()}
    lats.append((time.time() - t0) * 1000)

    recalls.append(len(got & truth) / K)
    print(f"{i + 1}/{N_ANCHORS} anchor={gid} recall={recalls[-1]:.2f} "
          f"{lats[-1]:.0f}ms", flush=True)

result = {
    "recall_mean": round(statistics.mean(recalls), 3),
    "recall_min": round(min(recalls), 3),
    "p50_ms": round(statistics.median(lats), 1),
    "p95_ms": round(sorted(lats)[int(len(lats) * 0.95) - 1], 1),
    "pass": statistics.mean(recalls) >= 0.9,
}
print(result)
