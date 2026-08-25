# 앱 테마를 검은색 단일 테마로 교체

## 배경

현재 앱(`frontend/`)은 뉴모피즘 디자인 시스템을 쓴다 — 배경·표면 색이 거의 같고(`--color-app` = `--color-surface` = `#e4e6eb`), 카드·버튼 같은 "떠있는 판" 요소는 그림자 짝(`--sh-d`/`--sh-l`)만으로 층을 구분한다. `globals.css`에 미사용 다크 초안(`:root[data-theme="dark"]`, 배경 `#24272e`)이 있지만, 실제 다크 시안 없이 라이트 값에서 유도한 값이라고 주석에 명시돼 있고 어디에도 적용되지 않는다.

이 프로젝트는 앱 전체를 검은색 테마로 바꾸길 원한다. 라이트/다크 토글이 아니라 **검은색을 유일한 기본 테마로 완전히 교체**하는 것이 목표다.

## 목표

- 앱의 모든 화면 배경이 순수/거의 순수 블랙(OLED 스타일)으로 보인다.
- 카드·버튼 등 "떠있는 판" 요소는 그림자 짝 대신 **플랫 다크 카드**(테두리 또는 명도 차이로 층 구분)로 표현된다.
- 강조색(accent)은 오렌지에서 **세이지/헌터그린 계열 초록**으로 바뀐다.
- 주요 버튼 바탕색(slate)은 **어두운 회색을 유지**한다(초록으로 바꾸지 않는다).
- 기존 라이트 테마는 남기지 않는다 — 토글 UI, 테마 전환 상태 저장 로직을 새로 만들지 않는다.

## 범위가 아닌 것

- 라이트/다크 모드 토글 기능 추가.
- `google-sign-in-button.tsx` / `onboarding-signup-screen.tsx`의 구글 4색 로고(`#EA4335` `#4285F4` `#FBBC05` `#34A853`) 변경 — 구글 공식 브랜드 색상이므로 그대로 유지.
- 두 파일에 중복된 `GoogleMark` 컴포넌트를 공용화하는 리팩토링 — 이번 테마 작업과 무관한 별개 개선이므로 손대지 않는다.

## 색상 토큰 변경 (`frontend/app/globals.css`)

`@theme` 블록의 값을 아래 방향으로 교체한다. 정확한 최종 hex는 구현 중 Orca 브라우저로 실제 화면을 보면서 대비·가독성 기준으로 미세 조정한다 — 아래 표는 방향과 출발점이다.

| 토큰 | 현재(라이트) | 역할 | 변경 방향 |
|---|---|---|---|
| `--color-app` / `--color-surface` / `--color-well` / `--color-chrome` | `#e4e6eb` | 페이지 배경 | 순수/거의 순수 블랙 (`#000000`~`#0a0a0a`) |
| `--color-raised` | `#f6f6f8` | 카드·들린 판 | 배경보다 살짝 밝은 판 (예: `#121212`대) — 플랫 카드 배경 |
| `--color-ink` / `--color-ink-soft` / `--color-ink-muted` | `#4e5563` 계열(진회색) | 글자 | 밝은 회색~흰색 계열로 반전 |
| `--color-line` | `#d3d6de` | 테두리·구분선 | 어두운 배경에서 보이는 은은한 회색 (카드 경계를 그림자 대신 담당) |
| `--color-accent` | `#e8542f`(오렌지) | 강조색 | **세이지/헌터그린 계열**, `#8FBF9F` 기준으로 블랙 배경 대비 맞춰 조정 |
| `--color-accent-ink` | `#1c120b` | accent 위 글자 | 새 accent(초록) 위에서 대비가 나오는 값으로 재산정 |
| `--color-slate` / `--color-on-slate` | `#8590a8` 계열 | 주요 버튼 바탕/글자 | **어두운 회색 유지**, 블랙 배경 대비만 재조정 |
| `--color-star` | `#e2b23f` | 별점 등 | 색상(골드) 유지, 명도만 블랙 배경에 맞게 조정 |
| `--color-danger` | `#c4574a` | 삭제 확인 등 경고 | 색상(레드) 유지, 명도만 블랙 배경에 맞게 조정 |
| `--color-thumb`, `--color-skel-1/2`, `--color-fill-soft/deep`, `--color-veil`, `--color-dim`, `--color-dim-search` | 라이트 값 | 채움·스켈레톤·가림막 | 블랙 배경 기준으로 재산정(현재 `:root[data-theme="dark"]` 초안의 대응값을 출발점으로 삼되, 실측 아님을 유의) |

