# Loop 1 업무 티켓 (2주 · 데이터 정돈 → 빌드·측정)

> Notion "업무 보드"에 복붙용. · 2026-07-21
> **규칙:** 1주차 = 데이터 정돈(담당 지정) / 2주차 = 무담당 Backlog(풀, `유형` 보고 하나씩 가져가기, WIP 1)
> **속성:** 상태(Backlog/In progress/Done) · 담당자 · 주차 · 유형(개발/데이터/검증/리서치/공통)
> **팀:** 김홍교(개발총괄) · 홍상호(카탈로그·라벨) · 신유정(이미지속성·검증) · 라진우(리뷰·감각)

---

## 🗄️ Supabase 스키마 (공용 단일 소스)

> 비개발자는 **Table Editor / CSV 임포트**로 입력 (SQL 불필요). 행동 로그(검색·클릭·찜)는 Supabase 아님 → **Amplitude**.

| 테이블 | 핵심 컬럼 | 채우는 사람 |
|---|---|---|
| `products` | id, naver_product_id, title, image_url, **back_image_url**, price, mall, source_keyword, is_curated | 김홍교(수집) → 홍상호(큐레이션·등판URL) |
| `attribute_schema` | attribute_key, label, enum_values(jsonb), 판정규칙, version | 홍상호 |
| `catalog_keywords` | keyword, type(brand/키워드/암장굿즈), included, note | 홍상호 |
| `product_attributes` | product_id(fk), 바탕색, 프린팅색, 프린팅위치, 그래픽유형, 핏, 소재추정, raw_json, model | 김홍교(1차 적재) → 신유정(검수·교정) |
| `attribute_validation` | product_id(fk), attribute_key, extracted_value, correct(o/x/부분), corrected_value, validator | 신유정(시각) · 라진우(감각) |
| `product_reviews` | product_id(fk), review_text, source, sentiment, mentioned_attributes | 라진우 |
| `interviews` | interviewee, date, jtbd_notes, query_types(jsonb), purchase_intent(1~5), quotes, insight | 라진우 |

- **앱 검색** = `products ⨝ product_attributes`, 검증서 임계 미달 속성 제외

---

## 📋 복붙용 제목 목록 (표에 붙이면 행 여러 개 생성)

**1주차 (이미 카드 4개 생성됨 — ✅ 표시)**
```
데이터 스파이크: 네이버 API 이미지·물량 확인   ✅생성됨(김홍교·1주차·개발)
Supabase 프로젝트 + 스키마 설계·마이그레이션   ✅생성됨(김홍교·1주차·개발)
네이버 API 수집 → products 적재                ✅생성됨(김홍교·1주차·개발)
비전 LLM 속성추출 배치 → product_attributes 적재  ✅생성됨(김홍교·1주차·개발)
속성 스키마 v1 → attribute_schema
라벨링 판정 기준 문서
카탈로그 선정 기준 + 수집 키워드 → catalog_keywords
검증 프로토콜·골든셋 설계
이미지 속성 검수·교정 + 정확도 1차 측정
리뷰/댓글 수집·정제 → product_reviews
감성·속성 언급 분석 → 감각(소재·기능성·느낌) 태그
```

**2주차 (전부 무담당 Backlog)**
```
Next.js + shadcn 스캐폴딩 + Vercel 배포 파이프라인
자연어 검색·파싱·랭킹
결과 카드 + 찜/모의 담기
Amplitude 계측
프로덕션 배포 + 인터뷰/측정 링크 공유
카탈로그 큐레이션 50~100
스키마·라벨 v1.1 개정
시각속성 정확도 리포트
오검색 패턴 정리 → 프롬프트/스키마 개선안
클라이머 인터뷰 가이드 작성
클라이머 인터뷰 진행·정리 3~5 → interviews
Loop1 의사결정 게이트 + iterate-log 기록
```

---

# 🗓️ 1주차 — 데이터 정돈 (담당 지정 · 상태 Backlog)

## 1. 데이터 스파이크: 네이버 API 이미지·물량 확인  ✅생성됨
`담당자 김홍교 · 주차 1주차 · 유형 개발` — *최우선(D1)*
**목표:** 코드 짜기 전, 데이터 소스가 쓸만한지 판정.
- [ ] API 10~20개 샘플 호출 → 등판(백프린팅) 이미지 유무·해상도 확인
- [ ] 클라이밍 프린팅티 실제 물량(50개 확보 가능?) 확인
- [ ] GO / 우회(등판 이미지 수기 보강) 판정 → 팀 공유

