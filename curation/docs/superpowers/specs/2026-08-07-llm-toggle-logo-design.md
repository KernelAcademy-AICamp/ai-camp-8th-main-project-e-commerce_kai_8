# 스펙 — 로고 토글 "티:파운드(without llm)" (요청 단위 LLM off 모드)

- 작성일: 2026-08-07
- 상태: 사용자 승인 완료 (대화 검토)
- 관련: [컬러웨이 검색 설계 §8](../../design/2026-08-07-colorway-search-optional-llm-design.md) — 요청 단위 override는 내부 실험용으로만 허용

## 목적

홈 화면의 "티:파운드" 로고를 눌러 검색의 LLM 레이어를 끄고, 결정적 검색(가격·브랜드·제목 lexical + 컬러웨이 결속)만으로 같은 쿼리를 체험·비교할 수 있게 한다. 팀 내부 실험·데모 장치다.

## 동작 결정 (사용자 확인)

1. **모드 의미**: `without llm` = LLM 쿼리 파서(parseQueryIntent) 호출 생략 + 컬러웨이 결속 레인을 요청 단위로 활성화. 결정적 경로(가격 파서·브랜드 lexical·제목 토큰)는 그대로.
2. **상태 유지**: URL 파라미터 `llm=off`. 홈 ↔ 결과 화면 이동·새로고침·링크 공유에 유지.

## UI

- 홈 로고: 버튼형 토글. 누르면 `?llm=off` 부착/제거 + 라벨 `티:파운드` ↔ `티:파운드(without llm)`.
- LandingFinder: 모드 켜짐이면 `/search?q=...&src=...&llm=off`로 이동.
- 결과 화면 로고: `llm=off`면 라벨에 `(without llm)` 표시. 클릭은 기존대로 홈 이동(`/?llm=off`로 모드 보존). 재검색(go)·SearchBar 검색도 파라미터 보존.

## API·서버

- `POST /api/search` body 선택 필드 `llm: "off"`. 그 외 값·부재 = 현행 동작(기본 안전).
- `llm=off`일 때 route:
  1. LLM 파서 호출 생략 — intent는 빈 값에서 시작, parserDegraded 취급.
  2. 컬러웨이 레인 활성: `isColorwayLaneOn(env) || llmOff`.
  3. mode 판정 후 `failed`인데 컬러웨이 계획이 있으면 `lexical_only`로 승격(컬러웨이 조건 = 검색 신호).
- 클라이언트 캐시 키에 모드 반영(`llm-off::<query>`) — 모드 간 결과 오염 방지.

## 테스트

- route: ①`llm:"off"`면 LLM 파서 미호출 ②컬러웨이 레인 요청 단위 활성(계획 실행) ③`llm` 부재 시 현행 동일 ④결정적 신호 전무+컬러웨이 계획도 없으면 failed 유지.
- UI 라벨·URL 전파는 dev 서버 눈 확인.

## 비목표

- 일반 사용자 노출 제어(권한·숨김) — 팀 내부 MVP라 두지 않음.
- 컬러웨이 해석 칩 표시 — 별도 후속(followup 문서).
