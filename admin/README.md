# admin — aTee 이벤트 대시보드

`c_events`에 쌓인 행동 신호를 표로 보는 **읽기 전용** 화면이다. 데이터를 고치는 기능은 없다.

- 설계: [docs/superpowers/specs/2026-08-20-admin-event-dashboard-design.md](../docs/superpowers/specs/2026-08-20-admin-event-dashboard-design.md)
- 실행 계획: [docs/plans/2026-08-20-admin-event-dashboard.md](../docs/plans/2026-08-20-admin-event-dashboard.md)
- 지표 정의: [docs/atee/living/session-metrics.md](../docs/atee/living/session-metrics.md)

## 로컬에서 돌리기

```
cp .env.example .env.local     # 값 채우기 — 아래 참고
npm install
npm run dev
```

`npm run check`로 lint·타입·포맷을 한 번에 검사한다. `npm run test`는 vitest.

## 환경변수

| 이름                 | 무엇                                                |
| -------------------- | --------------------------------------------------- |
| `ADMIN_USER`         | 출입용 사용자명. 생략하면 `admin`                   |
| `ADMIN_PASSWORD`     | 출입용 비밀번호. **비어 있으면 아무도 못 들어간다** |
| `ADMIN_DATABASE_URL` | 읽기 전용 계정의 Postgres 접속 문자열               |

자세한 형식과 함정은 [.env.example](.env.example)에 적어 뒀다. 특히 두 가지를 놓치기 쉽다.

- **shared pooler(IPv4)** 를 써야 한다. Pro 플랜이 기본으로 주는 dedicated pooler는 IPv6 전용이고 **Vercel은 IPv6를 지원하지 않는다.**
- 비밀번호는 **ASCII만.** Basic 인증이 비ASCII를 제대로 다루지 못해 맞는 비밀번호인데도 거절된다.

## 데이터베이스 계정

`atee_admin_ro` — 읽기만 되고 쓰기는 데이터베이스가 거부한다. 생성은
[backend/supabase/migrations/20260820300000_admin_readonly_role.sql](../backend/supabase/migrations/20260820300000_admin_readonly_role.sql)에 있고,
비밀번호만 사람이 콘솔에서 따로 설정한다(그 파일 상단 주석 참고).

**새 테이블을 대시보드에서 보려면** 그 테이블에도 `grant select`와 RLS 정책을 **함께** 줘야 한다. 하나만 주면 오류가 아니라 조용히 0건이 나온다.

## 지표를 추가하려면

1. [`metrics/`](metrics/)에 파일을 하나 만든다 ([session-summary.ts](metrics/session-summary.ts)를 본뜨면 된다)
2. [`metrics/index.ts`](metrics/index.ts)의 명단에 한 줄 추가한다

화면 코드는 건드리지 않는다 — SQL 결과의 컬럼 이름이 그대로 표 머리글이 된다.

SQL은 **읽기 전용**이어야 한다. 데이터베이스가 쓰기를 거부하지만, 거부는 카드 하나가 조용히 "실패"로 뜨는 것으로만 나타난다. `metrics/index.test.ts`가 쓰기 키워드를 미리 잡아 이름을 대며 실패시킨다.

## 배포

**`frontend`와 다른 Vercel 계정**에 올라간다 (기존 계정의 무료 한도가 찼다). 어느 계정인지 모르면 찾을 수 없으므로 팀에서 공유해 둔다.

| 설정               | 값                                                                 |
| ------------------ | ------------------------------------------------------------------ |
| Root Directory     | `admin`                                                            |
| 리전               | `icn1` (서울) — [vercel.json](vercel.json). Supabase가 서울에 있다 |
| 환경변수           | 위 3개                                                             |
| Ignored Build Step | `admin/`이 바뀔 때만 빌드                                          |

**Ignored Build Step을 꼭 건다.** 걸지 않으면 `frontend`만 고쳐도 admin이 매번 빌드되어 무료 한도를 갉아먹는다.

> ⚠️ **repo가 private이 되면 배포가 막힌다.** Vercel 무료(Hobby) 플랜은 조직 소유의 private repo를 붙일 수 없다. 지금은 public이라 문제가 없다. 아카데미 채점 후 비공개로 바뀌면 Pro로 올리거나 GitHub Actions에서 배포하는 방식으로 바꿔야 한다. 갑자기 배포가 안 되면 여기를 먼저 본다.

## 지금 할 수 없는 것

|                                   | 왜                                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **유저 단위 집계**                | 행동 기록에 계정 식별자가 없다. **기기 단위로만** 나온다 ([session-metrics.md §9](../docs/atee/living/session-metrics.md)) |
| **비회원 구간**                   | 로그인 전에는 기록 자체가 남지 않는다 (§10)                                                                                |
| 스타일 탐색 · 검색 총 건수 · 구매 | 정의만 있고 값이 없거나 뜻이 다르다 (§13)                                                                                  |

출입 통제는 지금 **공용 비밀번호 하나**를 쓰는 임시 조치다. 본안은 구글 로그인 + 이메일 허용 목록이며, 갈아끼울 때 고칠 곳은 [proxy.ts](proxy.ts) 하나다.
