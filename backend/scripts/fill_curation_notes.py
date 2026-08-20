"""큐레이션 JSON에 상품별 한마디(note)와 아쉬운 점(con)을 채운다.

문장을 쓰지 않는다. 무신사가 만들어 둔 리뷰 AI 요약에서 **문장 하나를 고른다.**
같은 데이터를 gen_curation_page.py가 이미 조건(`neg_free`·`pos_kw`)으로 쓰고 있다 —
컬럼은 c_goods.ai_summary이고, 여기서는 DB 없이 같은 엔드포인트를 직접 부른다.

고르는 규칙:
  note  긍정 요약을 문장으로 쪼갠 뒤, 그 게시물의 조건 라벨과 겹치는 문장을 먼저 쓴다.
        같은 게시물에서 이미 쓴 문장과 겹치면 다음 후보로 넘어간다 — 안 그러면
        아홉 장이 전부 "재질이 탄탄해요"가 된다(표본 9개 중 5개가 그랬다).
  con   불만 요약에서 상품과 무관한 것(배송·포장·품절)을 뺀 첫 문장.
        깔 게 없는 상품은 "전반적으로 만족도가 높아요"가 그대로 오므로 라벨만 바꾼다.

이미 채워진 값은 건드리지 않는다(손으로 고른 것을 덮어쓰지 않기 위해).

장 제목(head)은 여기서 못 만든다 — 사람이 쓰는 유일한 문장이라 워크시트로 주고받는다.

사용:
    python scripts/fill_curation_notes.py                 채우기
    python scripts/fill_curation_notes.py --worksheet OUT  장 제목 쓸 표를 뽑는다(TSV)
    python scripts/fill_curation_notes.py --read IN        채워온 표를 overlay 에 넣는다
"""

import argparse
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

API = "https://goods.musinsa.com/api2/review/v1/ai-summary/{no}"
HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": "https://www.musinsa.com/"}
DEFAULT_JSON = (
    Path(__file__).resolve().parents[3]
    / "frontend/features/curation/data/curations.json"
)
# 손으로 정한 것(고른 상품·장 제목·버튼 자리·상황 색). 생성기가 JSON을 다시 뽑으면
# 그 값들이 지워지므로 여기 따로 두고 매번 되씌운다.
DEFAULT_OVERLAY = Path(__file__).with_name("curation_overlay.json")

# 상품이 아니라 주문 경험에 대한 문장 — 아쉬운 점으로 내보내면 상품 얘기가 아니게 된다.
OFF_TOPIC = ("배송", "포장", "과배송", "품절", "교환", "반품", "재입고")
# 불만이 없을 때 무신사가 대신 넣는 문장. gen_curation_page.py 의 no_complaint 와 같은 신호다.
NO_COMPLAINT = "만족도가 높"


def sentences(text: str) -> list[str]:
    """마침표로 끝나는 문장들. 무신사 요약은 '~해요.' 를 이어붙인 형태다."""
    return [s.strip() for s in re.split(r"(?<=\.)\s+", text or "") if s.strip()]


def goods_no(url: str) -> int | None:
    matched = re.search(r"/products/(\d+)", url)
    return int(matched.group(1)) if matched else None


def fetch(no: int) -> dict:
    try:
        r = requests.get(API.format(no=no), headers=HEADERS, timeout=15)
        r.raise_for_status()
        return r.json().get("data") or {}
    except Exception:
        return {}


def pick_note(pos: str, cond: list[str], used: set[str]) -> str:
    """조건과 겹치는 문장 우선, 이미 쓴 것은 건너뛴다."""
    cands = [s for s in sentences(pos) if s not in used]
    if not cands:
        return ""
    words = [w for label in cond for w in re.findall(r"[가-힣]{2,}", label)]
    scored = sorted(
        cands, key=lambda s: -sum(1 for w in words if w in s)
    )
    return scored[0]


def pick_con(neg: str) -> tuple[str, str]:
    """(라벨, 문장). 상품과 무관한 문장은 뺀다."""
    for s in sentences(neg):
        if NO_COMPLAINT in s:
            return "불만 요약", s
        if not any(w in s for w in OFF_TOPIC):
            return "아쉬운 점", s
    return "", ""


def write_worksheet(data: list[dict], out: Path) -> int:
    """장 제목을 쓸 표. 마지막 칸만 채우면 된다 — 빈 줄은 --read 가 건너뛴다."""
    rows = ["게시물\t상품번호\t브랜드\t상품명\t한마디\t제목(여기를 채우세요)"]
    for c in data:
        rows.append(f"# {c['key']}\t\t\t\t{c['title']}\t")
        for it in c["items"]:
            rows.append(
                "\t".join(
                    [
                        c["key"],
                        str(goods_no(it["u"]) or ""),
                        it["b"],
                        it["t"][:40],
                        (it.get("note") or "")[:60],
                        it.get("head", ""),
                    ]
                )
            )
    out.write_text("\n".join(rows) + "\n", encoding="utf-8")
    return len(rows)


