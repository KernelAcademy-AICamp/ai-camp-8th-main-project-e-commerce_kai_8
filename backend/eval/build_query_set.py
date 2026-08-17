"""평가 질의 세트 생성 — 씨앗 + 기계 생성 + 작성분을 합쳐 개발/진행/홀드아웃으로 층화 분할한다.

계획: docs/plans/2026-08-17-search-eval-harness.md 2단계
목표 개수: docs/atee/eval/bucket-targets.json (카탈로그를 보기 전에 확정한 것)

왜 스크립트인가:
  - G1(브랜드)·G3(표기 변형)은 정답이 결정론적이라 손으로 쓸 이유가 없다.
  - 1차 집계를 손으로 세다 두 계열이 틀렸다(2차 리뷰 M12). 집계는 기계가 한다.
  - 분할은 **질의 가족** 단위여야 하고(파생·근접중복 누출 차단), 사람이 하면 실수한다.

실행:
  python backend/eval/build_query_set.py            # 산출물 재생성
  python backend/eval/build_query_set.py --check    # 재생성 없이 불변식만 검사
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVAL_DIR = ROOT / "docs" / "atee" / "eval"
SEED_PATH = EVAL_DIR / "query-seed.json"
TARGETS_PATH = EVAL_DIR / "bucket-targets.json"
OUT_PATH = EVAL_DIR / "query-set.json"

# ── 한글 자모·자판 ────────────────────────────────────────────────────────────
CHOSUNG = list("ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ")
JUNGSUNG = list("ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ")
JONGSUNG = [""] + list("ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ")

# 두벌식 자판 — 자모를 누르는 영문 키. 겹받침·이중모음은 낱자로 풀어 누른다.
JAMO_TO_KEY = {
    "ㄱ": "r", "ㄲ": "R", "ㄴ": "s", "ㄷ": "e", "ㄸ": "E", "ㄹ": "f",
    "ㅁ": "a", "ㅂ": "q", "ㅃ": "Q", "ㅅ": "t", "ㅆ": "T", "ㅇ": "d",
    "ㅈ": "w", "ㅉ": "W", "ㅊ": "c", "ㅋ": "z", "ㅌ": "x", "ㅍ": "v", "ㅎ": "g",
    "ㅏ": "k", "ㅐ": "o", "ㅑ": "i", "ㅒ": "O", "ㅓ": "j", "ㅔ": "p",
    "ㅕ": "u", "ㅖ": "P", "ㅗ": "h", "ㅛ": "y", "ㅜ": "n", "ㅠ": "b",
    "ㅡ": "m", "ㅣ": "l",
}
# 이중모음·겹받침 → 낱자 두 개
COMPOSITE = {
    "ㅘ": "ㅗㅏ", "ㅙ": "ㅗㅐ", "ㅚ": "ㅗㅣ", "ㅝ": "ㅜㅓ", "ㅞ": "ㅜㅔ",
    "ㅟ": "ㅜㅣ", "ㅢ": "ㅡㅣ",
    "ㄳ": "ㄱㅅ", "ㄵ": "ㄴㅈ", "ㄶ": "ㄴㅎ", "ㄺ": "ㄹㄱ", "ㄻ": "ㄹㅁ",
    "ㄼ": "ㄹㅂ", "ㄽ": "ㄹㅅ", "ㄾ": "ㄹㅌ", "ㄿ": "ㄹㅍ", "ㅀ": "ㄹㅎ",
    "ㅄ": "ㅂㅅ",
}


def decompose(text: str) -> list[str]:
    """한글 음절을 초·중·종성 자모 목록으로 편다. 한글이 아니면 그대로 둔다."""
    out: list[str] = []
    for ch in text:
        code = ord(ch)
        if 0xAC00 <= code <= 0xD7A3:
            idx = code - 0xAC00
            out.append(CHOSUNG[idx // 588])
            out.append(JUNGSUNG[(idx % 588) // 28])
            jong = JONGSUNG[idx % 28]
            if jong:
                out.append(jong)
        else:
            out.append(ch)
    return out


def to_qwerty(text: str) -> str:
    """한글을 두벌식 자판의 영문 키 나열로 바꾼다 (나이키 → sksdlzl)."""
    keys: list[str] = []
    for jamo in decompose(text):
        for part in COMPOSITE.get(jamo, jamo):
            keys.append(JAMO_TO_KEY.get(part, part))
    return "".join(keys)


def to_chosung(text: str) -> str:
    """초성만 남긴다 (나이키 → ㄴㅇㅋ). 공백은 유지한다."""
    out: list[str] = []
    for ch in text:
        code = ord(ch)
        if 0xAC00 <= code <= 0xD7A3:
            out.append(CHOSUNG[(code - 0xAC00) // 588])
        elif ch == " ":
            out.append(" ")
    return "".join(out)


# ── 기계 생성 대상 ────────────────────────────────────────────────────────────
# 노출 자격을 만족하는 상품 수 상위 브랜드에서 뽑았다(2026-08-17 조회).
# 정본은 c_goods.brand_name — 재생성 시 아래 목록을 갱신한다.
BRANDS = [
    "돌돌", "칸6312", "트립션", "어썸어스", "그레이버", "원헌드레드퍼센트",
    "아스트랄 프로젝션", "이스케이프프롬", "무신사 스탠다드", "라디네오",
    "티글레이크", "엘라모", "크림소다랩", "다이나핏", "닉앤니콜", "젝시믹스",
    "아디다스", "커버낫",
]

# G3 표기 변형의 원본. 브랜드 + 흔한 카테고리어를 섞는다.
VARIANT_SOURCES = [
    ("아디다스", "qwerty"), ("커버낫", "qwerty"), ("무신사 스탠다드", "qwerty"),
    ("젝시믹스", "qwerty"), ("다이나핏", "qwerty"), ("트립션", "qwerty"),
    ("아디다스", "chosung"), ("커버낫", "chosung"), ("그레이버", "chosung"),
    ("무지티", "chosung"), ("오버핏", "chosung"),
]
SPACING_SOURCES = [
    ("반팔 티", "반팔티"), ("무지 티셔츠", "무지티셔츠"), ("오버 핏", "오버핏"),
    ("포켓 티", "포켓티"), ("무지 반팔 티", "무지반팔티"),
]
TYPO_SOURCES = [
    ("아디다스", "아디다드"), ("커버낫", "커버났"),
]

# 사람이 쓰는 짧은 키워드·문장 — 카탈로그를 뒤져 만든 것이 아니라
# "사용자가 이렇게 칠 것이다"를 기준으로 작성했다(작성자는 AI, src로 표시).
AUTHORED: dict[str, list[str]] = {
    "G2": [
        "무지티", "흰티", "검정 반팔", "오버핏 반팔", "박시핏 반팔",
        "스트라이프 티셔츠", "라운드넥 반팔", "레터링 티", "포켓 티셔츠",
        "루즈핏 반팔티", "그래픽 티", "브이넥 티셔츠", "니트 가디건",
    ],
    "G4": [
        "3만원 이하 흰 반팔티", "2만원대 남성 오버핏 반팔",
        "여름에 시원한 얇은 반팔티", "여성 크롭 스트라이프 반팔",
        "면 100% 기본 반팔티", "네이비 라운드넥 반팔 3만원 이하",
        "커플로 입을 수 있는 무지 반팔 남녀 사이즈",
        "회색 오버핏 반팔에 작은 로고 있는 것",
        "린넨 느낌 나는 시원한 남성 반팔",
        "베이지 루즈핏 반팔티 2만원 이하",
        "여성 브이넥 반팔 흰색", "땀 잘 마르는 운동용 반팔티",
        "빅사이즈 남성 반팔 티셔츠 3XL",
    ],
    "G5": [
        "로고 없는 무지 반팔티", "프린트 없는 검정 반팔",
        "너무 붙지 않는 여성 반팔티", "형광색 말고 차분한 반팔티",
        "브이넥 말고 라운드넥 반팔", "비침 없는 흰 반팔티",
        "그림 너무 크지 않은 그래픽 티", "소매 짧지 않은 반팔티",
        "화려하지 않은 기본 티셔츠",
    ],
    "G6": [
        "패딩 점퍼", "청바지 32인치", "운동화 270", "가죽 자켓",
        "asdfasdf", "12345", "코트 아우터", "샌들 슬리퍼",
        "노트북 거치대", "강아지 사료",
    ],
}

# 초성 검색을 지원하면 'ㅁㄴㅇㄹ'은 더 이상 "0건이 정답"이 아니다 — 실제로 초성이
# ㅁㄴㅇㄹ인 단어를 가진 상품이 19개 있다(A단계 실측). 자판 뭉개기로 의도했지만
# 기능이 생기면서 의미가 바뀐 사례라 G3(표기 변형)로 옮기고 논쟁 표시를 단다.
EXTRA_ENTRIES = [
    {
        "id": "x01", "bucket": "G3", "query": "ㅁㄴㅇㄹ", "src": "authored",
        "family": "fam-x01", "tags": ["chosung"], "confidence": "low",
        "note": "자판 뭉개기로 의도했으나 초성 검색을 켜면 유효한 질의가 된다"
                " — 실제로 초성이 ㅁㄴㅇㄹ인 상품 19개. 정답 방향이 갈려 주 지표에서 분리한다.",
    },
]

FAMILY_OVERRIDE = {
    # 근접 중복 실사용 질의 — 같은 파티션에 묶는다 (2차 리뷰 M9)
    "g01": "fam-yellow-shoes",
    "g05": "fam-yellow-shoes",
}


def build() -> dict:
    seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    targets = json.loads(TARGETS_PATH.read_text(encoding="utf-8"))["targets"]

    entries: list[dict] = []

    # ① 씨앗 — 주 버킷·태그·관찰 기록을 그대로 옮긴다
    for e in seed["entries"]:
        entries.append(
            {
                "id": e["id"],
                "bucket": e["bucket"],
                "query": e["query"],
                "src": e["src"],
                "family": FAMILY_OVERRIDE.get(e["id"], e["id"]),
                "tags": e.get("tags", []),
                "note": e.get("note"),
                "confidence": e.get("confidence"),
            }
        )

    # ② G1 브랜드 — 정답이 결정론적
    for i, brand in enumerate(BRANDS, start=1):
        entries.append(
            {
                "id": f"b{i:02d}",
                "bucket": "G1",
                "query": brand,
                "src": "generated",
                "family": f"fam-brand-{brand}",
                "tags": [],
                "note": "브랜드명 정본(c_goods.brand_name)에서 생성. 해당 브랜드가 아니면 0점(기준서 규칙)",
            }
        )

    # ③ G3 표기 변형 — 원본과 같은 가족으로 묶어 누출을 막는다
    n = 0
    for source, kind in VARIANT_SOURCES:
        n += 1
        variant = to_qwerty(source) if kind == "qwerty" else to_chosung(source)
        label = "한영 자판" if kind == "qwerty" else "초성"
        entries.append(
            {
                "id": f"v{n:02d}",
                "bucket": "G3",
                "query": variant,
                "src": "generated",
                "family": f"fam-brand-{source}" if source in BRANDS else f"fam-var-{source}",
                "tags": [kind],
                "note": f"{label} 변형. 원본='{source}' — 원본이 되는데 변형이 안 되면 A단계 실패",
                "origin": source,
            }
        )
    for spaced, joined in SPACING_SOURCES:
        n += 1
        entries.append(
            {
                "id": f"v{n:02d}",
                "bucket": "G3",
                "query": joined,
                "src": "generated",
                "family": f"fam-var-{spaced}",
                "tags": ["띄어쓰기"],
                "note": f"띄어쓰기 변형. 원본='{spaced}' — 두 표기가 같은 결과를 내야 한다",
                "origin": spaced,
            }
        )
    for correct, typo in TYPO_SOURCES:
        n += 1
        entries.append(
            {
                "id": f"v{n:02d}",
                "bucket": "G3",
                "query": typo,
                "src": "generated",
                "family": f"fam-brand-{correct}",
                "tags": ["오타"],
                "note": f"한 글자 오타. 원본='{correct}'",
                "origin": correct,
            }
        )

    for extra in EXTRA_ENTRIES:
        entries.append({**extra})

    # ④ 작성분
    for bucket, queries in AUTHORED.items():
        for i, q in enumerate(queries, start=1):
            entries.append(
                {
                    "id": f"a-{bucket.lower()}-{i:02d}",
                    "bucket": bucket,
                    "query": q,
                    "src": "authored",
                    "family": f"fam-{bucket.lower()}-{i:02d}",
                    "tags": [],
                    "note": None,
                }
            )

    # ⑤ 가족을 **관계로 계산한다** — 선언한 family 문자열만 믿으면 누출이 생긴다.
    # 실측(2차 구현 리뷰 Blocker): v10 'ㅁㅈㅌ'(원본 무지티)가 dev인데 같은 원문
    # 질의 a-g2-01 '무지티'는 progress였다. origin 링크와 동일 원문을 union으로
    # 합쳐야 "개발셋에서 익힌 변환을 홀드아웃에서 다시 시험"하는 누출을 막는다.
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[min(ra, rb)] = max(ra, rb)

    for e in entries:
        find(e["family"])
    # (a) 선언된 family가 같으면 같은 가족
    # (b) origin(파생의 원본)이 어떤 질의의 원문과 같으면 그 질의와 같은 가족
    # (c) 원문이 완전히 같은 질의끼리 같은 가족
    by_query_text: dict[str, list[dict]] = {}
    for e in entries:
        by_query_text.setdefault(e["query"], []).append(e)
    for rows in by_query_text.values():
        for other in rows[1:]:
            union(rows[0]["family"], other["family"])
    for e in entries:
        origin = e.get("origin")
        if origin and origin in by_query_text:
            union(e["family"], by_query_text[origin][0]["family"])

    for e in entries:
        e["familyRoot"] = find(e["family"])

    families: dict[str, list[dict]] = {}
    for e in entries:
        families.setdefault(e["familyRoot"], []).append(e)

    by_bucket_families: dict[str, list[str]] = {}
    for fam, members in families.items():
        # 가족의 대표 버킷 = 첫 구성원의 버킷 (파생은 원본과 같은 파티션이면 충분)
        by_bucket_families.setdefault(members[0]["bucket"], []).append(fam)

    partition_of: dict[str, str] = {}
    for bucket, fams in by_bucket_families.items():
        # 해시 정렬로 결정적 셔플 후 50/25/25
        ordered = sorted(fams, key=lambda f: hashlib.sha256(f.encode()).hexdigest())
        total = len(ordered)
        n_dev = round(total * 0.5)
        n_prog = round(total * 0.25)
        for i, fam in enumerate(ordered):
            if i < n_dev:
                partition_of[fam] = "dev"
            elif i < n_dev + n_prog:
                partition_of[fam] = "progress"
            else:
                partition_of[fam] = "holdout"

    for e in entries:
        e["partition"] = partition_of[e["familyRoot"]]

    counts: dict[str, dict[str, int]] = {}
    for e in entries:
        counts.setdefault(e["bucket"], {"total": 0, "dev": 0, "progress": 0, "holdout": 0})
        counts[e["bucket"]]["total"] += 1
        counts[e["bucket"]][e["partition"]] += 1

    return {
        "meta": {
            "purpose": "검색 평가 질의 세트 — 씨앗 + 기계 생성 + 작성분을 합쳐 질의 가족 단위로 층화 분할한 것.",
            "generatedBy": "backend/eval/build_query_set.py (손으로 고치지 말 것 — 생성기를 고치고 다시 돌린다)",
            "plan": "docs/plans/2026-08-17-search-eval-harness.md 2단계",
            "targets": "docs/atee/eval/bucket-targets.json",
            "lockNotice": (
                "⚠️ 잠금: partition이 'progress'·'holdout'인 항목은 튜닝에 쓰지 않는다. "
                "progress는 각 단계(A·B·C·D) 끝에서 한 번씩만, holdout은 0단계 기준선과 "
                "최종 판정 딱 두 번만 연다. 열람할 때마다 계획의 실행 기록에 남긴다."
            ),
            "openLog": [
                {"partition": "holdout", "when": "0단계 기준선 측정 (2026-08-17)", "status": "열람함"},
                {"partition": "progress", "when": "A단계 완료 시", "status": "예정"},
                {"partition": "holdout", "when": "전체 완료 최종 판정", "status": "예정"},
            ],
            "partitionRules": {
                "dev": "자유롭게 본다. 파라미터 튜닝·기준서 보정·채점자 검증을 여기서만 한다.",
                "progress": "각 단계(A·B·C·D) 끝에서 한 번씩 열어 진행 확인. 튜닝 금지.",
                "holdout": "0단계 기준선 측정과 최종 판정, 딱 두 번만 연다. 튜닝 금지.",
            },
            "counts": counts,
            "total": len(entries),
        },
        "entries": entries,
    }


def check(doc: dict) -> list[str]:
    """불변식 검사 — 어기면 평가가 무의미해지는 것들만."""
    problems: list[str] = []
    notes: list[str] = []
    targets = json.loads(TARGETS_PATH.read_text(encoding="utf-8"))["targets"]
    counts = doc["meta"]["counts"]

    for bucket, spec in targets.items():
        want = spec["count"]
        got = counts.get(bucket, {}).get("total", 0)
        if want and got < want:
            problems.append(f"{bucket}: 목표 {want}건 미달 — {got}건")
        elif want and got > want:
            # 초과는 실패가 아니지만 "목표와 일치"라고 말하면 안 된다
            notes.append(f"{bucket}: 목표 {want}건 · 실제 {got}건 (초과)")

    # 같은 가족이 두 파티션에 흩어지면 누출이다 (선언 family + 계산된 familyRoot 둘 다)
    for key in ("family", "familyRoot"):
        fam_parts: dict[str, set[str]] = {}
        for e in doc["entries"]:
            if key in e:
                fam_parts.setdefault(e[key], set()).add(e["partition"])
        for fam, parts in fam_parts.items():
            if len(parts) > 1:
                problems.append(f"가족 누출({key}): {fam} → {sorted(parts)}")

    # 관계 기반 누출 — 선언값을 우회하는 두 경로를 직접 본다
    part_of_text: dict[str, str] = {}
    for e in doc["entries"]:
        part_of_text.setdefault(e["query"], e["partition"])
    for e in doc["entries"]:
        if part_of_text[e["query"]] != e["partition"]:
            problems.append(f"동일 원문 누출: {e['query']!r} ({e['id']})")
        origin = e.get("origin")
        if origin and origin in part_of_text and part_of_text[origin] != e["partition"]:
            problems.append(
                f"origin 누출: {e['id']} {e['query']!r}({e['partition']}) ← {origin!r}({part_of_text[origin]})"
            )

    ids = [e["id"] for e in doc["entries"]]
    if len(ids) != len(set(ids)):
        problems.append("중복 id 존재")

    queries = [e["query"] for e in doc["entries"]]
    dupes = {q for q in queries if queries.count(q) > 1}
    if dupes:
        problems.append(f"중복 질의: {sorted(dupes)}")

    if notes:
        problems.extend(f"[참고] {n}" for n in notes)
    return problems


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="재생성 없이 기존 산출물 검사")
    args = parser.parse_args()

    doc = json.loads(OUT_PATH.read_text(encoding="utf-8")) if args.check else build()
    problems = check(doc)

    if not args.check:
        OUT_PATH.write_text(
            json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"생성: {OUT_PATH.relative_to(ROOT)} — {doc['meta']['total']}건")

    for bucket in ("G1", "G2", "G3", "G4", "G5", "G6", "G7", "R1"):
        c = doc["meta"]["counts"].get(bucket)
        if c:
            print(
                f"  {bucket}: 총 {c['total']:>3}  "
                f"dev {c['dev']:>2} / progress {c['progress']:>2} / holdout {c['holdout']:>2}"
            )

    hard = [p for p in problems if not p.startswith("[참고]")]
    for p in problems:
        if p.startswith("[참고]"):
            print(f"  {p}")
    if hard:
        print("\n불변식 위반:")
        for p in hard:
            print(f"  - {p}")
        return 1
    print("\n불변식 통과 (목표 개수·가족 누출 없음·중복 없음)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
