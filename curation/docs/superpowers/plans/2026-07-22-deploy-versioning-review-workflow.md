# 배포·버전관리·리뷰 자동화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `feature/* → PR → develop(CI+CodeRabbit 게이트) → Release PR merge → main 자동 승격 → Vercel 프로덕션 배포 → Slack 알림` 파이프라인을 무료 도구로 구축한다.

**Architecture:** GitHub Actions 3개(CI, Release+Promote, Slack) + CodeRabbit GitHub App + release-please(Conventional Commits→SemVer) + gh api 브랜치 보호. develop이 리뷰받는 통합/스테이징 브랜치, main은 promote Action만 갱신하는 프로덕션 미러. Vercel은 이미 main=프로덕션·root=client·framework=Next.js로 연동됨.

**Tech Stack:** GitHub Actions(YAML), CodeRabbit, Slack Incoming Webhook, GitHub REST(branch protection) via `gh`.

> **⚠️ 실행 중 설계 변경 (2026-07-22):** KernelAcademy org가 "GitHub Actions의 PR 생성"을 정책으로 금지(409)해서 **release-please 방식(Release PR 자동생성)은 이 org에서 불가**. 대신 **수동 `workflow_dispatch` "Release" 워크플로우**(`.github/workflows/release.yml`)로 교체함: Actions 탭에서 버튼 실행 → conventional commits로 버전 산정 → `client/package.json`·`client/CHANGELOG.md`·태그·GitHub Release → develop→main 승격(merge) → 배포 → Slack. GITHUB_TOKEN만 사용(쓰기·태그·릴리즈·push는 허용, PR 생성만 금지). PAT/RELEASE_PLEASE_TOKEN 불필요. release-please 관련 Task(4) 및 매니페스트/config는 폐기. **부트스트랩 주의:** workflow_dispatch "Run workflow" 버튼은 워크플로우 파일이 **기본 브랜치(main)** 에 있어야 UI에 뜨므로, 최초 1회 develop→main 초기 승격으로 main에 워크플로우들을 심어야 함(첫 프로덕션 배포 겸).

## Global Constraints

- 모노레포: Next.js 앱은 `client/`에 있음. 모든 npm 명령은 `client/`에서 실행. CI 캐시 경로 `client/package-lock.json`.
- Node 버전 = **20** (Next.js 16 요구). `client/package.json`에 engines 없음 → CI에서 명시.
- repo = `KernelAcademy-AICamp/ai-camp-8th-main-project-2teams` (public, 홍교=admin). 기본 브랜치 = `main`.
- 커밋 = Conventional Commits(한글 설명 허용), 마지막에 트레일러 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- 커밋/푸시/PR은 **사용자가 명시 요청할 때만**. main 직접 push·force-push 금지. 작업은 `develop`에서 feature 브랜치로.
- 현재 버전 시드 = `0.1.0` (`client/package.json`). release-please 태그 형식 = `vX.Y.Z` (component 태그 미포함).
- 현재 브랜치 상태: **main과 develop이 분기(diverge)** 함(main엔 merge-commit 버블, develop엔 미배포 LLM 파싱 기능). 수동 reconcile 대신 promote 액션이 **merge**로 develop→main을 반영한다(ff 아님) — 분기 상태에서도 항상 성공. main은 사람이 안 건드림.
- Vercel "Skip deployments when no changes to root(client)" 활성 상태 → 릴리즈는 항상 `client/package.json` 버전 bump을 포함하므로 배포가 트리거됨(문서·설정만 바뀐 promote는 배포 스킵 = 의도된 동작).

---

## Task 1: 사전 준비물 (자격증명·앱 설치) — [USER ACTION]

시크릿 값과 앱 설치는 자격증명이 걸려 있어 **홍교님이 직접** 수행한다. Claude는 값을 대신 만들거나 입력하지 않는다. 아래 명령은 세션에서 `!` 프리픽스로 실행하면 된다.

**Files:** 없음 (GitHub Secrets · 외부 앱)

