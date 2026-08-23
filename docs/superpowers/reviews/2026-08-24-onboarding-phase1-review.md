# 교차 리뷰 결과 — 취향 발견 온보딩 1단계

## 판정

**수정 후 진행이 필요하다.** 핵심 세로 경로는 연결되어 있지만, 완료 계정에 온보딩을 다시 띄우고 기존 성별·선택을 덮을 수 있는 경로와 삭제 재시도의 부분 성공 결함이 있다. 운영 DB에 이미 적용된 마이그레이션은 새 파일을 추가해 전진 수정해야 한다.

검토 범위는 요청한 `774fb7e..9c172cb` 두 커밋이다. 현재 로컬의 `work/onboarding` ref는 `774fb7e`를 가리키고 있어, 브랜치 이름이 아니라 요청서에 적힌 커밋 범위와 현재 `HEAD`를 기준으로 삼았다.

## ① 지금 해를 끼침

### 1. 계정 상태 읽기 실패가 완료 계정에도 온보딩을 다시 띄운다

- path: `frontend/shared/onboarding/onboarding-account-sync.ts`
- lines: 94-101
- category: bug
- severity: high

`fetchAccountOnboarding()`이 일시적으로 실패하면 `accountCompleted`는 계속 `null`인데 상태만 `settled`로 바뀐다. 게이트는 이를 `syncSettled=true`, `accountCompleted=false`로 받아 로그인한 사용자를 곧바로 온보딩으로 보낸다. 주석의 “판정을 미룬다”와 실제 상태 전이가 반대이며, 같은 `session`·`gender`에서는 재시도도 예약되지 않는다. 완료 계정이 새 선택을 저장하면 아래 2번의 무조건 덮어쓰기까지 이어져 기존 성별과 온보딩 선택이 바뀔 수 있다. 읽기 실패를 미완료 계정으로 확정하지 말고, 재시도 가능한 미확정/오류 상태로 유지해야 한다.

### 2. 늦게 도착한 온보딩 저장이 설정 화면의 최신 성별과 완료 데이터를 덮는다

- path: `backend/supabase/migrations/20260824200000_onboarding_picks.sql`
- lines: 288-302
- category: bug
- severity: high

`c_onboarding_put`은 기존 완료 상태나 예상 갱신 시각을 확인하지 않고 `c_gender_prefs`, `c_onboarding_state`, 선택 목록을 모두 덮는다. 두 탭에서 불완전 계정의 온보딩을 열어 둔 뒤 한 탭이 완료하고 설정에서 성별을 바꿔도, 다른 탭의 오래된 저장이 나중에 도착하면 최신 설정과 선택을 되돌린다. 이는 `c_gender_put`이 조건부 쓰기로 막고 있는 바로 그 경합을 우회한다. “완료 계정에는 화면이 뜨지 않는다”는 클라이언트 가정은 지연 요청·다중 탭·1번의 읽기 실패·직접 RPC 호출을 막지 못한다. 최초 완료만 확정하고, 이후 동일 재시도는 기존 결과를 돌려주되 다른 payload는 기존 값을 덮지 않는 서버 계약이 필요하다.

### 3. 공유 삭제 큐가 부분 성공 뒤 새로 쌓인 취향까지 다시 지울 수 있다

- path: `frontend/shared/signals/signals.ts`
- lines: 339-354
- category: bug
- severity: high

계정 취향 삭제가 성공하고 온보딩 선택 삭제만 실패해도 사용자 ID 하나만 `atee-pending-taste-forget`에 남는다. 사용자가 그 뒤 새 탐색으로 새 취향 프로필을 만든 다음 재시도가 돌면, `pending-taste-forget.ts:67-75`가 이미 성공했던 `forgetAccountProfile()`부터 다시 호출해 초기화 이후의 새 취향까지 삭제한다. 두 삭제가 멱등이라는 사실은 “사이에 새 데이터가 생기지 않았을 때”만 안전하다. 큐에 작업별 완료 상태를 담거나 서버에서 두 삭제를 하나의 원자적 작업으로 묶어, 실패한 몫만 재시도해야 한다.

### 4. 깨진 승계 보관함 하나가 이후의 정상 승계를 영구 차단한다

- path: `frontend/shared/identity/onboarding-carry.ts`
- lines: 70-71, 102-118
- category: bug
- severity: high

성별이 빠진 옛 형식이나 깨진 JSON은 `readBox()`에서 `null`이 되지만 실제 키는 지워지지 않는다. 다음 익명→사용자 전환에서 `carryOnboarding()`은 키가 존재한다는 이유만으로 새 정상 선택을 쓰지 않고 종료한다. `OnboardingAccountGuard`도 깨진 상자를 “다른 사용자 것”으로 판별하지 못해 지우지 않으므로, 키는 allowlist를 통해 계속 살아남고 이후 로그인마다 선택이 정리 과정에서 유실된다. 유효한 진행 중 상자만 덮어쓰지 않아야 하며, 해석 불가능한 상자는 새 승계 전에 폐기해야 한다. 이 경우를 검증하는 테스트도 현재 없다.

### 5. 클라이언트에서 썸네일이 죽으면 최소 3장을 고를 수 없는 막다른 화면이 생긴다

- path: `frontend/features/onboarding/presentation/components/onboarding-pick-screen.tsx`
- lines: 86-99, 144-169
- category: bug
- severity: medium

