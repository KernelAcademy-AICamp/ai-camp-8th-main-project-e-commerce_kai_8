"""이미지 유형 재분류 — 표·라벨(3류) 프롬프트 교정 (개인화 3차 계획 1~2단계).

배경: 기존 3류 프롬프트("a size chart, table, or text information image")가
실제로는 뒷모습·전신 착용샷 6.1만 장을 흡수했다(사람 판정 3류 50/50 오류).
로컬 embed_state.db에 정규화 이미지 벡터(float16)가 있어, 텍스트 프롬프트만
다시 임베딩하면 재임베딩 없이 전체 재분류가 가능하다.

분류 버전(CLASSIFY_VER=2)의 고정 요소:
  - 모델: google/siglip2-base-patch16-256 @ REVISION (아래 상수)
  - 텍스트 전처리: padding="max_length", max_length=64 (run_embed.py와 동일)
  - 프롬프트 세트: PROMPT_SETS[선택 세트] (라벨 병합 규칙 포함)
  - 신뢰도: softmax(코사인 ×100)에서 같은 라벨로 병합되는 프롬프트 확률의 합
    (주의 — 프롬프트 세트가 다르면 신구 conf는 비교 불가)

사용:
  python reclassify.py score  --set C           # 전체 벡터 재스코어 → reclass 테이블
  python reclassify.py report --set C           # 현행 대비 전환 행렬·분포
  python reclassify.py sample --set C --label 3 --n 24 --out /tmp/s3  # 몬타주 표본
  python reclassify.py apply  --set C           # imgs.img_type2/type_conf2/classify_ver 기록
"""

import argparse
import io
import pathlib
import sqlite3
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np

BASE = pathlib.Path(__file__).parent
DB = BASE / "data" / "embed_state.db"
MODEL_NAME = "google/siglip2-base-patch16-256"
REVISION = "3f9f96cb90da5dbc758b01813f2f6f1aee24c1ab"  # 로컬 캐시 스냅숏 고정
CLASSIFY_VER = 2

# 프롬프트 세트: (프롬프트, 병합 라벨) 목록. 라벨 체계는 기존 0~3 유지.
# 0 착용샷 · 1 단품컷 · 2 디테일·원단 · 3 표·라벨
PROMPT_SETS = {
    # 원본 (v1 — 비교 기준)
    "V1": [
        ("a photo of a person wearing a t-shirt", 0),
        ("a t-shirt product photo on a plain background", 1),
        ("a close-up photo of fabric texture or clothing detail", 2),
        ("a size chart, table, or text information image", 3),
    ],
    # A: 3류 문구만 문서·표로 명확화
    "A": [
        ("a photo of a person wearing a t-shirt", 0),
        ("a t-shirt product photo on a plain background", 1),
        ("a close-up photo of fabric texture or clothing detail", 2),
        ("a size chart table with rows and columns of measurements", 3),
    ],
    # B: 뒷모습·전신 프롬프트를 착용샷(0)으로 흡수 + 3류 문구 유지
    "B": [
        ("a photo of a person wearing a t-shirt", 0),
        ("a photo of the back of a person wearing a t-shirt", 0),
        ("a full-body photo of a person standing", 0),
        ("a t-shirt product photo on a plain background", 1),
        ("a close-up photo of fabric texture or clothing detail", 2),
        ("a size chart, table, or text information image", 3),
    ],
    # C: A+B 결합 + 문서류 프롬프트 보강
    "C": [
        ("a photo of a person wearing a t-shirt", 0),
        ("a photo of the back of a person wearing a t-shirt", 0),
        ("a full-body photo of a person standing", 0),
        ("a t-shirt product photo on a plain background", 1),
        ("a close-up photo of fabric texture or clothing detail", 2),
        ("a size chart table with rows and columns of measurements", 3),
        ("a product information image with text and diagrams", 3),
    ],
}


def embed_prompts(texts):
    import torch
    from transformers import AutoModel, AutoTokenizer

    model = AutoModel.from_pretrained(MODEL_NAME, revision=REVISION).eval()
    tok = AutoTokenizer.from_pretrained(MODEL_NAME, revision=REVISION)
    inp = tok(texts, return_tensors="pt", padding="max_length", max_length=64)
    with torch.no_grad():
        out = model.get_text_features(**inp)
    t = out if torch.is_tensor(out) else out.pooler_output
    return torch.nn.functional.normalize(t, dim=-1).numpy().astype(np.float32)