- [ ] **Step 1: Slack Incoming Webhook 생성**

Slack에서 알림 받을 채널을 정하고 Incoming Webhook URL을 발급한다.
- https://api.slack.com/apps → Create New App → From scratch → 워크스페이스 선택
- Incoming Webhooks → Activate → Add New Webhook to Workspace → 채널 선택 → `https://hooks.slack.com/services/...` URL 복사

- [ ] **Step 2: Webhook을 GitHub Secret으로 등록**

```bash
gh secret set SLACK_WEBHOOK_URL --repo KernelAcademy-AICamp/ai-camp-8th-main-project-2teams
# 프롬프트에 위 URL 붙여넣기
```

- [ ] **Step 3: promote용 Fine-grained PAT 생성**

main 보호를 우회해 push하려면 admin 소유 토큰이 필요하다.
- https://github.com/settings/personal-access-tokens/new
- Resource owner = `KernelAcademy-AICamp`, Repository access = 해당 repo만
- Permissions: **Contents: Read and write**, **Pull requests: Read and write**, **Workflows: Read and write**
- Generate → 토큰 복사

- [ ] **Step 4: PAT를 GitHub Secret으로 등록**

```bash
gh secret set RELEASE_PLEASE_TOKEN --repo KernelAcademy-AICamp/ai-camp-8th-main-project-2teams
# 프롬프트에 PAT 붙여넣기
```

- [ ] **Step 5: CodeRabbit GitHub App 설치**

- https://coderabbit.ai → Login with GitHub → org `KernelAcademy-AICamp` 선택 → 해당 repo에 설치 승인

- [ ] **Step 6: 등록 확인**

```bash
gh secret list --repo KernelAcademy-AICamp/ai-camp-8th-main-project-2teams
```
Expected: `SLACK_WEBHOOK_URL`, `RELEASE_PLEASE_TOKEN` 두 개가 보임.

---

## Task 2: 작업 브랜치 생성

**Files:** 없음 (git 브랜치 조작)

**Interfaces:**
- Produces: 이후 모든 파일이 커밋되는 작업 브랜치 `chore/release-ci-workflow` (base = 최신 origin/develop)

> main/develop 분기는 promote가 merge로 흡수하므로 여기서 reconcile하지 않는다. 작업 트리에 남은 남의 untracked 파일(`loop1-tickets.md`)은 건드리지 않는다 — `git add`는 항상 경로를 명시.

- [ ] **Step 1: 최신 develop에서 작업 브랜치 생성**

```bash
cd /Users/kyo/Developments/ecommerce
git fetch origin
git checkout -B chore/release-ci-workflow origin/develop
```
Expected: `chore/release-ci-workflow` 브랜치가 origin/develop 기준으로 생성됨.

---

## Task 3: CI 워크플로우 (lint·typecheck·build)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: 상태 체크 컨텍스트(잡 이름) `check` — Task 8에서 develop 브랜치 보호의 필수 체크로 참조.

- [ ] **Step 1: 워크플로우 파일 작성**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    branches: [develop]
  push:
    branches: [develop]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: client
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: client/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build
```

- [ ] **Step 2: YAML 문법 검증**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('valid')"
```
Expected: `valid`

- [ ] **Step 3: 로컬에서 동일 명령이 통과하는지 확인**

```bash
cd client && npm run lint && npm run typecheck && npm run build && cd ..
```
Expected: 세 명령 모두 성공(오류·경고 0). 실패하면 코드부터 고친 뒤 진행.

- [ ] **Step 4: 커밋**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: develop PR용 lint·typecheck·build 워크플로우 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: release-please 설정 + Release/Promote 워크플로우

**Files:**
- Create: `release-please-config.json`
- Create: `.release-please-manifest.json`
- Create: `.github/workflows/release-please.yml`

**Interfaces:**
- Consumes: Secret `RELEASE_PLEASE_TOKEN` (Task 1).
- Produces: develop push 시 Release PR 유지; Release 생성 시 `develop`을 `main`으로 ff push.

