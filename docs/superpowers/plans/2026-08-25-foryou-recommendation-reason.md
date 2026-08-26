# FOR YOU 카드 추천 이유 한 줄 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FOR YOU 모자이크 피드에서 키워드 근거로 개인화된 카드에 "왜 추천됐는지" 한 줄을 보여준다.

**Architecture:** 큐레이션 64장 각각의 추천 이유 문구는 배치 스크립트로 **한 번만** 만들어 `gen_curation_page.py`의 `REASONS` 딕셔너리(기존 `NOTES` 오버레이와 같은 패턴)에 저장하고 생성기가 `curations.json`에 `reason` 필드로 흘려보낸다. 화면은 런타임에 LLM을 부르지 않는다. 그 세션에서 해당 카드가 **키워드 근거**로 개인화 순위에 올랐을 때만 저장된 문구를 보여주면 된다. 벡터 유사도만으로 오른 카드나 개인화가 안 걸린 카드는 문구를 비운다.

**Tech Stack:** 백엔드는 Python(psycopg) 배치 스크립트 + Anthropic SDK(Haiku 4.5). 프론트엔드는 TypeScript(domain 순수 함수 + React 훅).

## Global Constraints

- 문구를 전부 배치로 미리 만들기 때문에 런타임(브라우저·서버 렌더)에서 LLM API를 호출하지 않는다.
- API 키는 코드에 하드코딩하지 말고 환경변수(`ANTHROPIC_API_KEY`)로만 읽는다.
- 추천 이유는 **키워드 근거로 개인화된 카드에만** 보인다. 벡터 유사도만으로 오른 카드, 개인화가 안 걸린 카드는 문구를 비워 지어낸 설명을 보여주지 않는다.
- 배치 생성 모델은 Claude Haiku 4.5(`claude-haiku-4-5`).
- 커밋 메시지는 `<type>: <한글 설명>` 형식, 마지막 줄에 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- 프론트엔드 커밋 전 `npm run check`(frontend/에서) 통과.

---

## Task 1: 백엔드 — REASONS 오버레이 자리 만들기

**Files:**
- Modify: `backend/scripts/gen_curation_page.py:755-761` (NOTES 정의부 바로 뒤) — `REASONS` 딕셔너리 추가
- Modify: `backend/scripts/gen_curation_page.py:916-919` (`build()`의 출력 딕셔너리) — `reason` 필드 병합

**Interfaces:**
- Produces: 모듈 전역 `REASONS: dict[str, str]` (key → 추천 이유 한 줄). Task 3에서 채운다.
- Produces: `build()`가 만드는 각 큐레이션 딕셔너리에 값이 있을 때만 `reason` 키가 추가되고 그대로 `curations.json`으로 흘러간다.

- [ ] **Step 1: `NOTES` 뒤에 `REASONS` 오버레이 딕셔너리를 추가한다**

`backend/scripts/gen_curation_page.py`의 762번째 줄(빈 줄, `NOTES = {...}` 딕셔너리가 끝난 바로 다음) 앞에 삽입:

```python

# ── 손으로 검수한 추천 이유 한 줄 (key: 문구) ──────────────────
# FOR YOU 카드에서, 화면이 키워드 근거로 개인화했다고 판정한 큐레이션에만 붙는다
# (프론트 curation-match.ts의 withGroundedReasons). 배치 초안 생성:
# scripts/gen_curation_reasons.py. 사람이 훑어보고 여기 손으로 옮겨 적은 것만 최종이다.
# 계획: docs/superpowers/plans/2026-08-25-foryou-recommendation-reason.md
REASONS = {}
```

- [ ] **Step 2: `build()`의 출력 딕셔너리에 `reason`을 병합한다**

`backend/scripts/gen_curation_page.py:916-919`, 기존:

```python
        out.append({**{k: c[k] for k in ("key", "title", "cond")},
                    "lede": c["lede"] or "", "n": n, "items": items,
                    "sort": "조회순" if order == NEW_ARRIVAL_ORDER else "평점순",
                    "date": c["at"].strftime("%Y.%m.%d")})
```

다음으로 교체(`CurationItem`의 `g` 필드와 같은 "있을 때만 넣는" 관례를 그대로 따른다):

