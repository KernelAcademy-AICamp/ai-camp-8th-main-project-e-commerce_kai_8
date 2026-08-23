# 이커머스 현업의 리텐션 지표 — 외부 조사

> 조사일 2026-08-20 · 용도: 업계 지식 습득 (aTee 적용 판단은 이 문서의 범위가 아니다)
> 프로젝트 규칙에 따라 **원문을 열어 확인한 것만 인용**하고, 확인하지 못한 것은 "미확인"으로 표시했다.

---

## 0. 한 줄 요약

이커머스에는 **구독 해지 같은 "이탈 시점"이 없다.** 그래서 "리텐션"이라는 단일 지표가 존재하지 않고, 대신 **관측 창(window)을 몇 개월로 잡느냐**가 곧 지표 정의가 된다. 같은 회사도 IR·운영·프로덕트 세 계층에서 서로 다른 창과 정의를 쓴다. 그리고 **떠도는 "업계 평균 재구매율 28%" 류의 숫자는 대부분 원출처가 없다.**

---

## 1. 왜 이커머스 리텐션은 SaaS와 다른가

| | SaaS·구독 | 이커머스 |
|---|---|---|
| 이탈 시점 | **명확하다** — 해지 이벤트가 찍힌다 | **없다.** 안 사는 것과 떠난 것이 구분되지 않는다 |
| 리텐션 정의 | 계약 갱신 여부 | **"창 안에 한 번이라도 샀는가"** — 창을 정해야 계산이 성립한다 |
| 자연 주기 | 월·연 단위로 고정 | 카테고리마다 다르다 (식품 주 단위 ↔ 가전 수년) |
| 결과 | 지표가 하나로 수렴 | **정의가 회사마다 다르고, 같은 회사도 계층마다 다르다** |

이 구조 때문에 현업은 리텐션을 **하나의 숫자가 아니라 세 계층으로** 본다.

---

## 2. 계층 A — 상장사가 투자자에게 공시하는 지표

가장 신뢰할 수 있는 "현업 정의"다. SEC 공시라 문구가 고정돼 있고 매 분기 같은 방식으로 계산된다.

### 2-1. 쿠팡 (Coupang, Inc.) — 창 = **분기**

Q1 2026 실적 발표 원문에서 확인:

> "A customer is anyone who has created an account on our apps or websites, identified by a unique email address. **As of the last date of each quarterly reported period, we determine our number of Product Commerce Active Customers by counting the total number of individual customers who have ordered at least once** directly from our Product Commerce apps or websites during the relevant quarterly period."

> "The change in Product Commerce Active Customers in a reported period **captures both the inflow of new customers** who have made a purchase in the period **as well as the outflow of existing customers** who have not made a purchase in the period."

**핵심 구조**: 쿠팡은 리텐션율을 따로 공시하지 않는다. 대신 **Active Customers 총량**(유입−유출의 순합)과 **객단가**를 두 축으로 쓴다.

> "we view **net revenues per Product Commerce Active Customer as a key indicator of engagement and retention** of our customers"

| Q1 2026 실적 | 값 | YoY |
|---|---|---|
| Product Commerce Active Customers | 23.9M | +2% |
| Net revenues per Active Customer | $300 | +2% |
| 〃 (환율 고정) | $303 | +3% |

**주의**: 계정(이메일) 기준이라 한 사람이 여러 계정을 가지면 중복 계산된다. 이건 회사도 명시한다.

### 2-2. Etsy — 창 = **최근 12개월(TTM)**, 그리고 **"구매한 날 수"로 습관을 정의한다**

FY2025 Form 10-K 원문에서 확인. **이커머스 공시 중 가장 정교한 리텐션 분해**다.