def score(conn, set_name):
    prompts = PROMPT_SETS[set_name]
    t = embed_prompts([p for p, _ in prompts])
    labels = np.array([l for _, l in prompts])
    conn.execute(
        """create table if not exists reclass(
             set_name text not null, goods_no integer not null, slot integer not null,
             label integer not null, conf real not null,
             primary key (set_name, goods_no, slot))"""
    )
    conn.execute("delete from reclass where set_name=?", (set_name,))
    cur = conn.execute("select goods_no, slot, vec from imgs where status='done'")
    total = 0
    while True:
        rows = cur.fetchmany(20000)
        if not rows:
            break
        vecs = np.frombuffer(b"".join(r[2] for r in rows), dtype=np.float16)
        vecs = vecs.reshape(len(rows), -1).astype(np.float32)
        logits = vecs @ t.T * 100
        sm = np.exp(logits - logits.max(1, keepdims=True))
        sm /= sm.sum(1, keepdims=True)
        # 라벨 병합: 같은 라벨 프롬프트의 확률 합 → 최종 라벨·신뢰도
        merged = np.stack([sm[:, labels == k].sum(1) for k in range(4)], axis=1)
        lab = merged.argmax(1)
        conf = merged.max(1)
        conn.executemany(
            "insert into reclass (set_name, goods_no, slot, label, conf) values (?,?,?,?,?)",
            [(set_name, r[0], r[1], int(lab[j]), float(conf[j])) for j, r in enumerate(rows)],
        )
        total += len(rows)
        if total % 200000 < 20000:
            print(f"{total} scored", flush=True)
    conn.commit()
    print(f"done: {total} rows for set {set_name}")


def report(conn, set_name):
    print("== 전환 행렬 (행=기존 img_type, 열=새 label) ==")
    rows = conn.execute(
        """select i.img_type, r.label, count(*) from imgs i
           join reclass r on r.goods_no=i.goods_no and r.slot=i.slot and r.set_name=?
           group by 1,2 order by 1,2""",
        (set_name,),
    ).fetchall()
    mat = {}
    for old, new, n in rows:
        mat[(old, new)] = n
    print("old\\new " + "".join(f"{k:>10}" for k in range(4)))
    for old in range(4):
        print(f"{old:>7} " + "".join(f"{mat.get((old, k), 0):>10}" for k in range(4)))
    print("\n== 새 분포 ==")
    for lab, n, avg in conn.execute(
        "select label, count(*), round(avg(conf),3) from reclass where set_name=? group by 1 order by 1",
        (set_name,),
    ):
        print(f"label {lab}: {n}  (avg conf {avg})")


def fetch_img(url, px=180):
    from PIL import Image

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            img = Image.open(io.BytesIO(r.read())).convert("RGB")
        img.thumbnail((px, px))
        return img
    except Exception:
        return None


