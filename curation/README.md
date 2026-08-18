[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/yBcYDqOF)

# search-by-llm — 프린팅 티 발견 검색

> Kernel Academy AI Camp 8기 · 메인 프로젝트 2팀 · **팀명: 고양이가 세상을 구한다** 🐱
> ⚠️ 진행 중(WIP) — 문서·코드는 계속 다듬어집니다.

## 한 줄 소개
**말로 표현한 시각·감각 속성**("등판에 노란 프린팅 있는 시원한 흰 티")으로 프린팅 반팔 티셔츠를 찾아주는 **LLM 상품 발견 검색** 서비스.

## 왜 만드나 (문제)
튀는 색 운동화에 어울리는 백프린팅 티를 찾고 싶어도, 무신사에는 상품도 54색 공식 색 필터도 다 있지만 **색 필터가 상품 대표색 1개 기준**이라 "바탕 흰 + 프린팅만 노란" 같은 **조합**을 표현할 축이 없다. 검색도 키워드 매칭이라 조합 질의를 해석하지 못하고, 결과는 대표 썸네일뿐이라 등판·소재·사이즈를 상품마다 상세페이지로 확인해야 한다. → 실제로 **4시간을 쓰고도 원하는 티를 못 찾는** 문제.

근본 원인은 구조화가 *없어서*가 아니라 **구조화의 축(판매자 기준 대표색)이 사용자의 탐색 언어(바탕색×프린팅색×위치)와 어긋나 있어서**다.

## 무엇을 (해결)
**무신사 위에 '발견 레이어'를 얹는다** — 속성 조합(색×프린팅위치·핏·기능성)으로 '말로' 검색하고 '한눈에' 비교.

- 🎯 **첫 타겟**: 프린팅 티를 **바탕색·프린트색·위치의 조합으로 찾고 싶은데 지금 도구로는 못 찾는 사람**(D17). "등판이 보인다"·"장비색을 맞춘다"는 세그먼트를 정의하는 조건이 아니라 Loop1에서 자발 언급으로 검증할 **진입 트리거 가설**이다. 범위는 **스포츠 프린팅 티셔츠 전반**이고 Loop1 인터뷰 표본도 종목을 고정하지 않는다(D19).
- 🔍 **핵심 기능**: 자연어 쿼리 → LLM이 속성으로 파싱 → 속성 검색·랭킹 → 등판·색칩·핵심속성이 보이는 결과 카드
- 🧩 **데이터**: 무신사 상품 수집 + 상품 이미지에서 비전 LLM으로 속성 추출(색·프린팅·그래픽·핏·소재추정), 색 라벨은 우리 카탈로그 색 어휘 53종에 매핑하고, 바탕색 검증(ΔE)은 기준표 44색으로 한다

## 어떻게 (실행 구조)
**3 × 2주 Build-Measure-Learn 린 루프.** 이 프로젝트의 핵심은 완성도가 아니라 **GA4 데이터로 매 루프 의사결정하는 과정**을 증명하는 것.

| 루프 | 초점 |
|---|---|
| Loop 1 (W1-2) | 가치 검증 + 최소 자동추출 → 배포 → GA4·인터뷰 → 의사결정 |
| Loop 2 (W3-4) | Loop1 데이터가 가리키는 곳에 투자 |
| Loop 3 (W5-6) | 정밀화·전환·확장 + 최종 산출물 |

## 팀

| 역할 | 담당 |
|---|---|
| 개발 | LLM 검색 파이프라인 · API 연동 · 앱/배포 |
| 카탈로그 | 카탈로그 구축 · 속성 스키마/라벨 기준 정의 |
| 시각속성 검증 | 이미지 속성 추출 · 색/프린팅/그래픽 검증 |
| 감각속성·인터뷰 | 소재·기능성 속성 오너 · 리뷰 샘플 분석 · 사용자 인터뷰 |

## 기술 스택 (예정)
Next.js · shadcn/ui · Supabase · OpenAI/비전 LLM · 무신사(데이터 소스, D14) · GA4 · Vercel

## 문서
기획 산출물은 [`docs/product-methodology/`](docs/product-methodology/)에 있습니다.
- [기획 인덱스 & 핵심 결정](docs/product-methodology/README.md)
- [PRD](docs/product-methodology/living/prd.md) · [MVP·스프린트](docs/product-methodology/living/mvp-plan.md) · [지표(GA4)](docs/product-methodology/living/metrics.md)
- [고객 프로필/JTBD](docs/product-methodology/living/customer-profile.md) · [문제 검증](docs/product-methodology/foundation/problem-validation.md) · [데이터 현실성](docs/product-methodology/foundation/data-feasibility.md)

## 브랜치
- `main` — 안정 버전 · `develop` — 개발 통합 브랜치(기능 작업은 여기서)