| 등급 | 원문 정의 (verbatim) | FY2025 값 | YoY |
|---|---|---|---|
| **Active Buyers** | "a buyer who has made **at least one purchase in the last 12 months**" | 86.5M | −3% |
| **New Buyers** | "buyers using a unique email address that has not previously been used for a purchase on our marketplace" | 21.2M | −10% |
| **Reactivated Buyers** | "lapsed buyers—**those who had not made a purchase in a year or more**" | 30.0M | +4% |
| **Repeat Buyers (Non-Habitual)** | "Shoppers who made purchases on **two or more days** in the previous 12 months" | 34.6M (활성의 ~40%) | −4% |
| **Habitual Buyers** | "those who **spent $200 or more and made purchases on six or more days** in the past 12 months" | 5.9M (활성의 ~7%) | −9% |
| **GMS per Active Buyer** | TTM 기준 | $121 | −0.5% |

**여기서 배울 점 세 가지**

1. **"습관"을 회사가 지표로 정의했다.** 그 단위가 **횟수가 아니라 "구매한 서로 다른 날 수"(6일 이상)** 다. 금액 조건($200)과 **AND**로 묶었다.
2. **상위 7%가 GMS의 40%를 만든다.** Etsy 원문: *"Habitual buyers comprised approximately 7% of active buyers and represented about 40% of our 2025 GMS."* 리텐션을 인원수로만 보면 이 집중도가 안 보인다.
3. **이탈은 "떠남"이 아니라 "등급 하락"으로 나타난다.** Etsy 원문: *"Most habitual buyers **did not leave** Etsy, rather they primarily **moved into the 'repeat' category** through slightly lower purchase frequency or spend."* — 이커머스 이탈 분석이 "떠났나"가 아니라 "등급이 내려갔나"여야 하는 이유다.

**분포가 평균을 숨긴다는 사례도 원문에 있다:**

> "Active buyers made purchases on Etsy an average of approximately three times in 2025. **Approximately half of our buyer base made a purchase on Etsy once during the year, while the other half purchased on about five separate days.**"

평균 3회는 실제로 존재하지 않는 사람이다. 1회 절반 + 5회 절반이다.

### 2-3. 창 길이는 회사마다 다르다

| 회사 | 활성 정의 창 | 함께 보는 짝 지표 |
|---|---|---|
| 쿠팡 | **분기** | Net revenues per Active Customer |
| Etsy | **최근 12개월** | GMS per Active Buyer |
| Chewy | 최근 12개월 (미확인) | NSPAC = Net Sales per Active Customer (미확인) |

**창이 짧을수록 "활성"의 기준이 엄격해진다.** 쿠팡의 분기 창은 생필품 커머스라 자연 구매 주기가 짧기 때문이고, Etsy의 12개월 창은 수공예품이라 주기가 길기 때문이다. **창 길이는 관행이 아니라 카테고리의 구매 주기에서 나온다.**

---

## 3. 계층 B — 운영 도구가 기본 제공하는 지표

실무자가 매일 보는 화면. **도구가 제공하는 것이 사실상 업계 표준이 된다.**

### 3-1. Shopify (공식 도움말 원문 확인)

| 리포트 | 정의 |
|---|---|
| **New vs Returning Customers** | first-time = "placed their first order with your store" / returning = "placed an order, and whose order history **already includes at least one order**" |
| **Returning Customers** | "customers whose order history includes **two or more orders**" |
| **One-time Customers** | "customers whose order history includes **only one order**" |
| **Customer Cohort Analysis** | "customers are grouped into cohorts based on **the date that they placed their first order**". 선택 지표: 고객 수 · **customer retention rate** · gross sales · net sales · AOV |
| **Predicted Spend Tier** | 코호트별 예측 고객가치 |
| **RFM Customer Analysis** | Recency·Frequency·Monetary를 **각 1~5점**으로 매겨 **11개 그룹**으로 분류 |

**주목**: Shopify 기본 코호트의 기준점은 **가입일이 아니라 첫 주문일**이다. 이커머스 코호트의 사실상 표준.

### 3-2. Google Analytics 4 (공식 문서 원문 확인)

