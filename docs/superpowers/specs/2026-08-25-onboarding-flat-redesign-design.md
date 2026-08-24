# 온보딩 3화면을 홈·큐레이션상세 컨셉에 맞춰 플랫하게 재구성

## 배경

`onboarding-gender-screen.tsx` / `onboarding-pick-screen.tsx` / `onboarding-signup-screen.tsx`(공통 헤더 `onboarding-header.tsx`)는 [검은색·세이지그린 테마 전환](2026-08-24-black-theme-design.md)에서 색 토큰은 새 테마로 옮겨갔지만, 뒤로가기 버튼·성별 선택 버튼·구글 버튼·일러스트 카드는 여전히 `neo`/`neo-in` 유틸리티(테두리 + 그림자 짝)로 된 "떠있는 판" 스타일을 쓰고 있다.

반면 가장 최근 홈 화면 커밋(`4c741d3`, "홈 화면을 뉴모피즘 이전 디자인으로 되돌리고")과 큐레이션 상세 화면(`curation-detail-screen.tsx`)은 배경·테두리·그림자 없이 아이콘·텍스트가 검은 배경 위에 직접 놓이는 더 플랫한 방향으로 가 있다. 두 컨셉이 앱 안에 공존하는데, 이번 작업은 온보딩 3화면을 **후자(홈·큐레이션상세) 방향**으로 맞춘다 — 사람이 직접 확인하고 정한 방향이다.

`onboarding-header.tsx`에는 "뒤로가기는 상세·보관함류와 같은 neo 원형을 쓴다 — 예전에 평평하게 바꿨다가 되돌린 적이 있다"는 2026-08-24 결정 메모가 남아있다. 이번 변경은 그 메모와 반대 방향이므로, 구현 시 그 주석도 **이번 결정으로 갱신**해야 한다(아직 유효한 다른 화면들의 neo 표준을 잘못 뒤집지 않도록, 온보딩에 한정된 예외임을 명시).

## 범위

- `frontend/features/onboarding/presentation/components/onboarding-header.tsx`
- `frontend/features/onboarding/presentation/components/onboarding-gender-screen.tsx`
- `frontend/features/onboarding/presentation/components/onboarding-pick-screen.tsx`
- `frontend/features/onboarding/presentation/components/onboarding-signup-screen.tsx`

색 토큰 자체(`globals.css`)는 바꾸지 않는다 — 기존 토큰(`border-line`, `text-ink-soft`, `bg-app`, `bg-raised`, `bg-slate`/`text-on-slate`, `bg-thumb`/`text-on-thumb` 등)만 다시 조합한다.

## 범위가 아닌 것

- 화면 2(옷 고르기)의 카드 그리드·outline 선택 표시·하단 CTA 시트 구조 — 이미 플랫 컨셉과 맞아 손대지 않는다(예외: "다시 시도" 버튼, 아래 참고).
- 화면 흐름 순서, 진행 표시(숫자) 방식, ViewModel 로직 — 변경 없음.
- 구글 브랜드 에셋·문구의 공식 대조 — 기존 코드 주석에 이미 "프로덕션 심사 전 대조 필요"로 남아있고 이번 작업과 무관.
- 색상 토큰 값 자체 변경 — 검은색 테마 스펙(2026-08-24)의 범위이며 이번 작업은 기존 토큰 재조합만 한다.

## 공통: 뒤로가기 헤더 (`onboarding-header.tsx`)

뒤로가기 버튼에서 배경(`bg-app`)과 `neo`/`active:neo-in`(테두리+그림자)을 제거하고, 큐레이션 상세 화면의 뒤로가기와 같은 형태로 바꾼다 — 아이콘만, 배경·테두리·그림자 없음, 글자색은 지금과 같은 흐린 톤을 유지하고 눌림/포커스 시에만 진해지는 정도로 다룬다. 버튼의 좌표(왼쪽 16px·위 8px)와 단계 숫자 표시, 첫 화면에 뒤로가기가 없을 때 자리를 비워두는 동작은 그대로 유지한다.