- [ ] **Step 1: release-please 설정 파일 작성**

Create `release-please-config.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "include-component-in-tag": false,
  "separate-pull-requests": false,
  "packages": {
    "client": {
      "release-type": "node",
      "package-name": "search-by-llm",
      "changelog-path": "CHANGELOG.md"
    }
  }
}
```

- [ ] **Step 2: 매니페스트 파일 작성 (현재 버전 시드)**

Create `.release-please-manifest.json`:

```json
{
  "client": "0.1.0"
}
```

- [ ] **Step 3: Release/Promote 워크플로우 작성**

Create `.github/workflows/release-please.yml`:

```yaml
name: Release

on:
  push:
    branches: [develop]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    outputs:
      releases_created: ${{ steps.release.outputs.releases_created }}
    steps:
      - uses: googleapis/release-please-action@v4
        id: release
        with:
          target-branch: develop
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
          token: ${{ secrets.RELEASE_PLEASE_TOKEN }}

  promote:
    needs: release-please
    if: ${{ needs.release-please.outputs.releases_created == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.RELEASE_PLEASE_TOKEN }}
      - name: Promote develop to main (merge)
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git fetch origin main develop
          git checkout main
          git merge --no-ff origin/develop -m "chore: release 승격 (develop→main)"
          git push origin main
```

> ff가 아니라 merge라서 main/develop 분기 상태에서도 항상 성공한다. main tip의 트리는 develop과 동일해지고, Vercel이 main push를 감지해 프로덕션 배포한다.
>
> **토큰**: fine-grained PAT가 org repo에서 쓰기 403(Contents write 미승인)을 내서, release-please·promote 모두 내장 `GITHUB_TOKEN`으로 전환함(워크플로우 `permissions: contents/pull-requests: write`). RELEASE_PLEASE_TOKEN 시크릿은 불필요(제거 가능). 대신 **Task 10에서 main 보호 시 promote가 push할 수 있도록 github-actions 봇 bypass**를 넣어야 함.

- [ ] **Step 4: 세 파일 YAML/JSON 문법 검증**

```bash
python3 -c "import json; json.load(open('release-please-config.json')); json.load(open('.release-please-manifest.json')); print('json ok')"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release-please.yml')); print('yaml ok')"
```
Expected: `json ok` 와 `yaml ok`

- [ ] **Step 5: 커밋**

```bash
git add release-please-config.json .release-please-manifest.json .github/workflows/release-please.yml
git commit -m "ci: release-please 버전관리 + develop→main 승격 워크플로우 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: CodeRabbit 설정

**Files:**
- Create: `.coderabbit.yaml`

**Interfaces:**
- Consumes: CodeRabbit App 설치(Task 1).
- Produces: develop 대상 PR에 자동 한국어 리뷰.

- [ ] **Step 1: CodeRabbit 설정 파일 작성**

Create `.coderabbit.yaml`:

```yaml
language: ko-KR
reviews:
  profile: chill
  request_changes_workflow: false
  high_level_summary: true
  auto_review:
    enabled: true
    base_branches:
      - develop
```

- [ ] **Step 2: YAML 문법 검증**

```bash
python3 -c "import yaml; yaml.safe_load(open('.coderabbit.yaml')); print('valid')"
```
Expected: `valid`

- [ ] **Step 3: 커밋**

```bash
git add .coderabbit.yaml
git commit -m "ci: CodeRabbit 자동 리뷰 설정(develop PR·한국어) 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Slack 배포 알림 워크플로우

**Files:**
- Create: `.github/workflows/notify-slack.yml`

**Interfaces:**
- Consumes: Secret `SLACK_WEBHOOK_URL`(Task 1), Vercel가 GitHub에 보고하는 `deployment_status` 이벤트.
- Produces: 프로덕션 배포 성공 시 Slack 메시지(버전·커밋·URL).

> 주의: `deployment_status` 이벤트 워크플로우는 **기본 브랜치(main)** 의 파일만 실행된다. 이 파일은 Task 9(첫 릴리즈 promote)로 main에 반영된 뒤부터 동작한다. 첫 릴리즈 배포 자체는 알림이 안 갈 수 있음(의도된 부트스트랩 한계).

