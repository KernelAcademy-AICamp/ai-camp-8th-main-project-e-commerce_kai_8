# AGENTS.md — 프로젝트 작업 규칙

이 파일은 팀과 AI 에이전트(Claude, Codex 등)가 항상 참고하는 작업 규칙이다. 이 repo에서 코드를 작성하거나 커밋·브랜치·PR을 만들 때 아래 규칙을 반드시 따른다.

## 프로젝트

- **eati** — 개인화 무한 탐색 티셔츠 PWA (Discovery 단계)
- 검색어 없이 티셔츠 이미지를 습관적으로 훑는 사용자를 대상으로, 대중 베스트 목록 대신 사용할수록 개인 취향에 맞게 변하는 무한 모자이크 피드를 검증한다.
- 기획 문서: [`docs/eati/`](docs/eati/) — 제품 정의는 [Living PRD](docs/eati/living/prd.md), 결정 이력은 [결정 기록](docs/eati/living/decision-log.md) 참고
- 상태: 제품 정의 합의 / 가치 검증 전 / **engineering-ready 아님** — 구현 전 Gate 0(데이터·상호작용 준비)을 통과해야 한다.

## 폴더 구조

```
frontend/   # Next.js PWA (clean architecture + MVVM) — frontend/AGENTS.md 참고
backend/    # 무신사 c_* 카탈로그 파이프라인 (Python) — backend/README.md 참고
docs/       # 기획·산출물 문서 (eati = 제품 discovery 문서)
design/     # 디자인 시스템·시안
```

---

## GitHub 사용 규칙

### 브랜치 전략 (main + develop + feature/*)

- **`main`** — 안정/배포 버전. 직접 커밋·push 금지. `develop`에서 PR로만 병합.
- **`develop`** — 개발 통합 브랜치. 모든 작업 브랜치는 여기서 분기하고 여기로 병합.
- **작업 브랜치** — `develop`에서 따서 작업 후 **PR로 `develop`에 병합**. 병합되면 삭제.
- 아카데미 채점 repo(origin)의 기본 브랜치는 `main` (클래스룸 기준이라 변경하지 않음).

### 브랜치 네이밍

`<type>/<짧은-설명-kebab>` — 예: `feature/mosaic-feed`, `data/catalog-audit`, `fix/pinch-zoom`, `docs/prd-update`

- type: `feature` `fix` `docs` `data` `chore` `refactor` `test`

### 커밋 메시지 (Conventional Commits + 한글)

`<type>: <한글 설명>` (제목 명령형, 50자 이내)

- type: `feat` `fix` `docs` `data` `chore` `refactor` `test` `style` `perf`
- 예:
  - `feat: 모자이크 피드 무한 스크롤 추가`
  - `data: 티셔츠 카탈로그 필수 필드 커버리지 감사`
  - `fix: 바텀 시트 닫을 때 스크롤 위치 복원 오류 수정`
  - `docs: PRD 지표 섹션 갱신`
- 본문(선택): 왜 그렇게 했는지. 필요 시 이슈 링크(`#12`).
- AI 에이전트가 만드는 커밋은 마지막에 트레일러로 자신을 명시한다. 예:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

### PR 규칙

- **대상 브랜치 = `develop`** (릴리즈 시에만 `develop` → `main`).
- 제목도 Conventional Commits 형식.
- 본문: **무엇을/왜** · 확인 방법(테스트·스크린샷) · 관련 문서/이슈.
- 리뷰: 가능하면 1명 확인 후 병합. 개발 블로킹되면 작성자 병합 허용.
- 병합 방식: **squash merge** 기본(히스토리 깔끔).

### 하지 말 것

- `main`에 직접 push / force-push (`--force`) 금지.
- 비밀정보(비밀번호·API키·토큰·로그인 세션) 커밋 금지. `.env*`, `node_modules/`는 `.gitignore`로 제외.
- API 키는 코드에 하드코딩하지 말고 환경변수(`.env.local`)로.

### CI (배포는 미설정)

- **CI 게이트**: `develop`·`main` 대상 PR을 열면 자동으로 frontend(lint·typecheck·format·test·build)와 backend(pytest) 검사가 돈다. 초록불 후 squash 병합.
- 브랜치 보호: `develop`·`main` 모두 force-push·삭제 차단. 병합 방식은 squash만 허용, 병합 시 작업 브랜치 자동 삭제.
- Vercel preview·Release 워크플로우·Slack 알림은 아직 없다 — 첫 피드 프로토타입(Gate 0 테스트용 URL 필요 시점)에 도입 예정. 설정하면 이 섹션을 갱신한다.

---

## 코드 품질 (lint · format · 타입)

프론트엔드(`frontend/`)는 엄격하게 강제된다. 비개발자도 vibe 코딩을 하므로 **기계가 자동으로 고치고, 못 고치는 문제는 커밋을 막는다.**

### 스택

