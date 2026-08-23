# 습관화·리텐션 성공 지표 — 실제 사례와 이론

> 조사일 2026-08-20 · 용도: 업계 지식 습득
> 자매 문서: [이커머스 현업의 리텐션 지표](ecommerce-retention-metrics.md)
> 프로젝트 규칙에 따라 **원문을 열어 확인한 것만 인용**하고, 확인 못 한 것은 "미확인"으로 표시했다.

---

## 0. 한 줄 요약

**"습관"을 지표로 쓰는 방법은 업계에 이미 표준이 있다.** 크게 두 갈래다 —
**① 빈도 분포로 본다**(파워유저 곡선 L7/L28, Stickiness, "12개월 중 며칠 샀는가")
**② 리텐션 곡선이 평평해지는가로 본다**(습관이 붙은 층이 존재한다는 신호).

그리고 **실패 사례가 성공 사례보다 잘 기록돼 있다.** Pinterest는 자기가 만든 습관 지표(WARC)를 폐기했고 그 이유를 공개했다. 이게 이 조사에서 가장 값진 부분이다.

---

## 1. 실제 사례 — 회사가 공시한 "습관" 지표

### 1-1. Etsy — 습관을 **"구매한 서로 다른 날 수"** 로 정의했다 ✅ 원문 확인