- [ ] **Step 1: 알림 워크플로우 작성**

Create `.github/workflows/notify-slack.yml`:

```yaml
name: Notify Slack on Production Deploy

on:
  deployment_status

jobs:
  notify:
    if: >-
      ${{ github.event.deployment_status.state == 'success' &&
          startsWith(github.event.deployment_status.environment, 'Production') }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - id: ver
        run: echo "tag=$(git describe --tags --abbrev=0 2>/dev/null || echo 'unreleased')" >> "$GITHUB_OUTPUT"
      - name: Post to Slack
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
          TAG: ${{ steps.ver.outputs.tag }}
          URL: ${{ github.event.deployment_status.environment_url }}
          SHA: ${{ github.event.deployment.sha }}
        run: |
          SHORT=${SHA:0:7}
          MSG="🚀 프로덕션 배포 완료 — *${TAG}*\n<${URL}|사이트 열기>  (커밋 \`${SHORT}\`)"
          curl -sS -X POST -H 'Content-type: application/json' \
            --data "$(jq -n --arg t "$MSG" '{text:$t}')" \
            "$SLACK_WEBHOOK_URL"
```

- [ ] **Step 2: YAML 문법 검증**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/notify-slack.yml')); print('valid')"
```
Expected: `valid`

- [ ] **Step 3: 커밋**

```bash
git add .github/workflows/notify-slack.yml
git commit -m "ci: 프로덕션 배포 완료 시 Slack 알림 워크플로우 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 설정 PR을 develop에 병합 (부트스트랩)

이 시점엔 아직 develop 보호가 없으므로 이 첫 PR은 게이트 없이 병합한다(부트스트랩). — [일부 USER ACTION: 병합 승인]

**Files:** 없음

**Interfaces:**
- Produces: develop에 CI·release-please·CodeRabbit·Slack 파일 반영 → 이후 develop push가 release-please를 최초 실행.

- [ ] **Step 1: 브랜치 push 및 PR 생성**

```bash
git push -u origin chore/release-ci-workflow
gh pr create --base develop --head chore/release-ci-workflow \
  --title "ci: 배포·버전관리·리뷰 자동화 파이프라인 구축" \
  --body "CI(lint·typecheck·build) + release-please 버전관리 + develop→main 승격 + CodeRabbit 리뷰 + Slack 배포알림. 설계: docs/superpowers/specs/2026-07-22-deploy-versioning-review-workflow-design.md"
```

- [ ] **Step 2: CodeRabbit 리뷰 확인 (설치되어 있으면 자동 리뷰가 달림)**

PR 페이지에서 CodeRabbit 요약 코멘트 확인. 지적사항 있으면 반영 후 push.

- [ ] **Step 3: PR 병합 (squash)**

```bash
gh pr merge chore/release-ci-workflow --squash --delete-branch
```
Expected: 병합 성공. develop 갱신.

- [ ] **Step 4: release-please 최초 실행 확인**

develop push로 Release 워크플로우가 돈다.

```bash
sleep 20 && gh run list --workflow=release-please.yml --branch develop --limit 1
gh pr list --base develop --search "release" --state open
```
Expected: `release-please--branches--develop` 같은 이름의 **Release PR**이 자동 생성됨(제목 예: `chore(main): release 0.2.0`). 없으면 Actions 로그에서 토큰/설정 오류 확인.

---

## Task 8: develop 브랜치 보호 활성화

이제 CI 파일이 develop에 있으므로 필수 체크를 걸 수 있다. — [USER ACTION 권장: admin 권한]

**Files:**
- Create(임시): `/tmp/develop-protection.json` (적용 후 삭제)

**Interfaces:**
- Consumes: CI 잡 이름 `check`.
- Produces: develop 직접 push 차단 + CI 통과 필수.

- [ ] **Step 1: CI 상태 체크의 실제 컨텍스트 이름 확인**

