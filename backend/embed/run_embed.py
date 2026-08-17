"""aTee 이미지 임베딩 스트리밍 파이프라인 (설계 2단계).

썸네일+갤러리 약 93만 장을 내려받아 SigLIP2 임베딩·유형 분류·크기 기록 후
이미지는 버리고 벡터만 로컬 SQLite에 남긴다. 중단·재개 가능.

입력:  data/images_input.csv  (goods_no, thumbnail, gallery — c_feed_products 덤프)
상태:  data/embed_state.db    (이미지 1장 = 1행, status pending|done|fail:*)
실행:  python run_embed.py [--limit N] [--workers 24] [--batch 64]

주의: 디스크에 이미지를 저장하지 않는다(로컬 여유가 작음 — 계획 문서 '제약').
"""

import argparse
import csv
import io
import pathlib
import re
import sqlite3
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import torch
from PIL import Image

BASE = pathlib.Path(__file__).parent
DATA = BASE / "data"
DB = DATA / "embed_state.db"
CDN = "https://image.msscdn.net"
MODEL_NAME = "google/siglip2-base-patch16-256"

# zero-shot 프롬프트. 순서 = 라벨 코드.
TYPE_PROMPTS = [
    "a photo of a person wearing a t-shirt",              # 0 착용샷
    "a t-shirt product photo on a plain background",      # 1 단품컷
    "a close-up photo of fabric texture or clothing detail",  # 2 디테일·원단
    "a size chart, table, or text information image",     # 3 표·라벨
]
GRAPHIC_PROMPTS = [
    "a plain solid t-shirt without any print",            # 0 무지
    "a t-shirt with a large graphic or picture printed on it",  # 1 그래픽
    "a t-shirt with text or lettering printed on it",     # 2 레터링
]


def parse_pg_array(text):
    """postgres text[] 리터럴 파싱 ({a,b,"c,d"} 형태)."""
    if not text or text == "{}":
        return []
    inner = text[1:-1]
    return [m.group(1).replace('\\"', '"') if m.group(1) is not None else m.group(2)
            for m in re.finditer(r'"((?:[^"\\]|\\.)*)"|([^,]+)', inner)]


def image_url(path):
    u = path if path.startswith("http") else CDN + path
    return u + ("&w=500" if "?" in u else "?w=500")


def init_db():
    DB.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB)
    conn.execute("""
        create table if not exists imgs(
          goods_no integer not null,
          slot     integer not null,
          url      text not null,
          status   text not null default 'pending',
          width    integer, height integer,
          img_type integer, type_conf real,
          graphic  integer, graphic_conf real,
          vec      blob,
          primary key (goods_no, slot))
    """)
    n = conn.execute("select count(*) from imgs").fetchone()[0]
    if n == 0:
        print("initializing tasks from images_input.csv ...")
        rows = []
        with open(DATA / "images_input.csv", newline="") as f:
            for r in csv.DictReader(f):
                gid = int(r["goods_no"])
                rows.append((gid, 0, image_url(r["thumbnail"])))
                for i, g in enumerate(parse_pg_array(r["gallery"]), start=1):
                    rows.append((gid, i, image_url(g)))
        conn.executemany(
            "insert or ignore into imgs (goods_no, slot, url) values (?,?,?)", rows)
        conn.commit()
        print(f"{len(rows)} image tasks")
    return conn


def download(task):
    gid, slot, url = task
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            img = Image.open(io.BytesIO(r.read()))
            img = img.convert("RGB")
        return (gid, slot, img, None)
    except Exception as e:
        return (gid, slot, None, str(e)[:200])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--workers", type=int, default=24)
    ap.add_argument("--batch", type=int, default=64)
    args = ap.parse_args()

    conn = init_db()
    device = "mps" if torch.backends.mps.is_available() else "cpu"

    from transformers import AutoModel, AutoProcessor
    model = AutoModel.from_pretrained(MODEL_NAME).to(device).eval()
    processor = AutoProcessor.from_pretrained(MODEL_NAME)

    def as_tensor(out):
        return out if torch.is_tensor(out) else out.pooler_output

    def embed_texts(texts):
        inp = processor(text=texts, return_tensors="pt",
                        padding="max_length", max_length=64).to(device)
        with torch.no_grad():
            v = as_tensor(model.get_text_features(**inp))
        return torch.nn.functional.normalize(v, dim=-1)

    type_emb = embed_texts(TYPE_PROMPTS)
    graphic_emb = embed_texts(GRAPHIC_PROMPTS)

    pending = conn.execute(
        "select goods_no, slot, url from imgs where status='pending'"
        + (f" limit {args.limit}" if args.limit else "")).fetchall()
    total_done = conn.execute("select count(*) from imgs where status='done'").fetchone()[0]
    print(f"pending={len(pending)} done={total_done} device={device}")

    t0, processed = time.time(), 0
    ex = ThreadPoolExecutor(max_workers=args.workers)
    WINDOW = 256  # 다운로드 선행 상한 — 디코딩 이미지 메모리 적체 방지

    def flush(batch):
        nonlocal processed
        ok = [b for b in batch if b[2] is not None]
        fails = [(f"fail:{b[3]}", b[0], b[1]) for b in batch if b[2] is None]
        updates = []
        if ok:
            imgs = [b[2] for b in ok]
            inp = processor(images=imgs, return_tensors="pt").to(device)
            with torch.no_grad():
                v = as_tensor(model.get_image_features(**inp))
            v = torch.nn.functional.normalize(v, dim=-1)
            tp = torch.softmax(v @ type_emb.T * 100, dim=-1)
            gp = torch.softmax(v @ graphic_emb.T * 100, dim=-1)
            t_conf, t_idx = tp.max(dim=-1)
            g_conf, g_idx = gp.max(dim=-1)
            vecs = v.cpu().to(torch.float16).numpy()
            for j, (gid, slot, img, _) in enumerate(ok):
                updates.append((img.width, img.height,
                                int(t_idx[j]), float(t_conf[j]),
                                int(g_idx[j]), float(g_conf[j]),
                                vecs[j].tobytes(), gid, slot))
        conn.executemany(
            "update imgs set status='done', width=?, height=?, img_type=?, type_conf=?,"
            " graphic=?, graphic_conf=?, vec=? where goods_no=? and slot=?", updates)
        conn.executemany(
            "update imgs set status=? where goods_no=? and slot=?", fails)
        conn.commit()
        processed += len(batch)
        if processed % 1024 < args.batch:
            rate = processed / (time.time() - t0)
            eta_h = (len(pending) - processed) / rate / 3600 if rate else 0
            print(f"{processed}/{len(pending)}  {rate:.1f} img/s  ETA {eta_h:.1f}h",
                  flush=True)

    batch = []
    for w0 in range(0, len(pending), WINDOW):
        for item in ex.map(download, pending[w0 : w0 + WINDOW]):
            batch.append(item)
            if len(batch) >= args.batch:
                flush(batch)
                batch = []
    if batch:
        flush(batch)
    print(f"finished {processed} in {(time.time() - t0) / 3600:.1f}h")
    for row in conn.execute(
            "select status like 'fail:%', count(*) from imgs group by 1"):
        print("fail" if row[0] else "ok/pending", row[1])


if __name__ == "__main__":
    main()
