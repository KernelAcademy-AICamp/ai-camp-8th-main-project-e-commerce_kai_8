# 재검증 요청 — 온보딩 1단계 Blocker 수정

앞선 리뷰 결과가 `docs/superpowers/reviews/2026-08-24-onboarding-phase1-review.md`에 있습니다.
거기 적힌 9건을 커밋 `db49f27`에서 고쳤습니다. **그 수정이 맞는지, 수정이 새 결함을 만들지
않았는지**만 봐 주세요. 새 기능 리뷰가 아닙니다.

범위: `9c172cb..HEAD` (수정 커밋 하나).

## 각 건에 대해 물을 것

1. 원래 결함이 **실제로 사라졌는가** (수정이 그 경로를 덮는가)
2. 수정이 **새 결함을 만들지 않았는가**

특히:

- **①2 "완료는 한 번뿐"** (`backend/supabase/migrations/20260824300000_...sql`).
  이미 완료한 계정이 다시 부르면 조용히 기존 값을 돌려준다. 이게 **불완전 계정 재시작**과
  **개인화 초기화 뒤 재진입**을 막지 않는가? 조용한 무시가 클라이언트를 속이지 않는가?
- **①3 큐 분리** (`shared/onboarding/pending-onboarding-forget.ts`, `shared/signals/signals.ts`,
  `shared/profile/account-profile-guard.tsx`). 두 큐가 서로 다른 시점에 재시도될 때
  새로운 순서 문제가 없는가? 새 키가 신원 전환 남길 목록에 제대로 들어갔는가?
- **①1 unreachable 상태** (`shared/onboarding/onboarding-gate-state.ts`,
  `onboarding-account-guard.tsx`). 재시도 배선이 무한 루프나 영구 멈춤을 만들지 않는가?
- **②6 판 번호 전달** — 조회 → 기기 저장 → 보관함 → 저장까지 판 번호가 끊기는 지점이 없는가?
  저장 형태를 `{version, picks}`로 바꿨는데 **옛 형식이 남아 있는 기기**는 어떻게 되는가?
- **①5/②7 죽은 카드** (`use-onboarding-flow.ts`, `onboarding-pick-screen.tsx`).
  위치를 저장 시점에 계산하는데, 서버의 유일성·범위 검사와 어긋날 수 있는 경우가 있는가?

## 등급

① 지금 해를 끼침 · ② 나중에 비싸짐 · ③ 그 외.
**고칠 것이 없으면 없다고 적어 주세요** — 억지로 찾지 마세요.

결과는 `REVIEW_RESULT.md`에.