Task 7에서 돈 CI 실행의 체크 이름을 확인한다(보통 `check`).

```bash
gh api repos/KernelAcademy-AICamp/ai-camp-8th-main-project-2teams/commits/develop/check-runs \
  --jq '.check_runs[].name'
```
Expected: `check` 가 목록에 있음. (다르면 다음 스텝 contexts 값을 그 이름으로 교체)

- [ ] **Step 2: 보호 규칙 JSON 작성**

Create `/tmp/develop-protection.json`:

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["check"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0
  },
  "restrictions": null
}
```

- [ ] **Step 3: 보호 규칙 적용**

```bash
gh api -X PUT repos/KernelAcademy-AICamp/ai-camp-8th-main-project-2teams/branches/develop/protection \
  --input /tmp/develop-protection.json
```
Expected: 200 응답(JSON에 `required_status_checks` 반영).

- [ ] **Step 4: 확인 및 정리**

```bash
gh api repos/KernelAcademy-AICamp/ai-camp-8th-main-project-2teams/branches/develop/protection \
  --jq '{checks: .required_status_checks.contexts, pr_required: .required_pull_request_reviews != null}'
rm /tmp/develop-protection.json
```
Expected: `{"checks":["check"],"pr_required":true}`

---

## Task 9: 첫 릴리즈 — Release PR 병합 → 승격 → 배포 → Slack 검증

전 구성요소를 엔드투엔드로 처음 태워 검증한다. — [USER ACTION: 릴리즈 병합 결정]

**Files:** 없음

**Interfaces:**
- Consumes: Task 7이 만든 Release PR, Task 4 promote 잡, Task 6 Slack 워크플로우.

- [ ] **Step 1: Release PR 병합**

Task 7에서 생성된 Release PR 번호를 확인하고 병합한다.

```bash
gh pr list --base develop --state open --search "release in:title"
gh pr merge <PR번호> --squash
```
Expected: 병합 시 release-please가 태그(`v0.2.0` 등) + GitHub Release 생성, promote 잡이 `develop`을 `main`으로 push.

- [ ] **Step 2: 승격 및 배포 확인**

```bash
sleep 15
git fetch origin
git diff --stat origin/main origin/develop   # 트리 차이 없어야 함(merge 승격 성공)
gh release list --limit 1                     # 새 태그 확인
```
Expected: main과 develop 트리 동일(diff 없음), 새 릴리즈 태그 존재. Vercel 대시보드에서 프로덕션 배포가 새로 도는지 확인.

- [ ] **Step 3: `deployment_status` 환경 이름 확인 (Slack 필터 검증)**

첫 배포 후 Vercel이 보고한 배포 환경 문자열을 확인해 Task 6의 `startsWith(..., 'Production')` 필터가 맞는지 본다.

```bash
gh api repos/KernelAcademy-AICamp/ai-camp-8th-main-project-2teams/deployments \
  --jq '.[0].environment' 
```
Expected: `Production` (또는 `Production – ...`). 다르면 `notify-slack.yml` 필터를 실제 문자열에 맞게 수정 후 develop→릴리즈로 재반영.

- [ ] **Step 4: Slack 알림 확인**

주의: `notify-slack.yml`은 이번 promote로 **main에 처음 반영**되므로, 이번 배포는 알림이 안 갈 수 있다. 확인용으로 client에 사소한 변경(예: `fix:` 커밋) 하나를 develop PR→릴리즈로 한 번 더 태워 **두 번째 배포에서 Slack 메시지 수신**을 확인한다.
Expected: 지정 Slack 채널에 "🚀 프로덕션 배포 완료 — vX.Y.Z" 메시지 도착.

---

## Task 10: main 브랜치 보호 활성화

promote Action(admin PAT)만 main을 갱신하도록 잠근다. — [USER ACTION: admin 권한]

**Files:**
- Create(임시): `/tmp/main-protection.json` (적용 후 삭제)

- [ ] **Step 1: 보호 규칙 JSON 작성**

Create `/tmp/main-protection.json`:

```json
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