| 지표 | 정의 (verbatim) |
|---|---|
| Returning users | "The number of users who have **visited** your website or app at least once before" |
| User retention | "the percentage of users who **return each day in their first 42 days**" |
| Lifetime value | "Average 120d value shows the average revenue generated by new users over their **first 120 days**" |
| Cohort exploration 복귀 조건 | **Any event** / **Any transaction** / **Any conversion** / 특정 이벤트 중 선택 |

**⚠️ 함정**: GA4의 기본 "returning user"는 **방문** 기준이지 **구매** 기준이 아니다. Shopify의 "returning customer"(주문 2건 이상)와 이름은 비슷한데 세는 대상이 다르다. **두 도구 숫자를 나란히 놓고 비교하면 안 된다.** GA4에서 구매 기준으로 보려면 Cohort exploration에서 복귀 조건을 **Any transaction**으로 바꿔야 한다.

### 3-3. 프로덕트 분석 도구 (Amplitude · Mixpanel)

행동 기반이라 **구매가 아닌 방문·클릭도 리텐션 이벤트로 쓸 수 있다.** 두 도구의 계산 방식이 사실상 같다.

| 방식 | Amplitude | Mixpanel | 뜻 |
|---|---|---|---|
| 누적 | Return On or After | **On or After (Unbounded, 기본값)** | N일째 **또는 그 이후** 아무 때나 오면 리텐션 |
| N-Day | Return On | On | **정확히 N일째**에 와야 리텐션 |
| 구간 지정 | Return On (Custom) | (bracket) | 1~3일, 4~6일 같은 사용자 지정 구간 |
| 연속 | — | **Streak** | 연속된 구간마다 계속 했는가 |
| 빈도 | **Stickiness** (주/월에 며칠) | — | 한 주기 안에서 **며칠** 했는가 |
| 생애주기 | **Lifecycle** (신규/현재/부활/휴면) | — | 활성 사용자를 상태로 분해 |

Mixpanel 문서는 **On or After를 기본값으로 두는 이유**를 이렇게 설명한다 — 대부분의 제품은 가치 제안상 "정확히 그날 돌아올" 필요가 없기 때문.

> Amplitude의 세부 정의는 앞서 원문 확인해 둔 것이다(그 기록이 있던 `measurement-plan.md`는 2026-08-21 삭제됨 — 앰플리튜드를 쓰지 않기로 하면서). 여기서는 Mixpanel과의 대응만 추가한다.

---

## 4. 계산식 정리

| 지표 | 계산식 | 주의 |
|---|---|---|
| **Customer Retention Rate (CRR)** | `[(기말 고객수 − 기중 신규 고객수) ÷ 기초 고객수] × 100` | Shopify 블로그 기준. **SaaS에서 넘어온 식**이라 "고객수"를 무엇으로 셀지(=활성 창)를 먼저 정해야 의미가 생긴다 |
| **Repeat Purchase Rate (RPR)** | `(2회 이상 구매 고객수 ÷ 전체 고객수) × 100` | **창을 반드시 함께 표기해야 한다.** 90일 기준과 12개월 기준은 다른 지표다 |
| **코호트 리텐션 (비누적)** | `해당 월에 주문한 코호트 인원 ÷ 코호트 원래 인원` | 이커머스 코호트의 기준점 = **첫 주문일** |
| **구매 빈도** | `기간 내 총 주문수 ÷ 활성 고객수` | Etsy 사례처럼 **평균이 이봉 분포를 숨긴다** |
| **객단가형 지표** | `기간 매출 ÷ 활성 고객수` | 쿠팡 방식. 리텐션율 대신 이걸 공시하는 회사가 많다 |
| **RFM** | Recency·Frequency·Monetary 각 1~5점 | Shopify는 11그룹으로 자동 분류 |
| **CLV** | 정의 통일 안 됨 | Shopify 문서도 **계산식을 제시하지 않는다.** 회사마다 다르다 |

---

## 5. 벤치마크 수치 — 그리고 왜 그대로 믿으면 안 되는가

