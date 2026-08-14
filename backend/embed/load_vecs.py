"""로컬 embed_state.db의 완료 벡터를 Supabase c_img_vecs에 적재한다.

실행 순서 (설계 2단계):
  1. 마이그레이션(20260814120000_c_img_vecs.sql)이 적용돼 있어야 한다.
  2. python load_vecs.py            — done 행 전부 COPY (재실행 시 이어서)
  3. 적재 완료 후 이진 양자화 HNSW 인덱스 생성 + PoC 테이블 삭제까지 수행.

SUPABASE_DB_URL 환경변수 필요 (backend/.env.local).
"""

import os
import pathlib
import sqlite3
import time

import numpy as np
import psycopg

BASE = pathlib.Path(__file__).parent
DB = BASE / "data" / "embed_state.db"
CHUNK = 20_000


def vec_text(blob):
    v = np.frombuffer(blob, dtype=np.float16)
    return "[" + ",".join(f"{x:.3g}" for x in v) + "]"


lconn = sqlite3.connect(DB)
total_done = lconn.execute("select count(*) from imgs where status='done'").fetchone()[0]

with psycopg.connect(os.environ["SUPABASE_DB_URL"]) as conn:
    with conn.cursor() as cur:
        cur.execute("select count(*) from c_img_vecs")
        already = cur.fetchone()[0]
        print(f"local done={total_done}  remote={already}")

        # 재실행 대비: 이미 적재된 (goods_no, slot)은 건너뛴다.
        cur.execute("select goods_no, slot from c_img_vecs")
        seen = set(cur.fetchall())

        rows = lconn.execute(
            "select goods_no, slot, width, height, img_type, type_conf,"
            " graphic, graphic_conf, vec from imgs where status='done'")
        buf, loaded, t0 = [], 0, time.time()

        def flush(buf):
            with cur.copy(
                "copy c_img_vecs (goods_no, slot, width, height, img_type,"
                " type_conf, graphic, graphic_conf, emb) from stdin") as cp:
                for r in buf:
                    cp.write_row(r[:8] + (vec_text(r[8]),))
            conn.commit()

        for r in rows:
            if (r[0], r[1]) in seen:
                continue
            buf.append(r)
            if len(buf) >= CHUNK:
                flush(buf)
                loaded += len(buf)
                buf = []
                rate = loaded / (time.time() - t0)
                print(f"{loaded} loaded  {rate:.0f} rows/s", flush=True)
        if buf:
            flush(buf)
            loaded += len(buf)
        print(f"copy done: +{loaded} rows in {(time.time()-t0)/60:.1f}min")

        cur.execute("select count(*) from c_img_vecs")
        n = cur.fetchone()[0]
        if n >= total_done:
            print("building binary-quantize HNSW index (수 분)...")
            cur.execute("set maintenance_work_mem = '512MB'")
            cur.execute("set statement_timeout = '60min'")
            cur.execute("""
                create index if not exists c_img_vecs_bq_idx on c_img_vecs
                using hnsw ((binary_quantize(emb)::bit(768)) bit_hamming_ops)
            """)
            cur.execute("analyze c_img_vecs")
            cur.execute("drop table if exists c_vec_poc")
            conn.commit()
            cur.execute("""
                select pg_size_pretty(pg_relation_size('c_img_vecs')),
                       pg_size_pretty(pg_relation_size('c_img_vecs_bq_idx'))
            """)
            t, i = cur.fetchone()
            print(f"rows={n} table={t} index={i} (c_vec_poc dropped)")
        else:
            print(f"경고: 원격 {n} < 로컬 done {total_done} — 인덱스 생성 보류")