def montage(conn, set_name, label, n, out_prefix, seed, conf_min, conf_max, exclude=None):
    """표본 n장을 시드 결정적으로 뽑아 6열 몬타주 PNG + 매니페스트로 저장."""
    from PIL import Image, ImageDraw

    q = """select r.goods_no, r.slot, r.conf, i.url from reclass r
           join imgs i on i.goods_no=r.goods_no and i.slot=r.slot
           where r.set_name=? and r.label=? and r.conf between ? and ?"""
    rows = conn.execute(q, (set_name, label, conf_min, conf_max)).fetchall()
    rng = np.random.default_rng(seed)
    rng.shuffle(rows)
    if exclude:
        rows = [r for r in rows if (r[0], r[1]) not in exclude]
    rows = rows[:n]
    with ThreadPoolExecutor(max_workers=12) as ex:
        imgs = list(ex.map(lambda r: fetch_img(r[3]), rows))
    keep = [(r, im) for r, im in zip(rows, imgs) if im is not None]
    cols, cell = 6, 190
    rows_n = (len(keep) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows_n * (cell + 16)), "white")
    d = ImageDraw.Draw(sheet)
    manifest = []
    for j, ((gid, slot, conf, url), im) in enumerate(keep):
        x, y = (j % cols) * cell, (j // cols) * (cell + 16)
        sheet.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
        d.text((x + 4, y + cell + 2), f"#{j} {conf:.2f}", fill="black")
        manifest.append(f"#{j}\t{gid}:{slot}\tconf={conf:.3f}\t{url}")
    png = pathlib.Path(f"{out_prefix}.png")
    png.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(png)
    pathlib.Path(f"{out_prefix}.txt").write_text("\n".join(manifest))
    print(f"wrote {png} ({len(keep)} imgs)")


def apply(conn, set_name):
    cols = {r[1] for r in conn.execute("pragma table_info(imgs)")}
    for col, typ in (("img_type2", "integer"), ("type_conf2", "real"), ("classify_ver", "integer")):
        if col not in cols:
            conn.execute(f"alter table imgs add column {col} {typ}")
    conn.execute(
        """update imgs set
             img_type2 = (select r.label from reclass r
                          where r.set_name=? and r.goods_no=imgs.goods_no and r.slot=imgs.slot),
             type_conf2 = (select r.conf from reclass r
                           where r.set_name=? and r.goods_no=imgs.goods_no and r.slot=imgs.slot),
             classify_ver = ?
           where status='done'""",
        (set_name, set_name, CLASSIFY_VER),
    )
    conn.commit()
    n = conn.execute("select count(*) from imgs where classify_ver=?", (CLASSIFY_VER,)).fetchone()[0]
    print(f"applied set {set_name} as classify_ver={CLASSIFY_VER}: {n} rows")


def push(conn, limit=None):
    """라벨이 바뀐 행만 Supabase c_img_vecs에 반영한다 (계획 2단계).

    전체 96.7만 행 재기록은 안 한다 — 벡터 테이블의 UPDATE는 대부분 non-HOT라
    IVFFlat·이진 인덱스에 새 엔트리를 만들어 Micro에서 인덱스 팽창을 유발한다.
    라벨 불변 행은 v1 분류가 그대로 유효하므로 건드리지 않는다(classify_ver
    null = v1 라벨 유지). 서버 type_conf는 어떤 RPC 로직에도 쓰이지 않는
    참고값이라 v1/v2 혼재를 허용하고, 정본 신뢰도는 로컬 DB에 있다.

    멱등·재개: 서버에서 classify_ver=2인 (goods_no, slot)을 먼저 읽어 건너뛴다.
    """
    import os

    import psycopg

    rows = conn.execute(
        """select goods_no, slot, img_type2, type_conf2 from imgs
           where status='done' and img_type2 is not null and img_type2 <> img_type
           order by goods_no, slot"""
    ).fetchall()
    print(f"changed rows local: {len(rows)}")
    with psycopg.connect(os.environ["SUPABASE_DB_URL"]) as pg:
        with pg.cursor() as cur:
            cur.execute("select goods_no, slot from c_img_vecs where classify_ver = %s", (CLASSIFY_VER,))
            seen = set(cur.fetchall())
            todo = [r for r in rows if (r[0], r[1]) not in seen]
            if limit:
                todo = todo[:limit]
            print(f"already pushed: {len(seen)}  todo: {len(todo)}")
            CHUNK = 5000
            for i in range(0, len(todo), CHUNK):
                chunk = todo[i : i + CHUNK]
                cur.executemany(
                    """update c_img_vecs set img_type=%s, type_conf=%s, classify_ver=%s
                       where goods_no=%s and slot=%s""",
                    [(t, c, CLASSIFY_VER, g, s) for g, s, t, c in chunk],
                )
                pg.commit()
                print(f"{i + len(chunk)}/{len(todo)} pushed", flush=True)
            cur.execute("analyze c_img_vecs")
            pg.commit()
            cur.execute(
                "select img_type, count(*) from c_img_vecs where classify_ver=%s group by 1 order by 1",
                (CLASSIFY_VER,),
            )
            print("server ver2 by img_type:", cur.fetchall())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["score", "report", "sample", "apply", "push"])
    ap.add_argument("--set", dest="set_name", required=True)
    ap.add_argument("--label", type=int, default=3)
    ap.add_argument("--n", type=int, default=24)
    ap.add_argument("--out", default="/tmp/reclass_sample")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--conf-min", type=float, default=0.0)
    ap.add_argument("--conf-max", type=float, default=1.0)
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    conn = sqlite3.connect(DB)
    if args.cmd == "score":
        score(conn, args.set_name)
    elif args.cmd == "report":
        report(conn, args.set_name)
    elif args.cmd == "sample":
        montage(conn, args.set_name, args.label, args.n, args.out, args.seed,
                args.conf_min, args.conf_max)
    elif args.cmd == "apply":
        apply(conn, args.set_name)
    elif args.cmd == "push":
        push(conn, args.limit)


if __name__ == "__main__":
    main()
