"""큐레이션끼리 닮은 순서를 미리 뽑아 둔다 (계획 2026-08-25-curation-detail-continue 1단계).

상세를 끝까지 본 사람에게 "이어볼" 다음 큐레이션을 고르는 재료다. 재료는 FOR YOU
순위가 이미 쓰는 대표 벡터(c_curation_vecs) 그대로 — 큐레이션 A의 벡터와 가장 가까운
B를 찾는 것뿐이라 새 표도, 새 서버 함수도 필요 없다.

**미리 뽑아 정적 파일로 둔다.** 64×64 = 4,032쌍짜리 고정 계산이라 사람마다 달라질 게
없다. 화면이 열릴 때마다 서버에 물으면 왕복만 늘고 답은 늘 같다.

## 허브 보정 — 왜 생 코사인을 그대로 안 쓰나

넓은 큐레이션(예: "여름옷으로 나와서 진짜 안 더운 티" 5,010건)의 대표 벡터는
"평균적인 티셔츠"에 가까워 **누구와도 어중간하게 가깝다.** 생 코사인으로 1등을 뽑으면
64개 중 12개가 그 하나로 이어졌다 — 고양이 티를 다 보고 나서 "안 더운 티"로 넘어간다.

그래서 각 후보가 **모두에게** 받는 평균 점수를 빼고 남은 차이만 본다. 1등 쏠림이
12건→7건으로 흩어지고, 고양이→강아지·축구저지→스포티처럼 사람이 볼 때 납득되는
짝이 올라온다 (2026-08-25 실측).

curation-match.ts의 희소도 보정(rarityBonus)을 여기에도 걸어 봤지만 더 나빴다.
그쪽은 앵커에 걸린 횟수에 곱하는 값이라 괜찮은데, 여기서는 n이 6건뿐인 큐레이션의
보정값이 10배라 코사인 차이를 통째로 덮었다.

⚠️ 드리프트 — c_curation_vecs가 다시 만들어지면(= curations.json이 바뀌면) 이 파일도
다시 돌린다. 안 돌리면 없어진 키가 남거나 새 큐레이션이 후보에서 빠진다.
프론트 테스트(curation-similar.test.ts)가 키 목록을 대조한다.

실행 (backend 디렉터리에서):
    python3 scripts/gen_curation_similar.py
"""
import json
from collections import defaultdict
from pathlib import Path

from gen_curation_page import connect

OUT = Path(__file__).resolve().parents[2] / "frontend/features/curation/data/curation-similar.json"

#: 큐레이션마다 남길 후보 수. 이미 본 것을 걸러내고도 남을 만큼만 —
#: 한 번에 여러 개를 보여주려는 게 아니다.
KEEP = 8


def main():
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "select a.key, b.key, 1 - (a.emb <=> b.emb) "
            "from c_curation_vecs a, c_curation_vecs b where a.key <> b.key"
        )
        pairs = cur.fetchall()

    sim = defaultdict(dict)
    for a, b, s in pairs:
        sim[a][b] = float(s)

    # 후보 b가 모두에게 받는 평균 — 위 주석의 허브 보정
    mean = {b: sum(sim[a][b] for a in sim if a != b) / (len(sim) - 1) for b in sim}

    out = {
        a: sorted(d, key=lambda b: mean[b] - d[b])[:KEEP]
        for a, d in sorted(sim.items())
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(out)}개 큐레이션 × 최대 {KEEP}건 → {OUT}")


if __name__ == "__main__":
    main()
