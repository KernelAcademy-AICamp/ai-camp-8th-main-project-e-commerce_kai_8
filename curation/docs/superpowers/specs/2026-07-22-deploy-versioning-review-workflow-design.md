# 배포·버전관리·리뷰 자동화 설계

- 작성일: 2026-07-22
- 대상: `search-by-llm` (client, Next.js 16 · Vercel 배포)
- repo: `KernelAcademy-AICamp/ai-camp-8th-main-project-2teams` (public, 홍교 admin)

## 목표

세 가지를 무료 도구로 자동화한다.

1. **버전관리** — Conventional Commits 기반 SemVer 자동 계산 + CHANGELOG + 태그.
2. **배포 알림** — 프로덕션 배포가 실제 완료되면 Slack으로 알림.
3. **리뷰 게이트** — PR에 무료 AI 리뷰(CodeRabbit)를 붙이고, 품질 체크를 통과해야 병합.

## 전체 흐름

```
feature/*  ──PR──▶  develop  ──(Release PR merge 시 자동 승격)──▶  main  ──▶  Vercel 프로덕션
   │                  │                                            │
   │           CI + CodeRabbit                              (사람 직접 push 차단,
   │           (품질 게이트)                                  promote Action만 push)
   └─ 작업 브랜치        develop = 리뷰받는 통합/스테이징 (Vercel preview URL 자동)
```

- **develop** = 통합/스테이징. 모든 feature PR이 여기로 오고, Vercel이 preview URL을 자동 생성한다. develop에 머지해도 프로덕션에는 반영되지 않는다.
- **main** = 프로덕션 미러. 사람이 직접 건드리지 않고, 릴리즈 시 promote Action이 develop을 승격시킨다. main push가 Vercel 프로덕션 배포를 트리거한다.
- **승격 트리거 = 릴리즈 시** (상시 아님). release-please가 유지하는 Release PR을 merge하는 순간이 곧 "이번 릴리즈 확정 + 프로덕션 배포"다.

## 구성 요소

전부 무료. GitHub Actions(공개 repo 무제한) + CodeRabbit(공개 repo 무료) + Vercel(Hobby) + Slack Webhook.

| # | 이름 | 파일/도구 | 트리거 | 역할 |
|---|---|---|---|---|
| 1 | CI | `.github/workflows/ci.yml` | `develop`로 PR (+ develop push) | `client/`에서 `npm ci` → lint → typecheck → build. **필수 통과 체크** |
| 2 | CodeRabbit | GitHub App + `.coderabbit.yaml` | `develop`로 PR | 자동 AI 리뷰(요약·라인 코멘트). 자문용(advisory) |
| 3 | release-please | `.github/workflows/release-please.yml` + config | `develop` push | Conventional Commits 읽어 버전 bump + CHANGELOG를 담은 **Release PR** 유지·갱신, merge 시 태그·GitHub Release 생성 |
| 4 | promote | `.github/workflows/release-promote.yml` | release-please가 Release 생성 시 | `develop`의 릴리즈 커밋을 `main`으로 push(승격) → Vercel 배포 촉발 |
| 5 | Slack 알림 | `.github/workflows/notify-slack.yml` | `deployment_status` = Production·success | Vercel이 GitHub에 배포 성공 보고하는 시점에 Slack 전송: 버전·변경 요약·프로덕션 URL |

### 왜 Slack을 `deployment_status`에 거는가
promote 직후는 Vercel 빌드가 아직 안 끝난 상태다. Vercel의 GitHub 연동은 배포가 실제 완료되면 GitHub Deployment 상태를 `success`로 갱신한다. 그 이벤트에 알림을 걸면 **사이트가 진짜 라이브된 순간**에 정확히 알린다.

## 병합 게이트 (브랜치 보호 규칙)

- **develop**
  - 직접 push 차단(PR 필수)
  - CI(`ci.yml`) 통과를 **필수 상태 체크**로 지정
  - CodeRabbit 리뷰(자문). CodeRabbit 무료 티어는 코멘트 중심이라 하드 게이트가 아니라 자문으로 둔다.
  - **사람 승인 강제 안 함** → 홍교님이 CodeRabbit 지적을 해결하고 CI가 초록이면 본인이 merge. (팀원이 늘면 "승인 1명 필수" 한 줄만 추가)
- **main**
  - force-push·사람 직접 push 차단
  - promote Action만 push 허용 (bypass 대상에 Action identity 또는 전용 토큰)

## 버전·커밋 규칙

- 이미 CLAUDE.md가 강제하는 **Conventional Commits**(`feat:`/`fix:`/`docs:`/`chore:`…) 기반.
- SemVer 자동 계산: `feat` → minor, `fix` → patch, `BREAKING CHANGE`/`!` → major.
- 모노레포라 release-please를 `client` 경로에 설정: `client/package.json` 버전 + `client/CHANGELOG.md` 갱신.
- release-please 설정 파일: `release-please-config.json`(패키지 경로 `client`, release-type `node`) + `.release-please-manifest.json`(현재 버전 시드 `0.1.0`).

## 필요한 준비물 (사람이 넣는 값)

1. **Slack Incoming Webhook URL** 1개 → GitHub Secret `SLACK_WEBHOOK_URL` 등록.
2. **CodeRabbit GitHub App** 설치 승인(repo에 대해).
3. **promote용 토큰** — main 보호를 우회해 push할 수 있는 fine-grained PAT(또는 GitHub App 토큰) → Secret 등록. (기본 `GITHUB_TOKEN`은 보호 브랜치 push가 막힐 수 있음)

## 기술적 주의점 / 리스크

- **promote 방식**: main은 오직 promote로만 갱신되므로 develop이 항상 앞선다 → fast-forward push(`git push origin <release-sha>:main`)가 성립. 실패 시(예: main 수동 변경) 알림 후 중단.
- **토큰 트리거 한계**: release-please가 `GITHUB_TOKEN`으로 만든 Release PR에는 다른 워크플로우(CI)가 자동 실행되지 않는다 — Release PR은 CI 대상이 아니므로 문제없음. 단, Vercel 배포는 Actions 토큰과 무관하게 git push를 감지하므로 promote push는 정상적으로 배포를 촉발한다.
- **`deployment_status` 워크플로우 위치**: 이 이벤트로 실행되는 워크플로우 파일은 기본 브랜치(main)에 존재해야 인식된다. 최초 세팅 시 main에도 워크플로우가 반영되도록 첫 릴리즈를 한 번 태운다.
- **CodeRabbit 하드 게이트 불가**: 무료 티어는 pass/fail 필수 체크를 안정적으로 제공하지 않으므로, 강제 게이트는 자체 CI로만 걸고 CodeRabbit은 자문으로 둔다.
- **Vercel 프로덕션 브랜치**: 이미 `main`으로 설정됨. develop은 자동으로 preview 배포됨. 별도 변경 불필요.

## 범위 밖 (지금 안 함)

- Vercel 팀원 초대(Pro 유료) — 무료 GitHub 협업으로 충분.
- 커스텀 도메인 연결.
- 상시 배포(continuous) 모드 — 릴리즈 승격으로 결정됨.
- 테스트 스위트 도입(현재 테스트 없음) — CI는 lint/typecheck/build까지. 추후 test 추가 시 CI에 한 줄 추가.