> `enforce_admins:false` + admin 소유 `RELEASE_PLEASE_TOKEN` 조합으로 promote의 직접 push는 통과하고, 일반 팀원의 직접 push는 PR 필수 규칙에 막힌다.

- [ ] **Step 2: 적용**

```bash
gh api -X PUT repos/KernelAcademy-AICamp/ai-camp-8th-main-project-2teams/branches/main/protection \
  --input /tmp/main-protection.json
```
Expected: 200 응답.

- [ ] **Step 3: 다음 릴리즈에서 promote가 여전히 성공하는지 확인 후 정리**

```bash
rm /tmp/main-protection.json
```
그리고 이후 첫 릴리즈에서 promote 잡이 실패하지 않는지 Actions 로그로 확인. 실패 시 PAT 권한(Contents RW) 또는 `enforce_admins` 설정 재점검.

---

## Task 11: CLAUDE.md에 파이프라인 문서화

팀(비개발자 포함)이 흐름을 알도록 규칙 문서를 갱신한다.

**Files:**
- Modify: `CLAUDE.md` (GitHub 사용 규칙 섹션 뒤에 추가)

- [ ] **Step 1: 파이프라인 섹션 추가**

`CLAUDE.md`의 "## 코드 품질" 섹션 바로 앞에 아래 내용을 삽입:

```markdown
## 배포·버전·리뷰 파이프라인 (자동화)

- **흐름**: `feature/*` → PR → `develop` → (Release PR 병합) → `main` 자동 승격 → Vercel 프로덕션 배포 → Slack 알림.
- **develop PR 게이트**: CI(`client` lint·typecheck·build) 통과 필수 + CodeRabbit 자동 리뷰(자문). 초록이면 작성자가 squash 병합.
- **버전관리**: release-please가 Conventional Commits로 SemVer 계산 → `client/package.json`·`client/CHANGELOG.md` 갱신 Release PR을 유지. 이 PR을 병합하면 태그·GitHub Release 생성 + main 승격 + 프로덕션 배포.
- **main**: 사람이 직접 push 금지. promote Action만 갱신. Vercel 프로덕션 = main.
- **develop**: Vercel preview URL 자동 생성(스테이징).
- 필요한 시크릿: `RELEASE_PLEASE_TOKEN`(promote용 admin PAT), `SLACK_WEBHOOK_URL`.
```

- [ ] **Step 2: 커밋 (별도 작업 브랜치→develop PR)**

```bash
git checkout develop && git pull
git checkout -b docs/pipeline-rules
git add CLAUDE.md
git commit -m "docs: 배포·버전·리뷰 자동화 파이프라인 규칙 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push -u origin docs/pipeline-rules
gh pr create --base develop --title "docs: 파이프라인 규칙 추가" --body "자동화 파이프라인 흐름 문서화"
```
Expected: 이 PR이 새 게이트(CI+CodeRabbit)를 통과하는지 = 파이프라인 자체의 첫 실사용 검증.

---

## 부록: 롤백 / 트러블슈팅

- **promote merge 충돌**: 누군가 main을 develop과 무관하게 직접 바꿈(원래 금지). 충돌 파일 확인 후 develop 기준으로 해소하거나, main 직접 변경분을 develop에 먼저 반영.
- **CI 필수 체크가 "Expected — Waiting"에서 안 끝남**: contexts 이름 불일치. Task 8 Step 1으로 실제 이름 확인 후 보호 규칙 갱신.
- **Slack 안 옴**: (1) `notify-slack.yml`이 main에 있는지, (2) 환경 필터 문자열이 실제 `deployment_status.environment`와 맞는지(Task 9 Step 3), (3) `SLACK_WEBHOOK_URL` 시크릿 존재 확인.
- **Vercel이 배포를 스킵**: 변경이 `client/` 밖이라서. 릴리즈는 항상 `client/package.json`이 바뀌므로 정상. 강제 배포는 Vercel 대시보드 Redeploy.
