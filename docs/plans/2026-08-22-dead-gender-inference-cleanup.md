# #63 죽은 코드 정리 — 행동 기반 성별 추론 (2026-08-22)

> 상태: **완료 (2026-08-22).** PR #74가 병합돼 `signals.ts` 충돌이 풀렸다.
> 다만 `Anchor.gender` 기록 자체는 이번에도 남겼다 — 아래 "이번에 손대지 않는 것".

## 무엇을 지우나

성별 토글(O-39, #77)이 **사람이 고른 설정**을 유일한 진실로 만들면서, #63이 만든
**행동 기반 우세 성별 추론**은 아무도 안 쓰게 됐다. 그런데 코드는 남아 있고
**요청을 하나 더 보내고 있다.**

### 죽은 것이 확실한 사슬 (2026-08-22 확인)

`getProfileSummary().gender`를 **읽는 곳이 하나도 없다.** 그래서 아래가 전부 죽었다:

| 대상 | 자리 |
|---|---|
| `deriveDominantGender` + `GENDER_SHARE_THRESHOLD` | `shared/profile/profile-rules.ts` |
| `ProfileSummary.gender` 필드 | `shared/profile/profile-store.ts` |
| `longAnchorsMissingGender` · `applyAnchorGenders` | `shared/profile/profile-store.ts` |
| `fetchAnchorGenders` · `backfillAnchorGenders` | `features/feed/data/gender-backfill.ts` (54줄) |
| 그 테스트 | `features/feed/data/gender-backfill.test.ts` (118줄) |
| `backfillAnchorGenders()` 호출 | `features/feed/presentation/view-model/use-feed-view-model.ts` |

**실익이 있다** — 피드가 뜰 때마다 `c_feed_products`를 조회하는 **REST 왕복이 하나
사라진다.** 그 조회는 오직 죽은 판정을 먹이려고 있었다.

### 이번에 손대지 않는 것

`Anchor.gender` 기록 자체(`logAction(..., { gender })` → `recordProfileAction` →
앵커 병합)는 **남긴다.** 이유는 둘이다.

1. **열린 PR #74가 `shared/signals/signals.ts`를 편집 중**이라 지금 건드리면 충돌한다.
2. 앵커에 성별이 실려 있어도 해가 없다(저장 공간뿐이다).

**후속 조각**으로 남긴다 — #74 병합 뒤 `logAction`의 `gender` 옵션과
`Anchor.gender` 필드, `AnchorGender`·`toAnchorGender`를 함께 걷어낸다.

## 순서

### 1단계 — 호출과 파일을 지운다

- **무엇을**: 피드 뷰모델에서 `backfillAnchorGenders()` 호출과 그 효과를 지우고,
  `gender-backfill.ts`와 테스트를 삭제한다.
- **완료 기준**: 피드를 띄웠을 때 **`c_feed_products` 조회 요청이 사라진 것**을
  브라우저 네트워크에서 확인한다. 피드는 그대로 뜬다.

### 2단계 — 판정 로직을 지운다

- **무엇을**: `deriveDominantGender`·`GENDER_SHARE_THRESHOLD`·`ProfileSummary.gender`·
  `longAnchorsMissingGender`·`applyAnchorGenders`와 각 테스트를 지운다.
- **주의**: `DominantGender` 타입은 큐레이션의 `filterByGender`가 아직 쓴다.
  타입만 남길지 `GenderChoice`로 갈아탈지 이 단계에서 정한다 —
  **둘은 값 집합이 같다**(`"남성" | "여성" | null`).
- **완료 기준**: `npm run check`와 테스트 전체 통과. 남은 참조가 0개임을
  검색으로 확인하고 그 명령과 결과를 적는다.

### 3단계 — 이미 저장된 데이터 방침

기기(`atee-profile`)와 계정에 **이미 저장된 앵커의 성별 필드**가 있다.

- **읽되 무시한다**(스키마 버전을 올리지 않는다) — 필드가 남아 있어도 아무도 안 읽으면
  해가 없고, 스키마 버전을 올리면 기존 프로필을 마이그레이션하거나 버려야 한다.
- 이 결정을 코드 주석과 이 문서에 남긴다.

### 4단계 — 검증 기록

- 지운 줄 수, 사라진 요청, 남은 참조 0 확인, 테스트 결과를 적는다.
- **안 돌려본 것은 미검증으로 명시**한다.

## 결과 (2026-08-22)

| 항목 | 값 |
|---|---|
| 지운 줄 | **447줄** (더한 줄 10) |
| 지운 파일 | `gender-backfill.ts`(54) · `gender-backfill.test.ts`(118) |
| 남은 참조 | **0개** — 아래 검색을 다시 돌려 확인 |

```
deriveDominantGender: 0   GENDER_SHARE_THRESHOLD: 0   GENDER_MIN_ANCHORS: 0
backfillAnchorGenders: 0  fetchAnchorGenders: 0
longAnchorsMissingGender: 0   applyAnchorGenders: 0
```

**REST 왕복이 실제로 사라진 것을 브라우저에서 확인했다.** 성별이 **없는** 장기 앵커
11개를 일부러 심고(예전 보강 코드가 노리던 바로 그 상태) 피드를 띄웠을 때
`/rest/v1/c_feed_products` 조회가 **한 건도 나가지 않았다**. RPC는
`c_feed_page`·`c_taste_get`·`c_gender_get` 셋뿐이다.

`npm run check` 통과, 테스트 **548개** 통과.

### 3단계 결정 — 이미 저장된 성별 필드는 읽되 무시한다

스키마 버전을 올리지 않았다. 기기·계정에 저장된 앵커의 `gender` 필드는 남아 있지만
아무도 읽지 않는다. 버전을 올리면 기존 프로필을 마이그레이션하거나 버려야 하는데,
필드가 남아 있어도 해가 없다.

### 후속 조각도 완료 (2026-08-23)

`Anchor.gender` **기록** 경로를 걷어냈다. 1차에서는 `signals.ts`를 열린 PR #74가
편집 중이었고 이 조각의 검증 대상("죽은 판정을 걷어내면 요청이 하나 준다")과
섞이지 않게 미뤘던 부분이다.

지운 것: `logAction`의 `gender` 옵션과 호출부 4곳, `recordProfileAction`의 인자,
`Anchor.gender`·`ProfileAction.gender` 필드, `applyAction`·`mergeLongTerm`의 성별
병합 분기, `toAnchorGender`와 `AnchorGender` 타입. **165줄 삭제.**

**계정에 저장된 옛 `gender` 필드는 읽되 무시한다** — `account-profile-api`가 그 값을
파싱하지 않고 버린다. 스키마 버전은 올리지 않았다(1차의 3단계 결정과 같다).
그 동작을 테스트로 고정했다.

남은 참조 0개를 지우기 전과 같은 검색으로 확인했다 —
`toAnchorGender` · `AnchorGender` · `Anchor.gender` · `action.gender` · `anchor.gender`
전부 0, `logAction`에 성별을 넘기는 곳도 0.

## 이 계획이 스스로 경계하는 것

- **"안 쓴다"를 검색으로만 판단하지 않는다.** `getProfileSummary().gender`가 죽었다는
  근거는 `.gender` 참조를 전부 훑어 소비처가 없음을 확인한 것이다. 지우기 전에
  같은 검색을 다시 돌리고 그 명령을 기록한다 — 세는 방법이 대상을 보고 있는지.
- **#74와 겹치는 파일은 건드리지 않는다.** 겹치면 남의 작업을 되돌리는 diff가 된다
  (#81에서 실제로 그럴 뻔했다).