[FY2025 Form 10-K](https://investors.etsy.com/sec-filings/all-sec-filings/content/0001370637-26-000019/etsy-20251231.htm) 원문. **이커머스 공시 중 "습관"을 명시적으로 지표화한 유일한 사례**를 찾았다.

| 등급 | 원문 정의 | 조건의 구조 |
|---|---|---|
| Active Buyer | "at least one purchase in the last 12 months" | 최소 조건 |
| Repeat (Non-Habitual) | "purchases on **two or more days** in the previous 12 months" | **날 수 2일** |
| **Habitual Buyer** | "spent **$200 or more** **and** made purchases on **six or more days** in the past 12 months" | **금액 AND 날 수 6일** |

**설계에서 읽히는 것 네 가지**

1. **단위가 "횟수"가 아니라 "서로 다른 날 수"다.** 같은 날 세 번 사는 건 습관이 아니라고 본 것이다.
2. **계단이 2일 → 6일이다.** "반복이 시작됐다"(2일)와 "습관이다"(6일)를 나눴다.
3. **금액 조건을 AND로 묶었다.** 싼 것만 자주 사는 사람을 습관층에서 뺀다.
4. **관측 창이 12개월 롤링(TTM)이다.** 캘린더 연도가 아니다.

**결과 수치가 이 설계의 정당성을 보여준다:**

> "Habitual buyers comprised approximately **7% of active buyers** and represented about **40% of our 2025 GMS**."

그리고 **이탈이 "떠남"이 아니라 "등급 하락"으로 나타난다는 것을 회사가 직접 서술한다:**

> "Most habitual buyers **did not leave** Etsy, rather they primarily **moved into the 'repeat' category** through slightly lower purchase frequency or spend."

**평균이 실재하지 않는다는 사례도 같은 문서에 있다:**

> "Active buyers made purchases on Etsy an average of approximately three times in 2025. **Approximately half of our buyer base made a purchase on Etsy once during the year, while the other half purchased on about five separate days.**"

### 1-2. Chewy — 습관을 **행동이 아니라 계약으로 고정**했다 ✅ 원문 확인

[Q2 FY2025 실적 발표](https://investor.chewy.com/news-and-events/news/news-details/2025/Chewy-Announces-Second-Quarter-2025-Financial-Results/default.aspx) 원문 확인.

| 지표 | 값 (13주, ~2025-08-03) |
|---|---|
| Autoship customer sales | $2,576.9M (+14.9% YoY) |
| **Autoship customer sales as % of net sales** | **83.0%** |
| Active Customers | 20.906M (+4.5%) |
| NSPAC (Net Sales per Active Customer) | $591 (+4.6%) |

**핵심 발상**: 반복 구매가 일어나기를 기다리며 재구매율을 재는 대신, **정기배송 구독으로 반복을 계약화하고 그 비중을 핵심 지표로 삼는다.** 매출의 83%가 이미 반복 행동을 증명한 고객에게서 나온다.

⚠️ 주의: Autoship customer sales는 **정기배송 주문만이 아니라 "정기배송 고객이 낸 모든 매출"** 이다(단건 구매 포함). 이 구분은 2차 자료에서만 확인했고 10-K 원문은 SEC 차단으로 못 봤다.

### 1-3. Pinterest — 습관 지표를 만들었다가 **폐기했고, 이유를 공개했다** ✅ 원문 확인

> **이 항목은 앞서 "원문 접근 불가로 미확인"으로 남겨 두었던 WARC를 이번에 확인한 것이다.** (그 미확인 기록이 있던 `measurement-plan.md`는 2026-08-21 삭제됨.)
> 출처: Casey Winters(Pinterest 전 성장 총괄), [*Don't Become a Victim of One Key Metric*](https://www.caseyaccidental.com/p/dont-become-a-victim-of-one-key-metric)

**WARC = "a weekly active repinner or clicker"** (주간 활성 리핀·클릭 사용자)

정의와 채택 이유(원문):

> "A **repin** is a save of content already on Pinterest. A **click** is a clickthrough to the source of the content from Pinterest. **Both indicate Pinterest showed you something interesting.** A weekly event made it impossible to optimize for marginal activity."

즉 **"우리가 보여준 게 볼 만했다"의 최소 증거 두 개를 OR로 묶고, 주간 단위로 셌다.** MAU보다 나은 지표를 찾다가 만든 것이다.

**그런데 폐기했다. 이유 두 가지(원문):**

| 문제 | 원문 |
|---|---|
| **① 복합 지표의 거짓 정밀성** | 실험이 "increase WARCs that might actually **trade off repins for clicks or vice versa** and not even realize it because the combined metric increased" → 낚시성 콘텐츠 최적화로 흐를 수 있다 |
| **② 공급 측면 무시** | WARC는 "**ignores the supply side of the network entirely**" → 새 콘텐츠를 늘리거나 노출시킬 유인이 사라진다. 이미 검증된 콘텐츠를 계속 미는 게 지표에 유리하다 |

> "Pinterest **doesn't use WARCs anymore** as its one key metric."

**저자의 대안**:
> "Figure out the **portfolio of metrics** that matter for a business and track them all religiously."

**이 사례가 특히 중요한 이유**: WARC는 "검색어 없이 이미지를 훑는 제품에서 습관을 재는 지표"였다. **구조가 같은 제품이 실제로 시도했다가 실패한 기록**이라 성공 사례보다 정보량이 많다.

### 1-4. 쿠팡 — 습관 지표를 따로 두지 않는다 ✅ 원문 확인

[Q1 2026 실적](https://s206.q4cdn.com/919117365/files/doc_financials/2026/q1/2026-Q1_Earnings-Release.pdf). **분기 창 Active Customers(23.9M) + 객단가($300)** 두 축뿐이다. 회사 표현으로는 객단가가 습관의 대리 지표다:

> "we view **net revenues per Product Commerce Active Customer as a key indicator of engagement and retention**"

생필품 커머스는 구매 주기가 짧아 **분기 활성만으로도 반복이 걸러지기 때문**으로 보인다. 별도 습관 등급이 필요 없다.

---

## 2. 프로덕트 분석 업계의 표준 습관 지표

### 2-1. 파워유저 곡선 (Power User Curve, L28 / L30 / L7) ✅ 원문 확인

출처: [Andrew Chen · Li Jin, a16z](https://andrewchen.com/power-user-curve/)

> "a **histogram of users' engagement by the total number of days they were active in a month**, from 1 day out of the month to all 30 (or 28, or 31) days."

- 월간 = **L30/L28**, 주간 = **L7**. 원래 **Facebook 성장팀**이 만든 표기(last 7/30 days).
- **DAU/MAU 한 숫자보다 나은 이유**: "It shows if you have a **hardcore, engaged segment** that's coming back every day" — 평균이 숨기는 분포를 드러낸다.
- **곡선 모양의 해석**:
  - **스마일(우측 상승)** = 매일 오는 코어층 존재. Facebook은 "a very right-leaning smile, with **60%+ of its MAUs coming back daily**".
  - **좌측 편중** = 대부분 월 1일. LinkedIn형.
- **핵심 단서**: 좌측 편중이 곧 실패가 아니다.
  > "**Not every company needs to have a smile-shaped Power User Curve.**"
  드물게 쓰는 제품(투자 플랫폼, 중고거래)은 **쓸 때 충분한 가치를 주는지**가 성공 조건이라고 명시한다. eBay·OfferUp 사례를 든다 — 자주 안 팔아도, 팔 때 알고리즘이 잘 노출해주면 된다.

**Etsy의 "12개월 중 며칠 샀는가"가 사실상 이 곡선의 커머스 버전이다.** 축이 "월 중 활동일"에서 "12개월 중 구매일"로 바뀌었을 뿐이다.

### 2-2. Stickiness (DAU/MAU) — 이커머스 벤치마크 ✅ 방법론 공개된 자료 확인

출처: [Mixpanel — MAU 정의와 2026 벤치마크](https://mixpanel.com/blog/mau/) · [2026 State of Digital Analytics](https://mixpanel.com/content/benchmarks-2026)

> "MAU measures the number of unique users who performed a **meaningful action** in your product within a **30-day window**."

**이커머스 Stickiness (지역별)**

| 지역 | Stickiness |
|---|---|
| North America | 20% |
| EMEA | 21% |
| APAC | 23% |
| LATAM | 25% |

**방법론이 공개돼 있다**: "3.7T events tracked, 12K+ Mixpanel companies included, 22B devices" (이커머스 섹션은 423.1B events, 4.7B devices). **이 조사에서 표본이 공개된 유일한 벤치마크다.**

⚠️ **정합성 문제**: MAU 글은 위 수치를 **DAU/MAU**로, 이커머스 섹션은 같은 지표를 **DAU/WAU**로 표기한다. 둘은 전혀 다른 값이라 **어느 쪽인지 확정하지 못했다.** 인용할 때 주의.

⚠️ 2차 자료 벤치마크(**미확인**): Sequoia 10~20% 표준 / AppsFlyer 20% 양호·25% 강함 — 원문 미확인.

### 2-3. 리텐션 곡선의 평탄화 = 습관층이 존재한다는 신호 ⚠️ 부분 확인

업계에서 가장 널리 쓰이는 "습관 붙었나" 판정법이다. **코호트 리텐션 곡선이 어느 지점에서 평평해지면** 그 수준에 머무는 고정 사용자층이 있다는 뜻으로 본다.

- Brian Balfour가 2013년에 제기, Andrew Chen이 확산 — **둘 다 2차 자료로만 확인. 원문 미확인.**
- Andrew Chen이 든 PMF 3종 세트로 인용되는 것: ① 평탄화되는 코호트 리텐션 곡선 ② actives/reg > 25% ③ 스마일 모양 파워유저 곡선 — **출처가 X(트위터) 게시물이라 접근 못 했다. 미확인.**
- 중요한 단서(2차): **평탄화만으로 부족하고 "어느 높이에서 평평해지는가"가 진짜 판정**이다. 그리고 데이팅·보험처럼 자연 이탈이 정상인 업종은 이 기준이 안 맞는다.

### 2-4. Amplitude "7% 규칙" ✅ 원문 확인 (단, 이커머스 구간 없음)

출처: [Amplitude — The 7% Retention Rule](https://amplitude.com/blog/7-percent-retention-rule)

> "when at least **7% of your original cohort of users return on day seven**, your product has demonstrated early value that correlates strongly with long-term success."

- 근거: **2025 Product Benchmark Report, 2,600+ 개 회사** 분석. 7% Day-7이 **활성화 상위 25%** 선.
- 뒷받침: "**69% of top day seven performers were also top three-month performers**" — Day-7이 3개월 성과의 선행 지표라는 주장.
- 제시된 업종별 3개월 리텐션 상위값: 금융 19.5% · 여행/숙박 25.6% · B2B 테크 15.6%(90분위) · 엔터프라이즈 Day-7 12.4%(중앙값 2.1%)

⚠️ **이커머스/리테일 구간은 이 글에 없다.** 이커머스에 그대로 적용할 근거는 확인하지 못했다.

---

## 3. 이론 — "습관"을 지표로 번역하는 방법

### 3-1. Nir Eyal의 Habit Testing ✅ 원문 확인

출처: [Nir Eyal — Hooking Users in 3 Steps: An Intro to Habit Testing](https://www.nirandfar.com/hooking-users-in-3-steps/)

제품 습관 측정의 사실상 표준 절차. **Identify → Codify → Modify**.

| 단계 | 내용 |
|---|---|
| **① Identify** | 습관 사용자가 몇 %인지 센다. 그러려면 **먼저 "얼마나 자주 써야 습관인가"를 정의해야 한다** |
| **② Codify** | 습관 사용자들이 공통으로 거친 행동 경로("Habit Path")를 찾는다 |
| **③ Modify** | 신규 사용자를 그 경로로 유도하도록 UX를 고친다 |

**빈도 기준을 정하는 방법(원문)**:

> "How often a user 'should' use the site. That is to say, **assuming that some day all the bugs are worked out and the product is perfectly 'lickable,' how often would you expect a habitual user to be on the site?**"

**임계값(원문)**:

> "**My rule of thumb is 5%.** Though your rate of active users will need to be much higher to sustain your business, 5% is a good benchmark to being Habit Testing."

**코호트(원문)**:

> "The best practice here is to **create a cohort analysis to provide a baseline** by which to measure future product iterations."

⚠️ **이 프레임워크의 약점을 원문이 그대로 노출한다.** 빈도 기준을 어떻게 정하냐는 질문에 저자가 내놓는 답이 이것이다:

> "A good short-cut might be to **take an average of how often you and the people in your office use your own product.**"

**사무실 동료의 사용 빈도를 기준으로 삼으라는 것**이다. 표본 편향이 명백하고, 근거 데이터도 제시되지 않는다. **5%라는 숫자도 "rule of thumb"이라고 저자가 직접 밝힌다.** 이 프레임워크는 절차로는 쓸 만하지만 **임계값 근거로는 쓸 수 없다.**

### 3-2. 아하 모먼트 / 활성화 임계값 — 그리고 그에 대한 반론

**표준 프레임**: 초기에 완료하면 장기 리텐션을 예측하는 소수의 행동을 찾아 온보딩을 그쪽으로 설계한다(Facebook에서 대중화). "가입 10일 내 친구 7명" 류의 매직 넘버가 대표 사례로 인용된다.

**⚠️ 이에 대한 정면 반박** ✅ 원문 확인 — [Mixpanel, *Magic numbers are an illusion*](https://mixpanel.com/blog/magic-numbers-are-an-illusion/)

> "**if you go digging into your data looking for magic, you probably aren't going to see it.**"

> "**there is no one thing**" — 여러 행동이 각기 다르게 기여하므로 단일 임계값을 분리해낼 수 없다.

대안으로 제시하는 것:

> "magic numbers are about **finding when users get value from your product** and working like hell to get them to that point."

VSCO 사례로 **하나가 아닌 여러 개의 기능별 이정표**(사진 8장 편집 / 10장 게시 / 16장 수집)를 제시한다. 요지는 **수학적 정밀성이 아니라 팀을 움직이는 서사적 명료성**이라는 것.

즉 매직 넘버는 **상관을 인과로 착각하기 쉬운 장치**이고, 실제 효용은 "조직이 같은 방향을 보게 하는 구호"에 가깝다.

---

## 4. 실패에서 나온 규칙 4가지

| 규칙 | 근거 | 출처 |
|---|---|---|
| **복합 지표(A OR B)를 하나로 묶지 마라** | 실험이 A와 B를 맞바꿔도 합계가 오르면 성공으로 보인다("false rigor"). Pinterest가 WARC로 겪음 | Casey Winters ✅ |
| **양면 시장은 한쪽만 재면 다른 쪽이 죽는다** | WARC는 공급(콘텐츠 생성)을 완전히 무시해 새 콘텐츠 발굴 유인이 사라졌다 | Casey Winters ✅ |
| **북극성 지표 하나가 아니라 포트폴리오로 본다** | "Figure out the portfolio of metrics that matter and track them all religiously" | Casey Winters ✅ |
| **매직 넘버는 상관이지 인과가 아니다** | "there is no one thing" | Mixpanel ✅ |
| **파워유저 곡선이 좌측 편중이어도 실패가 아니다** | "Not every company needs to have a smile-shaped Power User Curve" | a16z ✅ |

---

## 5. 이커머스 고유의 문제 — 구매 빈도가 습관을 재기엔 너무 낮다

이 조사에서 가장 반복적으로 확인된 구조적 사실이다.

- **Etsy: 활성 구매자 평균 연 3회.** 그마저도 절반은 연 1회. 구매만으로는 주 단위 습관을 관측할 수 없다.
- **의류 카테고리 비누적 코호트 재구매율**(2차, 합성 추정치): m1 15% · m2 9% · m3 7%. → 월 단위로도 대부분 0이다.
- 그래서 커머스에서 "습관"을 재려면 **① 관측 창을 12개월로 늘리거나**(Etsy) **② 구독으로 반복을 계약화하거나**(Chewy) **③ 구매가 아닌 방문·탐색 행동을 지표로 삼는다**(Pinterest형).

**③을 택하면 Pinterest의 실패 지점을 그대로 만난다.** 방문·탐색 지표는 낚시성 콘텐츠에 취약하고, 공급 측면을 놓친다.

**Mixpanel 2026 이커머스 벤치마크의 주장**(✅ 원문 확인)도 같은 방향이다:

> "**habit formation is the primary growth lever, not traffic**"

획득량이 아니라 반복 사용으로 경쟁 우위가 이동했다는 것. 다만 이건 분석 도구 벤더의 서술이라 **주장**으로 읽어야 한다.

---

## 6. 확인 / 미확인 정리

### 원문 확인함 ✅

| 출처 | 무엇을 확인했나 |
|---|---|
| [Etsy FY2025 10-K](https://investors.etsy.com/sec-filings/all-sec-filings/content/0001370637-26-000019/etsy-20251231.htm) | Habitual/Repeat Buyer 정의(날 수 기준), 7%/40% 수치, 등급 하락 서술, 평균 3회의 이봉 분포 |
| [Casey Winters — Don't Become a Victim of One Key Metric](https://www.caseyaccidental.com/p/dont-become-a-victim-of-one-key-metric) | **WARC 정의와 폐기 이유** (기존 미확인 항목 해소) |
| [Chewy Q2 FY2025 실적](https://investor.chewy.com/news-and-events/news/news-details/2025/Chewy-Announces-Second-Quarter-2025-Financial-Results/default.aspx) | Autoship 83.0%, Active Customers 20.906M, NSPAC $591 |
| [Coupang Q1 2026 실적 PDF](https://s206.q4cdn.com/919117365/files/doc_financials/2026/q1/2026-Q1_Earnings-Release.pdf) | 분기 활성 정의, 객단가를 engagement/retention 지표로 본다는 서술 |
| [Andrew Chen / a16z — Power User Curve](https://andrewchen.com/power-user-curve/) | L30/L28/L7 정의, 스마일 곡선, "모두가 스마일일 필요 없다" |
| [Nir Eyal — Habit Testing](https://www.nirandfar.com/hooking-users-in-3-steps/) | 3단계, 5% rule of thumb, 빈도 기준 설정법(및 그 약점) |
| [Mixpanel — Magic numbers are an illusion](https://mixpanel.com/blog/magic-numbers-are-an-illusion/) | 매직 넘버 반박, VSCO 다중 이정표 대안 |
| [Mixpanel — MAU 정의·2026 벤치마크](https://mixpanel.com/blog/mau/) · [State of Digital Analytics 2026](https://mixpanel.com/content/benchmarks-2026) | 이커머스 stickiness 20~25%, 표본 공개(3.7T events / 12K+ companies) |
| [Amplitude — 7% Retention Rule](https://amplitude.com/blog/7-percent-retention-rule) | Day-7 7% = 활성화 상위 25%, 2,600+ 회사 표본 |

### 미확인 ⚠️

- **리텐션 곡선 평탄화의 원출처** — Balfour(2013)·Andrew Chen 원문을 못 열었다. 2차 자료로만 확인. Andrew Chen의 PMF 3종 세트는 **X 게시물이 출처라 접근 실패**.
- **Chewy Autoship의 정확한 정의**(구독 주문 vs 구독 고객의 전체 매출) — 10-K가 SEC 차단으로 확인 불가. 2차 자료 기준.
- **Mixpanel stickiness가 DAU/MAU인지 DAU/WAU인지** — 같은 회사 두 문서가 다르게 표기.
- **Mixpanel 이커머스 "북미 1주 리텐션 4.0%, YoY −98%"** — 수치가 비상식적이라 **데이터 아티팩트 의심.** 그대로 인용하지 않았다.
- **DAU/MAU 벤치마크(Sequoia 10~20%, AppsFlyer 20/25%)** — 원문 미확인.
- **Amplitude 7% 규칙의 이커머스 적용 가능성** — 해당 글에 이커머스 구간이 없다.
- **한국 이커머스의 습관 지표 사례** — 1차 자료를 찾지 못했다(쿠팡은 미국 공시라 확인 가능, 나머지는 없음).