`:root[data-theme="dark"]` 블록은 삭제한다 — 토글을 만들지 않기로 했으므로 유지하면 "언젠가 켜질 죽은 코드"로 남아 혼동을 준다.

## 뉴모피즘 → 플랫 카드 전환

`neo` / `neo-sm` / `neo-lg` / `neo-in` / `neo-in-sm` / `neo-drop` 유틸리티(현재 38개 파일에서 사용 중)는 **클래스명을 그대로 두고 CSS 구현만 바꾼다**:

- 현재: `box-shadow`에 어두운 그림자(`--sh-d`) + 밝은 그림자(`--sh-l`) 짝을 넣어 순수 뉴모피즘 효과를 낸다.
- 변경 후: 이중 그림자 대신 **테두리(`--color-line`) 또는 명도 차이**로 층을 구분하는 플랫 다크 카드 스타일로 재정의한다. `neo-in`류(인셋, 눌린 느낌)는 배경보다 어두운 톤이나 내부 테두리로 표현한다.
- 컴포넌트 파일(38개)은 클래스명이 그대로이므로 수정하지 않는다 — `globals.css`의 유틸리티 정의만 바뀐다.
- `--sh-d` / `--sh-l` 변수는 전환 후 더 필요 없어지면 제거하고, 새 스타일에 맞는 변수(예: 테두리 색·그림자 세기)로 대체한다.

## 하드코딩 색상 파일 처리

| 파일 | 현재 값 | 처리 |
|---|---|---|
| `frontend/features/curation/presentation/components/curation-detail-screen.tsx` | `#FAFAFA` (accent 기본값 fallback) | 새 accent(초록) 기준 fallback 값으로 교체 |
| `frontend/features/feed/wishlist/presentation/components/folder-grid-view.tsx` | `border-[#B9C0CF]` | 토큰 기반 클래스(`--color-line`)로 교체 |
| `frontend/app/layout.tsx` | `themeColor: "#E4E6EB"` | 새 블랙 배경 값으로 교체 |
| `google-sign-in-button.tsx`, `onboarding-signup-screen.tsx` | 구글 4색 로고 | 변경하지 않음(범위 아님, 위 참고) |

## 검증

- `npm run check`(lint + typecheck + format)를 통과한다.
- 구현 후 Orca 브라우저로 주요 화면(피드, 상세, 온보딩, 마이페이지, 지갑/폴더, 로그인)을 직접 훑어 라이트 테마 잔재(하드코딩된 `bg-white`/`text-black` 등 토큰을 안 쓰는 Tailwind 기본 클래스)가 남아있는지 확인한다. 발견되면 토큰 기반 클래스로 교체한다.
- 카드·버튼의 층 구분이 테두리/명도 차이로 실제로 눈에 보이는지 확인한다(그림자가 사라진 자리에 아무 구분도 안 남는 회귀 방지).
- danger/star 등 의미색이 블랙 배경에서 읽히는지(대비) 확인한다.

## 미정

- 색상 토큰의 정확한 최종 hex 값 — 구현 중 실제 화면을 보며 조정한다(위 "색상 토큰 변경" 표는 출발점).
- `curation-detail-screen.tsx`의 `#FAFAFA` fallback을 대체할 정확한 초록 hex — accent 최종 값이 정해진 뒤 그 값을 그대로 쓴다.
