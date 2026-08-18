"""골든셋 baseline 측정 v2.1 — 현행 검색(실 LLM) API-route E2E를 골든셋으로 채점.

- 측정 대상은 /api/search 라우트 응답이다(클라이언트 UI의 9초 예산과 별개 —
  지연 초과는 latencyMs로 기록되며 별도 실패 집계는 하지 않는다).

- 관측용 E2E(설계 §5: 실 LLM은 CI 밖). LLM 비결정성이 관측 대상이므로 기본 3회 반복,
  평균과 범위를 함께 보고한다. 1회 관측값을 일반화하지 않는다.
- 지표 명명 주의: 쿼리 골든셋 지표는 "E2E 출력 누락률"(하드필터 탈락·후보 1,000
  절단·랭킹 300 절단이 뒤섞인 최종 출력 기준)이다 — 기준 3의 축별 누락률(≤5%)과
  직접 비교하지 말 것. 갭 유형(metadata/synonym/stopword)별로 분해해 보고한다.
- 색 precision은 abstention 규약: 기대값이 있는데 미추출(침묵)이면 오답을 안 냈으므로
  precision 분모에서 제외하되, coverage(추출 시도율)·recall을 필수 동반 보고한다.
  unmapped(침묵이 정답) 케이스는 별도 "침묵 정확도"로 보고한다.
- 요청 오류가 하나라도 있으면 해당 회차는 무효(부분 실패가 점수를 좋게 만들지 않게).
- 감사 산출물: 회차별 채점 입력(JSONL: 쿼리·mode·intent·결과 goods 목록·지연·시각)과
  aggregate(JSON: HEAD·flag·골든셋 sha256 포함)를 --out 디렉터리에 저장한다.

실행: backend/ 에서
  ./venv/bin/python scripts/measure_golden_baseline.py [--runs 3] \
      [--base http://localhost:3000] [--out ../docs/p3-t0/baseline-20260801]
"""

import argparse
import datetime
import hashlib
import json
import statistics
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
QG_PATH = ROOT / "client/features/search/data/goldens/query-intent-golden.json"
CG_PATH = ROOT / "client/features/search/data/goldens/color-expression-golden.json"


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def head_sha() -> str:
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True
        ).stdout.strip()
    except Exception:
        return "unknown"


def search(base, q):
    req = urllib.request.Request(
        f"{base}/api/search", data=json.dumps({"query": q}).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r), int((time.time() - t0) * 1000)


def score_run(recs, qg, cg):
    """기록(recs: {(kind,key): rec})을 채점 — 라이브 측정과 --rescore가 공유하는 단일 경로."""
    miss = {"clean": [0, 0], "metadata": [0, 0], "synonym": [0, 0], "stopword": [0, 0]}
    trap_color_leaks = 0  # expected.colors==[] 인데 색 하드 추출된 쿼리 수
    sort_ok = sort_total = 0
    for e in qg["entries"]:
        r = recs[("query", e["id"])]
        got = set(r["resultGoods"])
        answers = e.get("answerGoods", []) if e["answerType"] == "must_include" else []
        for g in answers:
            gap = g.get("gap", "")
            bucket = ("metadata" if gap.startswith("metadata") else
                      "synonym" if gap.startswith("synonym") else
                      "stopword" if gap.startswith("extractor") else "clean")
            miss[bucket][1] += 1
            if str(g["goodsNo"]) not in got:
                miss[bucket][0] += 1
        ex = e["expected"]
        if ex.get("colors") == [] and r["intent"]["style"]["colors"]:
            trap_color_leaks += 1
        if e["answerType"] == "sort":
            sort_total += 1
            if r["intent"].get("sort") == ex.get("sort"):
                sort_ok += 1

    p_sum = p_n = 0
    r_sum = r_n = 0
    covered = expected_n = 0
    silent_ok = silent_n = 0
    for e in cg["entries"]:
        parsed = set(recs[("color", e["expression"])]["intent"]["style"]["colors"])
        want = set(e["expected"])
        if not want:  # unmapped — 침묵이 정답
            silent_n += 1
            silent_ok += 0 if parsed else 1
        else:
            expected_n += 1
            r_sum += len(parsed & want) / len(want)
            r_n += 1
            if parsed:  # abstention 규약: 추출을 시도한 경우만 precision 분모
                covered += 1
                p_sum += len(parsed & want) / len(parsed)
                p_n += 1
    return {
        "miss": miss, "trapColorLeaks": trap_color_leaks, "sort": [sort_ok, sort_total],
        "color": {
            "precisionOnAttempt": p_sum / p_n if p_n else 1.0,
            "coverage": covered / expected_n,
            "recall": r_sum / r_n,
            "silentAccuracy": silent_ok / silent_n,
        },
        "colorCounts": {"attempted": p_n, "expected": expected_n, "silent": silent_n},
    }


def load_run(path):
    recs = {}
    for line in path.open():
        r = json.loads(line)
        recs[(r["kind"], r["key"])] = r
    return recs