```python
        out.append({**{k: c[k] for k in ("key", "title", "cond")},
                    "lede": c["lede"] or "", "n": n, "items": items,
                    **({"reason": REASONS[c["key"]]} if REASONS.get(c["key"]) else {}),
                    "sort": "조회순" if order == NEW_ARRIVAL_ORDER else "평점순",
                    "date": c["at"].strftime("%Y.%m.%d")})
```

- [ ] **Step 3: 기존 자체점검이 안 깨졌는지 확인한다**

Run (backend 디렉터리에서): `.venv/bin/python scripts/gen_curation_page.py --demo`
Expected: `demo ok` (REASONS가 아직 비어 있으니 화면엔 영향이 없다. 이 단계는 자리만 만든다)

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/gen_curation_page.py
git commit -m "$(cat <<'EOF'
feat: 큐레이션에 추천 이유 문구 자리를 만든다

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 백엔드 — 추천 이유 초안 배치 생성 스크립트

**Files:**
- Create: `backend/scripts/gen_curation_reasons.py`
- Modify: `backend/requirements.txt` — `anthropic` 추가

**Interfaces:**
- Consumes: `backend/scripts/gen_curation_page.py`의 `SEED`(list of dict, 각 항목에 `key`·`title`·`lede`·`cond_labels`)를 import로 가져온다.
- Produces: `backend/scripts/curation_reasons_draft.json` (key → 초안 문구). Task 3에서 사람이 검수해 `REASONS`에 옮긴다. 화면·생성기에는 영향 없다.

- [ ] **Step 1: 의존성 추가**

정확한 최소 버전은 확인 못 했으므로 버전을 고정하지 않는다. 설치할 때 `pip show anthropic`으로 실제 버전을 확인해 필요하면 나중에 고정한다. `backend/requirements.txt` 끝에 한 줄 추가:

```
anthropic
```

- [ ] **Step 2: 배치 스크립트 작성**

Create `backend/scripts/gen_curation_reasons.py`:

