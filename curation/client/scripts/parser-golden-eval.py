"""무신사 검색 파서 골든셋 평가 — 자연어 20건을 /api/search에 통과시켜
'이해한 조건'(QueryIntent) 추출 품질을 축별로 채점한다.

사용: (dev 서버 실행 중) python3 client/scripts/parser-golden-eval.py
목적: 싼 LLM(llama-3.1-8b)의 파싱 품질 회귀 감시 + 프롬프트 튜닝 근거.
2026-07-31 프롬프트 개선(가격 방향·계절 추측 억제) 후 42/42(100%), 완전정답 20/20.
"""
import json, urllib.request

BASE = "http://localhost:3000/api/search"

# 골든셋: q = 자연어, expect = 좋은 파서가 뽑아야 할 핵심 축(부분집합 기준 채점).
GOLDEN = [
    {"q": "블랙 오버핏 반팔", "expect": {"colors": ["블랙"], "fits": ["오버"]}},
    {"q": "화이트 면 반팔 3만원 이하", "expect": {"colors": ["화이트"], "materials": ["면"], "priceMax": 30000}},
    {"q": "여성 슬림핏 반팔티", "expect": {"gender": "여성", "fits": ["슬림"]}},
    {"q": "부드러운 촉감 반팔", "expect": {"wear.촉감": ["부드러움"]}},
    {"q": "시원한 반팔", "expect": {"wear.any_cool": True}},
    {"q": "남성 네이비 오버핏 티셔츠", "expect": {"gender": "남성", "colors": ["네이비"], "fits": ["오버"]}},
    {"q": "면 말고 폴리에스테르 반팔", "expect": {"exclude.materials": ["면"], "materials": ["폴리에스테르"]}},
    {"q": "싼 반팔티", "expect": {"sort": "price_asc"}},
    {"q": "리뷰 많은 오버핏 반팔", "expect": {"sort": "review_count", "fits": ["오버"]}},
    {"q": "그레이 스트라이프 반팔", "expect": {"colors": ["그레이"], "patterns": ["스트라이프"]}},
    {"q": "L사이즈 블랙 반팔", "expect": {"sizeStd": [100], "colors": ["블랙"]}},
    {"q": "두꺼운 무지 반팔", "expect": {"wear.두께": ["두꺼움", "약간|두꺼움"], "patterns": ["단색"]}},
    {"q": "3만원대 남성 반팔", "expect": {"gender": "남성", "priceMin": 30000, "priceMax": 39000}},
    {"q": "비침 없는 흰 반팔", "expect": {"wear.비침": ["없음", "거의 없음"], "colors": ["화이트"]}},
    {"q": "신축성 좋은 반팔", "expect": {"wear.신축성": ["있음", "약간 있음"]}},
    {"q": "카키 오버핏 반팔 5만원 이하", "expect": {"colors": ["카키"], "fits": ["오버"], "priceMax": 50000}},
    {"q": "여름에 시원하게 입을 얇은 반팔", "expect": {"wear.두께": ["얇음", "약간 얇음"]}},
    {"q": "로고 그래픽 블랙 오버핏", "expect": {"patterns": ["로고/그래픽"], "colors": ["블랙"], "fits": ["오버"]}},
    {"q": "베이지 반팔 2만원 이하 여성", "expect": {"colors": ["베이지"], "priceMax": 20000, "gender": "여성"}},
    {"q": "폴리에스테르 남성 슬림핏 반팔", "expect": {"materials": ["폴리에스테르"], "gender": "남성", "fits": ["슬림"]}},
]

WEAR_AXES = ["촉감", "두께", "비침", "신축성", "계절"]


def call(q):
    req = urllib.request.Request(BASE, data=json.dumps({"query": q}).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def subset(exp, got):
    return all(e in (got or []) for e in exp)


def check(expect, intent):
    style = intent.get("style", {})
    wear = intent.get("wearChars", {})
    res = {}
    for k, v in expect.items():
        if k in ("colors", "patterns", "materials", "fits", "keywords"):
            res[k] = subset(v, style.get(k))
        elif k == "gender":
            res[k] = intent.get("gender") == v
        elif k in ("priceMax", "priceMin"):
            res[k] = intent.get(k) == v
        elif k == "sizeStd":
            res[k] = subset(v, intent.get("sizeStd"))
        elif k == "sort":
            res[k] = intent.get("sort") == v
        elif k.startswith("exclude."):
            res[k] = subset(v, intent.get("exclude", {}).get(k.split(".")[1]))
        elif k.startswith("wear."):
            axis = k.split(".")[1]
            if axis == "any_cool":
                res[k] = bool(wear.get("두께") or wear.get("비침") or wear.get("계절"))
            else:
                res[k] = any(x in (wear.get(axis) or []) for x in v)
    return res


def brief(intent):
    s = intent.get("style", {})
    w = {a: intent["wearChars"][a] for a in WEAR_AXES if intent.get("wearChars", {}).get(a)}
    parts = [f"{k}={s[k]}" for k in ("colors", "patterns", "materials", "fits") if s.get(k)]
    if intent.get("gender"): parts.append(f"g={intent['gender']}")
    if intent.get("sizeStd"): parts.append(f"size={intent['sizeStd']}")
    if intent.get("priceMin") or intent.get("priceMax"):
        parts.append(f"price={intent.get('priceMin')}~{intent.get('priceMax')}")
    if w: parts.append(f"wear={w}")
    if intent.get("sort") != "relevance": parts.append(f"sort={intent.get('sort')}")
    if s.get("keywords"): parts.append(f"kw={s['keywords']}")
    return " ".join(parts) or "(빈 intent)"


def main():
    tot_keys = tot_hit = full = 0
    axis_miss = {}
    print(f"{'쿼리':<28} {'점수':<7} 결과")
    print("-" * 100)
    for g in GOLDEN:
        try:
            intent = call(g["q"]).get("intent", {})
        except Exception as e:  # noqa: BLE001
            print(f"{g['q']:<28} ERROR {e}")
            continue
        res = check(g["expect"], intent)
        hit, n = sum(res.values()), len(res)
        tot_keys += n; tot_hit += hit
        if hit == n: full += 1
        for k, ok in res.items():
            if not ok:
                ax = k.split(".")[0]
                axis_miss[ax] = axis_miss.get(ax, 0) + 1
        print(f"{g['q']:<28} {hit}/{n:<5} {brief(intent)}")
        misses = [k for k, ok in res.items() if not ok]
        if misses:
            print(f"{'':28} X놓침: {misses}")
    print("-" * 100)
    print(f"\n집계: 축 정확도 {tot_hit}/{tot_keys} ({round(100 * tot_hit / tot_keys)}%) · 완전정답 {full}/{len(GOLDEN)}")
    print("자주 놓친 축:", dict(sorted(axis_miss.items(), key=lambda x: -x[1])))


if __name__ == "__main__":
    main()