def run_once(base, qg, cg, raw_path):
    """1회차 측정 — 요청 오류 발생 시 None(회차 무효)."""
    raw = raw_path.open("w")
    recs = {}

    def record(kind, key, d, ms):
        rec = {
            "kind": kind, "key": key,
            "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
            "latencyMs": ms, "mode": d["mode"], "intent": d["intent"],
            "resultGoods": [str(r["goodsNo"]) for r in d["results"]],
        }
        recs[(kind, key)] = rec
        raw.write(json.dumps(rec, ensure_ascii=False) + "\n")

    try:
        for e in qg["entries"]:
            d, ms = search(base, e["query"])
            record("query", e["id"], d, ms)
            time.sleep(0.1)
        for e in cg["entries"]:
            d, ms = search(base, f"{e['expression']} 반팔티")
            record("color", e["expression"], d, ms)
            time.sleep(0.1)
    except Exception as ex:  # noqa: BLE001 — 어떤 요청 오류든 회차 무효
        raw.close()
        print(f"  ⚠️ 회차 무효(요청 오류): {ex}")
        return None
    raw.close()
    return score_run(recs, qg, cg)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--base", default="http://localhost:3000")
    ap.add_argument("--out", default=str(ROOT / "docs/p3-t0/baseline-out"))
    ap.add_argument("--rescore", metavar="DIR",
                    help="측정 없이 기존 run*.jsonl에서 aggregate만 재생성(채점 경로 동일)")
    args = ap.parse_args()

    out = Path(args.rescore) if args.rescore else Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    qg = json.loads(QG_PATH.read_text())
    cg = json.loads(CG_PATH.read_text())

    runs = []
    if args.rescore:
        for f in sorted(out.glob("run*.jsonl")):
            print(f"— rescore {f.name}")
            runs.append(score_run(load_run(f), qg, cg))
    else:
        for i in range(args.runs):
            print(f"— 회차 {i + 1}/{args.runs}")
            r = run_once(args.base, qg, cg, out / f"run{i + 1}.jsonl")
            if r:
                runs.append(r)
    if not runs:
        raise SystemExit("유효 회차 없음")

    def stat(vals):
        return {"mean": statistics.mean(vals), "min": min(vals), "max": max(vals)}

    agg = {
        "measuredAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "gitHead": head_sha(),
        "flagDeclared": "측정 프로세스는 flag를 설정하지 않음(서버 환경이 실효값)",
        "base": args.base,
        "scope": "API-route E2E(/api/search 응답 기준) — 클라이언트 9초 예산과 별개",
        "rescoredFrom": str(out) if args.rescore else None,
        "runsRequested": args.runs, "runsValid": len(runs),
        "goldens": {"query_sha256": sha(QG_PATH), "color_sha256": sha(CG_PATH)},
        "metricNote": "e2eOutputMiss는 최종 출력 기준(하드필터·절단 혼합) — 기준3 축별 누락률과 직접 비교 금지",
        "e2eOutputMiss": {
            b: {"denominator": runs[0]["miss"][b][1],
                "missed": stat([r["miss"][b][0] for r in runs])}
            for b in ("clean", "metadata", "synonym", "stopword")
        },
        "trapColorLeaks": stat([r["trapColorLeaks"] for r in runs]),
        "sortCorrect": {**stat([r["sort"][0] for r in runs]), "total": runs[0]["sort"][1]},
        "color": {
            k: stat([r["color"][k] for r in runs])
            for k in ("precisionOnAttempt", "coverage", "recall", "silentAccuracy")
        },
        "colorCounts": {
            k: stat([r["colorCounts"][k] for r in runs])
            for k in ("attempted", "expected", "silent")
        },
    }
    (out / "aggregate.json").write_text(json.dumps(agg, ensure_ascii=False, indent=1))

    print(f"\n== 집계({len(runs)}회 유효) → {out}/aggregate.json ==")
    for b in ("clean", "metadata", "synonym", "stopword"):
        e = agg["e2eOutputMiss"][b]
        m = e["missed"]
        print(f"E2E 출력 누락({b}): 평균 {m['mean']:.1f}/{e['denominator']} "
              f"(범위 {m['min']}~{m['max']})")
    c = agg["color"]
    print(f"색 precision(시도분·abstention): 평균 {c['precisionOnAttempt']['mean']:.1%} "
          f"(범위 {c['precisionOnAttempt']['min']:.1%}~{c['precisionOnAttempt']['max']:.1%})")
    print(f"색 coverage(추출 시도율): 평균 {c['coverage']['mean']:.1%} "
          f"| recall: 평균 {c['recall']['mean']:.1%} "
          f"| 침묵 정확도: 평균 {c['silentAccuracy']['mean']:.1%}")
    print(f"함정 색 오추출 쿼리: 평균 {agg['trapColorLeaks']['mean']:.1f}개 "
          f"| 정렬 해석: 평균 {agg['sortCorrect']['mean']:.1f}/{agg['sortCorrect']['total']}")


if __name__ == "__main__":
    main()