```python
"""FOR YOU 카드 추천 이유 한 줄 초안 생성 (사람 검수 전).

큐레이션 각각의 제목·소개문단·선별조건 라벨을 근거로, "최근 관심 보인 것과 왜
맞는지"를 설명하는 한국어 한 줄을 Claude Haiku로 만든다. 결과는 파일로만 남고
gen_curation_page.py의 REASONS 딕셔너리에는 자동으로 반영되지 않는다 — 사람이
훑어보고 확정한 것만 손으로 옮겨 적는다.
계획: docs/superpowers/plans/2026-08-25-foryou-recommendation-reason.md

실행 (backend 디렉터리에서, ANTHROPIC_API_KEY 필요):
    .venv/bin/python scripts/gen_curation_reasons.py           # 전체 초안 생성
    .venv/bin/python scripts/gen_curation_reasons.py --demo    # 프롬프트 조립 자체점검(API 호출 없음)
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from gen_curation_page import SEED  # noqa: E402

MODEL = "claude-haiku-4-5"
OUT = Path(__file__).parent / "curation_reasons_draft.json"

PROMPT = """아래 큐레이션 정보를 보고, "최근 관심 보인 것과 왜 맞는지"를 설명하는
한국어 한 줄을 만들어라.

큐레이션 제목: {title}
소개: {lede}
선별 조건: {cond}

규칙:
- 30자 안팎, 존댓말체(-예요/-해요), 이모지 없음.
- "최근 관심 보인" 또는 이와 비슷한 말로 시작한다.
- 위에 없는 사실을 지어내지 않는다. 문장 하나만 출력한다(따옴표·설명 없이)."""


def build_prompt(entry):
    """SEED 한 항목 → LLM에 보낼 프롬프트 문자열."""
    return PROMPT.format(
        title=entry["title"], lede=entry["lede"],
        cond=", ".join(entry["cond_labels"]))


def generate_all(entries, client):
    out = {}
    for entry in entries:
        msg = client.messages.create(
            model=MODEL, max_tokens=200,
            messages=[{"role": "user", "content": build_prompt(entry)}])
        text = msg.content[0].text.strip()
        out[entry["key"]] = text
        print(f"{entry['key']}: {text}")
    return out


def demo():
    """자체 점검: 프롬프트가 근거(제목·조건)를 실제로 담는지. API 호출 없음."""
    entry = {"key": "cat_print", "title": "고양이 프린트 반팔",
              "lede": "고양이 그래픽이 크게 들어간 것.", "cond_labels": ["고양이", "9/9"]}
    p = build_prompt(entry)
    assert "고양이 프린트 반팔" in p, p
    assert "고양이, 9/9" in p, p
    print("demo ok")


def main():
    if "--demo" in sys.argv:
        demo()
        return
    from anthropic import Anthropic
    client = Anthropic()
    result = generate_all(SEED, client)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"\n{len(result)}장 초안 → {OUT}")
    print("훑어보고 고친 뒤 gen_curation_page.py의 REASONS에 손으로 옮겨 적을 것.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: 자체 점검 실행 (API 호출 없음)**

Run (backend 디렉터리에서): `.venv/bin/python scripts/gen_curation_reasons.py --demo`
Expected: `demo ok`

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/gen_curation_reasons.py backend/requirements.txt
git commit -m "$(cat <<'EOF'
feat: 추천 이유 초안을 배치로 만드는 스크립트를 추가한다

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 백엔드 — 초안 검수하고 REASONS 확정, 데이터 재생성

**Files:**
- Modify: `backend/scripts/gen_curation_page.py` (Task 1의 `REASONS = {}`를 확정된 내용으로 교체)
- Modify (생성 결과): `frontend/features/curation/data/curations.json`

**Interfaces:**
- Consumes: `backend/scripts/curation_reasons_draft.json` (Task 2 산출물)
- Produces: `REASONS` 딕셔너리가 실제 문구로 채워짐 → `curations.json`의 각 큐레이션 중 근거 문구가 있는 것만 `reason` 필드가 생김.

- [ ] **Step 1: 초안 생성 실행**

Run (backend 디렉터리에서, `ANTHROPIC_API_KEY` 환경변수 필요): `.venv/bin/python scripts/gen_curation_reasons.py`
Expected: 64줄 출력(`key: 문구`) + `curation_reasons_draft.json` 생성 확인.

- [ ] **Step 2: 초안을 훑어보고 확정한다**

`backend/scripts/curation_reasons_draft.json`을 열어 64줄을 눈으로 훑는다. 근거 없는 말(제목·조건에 없는 사실)이나 어색한 문장이 있으면 고친다.

- [ ] **Step 3: 확정된 내용을 `REASONS`에 옮겨 적는다**

`backend/scripts/gen_curation_page.py`의 `REASONS = {}`(Task 1에서 추가한 자리)를 확정된 내용으로 교체한다:

```python
REASONS = {
    "baseball_raglan": "...",
    "cat_print": "...",
    # ... 64장 전부
}
```

- [ ] **Step 4: 생성기를 다시 돌려 데이터에 반영한다**

Run (backend 디렉터리에서): `.venv/bin/python scripts/gen_curation_page.py`
Expected: 콘솔에 큐레이션별 건수·제목이 출력되고 `frontend/features/curation/data/curations.json`이 갱신됨.

- [ ] **Step 5: reason 필드가 실제로 들어갔는지 확인한다**

Run: `python3 -c "import json; d=json.load(open('frontend/features/curation/data/curations.json')); print(sum(1 for c in d if c.get('reason')), '/', len(d))"`
Expected: `N / 64` 형태로 N이 0보다 큰 값(REASONS를 채운 만큼).

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/gen_curation_page.py backend/scripts/curation_reasons_draft.json frontend/features/curation/data/curations.json
git commit -m "$(cat <<'EOF'
data: 큐레이션 64장에 추천 이유 문구를 채운다

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 프론트엔드 domain — reason 필드 + 키워드 근거 판정

**Files:**
- Modify: `frontend/features/curation/domain/curation.ts` — `Curation`에 `reason?: string` 추가
- Modify: `frontend/features/curation/domain/curation-match.ts` — `ScoredCuration`에 `grounded` 추가, `groundedKeys`·`withGroundedReasons` 신규
- Test: `frontend/features/curation/domain/curation-match.test.ts`

**Interfaces:**
- Consumes: 없음. 다른 태스크의 산출물에 의존하지 않으므로 Task 1~3과 병렬로 진행할 수 있다.
- Produces:
  - `Curation.reason?: string`
  - `ScoredCuration.grounded: boolean`
  - `groundedKeys(scored: ScoredCuration[]): Set<string>`
  - `withGroundedReasons<T extends { key: string; reason?: string }>(curations: T[], grounded: Set<string>): T[]`
  - Task 5가 이 세 함수와 필드를 그대로 가져다 쓴다.

- [ ] **Step 1: `Curation`에 `reason` 필드 추가**

`frontend/features/curation/domain/curation.ts`, 기존:

```ts
  /** 상황 색. 상세의 번호와 장 제목에만 쓴다 (없으면 흰색) */ accent?: string;
}
```

다음으로 교체:

```ts
  /** 상황 색. 상세의 번호와 장 제목에만 쓴다 (없으면 흰색) */ accent?: string;
  /** FOR YOU 추천 이유 한 줄 — 키워드 근거로 개인화됐을 때만 화면에 노출한다
   *  (curation-match.ts의 withGroundedReasons). 계획 2026-08-25. */
  reason?: string;
}
```

- [ ] **Step 2: 실패하는 테스트부터 쓴다**

`frontend/features/curation/domain/curation-match.test.ts` 맨 위 import에 `groundedKeys`, `withGroundedReasons` 추가:

```ts
import {
  type CurationRule,
  groundedKeys,
  orderByTaste,
  rarityBonus,
  scoreCurations,
  viewDamping,
  withGroundedReasons,
} from "@/features/curation/domain/curation-match";
```

파일 끝(`describe("orderByTaste", ...)` 블록 뒤)에 추가:

```ts

