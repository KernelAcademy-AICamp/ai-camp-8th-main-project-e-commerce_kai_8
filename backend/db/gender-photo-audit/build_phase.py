"""구간별 전수 판정 시트를 만든다.

사용: build_phase.py <구간코드> <입력csv> [워커수]
  구간코드  A|B|C|D  — 시트/매니페스트 파일 접두어
  입력csv   goods_no,thumbnail,brand_name,title,p_female  (이미 원하는 순서로 정렬돼 있어야 한다)

출력
  sheets_<구간>/rev_NNNN.jpg   56칸(8열×7행) 대조 시트, 1440x1454
                               → 전송 시 축소가 없어 칸이 온전한 180px로 보인다
  manifest_<구간>.csv          seq,sheet,goods_no,p_female,brand_name,title

제외: dead_final.txt (3회 재확인으로 확정한 죽은 썸네일)
캐시: sheets/cache/ 를 공용으로 쓴다 (이미 받은 것은 다시 안 받는다)
"""

import csv
import pathlib
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO

import urllib.request
from PIL import Image, ImageDraw, ImageFont

SP = pathlib.Path(__file__).parent
PHASE, SRC = sys.argv[1], pathlib.Path(sys.argv[2])
WORKERS = int(sys.argv[3]) if len(sys.argv) > 3 else 16

COLS, ROWS, CELL, PAD, HEAD = 8, 7, 180, 22, 40
PER = COLS * ROWS
OUT = SP / f"sheets_{PHASE}"
CACHE = SP / "sheets" / "cache"
OUT.mkdir(exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)

try:
    HFONT = ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", 22)
except OSError:
    HFONT = None

dead = {ln.strip() for ln in open(SP / "dead_final.txt") if ln.strip()}
rows = [r for r in csv.DictReader(open(SRC)) if r["goods_no"] not in dead]
n_sheets = (len(rows) + PER - 1) // PER
print(f"[{PHASE}] 대상 {len(rows)}개 (죽은 이미지 제외), 시트 {n_sheets}장", flush=True)

lock, done = threading.Lock(), [0]


def fetch(row):
    path = CACHE / f"{row['goods_no']}.jpg"
    if path.exists() and path.stat().st_size > 0:
        return
    url = row["thumbnail"]
    if url.startswith("/"):
        url = "https://image.msscdn.net" + url
    for _ in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            img = Image.open(BytesIO(urllib.request.urlopen(req, timeout=25).read())).convert("RGB")
            img.thumbnail((CELL, CELL))
            img.save(path, quality=85)
            break
        except Exception:
            continue
    with lock:
        done[0] += 1
        if done[0] % 10000 == 0:
            print(f"[{PHASE}] {done[0]} 내려받음", flush=True)


with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    list(ex.map(fetch, rows))
print(f"[{PHASE}] 다운로드 완료", flush=True)

manifest = csv.writer(open(SP / f"manifest_{PHASE}.csv", "w", newline=""))
manifest.writerow(["seq", "sheet", "goods_no", "p_female", "brand_name", "title"])

for si in range(n_sheets):
    chunk = rows[si * PER : (si + 1) * PER]
    rn = (len(chunk) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS * CELL, HEAD + rn * (CELL + PAD)), (255, 255, 255))
    draw = ImageDraw.Draw(sheet)
    draw.rectangle([0, 0, sheet.width, HEAD], fill=(25, 25, 25))
    draw.text(
        (10, 9),
        f"{PHASE}{si + 1}/{n_sheets}   번호 {si * PER + 1}~{si * PER + len(chunk)}"
        f"   p_female {chunk[0]['p_female']}~{chunk[-1]['p_female']}",
        fill=(255, 255, 255),
        font=HFONT,
    )
    for j, row in enumerate(chunk):
        seq = si * PER + j + 1
        manifest.writerow(
            [seq, si + 1, row["goods_no"], row["p_female"], row["brand_name"], row["title"]]
        )
        try:
            img = Image.open(CACHE / f"{row['goods_no']}.jpg").convert("RGB")
        except Exception:
            img = Image.new("RGB", (CELL, CELL), (70, 70, 70))
        c, r = j % COLS, j // COLS
        x, y = c * CELL, HEAD + r * (CELL + PAD)
        sheet.paste(img, (x + (CELL - img.width) // 2, y))
        draw.text((x + 4, y + CELL + 4), f"{seq}", fill=(0, 0, 0))
    sheet.save(OUT / f"rev_{si + 1:04d}.jpg", quality=88)

print(f"[{PHASE}] 시트 {n_sheets}장 생성 -> {OUT}  (규격 {COLS * CELL}x{HEAD + ROWS * (CELL + PAD)})")