def read_worksheet(src: Path, overlay_path: Path) -> int:
    """채워온 표에서 제목만 골라 overlay 의 heads 에 넣는다. 고른 상품·순서는 안 건드린다."""
    overlay = (
        json.loads(overlay_path.read_text(encoding="utf-8"))
        if overlay_path.exists()
        else {}
    )
    added = 0
    for line in src.read_text(encoding="utf-8").splitlines()[1:]:
        if line.startswith("#"):
            continue
        cols = line.split("\t")
        if len(cols) < 6 or not cols[5].strip():
            continue
        spec = overlay.setdefault(cols[0], {})
        spec.setdefault("heads", {})[cols[1]] = cols[5].strip()
        added += 1
    overlay_path.write_text(
        json.dumps(overlay, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return added


def accent_for(c: dict, palette: dict) -> str:
    """조건 라벨에서 주제를 읽어 색을 정한다 — 취향이 아니라 규칙이라 게시물이 늘어도 붙는다.

    제목은 안 본다. 부분 문자열이라 「경기장」이 '기장'에, 「야자수」가 '자수'에 걸렸다.
    조건 라벨은 사람이 축을 적어둔 것이라 그런 사고가 적다.
    """
    text = " ".join(c.get("cond") or [])
    for color, words in palette.get("rules") or []:
        if any(w in text for w in words):
            return color
    return palette.get("default", "#A3A3A3")


def apply_overlay(data: list[dict], overlay: dict) -> int:
    """고른 상품만 남기고 순서대로 세운 뒤 장 제목·버튼 자리·상황 색을 얹는다.

    상품은 **파일 전체**에서 찾는다. 사람이 고를 때는 게시물 경계를 안 보고 고르는데,
    JSON에는 게시물별 상위 9개만 담겨 있어 원하는 상품이 다른 게시물에 있을 수 있다.
    (조건 통과분 전체에서 고르려면 DB가 필요하다 — 계획 2단계.)
    """
    pool = {no: it for c in data for it in c["items"] if (no := goods_no(it["u"]))}
    palette = overlay.get("_palette") or {}
    touched = 0
    for c in data:
        if palette and not c.get("accent"):
            c["accent"] = accent_for(c, palette)
        spec = overlay.get(c["key"])
        if not isinstance(spec, dict) or c["key"].startswith("_"):
            continue
        picked = []
        for pick in spec.get("picks") or []:
            item = pool.get(pick["goods_no"])
            if item is None:  # 카탈로그에서 빠졌거나 어느 게시물에도 안 남은 상품
                print(f"  ! {c['key']}: {pick['goods_no']} 를 못 찾았다 — 건너뜀")
                continue
            item = dict(item)
            item["head"] = pick["head"]
            item["pos"] = pick["pos"]
            picked.append(item)
        if picked:
            c["items"] = picked
            c["n"] = len(picked)
        for no, head in (spec.get("heads") or {}).items():
            item = pool.get(int(no))
            if item is not None:
                item["head"] = head
        if spec.get("accent"):
            c["accent"] = spec["accent"]
        touched += 1
    return touched


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", type=Path, default=DEFAULT_JSON)
    ap.add_argument("--overlay", type=Path, default=DEFAULT_OVERLAY)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--worksheet", type=Path, help="장 제목 쓸 표를 뽑을 경로")
    ap.add_argument("--read", type=Path, help="채워온 표를 overlay 에 넣는다")
    args = ap.parse_args()

    data = json.loads(args.json.read_text(encoding="utf-8"))

    if args.read:
        print(f"제목 {read_worksheet(args.read, args.overlay)}개를 {args.overlay} 에 넣었다")

    if args.worksheet:
        print(f"{write_worksheet(data, args.worksheet)}줄 → {args.worksheet}")
        return 0

    if args.overlay.exists():
        overlay = json.loads(args.overlay.read_text(encoding="utf-8"))
        print(f"손으로 정한 게시물 {apply_overlay(data, overlay)}개 되씌움")

    targets = {
        no: None
        for c in data
        for it in c["items"]
        if not it.get("note") and (no := goods_no(it["u"])) is not None
    }
    print(f"요약을 받아올 상품 {len(targets)}개")

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for no, summary in zip(targets, pool.map(fetch, targets)):
            targets[no] = summary

    filled = missing = 0
    for c in data:
        used: set[str] = set()
        for it in c["items"]:
            if it.get("note"):
                used.add(it["note"])
                continue
            no = goods_no(it["u"])
            sentiment = ((targets.get(no) or {}).get("sentimentSummary")) or {}
            note = pick_note(sentiment.get("positive", ""), c.get("cond") or [], used)
            if not note:
                missing += 1
                continue
            it["note"] = note
            used.add(note)
            label, con = pick_con(sentiment.get("negative", ""))
            if con:
                it["conLabel"], it["con"] = label, con
            filled += 1

    print(f"채움 {filled}개 · 요약이 없어 못 채운 것 {missing}개")
    if args.dry_run:
        print("--dry-run 이라 파일은 그대로 둔다")
        return 0
    args.json.write_text(
        json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"저장 {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