## 화면 1 — 성별 선택 (`onboarding-gender-screen.tsx`)

두 선택 버튼("남성"/"여성")에서 `neo`/`active:neo-in`(테두리+그림자)을 제거하고, 테두리 한 줄(`border-line` 색)만 남긴 형태로 바꾼다. 그림자 없이 얇은 테두리로만 탭 가능한 영역임을 표시한다. 버튼 배치(세로로 쌓아 화면 중앙 정렬), 크기, 문구, 라디오가 아닌 버튼이라는 시맨틱은 변경하지 않는다.

## 화면 2 — 옷 고르기 (`onboarding-pick-screen.tsx`)

카드 그리드의 outline 선택 표시, 하단 CTA 시트의 배경, 메인 CTA 버튼(`bg-slate`)은 이미 그림자 없는 플랫 스타일이므로 그대로 둔다.

"불러오지 못했어요" / "부족해요" 상태의 **"다시 시도" 버튼 두 곳**에서만 `neo`/`active:neo-in`을 제거하고, 성별 선택 버튼과 같은 테두리 한 줄(`border-line`) 방식으로 바꾼다.

## 화면 3 — 구글 로그인 (`onboarding-signup-screen.tsx`)

가장 큰 구조 변경이 있는 화면이다.

**일러스트 영역**: 지금은 이미지+설명 리스트가 `bg-raised` 배경에 `neo-sm` 테두리+그림자를 두른 카드 하나에 담겨 있다. 이 카드 감싸기를 없앤다 — 이미지는 화면 폭 전체(현재 본문 좌우 여백보다 넓게, edge-to-edge에 가깝게)로 배치하고, 그 아래 설명 리스트(현재의 두 항목, "지금 고른 취향에서 추천 시작" / "볼수록 더 나에게 맞게 변화")는 카드 없이 `bg-app` 배경 위에 직접 놓는다. 리스트 항목 사이 구분선(`border-t border-line`)은 지금처럼 유지한다. 각 리스트 항목의 아이콘 칩(`FigureIcon`, `border border-line` 사각형)은 이미 카드 없는 플랫 스타일이므로 그대로 둔다.

시안 이미지(`/onboarding/taste-converge.jpg`)를 그대로 잘라 쓰는 기존 결정, "여기 보이는 옷은 실제 사용자가 고른 것이 아니라 시안 예시"라는 기존 주석의 경고는 유지한다 — 이미지를 다시 그리거나 사용자가 고른 사진으로 바꾸는 것은 이번 범위가 아니다.

**구글 로그인 버튼**: `bg-thumb` 배경에 `neo`/`active:neo-in`(테두리+그림자)을 쓰던 것을, 그림자 없이 테두리 한 줄(`border-line`)만 남기는 방식으로 바꾼다. 필(pill) 모양, 배경색(`bg-thumb`)과 글자색, 구글 4색 로고는 유지한다.

## 검증

- `npm run check`(lint + typecheck + format) 통과.
- Orca 브라우저로 새 기기 경로 3화면(성별 → 옷 고르기 → 구글 로그인)을 순서대로 열어, 뒤로가기·선택 버튼·다시 시도 버튼·구글 버튼이 그림자 없이 테두리(또는 무테두리)로 보이는지, 화면 3 이미지가 카드 없이 배경 위에 바로 놓이는지 눈으로 확인한다.
- 옷 고르기 화면의 "불러오지 못했어요"/"부족해요" 상태를 실제로 띄워(네트워크 실패 재현 또는 후보 부족 상황) 다시 시도 버튼의 새 스타일을 확인한다.
- 다크 배경 위에서 hairline 테두리(`border-line`)가 실제로 눈에 보이는 대비인지 확인한다 — 안 보이면 이번 변경이 오히려 탭 가능 영역을 안 보이게 만든 회귀다.

## 미정

없음 — 모든 화면·요소의 방향이 위 질의응답으로 확정됨.