서버가 3장 이상을 반환한 뒤 이미지 로드가 실패하면 `PickCard`만 `null`을 반환한다. `tooFewCandidates`는 원래 응답 배열 길이만 보므로, 실제로 보이는 카드가 2장 이하가 되어도 부족 안내나 복구 경로가 나타나지 않고 다음 버튼은 영원히 비활성이다. 코드 주석도 CDN 404는 클라이언트에서만 안다고 명시한다. 죽은 카드를 부모 후보 집합에서 제거해 보이는 카드 수와 진행 가능 여부를 같은 상태에서 계산해야 한다.

## ② 나중에 비싸짐

### 6. `candidates_version`이 사용자가 본 목록이 아니라 저장 순간의 목록을 기록한다

- path: `backend/supabase/migrations/20260824200000_onboarding_picks.sql`
- lines: 138-146, 231-234
- category: bug
- severity: high

후보 조회 응답에는 버전이 없고 클라이언트도 버전을 보존하거나 저장 요청에 보내지 않는다. 저장 함수는 그때의 `c_onboarding_version()`을 다시 읽어 상태에 기록한다. 후보 판이 화면을 보는 도중 교체되면, 겹치는 상품은 사용자가 보지 않은 새 판으로 잘못 기록되고 겹치지 않는 상품은 저장 자체가 거부된다. “어느 후보 목록을 봤는지”는 첫 배포 뒤 복구할 수 없다고 정한 데이터이므로 조회 시점 버전을 함께 내려주고, 클라이언트가 그대로 돌려보내며, 서버가 그 버전의 허용 목록을 검증해야 한다.

### 7. 화면 위치·선택 순서가 실제 표시와 달라도 서버가 받아 영구 데이터가 오염된다

- path: `backend/supabase/migrations/20260824200000_onboarding_picks.sql`
- lines: 253-267
- category: security
- severity: high

서버는 `card_pos`와 `pick_seq`가 0~999 형태인지만 보고, 표시 가능한 범위·중복·연속 순서를 검증하지 않는다. 인증된 호출자는 모든 선택에 같은 `pick_seq`를 주거나 존재할 수 없는 `card_pos=999`를 저장할 수 있다. 정상 UI에서도 `onboarding-pick-screen.tsx:88-95`가 원본 배열의 index를 넘기고 죽은 카드는 자식에서만 숨기므로, 앞 카드가 404이면 이후 카드의 저장 위치가 실제 보이는 위치와 어긋난다. 위치 편향 분석을 위해 되살릴 수 없는 값을 보존한다는 목적상, 부모에서 보이는 목록을 확정해 위치를 매기고 서버도 최소한 범위·유일성·순서 계약을 검증해야 한다.

### 8. 데이터 수집 정본 안에서 개인화 초기화의 계정 데이터 범위가 서로 모순된다

- path: `docs/atee/living/data-collection-policy.md`
- lines: 39-45, 61-65
- category: documentation
- severity: medium

새 온보딩 절은 “개인화 데이터 모두 지우기”가 계정의 온보딩 선택을 지운다고 명시하지만, 아래 기존 절은 같은 기능이 “계정에 담긴 것을 지우지 않는다”고 단정한다. 공개 처리방침은 전자의 동작을 약속하고 있어 정본 내부 설명만 반대가 되었다. 삭제 범위는 개인정보 계약이므로 예외를 명시해 한 문서 안에서 일치시켜야 한다.

## ③ 그 외

### 9. 씨앗 감쇠가 현재 세션의 실제 행동 앵커를 세지 않는다

- path: `frontend/shared/profile/profile-store.ts`
- lines: 243-256
- category: maintainability
- severity: medium

`seedAnchors`에 넘기는 수는 장기 앵커 개수뿐이고, 같은 함수가 이미 읽은 `session.anchors`는 제외된다. 따라서 첫 세션에서 서로 다른 상품에 20번 반응해 세션 앵커가 상한까지 쌓여도 온보딩 씨앗은 전체 무게 4로 계속 실리고, 세션이 접힌 뒤에야 갑자기 사라진다. “실제 행동이 쌓일수록 선형으로 물러난다”는 설명과 달리 세션 경계에서 계단식으로 변한다. 의도라면 문서와 이름을 장기 앵커 기준으로 좁히고, 의도가 아니라면 중복 상품을 제거한 장기+세션 실제 앵커 수로 감쇠를 계산하는 편이 맞다.

## 확인 결과

- OCR 기준 `total_files`: 39
- `reviewable_files`: 30
- `reviewed_files`: 30
- `skipped_files`: 0
- `coverage_rate`: 100%
- OCR이 확장자·기본 경로 규칙으로 제외한 문서·테스트 9개도 정본 및 테스트 적합성 확인을 위해 수동으로 읽었다.
- 접근 매트릭스의 현재 App Router 경로를 전부 대조했다. `/`, `/wishlist`, `/wishlist/[folder]`는 게이트되고 `/curation`은 `/`로 리다이렉트된다. `/settings`, `/my`, `/privacy`, `/login`과 두 overlay 경로는 의도대로 열려 있어 빠진 사용자 경로는 찾지 못했다.
- anon 공개 `c_onboarding_candidates_get`은 성별을 정확한 두 값으로 제한하고 작은 고정 후보 집합만 조회한다. 이번 범위에서 추가적인 입력 주입·무제한 결과 문제는 찾지 못했다.
- `npm run check`: 통과.
- `NODE_OPTIONS=--no-experimental-webstorage npm test`: 83개 파일, 592개 테스트 통과. 기본 `npm test`는 현재 Node의 실험적 Web Storage 전역이 jsdom의 `localStorage`를 가려 123개가 같은 환경 오류로 실패했으며, 실험 기능을 끄면 모두 통과했다.
- 백엔드 테스트: 작업공간에 `backend/venv` 또는 `backend/.venv`가 없어 실행하지 못했다.