## 2. Supabase 프로젝트 + 스키마 설계·마이그레이션  ✅생성됨
`담당자 김홍교 · 주차 1주차 · 유형 개발`
**목표:** 공용 데이터 단일 소스 구축.
- [ ] 7개 테이블 생성(products·attribute_schema·catalog_keywords·product_attributes·attribute_validation·product_reviews·interviews)
- [ ] 팀 접근권한 + Table Editor 온보딩(비개발 5분)

## 3. 네이버 API 수집 → products 적재  ✅생성됨
`담당자 김홍교 · 주차 1주차 · 유형 개발`
**목표:** 클라이밍 프린팅티 50~100개 원천 데이터 확보.
- [ ] 오픈API 연동(일 25,000회 한도)
- [ ] 홍상호 키워드로 수집 스크립트
- [ ] products insert(이미지URL·가격·몰·상품ID)
- **DoD:** 50개+ 저장, 재실행 재현 가능

## 4. 비전 LLM 속성추출 배치 → product_attributes 적재  ✅생성됨
`담당자 김홍교 · 주차 1주차 · 유형 개발`
**목표:** 이미지 → 속성 JSON 자동 추출(H1 최대 리스크).
- [ ] 홍상호 스키마를 프롬프트에 반영(JSON 강제)
- [ ] 이미지URL → 비전 LLM **단일 호출** → JSON(바탕색·프린팅색·프린팅위치·그래픽유형·핏·소재추정)
- [ ] 30~50개 먼저 추출 → 신유정 핸드오프

## 5. 속성 스키마 v1 → attribute_schema
`담당자 홍상호 · 주차 1주차 · 유형 데이터` — *(Notion에 카드는 있으나 주차·유형만 채우면 됨)*
**목표:** 검색·추출의 기준이 되는 속성 정의.
- [ ] 속성·값(enum) 정의: 바탕색 / 프린팅색 / 프린팅위치(앞·등·양면·소매) / 그래픽유형(레터링·로고·일러스트·포토) / 핏(오버·레귤러·슬림) / 소재추정
- [ ] attribute_schema 테이블에 입력
- **DoD:** 김홍교가 프롬프트에 바로 쓸 수 있는 enum 표

## 6. 라벨링 판정 기준 문서
`담당자 홍상호 · 주차 1주차 · 유형 데이터`
**목표:** 사람마다 다르게 라벨링하지 않도록 규칙 확정.
- [ ] 속성별 판정 규칙
- [ ] 애매/경계 케이스(예: 멀티컬러 프린팅 → 대표색 규칙)
- **산출물:** 라벨 가이드

## 7. 카탈로그 선정 기준 + 수집 키워드 → catalog_keywords
`담당자 홍상호 · 주차 1주차 · 유형 데이터` — *(docs 미해결 항목)*
**목표:** "클라이밍 관련" 범위 확정 → 김홍교 수집 입력.
- [ ] "클라이밍 관련" 정의(클라이밍 브랜드·암장 굿즈·클라이밍 그래픽 키워드)
- [ ] 검색 키워드·브랜드 리스트 → catalog_keywords 입력 → 김홍교 전달
- **DoD:** 키워드/브랜드 리스트 확정(W1 초)

## 8. 검증 프로토콜·골든셋 설계
`담당자 신유정 · 주차 1주차 · 유형 검증`
**목표:** 정확도를 재는 방법·기준선 정의.
- [ ] 속성별 정/오/부분 판정 기준
- [ ] 표본 30~50 · 골든셋 정의
- **산출물:** 검증 시트 템플릿(attribute_validation 입력 기준)

## 9. 이미지 속성 검수·교정 + 정확도 1차 측정
`담당자 신유정 · 주차 1주차 · 유형 검증`
**목표:** 추출 결과 데이터 품질을 신유정이 오너십.
- [ ] 김홍교 추출 JSON vs 실제 이미지 대조 → 속성별 정확도
- [ ] 교정값 반영(product_attributes 정제) + attribute_validation 입력
- **DoD:** 30~50개 대조 완료 + 속성별 정확도 수치(H1 조기신호)

## 10. 리뷰/댓글 수집·정제 → product_reviews
`담당자 라진우 · 주차 1주차 · 유형 리서치` — *(크롤링 X, 소규모 수기 샘플)*
**목표:** 감각(소재·기능성·느낌) 축의 원천 텍스트 확보.
- [ ] 카탈로그 상품 몇 개의 리뷰/댓글을 **손으로** 수집·정제
- [ ] product_reviews 입력(review_text, source)