describe("groundedKeys / withGroundedReasons", () => {
  it("키워드로 걸린 것만 근거 있음으로 잡는다", () => {
    const scored = scoreCurations(CURATIONS, RULES, [
      { title: "고양이 반팔티", weight: 4 },
    ]);
    expect(groundedKeys(scored)).toEqual(new Set(["cat"]));
  });

  it("벡터로만 걸린 것은 근거 없음이다", () => {
    const scored = scoreCurations(CURATIONS, RULES, [], {}, { summer: 0.8, cat: 0.6 });
    expect(scored.map((s) => s.key)).toEqual(["summer"]);
    expect(groundedKeys(scored)).toEqual(new Set());
  });

  it("근거 없는 큐레이션의 reason은 지워진다", () => {
    const withReasons = [
      { key: "cat", n: 1151, reason: "고양이라서" },
      { key: "summer", n: 8180, reason: "여름이라서" },
    ];
    const stripped = withGroundedReasons(withReasons, new Set(["cat"]));
    expect(stripped.find((c) => c.key === "cat")?.reason).toBe("고양이라서");
    expect(stripped.find((c) => c.key === "summer")?.reason).toBeUndefined();
  });

  it("근거 있는 큐레이션은 원래 객체를 그대로 돌려준다(불필요한 복사 없음)", () => {
    const withReasons = [{ key: "cat", n: 1151, reason: "고양이라서" }];
    const [result] = withGroundedReasons(withReasons, new Set(["cat"]));
    expect(result).toBe(withReasons[0]);
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run (frontend 디렉터리에서): `npm run test -- curation-match`
Expected: FAIL. `groundedKeys`/`withGroundedReasons`가 존재하지 않는다는 타입·런타임 에러가 난다.

- [ ] **Step 4: `curation-match.ts` 구현**

`frontend/features/curation/domain/curation-match.ts`, `ScoredCuration` 기존:

```ts
export interface ScoredCuration {
  key: string;
  score: number;
}
```

다음으로 교체:

```ts
export interface ScoredCuration {
  key: string;
  score: number;
  /** 키워드 근거로 걸렸는가 — 화면에서 추천 이유 문구를 보여줄지의 기준 */
  grounded: boolean;
}
```

`scoreCurations`의 반환부(파일 끝쪽 `return raw...` 블록) 기존:

```ts
  return raw
    .map((r) => ({
      key: r.key,
      index: r.index,
      score:
        ((maxKw > 0 ? (r.kw / maxKw) * (1 - VECTOR_WEIGHT) : 0) +
          (maxVec > 0 ? (r.vec / maxVec) * VECTOR_WEIGHT : 0)) *
        viewDamping(views[r.key] ?? 0),
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ key, score }) => ({ key, score }));
```

다음으로 교체:

```ts
  return raw
    .map((r) => ({
      key: r.key,
      index: r.index,
      grounded: r.kw > 0,
      score:
        ((maxKw > 0 ? (r.kw / maxKw) * (1 - VECTOR_WEIGHT) : 0) +
          (maxVec > 0 ? (r.vec / maxVec) * VECTOR_WEIGHT : 0)) *
        viewDamping(views[r.key] ?? 0),
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ key, score, grounded }) => ({ key, score, grounded }));
```

파일 맨 끝에 추가:

```ts

/** 점수를 받은 것 중 키워드 근거로 걸린 키만 모은다(벡터 전용은 제외). */
export function groundedKeys(scored: ScoredCuration[]): Set<string> {
  return new Set(scored.filter((s) => s.grounded).map((s) => s.key));
}

/**
 * 추천 이유 문구는 키워드 근거가 있을 때만 보여준다 — 벡터 유사도만으로는 "왜"를
 * 구체적으로 설명할 수 없다(VECTOR_WEIGHT 주석 참고). 근거가 없는 큐레이션은
 * reason이 지워진 사본을 돌려준다. 근거가 있거나 reason이 원래 없으면 원본을
 * 그대로 돌려준다(불필요한 복사를 피한다).
 */
export function withGroundedReasons<T extends { key: string; reason?: string }>(
  curations: T[],
  grounded: Set<string>,
): T[] {
  return curations.map((c) =>
    grounded.has(c.key) || !c.reason ? c : { ...c, reason: undefined });
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm run test -- curation-match`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/features/curation/domain/curation.ts frontend/features/curation/domain/curation-match.ts frontend/features/curation/domain/curation-match.test.ts
git commit -m "$(cat <<'EOF'
feat: 큐레이션 이유 필드와 키워드 근거 판정을 추가한다

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 프론트엔드 view-model — useForYouOrder에 근거 판정 연결

**Files:**
- Modify: `frontend/features/curation/presentation/view-model/use-for-you-order.ts`
- Test: `frontend/features/curation/presentation/view-model/use-for-you-order.test.ts`

**Interfaces:**
- Consumes: Task 4의 `groundedKeys`, `withGroundedReasons`, `scoreCurations`(기존), `Curation.reason?`
- Produces: `useForYouOrder`의 반환 타입은 `Curation[]` 그대로다. 각 원소의 `reason`만 그 세션에 근거가 있을 때 채워진 상태로 나간다. 호출부(`curation-pane.tsx`)는 수정할 필요 없다.

- [ ] **Step 1: 실패하는 테스트부터 쓴다**

`frontend/features/curation/presentation/view-model/use-for-you-order.test.ts`의 `describe("useForYouOrder", ...)` 블록 끝(마지막 `it(...)` 뒤, 닫는 `});` 앞)에 추가:

```ts

  it("키워드 근거로 걸린 큐레이션엔 이유 문구가 남는다", async () => {
    const withReason = curations.map((c) =>
      c.key === "cat_print" ? { ...c, reason: "고양이를 좋아해서" } : c,
    );
    summary.mockReturnValue({
      longAnchors: [{ goodsNo: 111, weight: 4 }],
      sessionAnchors: [],
    });
    restSelect.mockResolvedValue([{ goods_no: 111, title: "고양이 티셔츠" }]);
    const { result } = render(withReason);
    await waitFor(() => {
      expect(result.current[0].key).toBe("cat_print");
    });
    expect(result.current[0].reason).toBe("고양이를 좋아해서");
  });

  it("벡터로만 걸리면 이유 문구가 없어진다 — 근거를 지어내지 않는다", async () => {
    const withReason = curations.map((c) =>
      c.key === "embroidery" ? { ...c, reason: "자수라서" } : c,
    );
    summary.mockReturnValue({
      longAnchors: [{ goodsNo: 111, weight: 4 }],
      sessionAnchors: [],
    });
    restSelect.mockRejectedValue(new Error("제목 조회 실패"));
    rpcPost.mockResolvedValue([{ key: "embroidery", score: 0.9 }]);
    const { result } = render(withReason);
    await waitFor(() => {
      expect(result.current[0].key).toBe("embroidery");
    });
    expect(result.current[0].reason).toBeUndefined();
  });

  it("개인화가 안 걸리면(콜드스타트) 이유 문구도 없다", () => {
    const withReason = curations.map((c) =>
      c.key === "cat_print" ? { ...c, reason: "고양이를 좋아해서" } : c,
    );
    summary.mockReturnValue({ longAnchors: [], sessionAnchors: [] });
    const { result } = render(withReason);
    expect(result.current.find((c) => c.key === "cat_print")?.reason).toBeUndefined();
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run (frontend 디렉터리에서): `npm run test -- use-for-you-order`
Expected: 새 테스트 3개 FAIL, 기존 테스트는 그대로 PASS. reason이 원본 그대로 남아 벡터 전용·콜드스타트 케이스에서도 문구가 보이기 때문이다.

- [ ] **Step 3: `use-for-you-order.ts` 구현**

import 블록, 기존:

```ts
import {
  type CurationRule,
  type CurationVectors,
  orderByTaste,
} from "@/features/curation/domain/curation-match";
```

다음으로 교체:

```ts
import {
  type CurationRule,
  type CurationVectors,
  groundedKeys,
  orderByTaste,
  scoreCurations,
  withGroundedReasons,
} from "@/features/curation/domain/curation-match";
```

파일 상단, `rules` 선언 바로 아래에 모듈 상수 추가:

```ts
const rules: Record<string, CurationRule | undefined> = curationRules;
/** 개인화가 아예 안 걸렸을 때 이유 문구를 지우는 용도 — 매번 새로 만들 필요가 없다 */
const NO_GROUNDED = new Set<string>();
```

`showBase`, 기존:

```ts
    const showBase = () => {
      shownRef.current = mine;
      setTasteOrdered(null);
    };
```

다음으로 교체:

```ts
    const showBase = () => {
      shownRef.current = withGroundedReasons(mine, NO_GROUNDED);
      setTasteOrdered(null);
    };
```

`reorder`, 기존:

```ts
    const reorder = () => {
      if (!live) return; // 성별·목록이 바뀐 뒤 도착한 응답은 버린다
      const next = orderByTaste(
        mine,
        rules,
        cachedAnchorTitles(anchors),
        views,
        vectors,
      );
      shownRef.current = next;
      setTasteOrdered(next);
    };
```

다음으로 교체:

```ts
    const reorder = () => {
      if (!live) return; // 성별·목록이 바뀐 뒤 도착한 응답은 버린다
      const anchorTitles = cachedAnchorTitles(anchors);
      const next = orderByTaste(mine, rules, anchorTitles, views, vectors);
      // 이유 문구는 벡터 전용 매치가 아니라 키워드 근거가 있을 때만 남긴다.
      const grounded = groundedKeys(scoreCurations(mine, rules, anchorTitles, views, vectors));
      const withReasons = withGroundedReasons(next, grounded);
      shownRef.current = withReasons;
      setTasteOrdered(withReasons);
    };
```

훅의 마지막 줄, 기존:

```ts
  return tasteOrdered ?? mine;
```

다음으로 교체:

```ts
  return tasteOrdered ?? withGroundedReasons(mine, NO_GROUNDED);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- use-for-you-order`
Expected: PASS (전체 20개 테스트)

- [ ] **Step 5: Commit**

```bash
git add frontend/features/curation/presentation/view-model/use-for-you-order.ts frontend/features/curation/presentation/view-model/use-for-you-order.test.ts
git commit -m "$(cat <<'EOF'
feat: FOR YOU 정렬에 추천 이유 근거 판정을 연결한다

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 프론트엔드 화면 — 카드에 이유 문구 노출

**Files:**
- Modify: `frontend/features/curation/presentation/components/curation-list.tsx`

**Interfaces:**
- Consumes: `Curation.reason?: string`(Task 4). Task 5가 세션별로 채우거나 비워서 넘겨준 값을 그대로 읽기만 한다. 새 prop 없음.
- Produces: 없음(화면 최종 소비 지점)

- [ ] **Step 1: 카드 안 제목과 개수 사이에 이유 문구를 넣는다**

`frontend/features/curation/presentation/components/curation-list.tsx`, 기존:

```tsx
                  <span className="line-clamp-2 block text-[16px] leading-[1.25] font-bold tracking-[-0.03em] break-keep text-white">
                    {curation.title}
                  </span>
                  <span className="mt-1.5 block text-[11px] text-white/70">
                    {curation.items.length}개
                  </span>
```

다음으로 교체:

```tsx
                  <span className="line-clamp-2 block text-[16px] leading-[1.25] font-bold tracking-[-0.03em] break-keep text-white">
                    {curation.title}
                  </span>
                  {curation.reason && (
                    <span className="mt-1 block line-clamp-1 text-[11px] font-medium text-accent-ink">
                      {curation.reason}
                    </span>
                  )}
                  <span className="mt-1.5 block text-[11px] text-white/70">
                    {curation.items.length}개
                  </span>
```

- [ ] **Step 2: 타입·린트 확인**

Run (frontend 디렉터리에서): `npm run check`
Expected: 에러 없이 통과.

- [ ] **Step 3: 실제 화면에서 눈으로 확인한다**

Run: `npm run dev` (frontend 디렉터리에서), 브라우저로 홈 열기.

Expected:
- Task 3에서 `curation_reasons_draft.json`을 검수·확정하고 데이터를 재생성했다면 로그인 후 이유 문구가 보인다. 최근 반응(찜·판매처 이동)한 상품과 키워드가 겹치는 큐레이션 카드가 대상이다.
- 벡터 유사도로만 뜬 카드나 비회원 상태에는 문구가 안 보인다.
- 아직 Task 3의 데이터 재생성 전이면(REASONS가 비어 있으면) 문구가 하나도 안 보이는 게 정상이다. 코드 경로 자체는 Task 5의 테스트로 이미 검증됐다.

- [ ] **Step 4: Commit**

```bash
git add frontend/features/curation/presentation/components/curation-list.tsx
git commit -m "$(cat <<'EOF'
feat: FOR YOU 카드에 추천 이유 문구를 보여준다

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## 진행 기록 (2026-08-25)

Task 1~6 전부 완료. 계획과 달라진 것 두 가지, 리뷰에서 잡혀 고친 것 두 가지.

**계획과 달라진 것**

- **Task 2(배치 API 스크립트)를 없앴다.** 64장은 한 번만 쓰는 문구라 실시간
  LLM 호출·API 키·venv가 굳이 필요 없었다(사람 지적). `gen_curation_reasons.py`와
  `requirements.txt`의 `anthropic`을 걷어냈다(커밋 `5997976`).
- **Task 3을 스크립트 없이 직접 끝냈다.** Claude가 64줄을 써서
  `gen_curation_page.py`의 `REASONS`(정본)와 `curations.json`(DB 재질의 없이
  같은 병합 로직으로 직접 반영)에 한 번에 넣었다(커밋 `b9e7417`). 이후 생성기를
  다시 돌리면 `REASONS`에서 그대로 채워진다.

**리뷰에서 잡혀 고친 것**

- Task 6 리뷰에서 이유 문구 색(`text-accent-ink`)이 카드의 어두운 사진
  오버레이 위에서 거의 안 보인다는 지적이 나와 `text-accent`로 고쳤다(커밋
  `a58ffbd`).
- 최종 브랜치 리뷰에서 커밋 안 된 포맷팅 2건과 지운 스크립트를 가리키던
  주석 하나를 잡아 고쳤다(커밋 `43378b0`). 같은 리뷰에서 64장 중
  `curation-rules.json`에 키워드 규칙이 없는 20장은 이유 문구가 화면에
  절대 못 뜬다는 것도 확인됐다. 하한 미달이 아니라 애초에 키워드 근거가
  안 걸리는 구조다 — 규칙이 생기면 그때 뜬다.