### 5-1. 검색하면 나오는 수치

| 항목 | 떠도는 값 | 출처 상태 |
|---|---|---|
| 이커머스 평균 재구매율 | **28.2%** | ⚠️ **원출처 없음.** 여러 블로그가 서로를 인용하며 순환 |
| 이커머스 평균 리텐션율 | 28~35% | ⚠️ 동일 |
| Statista 기준 이커머스 리텐션 | **30%** | Shopify가 인용. **Statista 원자료는 확인 못 함** |
| 패션·의류 재구매율 | 24.4% / 연 2.1회 | ⚠️ 원출처 없음 |
| Klaviyo 12개월 재구매율 | 38~48% | ⚠️ **Klaviyo 공식 문서에서 확인 못 함** |
| 의류 코호트 비누적 재구매율 | m1 15% · m2 9% · m3 7% | 출처가 **"합성 추정치"임을 스스로 밝힘**(아래) |

### 5-2. 벤치마크 블로그가 스스로 인정한 것

2026 벤치마크를 표로 제공하는 블로그(Eightx) 원문:

> "**None of Klaviyo, Lifetimely, Recharge, or Triple Whale publish a public 2026 m0 to m3 vertical benchmark dataset.**"

> "None of the four publishes a public 2026 m0 to m3 vertical curve. Operators should **triangulate** by combining Shopify's free cohort report, their ESP's repeat-rate metric, and the in-app benchmark feature of whichever cohort tool they use."

> "Treat them as **midpoints of operator-observed ranges, not point estimates.**"

**즉, 2025~2026 "업계 벤치마크"라고 유통되는 표에는 공개된 원천 데이터셋이 없다.** 도구 벤더들이 자기 플랫폼 집계치를 공개 데이터셋으로 내지 않기 때문이다.

### 5-3. 그래서 현업이 실제로 하는 것

벤치마크와 비교하는 대신 **자기 코호트끼리 비교한다.** 검색된 실무 조언들이 공통으로 말하는 것:

- 블렌디드 평균이 아니라 **획득 월별 코호트**로 본다. 평균은 충성 고객과 지난달 할인 유입을 섞어 모든 추세를 가린다.
- 초기 브랜드는 **두 번째 주문율(second-order rate)** 을 선행 지표로 본다. 제품과 구매 후 경험이 작동하는지의 첫 신호.
- 리텐션을 **기여이익(contribution margin)과 곱해서** 본다. 마진 얇은 상품의 높은 재구매율은 여전히 적자다.

---

## 6. 가장 많이 인용되는 통계의 출처 문제 ⚠️

> "리텐션을 5% 올리면 이익이 25~95% 늘어난다 (Bain & Company)"

이커머스 리텐션 글의 절반이 이 문장으로 시작한다. **원문을 열어 확인했다.**

출처로 지목되는 문서: Fred Reichheld, *"Prescription for cutting costs"*, Bain & Company, 2001-10-24. **PDF 전문(6,737자)을 추출해 대조한 결과:**

> "**In financial services, for example, a 5% increase in customer retention produces more than a 25% increase in profit.**"

| 인용되는 내용 | 원문 실제 |
|---|---|
| "이익 25~**95%** 증가" | **95%라는 숫자가 문서에 없다.** 문서 전체에서 가장 큰 수치는 25% |
| "모든 업계에 적용" | **"In financial services, for example"** — 금융업 한정 |
| "Bain 연구 결과" | **근거 연구·표본이 문서에 제시돼 있지 않다.** 3쪽짜리 칼럼이다 |
| "이커머스에도 해당" | 문서에 이커머스 언급 없음. 사례는 Vanguard(뮤추얼펀드)·Chick-fil-A(외식) |

**결론: 이 수치를 이커머스 근거로 쓰면 안 된다.** 95%는 출처 불명이고, 25%는 금융업 사례이며 뒷받침 데이터가 공개돼 있지 않다.

---