## 11. 감성·속성 언급 분석 → 감각(소재·기능성·느낌) 태그
`담당자 라진우 · 주차 1주차 · 유형 리서치`
**목표:** 리뷰 텍스트에서 보조 추정축(감각) 태그 도출.
- [ ] 감성·속성 언급 분석 → 소재/기능성/느낌(산들산들 등) 태그
- [ ] product_reviews.sentiment / mentioned_attributes 정리
- **DoD:** 샘플 태그 세트 + 신뢰도 코멘트

---

# 🗓️ 2주차 — 빌드·측정·인터뷰 (무담당 Backlog · 풀 · WIP 1)

## 12. Next.js + shadcn 스캐폴딩 + Vercel 배포 파이프라인
`담당자 (무담당) · 주차 2주차 · 유형 개발`
- [ ] Next.js + shadcn/ui 프로젝트·기본 레이아웃
- [ ] Supabase 연결 · 프리뷰 배포
- **DoD:** 빈 앱이 Vercel URL로 뜬다

## 13. 자연어 검색·파싱·랭킹
`담당자 (무담당) · 주차 2주차 · 유형 개발`
- [ ] 쿼리 → LLM 파싱 → parsed_attributes
- [ ] 속성 조합 매칭·랭킹, no-result 처리
- [ ] `products ⨝ product_attributes`, **임계 미달 속성 제외**(검증 반영)
- **DoD:** "노란 프린팅 흰 티" 류 쿼리가 관련 결과 반환

## 14. 결과 카드 + 찜/모의 담기
`담당자 (무담당) · 주차 2주차 · 유형 개발`
- [ ] 카드: 등판 이미지·색칩·핵심속성 배지
- [ ] 찜(item_saved) · 모의 담기(mock_add_to_cart)

## 15. Amplitude 계측
`담당자 (무담당) · 주차 2주차 · 유형 개발`
- [ ] 이벤트: search_performed · search_no_results · result_card_impression · result_clicked · item_saved · mock_add_to_cart · filter_applied · mismatch_reported
- [ ] 핵심 퍼널 확인(search → click → save)

## 16. 프로덕션 배포 + 인터뷰/측정 링크 공유
`담당자 (무담당) · 주차 2주차 · 유형 개발`
- [ ] Vercel 프로덕션 배포
- [ ] 인터뷰·측정용 링크 팀 공유

## 17. 카탈로그 큐레이션 50~100
`담당자 (무담당) · 주차 2주차 · 유형 데이터`
- [ ] 비관련·중복·저품질 제거 → products.is_curated
- [ ] 등판 이미지 없으면 back_image_url 수기 보강
- **DoD:** 50~100개 큐레이션 완료

## 18. 스키마·라벨 v1.1 개정
`담당자 (무담당) · 주차 2주차 · 유형 데이터`
- [ ] 신유정 검증 결과로 애매 규칙·enum 보정

## 19. 시각속성 정확도 리포트
`담당자 (무담당) · 주차 2주차 · 유형 검증`
- [ ] attribute_validation 속성별 집계
- [ ] 임계(예 ≥80%) 판정 → **미달 속성 검색 숨김 권고**
- **산출물:** H1 정확도 리포트(게이트 입력)

## 20. 오검색 패턴 정리 → 프롬프트/스키마 개선안
`담당자 (무담당) · 주차 2주차 · 유형 검증`
- [ ] 자주 틀리는 케이스(예: 흰바탕+노랑프린팅 색분리 실패) 정리
- [ ] 프롬프트/스키마 개선안 제시

## 21. 클라이머 인터뷰 가이드 작성
`담당자 (무담당) · 주차 2주차 · 유형 리서치`
- [ ] 질문 설계(JTBD·탐색 페인·쿼리 유형)
- [ ] 클라이머 3~5명 섭외·일정

## 22. 클라이머 인터뷰 진행·정리 3~5 → interviews
`담당자 (무담당) · 주차 2주차 · 유형 리서치`
- [ ] 배포 링크로 실사용 관찰 + 구매의향(1~5, purchase_intent)
- [ ] interviews 테이블에 요약·인사이트 입력(H2/H3 근거)

## 23. Loop1 의사결정 게이트 + iterate-log 기록
`담당자 (무담당) · 주차 2주차 · 유형 공통` — *W2 말, 전원/PM 주도*
**게이트 판정:** 속성 추출 정확도 임계 통과? · 검색 성공률(no-result·오검색) OK? · 인터뷰 "쓰겠다" 다수?
- [ ] H1 정확도 · 검색 성공률 · 인터뷰 종합
- [ ] **Loop2 투자처 결정** → iterate-log.md 기록
- 미달 시 피봇 후보: 스키마 축소 / 추출법 교체 / 타겟·쿼리유형 좁히기