- **ESLint** (`strictTypeChecked`, 타입 기반) — floating promise·`any`·unsafe 등 실제 버그 차단
- **simple-import-sort** — import 자동 정렬(auto-fix)
- **unused-imports** — 미사용 import 자동 제거(auto-fix)
- **Prettier** — 포맷 자동 통일 (스타일 논쟁 제거)
- **husky + lint-staged** — pre-commit에서 스테이징 파일 자동 수정 + 실패 시 커밋 차단

### 명령 (`frontend/`에서)

```
npm run lint        # 검사 (경고도 0이어야 통과)
npm run lint:fix    # 자동 수정
npm run format      # 포맷 정리
npm run typecheck   # 타입 검사 (tsc --noEmit)
npm run test        # vitest 실행
npm run check       # lint + typecheck + format 한 번에
```

### 규칙

- **커밋하면 자동으로** 스테이징한 파일이 정리되고, 못 고치는 문제(예: `any`, 미사용 변수)면 **커밋이 막힌다.** 막히면 메시지를 읽고 고치거나 `npm run lint:fix` 실행.
- 훅을 켜려면 각자 클론 후 **프로젝트 루트에서 `npm install`을 한 번** 실행(husky 설치). `frontend/`에서만 install하면 훅이 안 켜진다.
- 규칙을 무시(`eslint-disable`)하는 건 지양. 정말 필요하면 이유를 주석으로 남긴다.
- AI 에이전트는 `frontend/` 코드를 만들거나 고친 뒤 커밋 전 `npm run check`가 통과하는지 확인한다.

---

## AI 에이전트 작업 지침

- 사용자가 **명시적으로 요청할 때만** 커밋/푸시/PR을 만든다.
- 현재 브랜치가 `main`이면, 먼저 작업 브랜치를 파고 시작한다.
- 커밋 전 비밀정보가 섞이지 않았는지 확인한다.
- 되돌리기 어려운 작업(강제 push, repo 공개범위 변경, 브랜치 삭제)은 먼저 확인받는다.
- 기획·산출물 문서는 한국어로 작성한다(파일명·브랜치·커밋 type만 영어).
- 규칙 파일은 `AGENTS.md`에만 쓴다. `CLAUDE.md`는 `@AGENTS.md` 위임 한 줄만 유지하고 내용을 추가하지 않는다.

---

## 계획 작성 규칙 (기능 개발 착수 전 필수)

새 기능·작업을 시작하기 전에 **코드 없이** 계획을 먼저 세운다. 계획엔 코드·의사코드를 넣지 않고 **순서와 단계별 완료 기준만** 적는다. 완성된 계획은 파일로 저장한다(`docs/plans/YYYY-MM-DD-<제목>.md`).

### 4단계 절차

1. **질문** — 계획을 쓰기 전에, AI가 추가로 알아야 할 것을 사람에게 먼저 묻는다. (모르는 건 물어서 해소 — 다음 단계에서 임의로 가정하지 않기 위해)
2. **초안** — 아래 4제약을 지켜 초안을 쓴다.
   - **임의 가정 금지** — 모르는 건 1단계 질문으로 풀고, 남으면 "미정" 플래그로 둔다(지어내지 않는다).
   - **구현 옵션 제한 금지** — 특정 방법 하나로 못박지 않는다. 여러 구현이 가능하면 열어둔다.
   - **코드 내용 금지** — 코드·함수명 없이 "무엇을 / 어떤 순서로 / 무엇이 되면 끝"만 쓴다.
   - **타 AI 도구도 이해 가능하게** — 이 repo 문맥을 모르는 다른 AI·사람이 읽어도 실행 가능하게(약어·내부 맥락은 풀어서).
3. **개선** — 사람이 읽고 ⓐ의도와 다른 것 ⓑ이해 안 되는 것 ⓒ빠진 것·불필요한 것을 짚어 고친다.
4. **최종 검토** — 아래 체크 3개를 통과하면 확정한다.

### 각 단계 완료 기준

- 1단계 = 사람이 모든 질문에 답함(또는 "미정으로 둬"라고 정함).
- 2단계 = 4제약을 지킨 초안이 파일로 저장됨.
- 3단계 = ⓐⓑⓒ 지적이 모두 반영되거나 "안 고침" 사유가 적힘.
- 4단계 = 아래 체크가 모두 ✅.

### 체크 (계획이 통과해야 하는 3가지)

- [ ] **핵심 기능이 첫 단계인가?** — 가장 중요한 기능을 맨 먼저(부수 기능·꾸미기는 뒤로).
- [ ] **바로 확인 가능한 크기인가?** — 각 단계가 곧바로 눈으로 확인할 만큼 작게 쪼개졌는가.
- [ ] **완료 기준이 "X를 하면 Y가 보인다" 형태인가?** — 각 단계 끝에 관찰 가능한 결과가 있는가(모호한 "구현 완료" 금지).