## 7. 2025~2026 흐름

원문 확인 강도가 낮은 항목이라 **관찰된 경향**으로만 적는다.

| 흐름 | 내용 |
|---|---|
| **리텐션율 → 코호트 이익** | "재구매율 몇 %"에서 **"코호트별 기여이익이 CAC를 언제 회수하는가"** 로 이동. LTV:CAC(3:1~5:1), CAC 회수기간, MER이 같이 묶여 논의된다 |
| **등급 이동 분석** | Etsy처럼 이탈을 "떠남"이 아니라 **등급 하락**으로 모델링. 상위 소수가 매출 대부분을 만드는 구조가 공시에서 드러남 |
| **재활성화(reactivation)의 재발견** | Etsy 원문: 재활성화 구매자가 **신규 구매자보다 1년차 LTV가 약 40% 높다.** 신규 획득 비용이 오르면서 휴면 고객 풀이 성장 자원으로 다뤄짐 |
| **멤버십·구독** | 리텐션을 행동이 아니라 **계약으로 고정**하는 방식(쿠팡 와우, Amazon Prime). 구독이 있으면 SaaS식 리텐션 계산이 가능해진다 |
| **벤치마크 회의론** | 위 5-2처럼 벤치마크 제공자 스스로 "합성 추정치"라고 밝히는 사례 등장 |

---

## 8. 이 조사에서 확인한 것 / 못한 것

### 원문 확인함 ✅

| 출처 | 확인 방법 |
|---|---|
| [Coupang Q1 2026 Earnings Release (PDF)](https://s206.q4cdn.com/919117365/files/doc_financials/2026/q1/2026-Q1_Earnings-Release.pdf) | PDF 텍스트 추출 후 정의 문단 대조 |
| [Etsy FY2025 Form 10-K](https://investors.etsy.com/sec-filings/all-sec-filings/content/0001370637-26-000019/etsy-20251231.htm) | HTML 2.7MB 다운로드 → 텍스트 445K자 추출 → 정의 문장 grep 대조 |
| [Shopify Help Center — Customers reports](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/customers-reports) | 페이지 전문 |
| [GA4 Retention overview report](https://support.google.com/analytics/answer/11004084?hl=en) | 페이지 전문 |
| [Mixpanel — Retention report](https://docs.mixpanel.com/docs/reports/retention) | 페이지 전문 |
| [Reichheld, "Prescription for cutting costs" (Bain, 2001)](https://media.bain.com/Images/BB_Prescription_cutting_costs.pdf) | PDF 전문 추출 후 전체 % 표현 검색 |
| [Eightx — cohort analysis 벤치마크](https://eightx.co/blog/what-is-cohort-analysis-ecommerce) | 방법론 고지 문장 대조 |
| [Shopify — Average customer retention rate by industry](https://www.shopify.com/blog/average-customer-retention-rate-by-industry) | CRR 계산식·Statista 인용 확인 |

### 확인 못 함 ⚠️

- **SEC EDGAR 직접 접근 실패** — sec.gov가 자동화 도구를 차단(HTTP 403 + "Undeclared Automated Tool"). Etsy는 IR 사이트 미러로 우회했으나 **Chewy·Wayfair·MercadoLibre의 활성고객 정의는 확인하지 못했다.**
- **Klaviyo 공식 벤치마크 수치** — 벤치마크 페이지가 인터랙티브라 원문 수치를 뽑지 못했다.
- **Statista 이커머스 리텐션 30%** — Shopify가 인용했으나 Statista 원자료 미확인.
- **떠도는 "평균 재구매율 28.2%" 계열 수치 전부** — 원출처를 찾지 못했다. 근거로 쓰지 말 것.
- **한국 이커머스 사례(무신사·29CM·오늘의집 등)** — 검색 결과가 일반론 블로그뿐이라 정의를 확인할 수 있는 1차 자료를 찾지 못했다. 쿠팡만 미국 상장사라 공시로 확인 가능했다.
