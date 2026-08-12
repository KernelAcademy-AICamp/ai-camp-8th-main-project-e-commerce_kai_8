# frontend/AGENTS.md — 프론트엔드 아키텍처 규칙

Next.js(App Router) + TypeScript + Tailwind 기반 PWA. 커밋·품질 규칙은 루트 [`AGENTS.md`](../AGENTS.md)를 따르고, 이 파일은 코드 구조 규칙만 다룬다.

## 폴더 구조

```
frontend/
  app/         # Next.js App Router — 라우팅·레이아웃만. 로직 금지, features를 조립만 한다.
  features/    # 기능 단위 모듈 (아래 feature 구조 참고)
  shared/      # 여러 feature가 함께 쓰는 순수 유틸·공용 모듈 (특정 feature에 속하면 안 됨)
```

## Feature 구조 (clean architecture + MVVM)

각 feature는 세 레이어로 나눈다. 의존 방향은 **presentation → domain ← data** (domain은 다른 레이어를 import하지 않는다).

```
features/<feature>/
  domain/          # 엔티티·타입·순수 비즈니스 로직. 프레임워크·fetch 의존 금지.
  data/            # API 클라이언트·저장소 구현·DTO 매핑. domain 타입으로 변환해 반환.
  presentation/
    components/    # View — 표시만 담당하는 React 컴포넌트
    view-model/    # ViewModel — 상태·이벤트 처리 훅(use*). View와 domain을 연결.
```

- **View**(components)는 로직을 갖지 않는다. 상태와 핸들러는 view-model 훅에서 받는다.
- **ViewModel**(view-model)은 React 훅으로 작성하고 UI(JSX)를 반환하지 않는다.
- **domain**은 순수 TypeScript만 — React·Next.js·브라우저 API를 import하지 않는다.
- **data**는 외부 세계(API·스토리지)를 감추고 domain 타입으로 변환해서 넘긴다.
- 레이어가 아직 필요 없으면 만들지 않는다(빈 폴더 금지). 필요해질 때 추가한다.

## 하위 기능 (nested feature)

한 feature 안에서 독립된 하위 기능이 생기면 그 feature 폴더 안에 같은 구조로 중첩한다.

```
features/feed/
  domain/
  data/
  presentation/
  bottom-sheet/        # feed의 하위 기능
    domain/
    presentation/
```

- 하위 기능은 부모 feature 내부에서만 사용한다. 다른 feature가 쓰게 되면 `features/` 최상위로 승격하거나 `shared/`로 옮긴다.
- feature 간 직접 import는 지양한다. 공유가 필요하면 `shared/`를 거친다.

## Import 규칙

- 경로 별칭 `@/*` 사용 (예: `@/features/feed/domain/product`).
- import 정렬은 ESLint(simple-import-sort)가 자동으로 처리 — 손으로 정렬하지 않는다.

## 테스트

- vitest 사용. 테스트 파일은 대상 파일 옆에 `*.test.ts(x)`로 둔다.
- domain 로직은 순수 함수라 테스트가 쉽다 — domain부터 테스트를 작성한다.
