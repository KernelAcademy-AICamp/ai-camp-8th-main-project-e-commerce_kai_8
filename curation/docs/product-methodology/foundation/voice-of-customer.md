# 고객의 실제 목소리 (Voice of Customer)

> 유형: foundation · 2026-07-31 작성 · 방법: 웹 리서치(공개 리뷰·커뮤니티 원문 수집)
> 상위 문서: [problem-validation.md](problem-validation.md) — 이 문서는 그 4체크 판정의 **근거 원본**이다.
> 근거 등급: 이 문서의 모든 항목은 **웹(URL)** 등급. 직접관찰(n=1 클라이머 팀원)은 problem-validation에 별도 기록.
> ✍️ 인용 표기: 커뮤니티 원문의 강한 비속어는 발표용으로 순화했다(뜻은 유지). 원문 확인은 각 링크 참조.

## 왜 이 문서가 필요했나

problem-validation 4체크에서 ③④가 **🟢(본인)/🟡(웹)** 이었다. 즉 "본인 4시간 실패"는 강하지만
n=1이고, 웹 근거는 창업자·언론 중심이라 **개인의 육성이 없었다.** 팀플 기간에 인터뷰 n을 못 키우므로,
이미 공개돼 있는 육성(앱 리뷰·커뮤니티 원문)으로 그 칸을 메우는 것이 이 조사의 목적이다.

조사는 4갈래로 나눠 돌렸다.

| # | 대상                                                            | 상태                                                             |
| - | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1 | **한국 커뮤니티** (디시·에펨·더쿠·네이트판·지식iN 등) | ✅ 완료 —**분리 묘사 8건. 단 "사진 못 올릴 때만" 나옴**   |
| 2 | **앱스토어·구글플레이 리뷰 + SNS**                       | ✅ 완료 — 아래                                                  |
| 3 | **영어권 Reddit + 이커머스 검색 업계**                    | ✅ 완료 —**n=308 정량 + 업계 판정: 아무도 안 풀었음**     |
| 4 | **"장비색 깔맞춤" 트리거 실존 검증**                      | ✅ 완료 —**판정 (b) 소수 존재. 클라이밍 최약, 러닝 최강** |

## 네 갈래를 합친 결론 (2026-07-31)

**1. 문제는 확인됐다. 그런데 우리가 대던 근거가 틀렸다.**
"사용자가 원래 바탕색/프린트색을 나눠 말한다"는 **약한 주장**이다 — 한국 커뮤니티 반례 다수,
영어권도 색 미언급이 76%다. 사진을 던질 수 있으면 아무도 색을 안 쓴다.

**2. 대신 훨씬 센 주장이 나왔다 — 두 언어권에서 독립적으로 재현됨.**

> **사진 없이 설명해야 하는 순간, 사람들은 예외 없이 `바탕색 / 프린트색 / 프린트위치`로 쪼갠다.**
> 프린트색을 말한 29건 중 **21건(72%)** 이 바탕색도 함께 말했다(영어권 n=308).
> 한국은 지식iN(사진 못 올림)에서만 이 어순이 나왔다.
> **평소엔 사진으로 때우지만, 사진은 검색창에 넣을 수 없다.**

즉 이 축은 사용자가 먼저 꺼내는 언어가 아니라 **시스템이 줘야 사용자가 고를 수 있는 축**이다.

**3. 경쟁 우위가 명확해졌다.** 어느 플랫폼도(Google·Amazon·Shopify·무신사) 바탕색 vs 프린트색을
지원하지 않는다. 업계 방향은 "한 색 필드에 여러 값"이 아니라 **속성을 쪼개는 것**이고, 우리 설계가 그 방향이다.

**4. 세그먼트는 다시 봐야 한다.** 장비색 깔맞춤 트리거는 **클라이밍이 가장 약하고 러닝이 가장 강하다.**
[problem-validation](problem-validation.md) 세그먼트 재검토 → **D17로 재정의 완료**(정의 = 문제 축, 트리거는 인터뷰 검증 가설).

---

# 2. 앱 리뷰·SNS (완료, 54건)

**수집 규모(추측 아님):** 앱스토어 iTunes RSS 450건(2025-05-31~2026-07-28) + 구글플레이 `com.musinsa.store`
3,356건(2018-10-01~2026-07-29). 아래는 이 안에서 검색·필터·색상·포기 키워드로 걸러낸 실제 리뷰 + 에펨코리아 원문.

> ⚠️ **이 54건을 전체 3,806건 대비 비율로 환산하지 말 것.** 키워드 필터 자체가 편향 표본이고,
> 앱스토어는 RSS 상한(450건 ≈ 14개월) 때문에 과거 리뷰가 아예 빠져 있다. 발표에서 "몇 %가 불만"으로 쓰면 반박당한다.
> 이 자료의 힘은 비율이 아니라 **"같은 불만이 4년 넘게 반복됐다 + 무신사가 인정하고 고쳤다"** 는 시계열에 있다.

## C. 색을 목록에서 못 알아본다 → 일일이 눌러봐야 한다 (10건) ★ 가장 강한 근거

우리 문제정의(바탕색을 텍스트 속성으로 뽑아 목록에서 판별 가능하게 한다)와 **정확히 같은 문제**다.

**[fmkorea 9879086076](https://www.fmkorea.com/best/9879086076) · 2026-05-27 · 포텐 · 댓글 84**
제목 "무신사 진짜 너무 별로인 점" (본문은 이미지). 댓글(순화):

- "**블랙인줄알고 누르면 네이비ㅋㅋ 아 그럼 아까꺼가 블랙이었겠구나? 하고 누르려고하면 위치바껴있음** 아 그럼 이건가? 하고 누르면 응 다크그레이"
- "**다른 색상 누를때마다 위치 매번 달라짐** 진짜 이거 너무 엉망임"
- "**위에 글자 뜨게 하는 게 어려운 것도 아니고** 진짜 짜증나긴함"
- "아 이거 나만 그런거 아니였구나 똑같이 불편했구나 휴..나만 불편한 줄"
- "심지어 블랙 찾으면 품절인 경우가 있음"

**[fmkorea 9888625472](https://www.fmkorea.com/best/9888625472) · 2026-05-29 · 댓글 28** — "펨코 의식하는듯한 무신사 피드백 근황" / "하루도 안걸려서 바꿨네 대처 빠른거보소"

- "**저거 볼때마다 이게 무슨색이야 싶어서 터치해서 봐야했는데**"
- "**이것때문에 안쓰고 있었는데** 이제야 바꿨다고? 응 안써~"
- "진짜 몇년을 쳐 안하던걸 이렇게 딸깍"

**나머지 8건**

- **Play · 2022-01-09 · 5★ 👍374** — "다른 컬러는 어떠신가요에 **색상기입해주세요 어두운색은 클릭해서 확대사진을 봐야만 확인가능하네요** 그리고 색상순번은 고정이었음 하네요 다른 색상 클릭하면 순서가 바뀌어서 어두운 색 확인하기가 더 힘들어요"
  → **2022년에 이미 같은 지적, 좋아요 374개. 2026년 5월까지 4년 4개월 방치.**
- [fmkorea 9891403416](https://www.fmkorea.com/9891403416) · 2026-05-30 — "네이비 차콜 다크그레이 블랙 건메탈 다크브라운 **이거 완전 헷갈렸음** / **나만 완전 미로같이 왔다갔다한게 아니구나**"
- [fmkorea 9936177305](https://www.fmkorea.com/9936177305) · 2026-06-10 — "색깔 고르면 랜덤으로 바뀌고 **어떤 색상인지 모르겠어서** 욕했던 내용있었는데 지금 보니까 색상 밑에 색깔 반영되어있네요"
- Play · 2024-11-22 · 5★ — "**제품의 색상 고를때마다 따로 들어가서 봐야하는점**은 조금 불편하네요"
- Play · 2021-03-23 · 1★ 👍138 — "**다른 색 보려고 아무리 눌러도** 링크가 연결이 안되고, **앱 포기하고** 일반 인터넷으로 들어갔더니"
- Play · 2020-11-20 · 4★ 👍70 — "**컬러나 사이즈별로 리뷰를 확인할 수 없어 정확한 정보를 찾기 어려운 점**"
- Play · 2020-10-05 · 4★ — "여러색상이 있는 옷은 ... **색상을 골라서 볼 수있게** 해줬으면 좋겠습니다"
- [fmkorea 5400958695](https://www.fmkorea.com/5400958695) · 2023-01-15 — "무신사 색상별로 후기 볼 수 있는 방법 아시는분? ... **원하는 색이 안나와서** ... 감을 못잡겠네요"

> **핵심 해석:** 무신사는 2026-05-29에 색상칩 아래 색상명을 붙여 이 문제를 **스스로 인정하고 고쳤다.**
> "사람들이 불편해한다"는 반박당하지만, **"플랫폼이 고쳤다"는 반박이 안 된다.** 발표에서 이 두 링크가 가장 세다.

## A. 검색이 원하는 걸 안 보여준다 (14건)

| 출처                                                    | 날짜/별점               | 인용                                                                                                                                                                                                        |
| ------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [fmkorea 9210611459](https://www.fmkorea.com/9210611459) | 2025-11-26 · 댓글 9    | 제목 "무신사에서**이런 자켓을 머라 검색해야 나오지**" / 작성자 "**봄버 검색했었는데 먼가 이런 느낌이 안 나와서**" → 댓글 9개가 "후드 봄버?" "캔버스 후드" "탱커자켓" 으로 검색어를 대신 찍어줌 |
| Play                                                    | 2023-12-13 · 2★ 👍13  | "너무 과도해서**원하는 상품을 찾기 어려워요** ... 스포츠 볼캡을 사고 싶어 카테고리를 찾아 들어가면 스포츠 모자에 여성 바라클라바가 나와요"                                                            |
| Play                                                    | 2020-09-11 · 1★ 👍119 | "상품 검색해서 보는데 왜 전혀 상관없는 강아지옷들이 계속 나오는지.."                                                                                                                                        |
| Play                                                    | 2020-09-06 · 1★ 👍51  | "상품을 검색할때 반팔티를 검색했는데 바지,긴팔 신발등이 막 나옴"                                                                                                                                            |
| Play                                                    | 2025-12-14 · 3★       | "왜 조거팬츠를 검색했는데 검색어대로 안나오고 다른 바지들만 나오는거임?"                                                                                                                                    |
| Play                                                    | 2025-07-01 · 3★       | "검색하면 불필요한 상품과 광고가 많이 노출됩니다 ... 여름 바지라고 쳤는데, 내복 나오네요;"                                                                                                                  |
| Play                                                    | 2020-09-18 · 4★       | "제품검색 시스템이 왜케 불편한겁까? 너무 비효율적이고 검색하기가 여간 힘든 것이 아닙니다"                                                                                                                   |
| Play                                                    | 2024-12-14 · 4★       | "검색어 연관성이 좀 떨어지네요"                                                                                                                                                                             |
| Play                                                    | 2023-02-13 · 2★ 👍4   | "왜검색하면 키즈까지 같이나오나요"                                                                                                                                                                          |
| Play                                                    | 2025-12-17 · 1★       | "AI의 정확도가 많이 떨어지고 필터를 거치지 않네요"                                                                                                                                                          |
| Play                                                    | 2026-04-02 · 4★       | "검색기능만 조금 더 개선됐으면 좋겠어요"                                                                                                                                                                    |
| App Store                                               | 2026-05-17 · 3★       | "요즘 뭐만 치면 못생기고 인기도 없는 옷들이 왜 맨 위부터 뜨는지"                                                                                                                                            |
| App Store                                               | 2026-04-11 · 2★       | "해당 작품 검색해도 안뜨는데 왜 배급사로 검색해야"                                                                                                                                                          |
| App Store                                               | 2026-04-07 · 1★       | "브랜드 이름 검색하니까 뭔 중고옷이나 쳐뜨네요"                                                                                                                                                             |

> 맨 위 건이 특히 중요하다 — **"이미지로는 아는데 텍스트로 표현 못 해서 못 찾는다"** 의 실물 증거이고,
> 커뮤니티가 검색어 대신 찍어주는 **우회 행동**까지 한 글에 다 있다.

## B. 필터가 부족·부정확하다 (11건 + 성별필터 10건)

**색상 필터 결핍 — 직격탄**

- App Store · 2026-04-06 · 4★ — "**검색 카테고리 색깔 편에 차콜 좀 추가해주세요 저는 옷 차콜색밖에 안입는데 차콜이 없어서 옷을 살 수가 없습니다** 차콜 무시하지마세요"
- Play · 2025-02-12 · 1★ — "색상 찾기 불편함" (전문)
- Play · 2022-11-22 · 1★ — "**필터 검색 누락되는 제품 있음**"
- Play · 2024-11-07 · 1★ 👍2 — "검색 필터가 다소 아쉽고"

**필터를 걸어도 결과가 안 맞는다 (AND/OR 문제)**

- Play · 2024-10-10 · 1★ 👍141 — "총장과 가슴단면을 제한해서 검색하고 싶은데 두 옵션이 다 적용된 제품들이 안 나와요. **and문을 원하는데 or문으로 적용되는거 같음** ... **원하는 사이즈의 제품 찾기가 너무너무 힘듦** ... 점점 퇴화하는 것 같음"
- App Store · 2025-11-06 · 4★ — "**or처리해서 따로따로 검색되던데요. and로 검색해야 하는거 아닙니까?** 조건을 다 충족하는 옷을 찾는건데"
- [fmkorea 9012739575](https://www.fmkorea.com/9012739575) · 2025-10-10 — "필터를 먹이고 검색을 해도 **전혀 관련없는 제품들이 뜨는데**"
- [fmkorea 7485022089](https://www.fmkorea.com/7485022089) · 2024-09-18 — "위 사진처럼 적용해도 **필터가 안먹는데** 원래 이런가요??"
- [fmkorea 8900635565](https://www.fmkorea.com/8900635565) · 2025-09-11 — "무신사 **중복 필터링 안되는거** 건의하니까 고쳐준데"
- Play · 2025-10-17 · 2★, Play · 2025-06-11 · 4★ ("**옷 못 찾아도** 이건 좀 개선해주셨으면")

> **우리 축과의 연결:** 사용자는 이미 **조건을 AND로 조합해서 걸고 싶어 한다.** 그런데 무신사에서 그게
> 실측 사이즈에서조차 안 된다. 하물며 "바탕색 × 프린트색 × 위치"라는 축은 **존재 자체가 없다.**

**성별 필터 강제 적용 — 10건** (앱스토어 6 + Play 3 + 커뮤니티 1)

- App Store · 2026-06-23 · 5★ — "여성이라고 여성 필터로 자동설정 되게 하는 거 ... 맨날 번거롭게 필터 해제하고 사용합니다"
- App Store · 2026-05-01 · 1★ — "성별 필터 해제해도 들어갈 때마다 적용됩니까? **상품 수 적게 보이면 그쪽에 이득인지**"
- [fmkorea 9621777798](https://www.fmkorea.com/9621777798) · 2026-03-22 — "자꾸 남성으로 자동 필터링돼서 ... 매번 초기화시키기 귀찮;;"

## D. 찾다가 포기했다 (8건)

problem-validation 4체크 ③(못 찾아 포기·우회)의 **웹 근거 🟡 → 🟢 승격 재료.**

- Play · 2026-02-22 · 1★ 👍14 — "**안그래도 사이즈 맞는 옷 찾기 힘들어서** 신중하게 고르는데 **2시간 골라서 겨우 한개 담았네요** ... 이럴거면 오프라인 매장 가서 사는게 덜 귀찮겠어요" ← **n=1 팀원의 "4시간"과 같은 종류의 사건**
- App Store · 2025-10-13 · 5★ — "몇번하다가 **진절머리 나서 쇼핑 중도 포기임**"
- Play · 2026-02-11 · 3★ 👍10 — "**구매하려 쇼핑을 하다가도 불편해서 포기하고** 어플을 나가게됩니다"
- App Store · 2025-11-18 · 3★ — "스페셜한 블프 상품 **찾다가** 봐도 봐도 평소랑 다른점 별로 없고 **결국 포기하게 돼요**"
- App Store · 2025-12-21 · 3★ — "**이거 때문에 쇼핑 포기했던 적이 한두 번이 아닙니다**"
- Play · 2020-09-08 · 1★ 👍8 — "나시를 쇼핑하러 들어왔다치자 **아무리 찾아봐도 옷 카테고리는 없고 찾다보면** ... **걍 헤매이다가**"
- Play · 2021-08-31 · 2★ 👍7 — "**점점 더 원하는 옷을 찾기 힘들어진거같고** 무신사에서 밀어주는 옷이 잘 보이는거 같다"
- App Store · 2026-05-17 · 3★ — "**옷 디깅하기가 힘든 느낌이에요**"

## E. UX 분석 글 (1건, 약한 근거)

[blog.naver.com/oliveena/223962853681](https://blog.naver.com/oliveena/223962853681) — 29cm vs 무신사 상품 검색 UX 역기획.
지적은 "돋보기 누르면 **원치 않은 화면이 떴다**", "**버퍼링**" 두 줄뿐. 색상·필터 정확도 얘기 없음 → 인용 가치 낮음.

## 2번 조사에서 못 찾은 것 (솔직히)

1. **X(트위터) — 0건.** 비로그인 검색 불가, WebSearch는 US 인덱스라 한국어 SNS를 못 긁음.
2. **스레드 — 0건.** 광고 포스트만.
3. **인스타그램 — 0건.** 비로그인 인덱싱 안 됨.
4. **디시인사이드 — 0건.** 남자패션 갤에 무신사 글은 많으나 이 주제는 안 걸림. (→ 1번 조사에서 재시도 중)
5. **무신사 tech blog VoC 대시보드 2편** ([part1](https://medium.com/musinsa-tech/voc-dashboard-development-part1-ec40412eb17f) / [part2](https://medium.com/musinsa-tech/voc-dashboard-development-part2-a220e42c34e9)) — Cloudflare 차단으로 본문 실패. **VoC 카테고리 중 '검색'의 비중**을 확인하려던 것 → 브라우저로는 열릴 듯. **미완 과제.**
6. **UX 분석 글 2편은 "없음"이 정답** — [weeklyuxuichallenge](https://weeklyuxuichallenge.oopy.io/0b585e89-d796-4e42-a8a4-59d8edd65252)(리뷰 UX만), [velog](https://velog.io/@not_even__close/UIUX-%EC%8A%A4%ED%84%B0%EB%94%94-8-%EB%AC%B4%EC%8B%A0%EC%82%AC)(오히려 필터·이미지 검색을 칭찬). 반대 근거로 기록해 둔다.

---

# 1. 한국 커뮤니티 (완료)

수집: 브라우저(Google) 직접 검색 + 디시 갤러리 직접 열람 + 네이트판·더쿠.
**남자패션 마이너갤(`id=mf`)이 실제 goldmine**이었다 (정식 fashion/stylish 갤러리는 404, 존재하지 않음).

## ★ 가장 중요한 발견: 분리 묘사는 "사진을 못 올릴 때"만 나온다

| 환경                                        | 분리 묘사                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| **지식iN**(사진 못 올림, 기억에 의존) | 거의 예외 없이`[바탕색] 바탕에 + [프린트색] + 글씨/그림 + [위치]` 어순 |
| **디시·네이트판**(사진 던질 수 있음) | 색 묘사를 통째로**생략**. 남패갤 본문에 "바탕"은 전체 3건뿐        |

→ **스키마 정당화 논리를 이렇게 써야 한다.**
"사용자가 원래 그렇게 말한다"(❌ 약함, 반례 많음)가 아니라
→ **"사용자가 사진 없이 설명해야 할 때 자연 발생하는 축이 정확히 바탕색/프린트색/프린트위치다.
평소엔 사진으로 때우지만, 그건 검색창에 넣을 수 없다."**(✅ 강함)
즉 이 축은 사용자가 먼저 꺼내는 언어라기보다 **시스템이 제공해야 사용자가 고를 수 있는 축**이다.

## A. 바탕색/프린트색을 명시적으로 나눠 말한 글 (8건)

1. **★최고 근거 — "반팔티 찾아주세요"** (지식iN) — "**흰색 반팔티**이고 **앞면에는 흑백으로** 얼굴 사진?같은게 네모난 칸에 여러개가 들어있어요 **뒷면에는 검정색 영어글씨로** pop art is for everyone이 써져…"
   → 바탕색 / 앞면 프린트(색+형태) / 뒷면 프린트(색+글씨) 를 **위치별로 전부 쪼갬. 우리 스키마 3필드가 그대로 나옴.**
2. [후드티 찾아주세요](https://m.kin.naver.com/qna/dirs/8040102/docs/461001261) (2023-12-25) — "**초록색에 노란색 글씨로** UCLA 적혀있는 후드티였는데요. 글씨가 약간 뽀글이? 같은 재질" (바탕/프린트색/내용/**재질**까지)
3. [반팔 추천](https://gall.dcinside.com/mgallery/board/view/?id=vintage&no=19101) (빈티지갤) — "**흰바탕에 하늘색 글씨나 프린팅으로 쿨톤 느낌나는**" (+프린트 종류 구분 +무드 라벨)
4. [BJD갤](https://gall.dcinside.com/mgallery/board/view/?id=bjd&no=98582) — "**흰바탕에 남색 세로줄무늬랑 남색 레이스프린팅**같은게 있던걸로 기억해"
5. [이 옷좀 찾아 주세요](https://m.kin.naver.com/qna/dirs/80401/docs/486832080) (2025-07-05) — "별모양 헤드의 일렉기타 위에 **흰색으로 글씨가** 써져있는데"
6. [애니 티셔츠](https://m.kin.naver.com/qna/dirs/30404/docs/440291429) — "**흰 바탕에 크게** 씹덕같은 캐릭터 프린팅된" (+프린트 **크기**)
7. [tlc 티셔츠](https://m.kin.naver.com/qna/dirs/5040102/docs/445605825) — "**흰색바탕에 그려진** tlc 티셔츠"
8. 스트라이프 반팔티 (지식iN) — 조건을 불릿으로 나열: "**-흰바탕에 블랙 또는 네이비 줄무늬**"

**부분 분리 (3건)** — [나이키 주황색 프린팅 티](https://m.kin.naver.com/qna/dirs/8040102/docs/469416945) "**뒷면에는 아무것도 없고**"(위치 유무 명시) / [mf/1044989](https://gall.dcinside.com/mgallery/board/view/?id=mf&no=1044989) "지퍼 회색이고 / 팔 중간쯤에 두껍게 검은색 삼선"(부위별 색)

**반례 (6건 + 네이트판·더쿠 9건 전부)** — 사진 올릴 수 있는 곳에선 색을 안 쓴다.
"이거 반팔 셔츠인데 / 이미지 검색해도 쿠팡에 품절만" · "**흰색 무지**"(색+프린트유무가 한 토큰) ·
네이트판 [티셔츠 정보찾아주세요](https://pann.nate.com/talk/374696532)는 색을 **한 번도 안 쓰고** 프린트 **위치+거기 적힌 문구**로만 식별 · [사례금 만원](https://pann.nate.com/talk/314534812)은 **가격을 식별자로** 씀

## B. 우회 행동 (15건) — B1·B2가 핵심

1. **★후기 탭 사진으로 색상 역추적** — [fmkorea 9877907124](https://www.fmkorea.com/9877907124) 댓글 — "그나마 찾아낸게 **후기 탭으로 가면 색상 별로 후기 볼 수 있는데 거기 탭에는 사진도 같이 있어서 그 사진으로 찾아서 클릭함** 근데 사진들이 비슷해서 저 다리 방향도 잘봐야댐"
2. **★가장 완결된 우회 동선** — [내가 무신사 옷 사는 과정](https://pann.nate.com/talk/371721352) (2023-12-30) — "일단 슥슥 둘러봄 … **스냅을 봄** 오 완전 괜찮음 **2차로 후기를 들어감** 내 눈을 의심함 아까 봤던 스냅이랑 같은 옷을 입은게 맞는건지 혼돈이 오기 시작함 … **다시 스냅으로 돌아감** … 일단 침착하게 사이즈 확인하고 **장바구니에만 담음**"
   → 상품 이미지 불신 → **스냅↔리뷰 왕복** → 구매 보류
3. **유튜브 코디 → 무신사 검색** — [mf/743014](https://gall.dcinside.com/mgallery/board/view/?id=mf&no=743014) "유튜브에서 마음에 드는 코디보고 그걸 무신사에서 검색해서 사는데 막상 도착해서 보면 옷이 많이 다름" / 답글 "**뭐라고 검색해야되는지 아심? 감도 안잡혀서**"
4. 인스타에서 체형 비슷한 사람 찾아 복붙 / 구글 렌즈 / 핀터레스트·스트릿 스냅 수집
5. 갤러리 공지·개념글 전수 뒤지기 — "공지랑 개념글 다 뒤져봣는데 못찾음"
6. 브랜드별 순회 — "유니클로 에어리즘 / 쿨탠다드 / 탑텐 / 다 안 나오네"
7. [옷 좌표 찾아주는 사이트 없나요](https://pann.nate.com/talk/319149608) — 댓글 "**네이트판 수사대**" (사람에게 물어보는 게 최종 수단)
8. 검색 대신 **리뷰 많은 순 정렬**에 의존 — [pann/356296999](https://pann.nate.com/talk/356296999)

> **부수 발견(무신사 측 자인):** 무신사 공식 자료에 "**'이 옷 정보 좀…' 댓글 남기던 시대는 끝났습니다**"
> (스냅 이미지 AI 검색 도입, [hwangbh8.tistory.com/204](https://hwangbh8.tistory.com/204)).
> 무신사 스스로 "스냅 보고 댓글로 옷 물어보기"를 **해결 대상 문제로 인정**했다.

## C. 검색·필터 불만 (13건)

1. **★색상 필터가 실제로 안 걸린다** — [mf/1045745 &#34;이런 바지는 대체 무슨 컬러로 검색해야 나오나&#34;](https://gall.dcinside.com/mgallery/board/view/?id=mf&no=1045745) (2026-06-22)
   - 본문 "**연청으로 검색해도 안나오고 회색으로 해도 안나오고**"
   - 댓글 "**무신사에 컬러 필터적용해서 바지 검색해도 안나오더라구**"
   - 다른 댓글 "연청 아이스블루 아이스그레이 ㄱㄱ" / "차콜아님?" ← **같은 색을 두고 사람마다 라벨이 갈림**
2. **색칩만 있고 이름이 없어 야바위** — [fmkorea 9877907124](https://www.fmkorea.com/9877907124) — "저 조그만한 사진에 색상 글씨 조차 없음 / **한 10번 클릭하고 겨우 블랙 찾았다**"
3. **색 이름 자체를 모름** — [mf/1053591](https://gall.dcinside.com/mgallery/board/view/?id=mf&no=1053591) "빈티지? 물빠진 느낌나는데.. **뭐라고 검색해야 나오지**"
4. **색감으로는 검색 불가** — [mf/1049558](https://gall.dcinside.com/mgallery/board/view/?id=mf&no=1049558) "요런 색감,재질 사고싶은데" / "**아무리 찾아도 비슷해 보이는게 없는디?**"
5. **"뭐라고 검색해야 되냐" 정형 패턴** — 남패갤 제목검색 `검색` 결과 **6건 중 5건이 이 형태**
   ([1054150](https://gall.dcinside.com/mgallery/board/view/?id=mf&no=1054150) · [1044939](https://gall.dcinside.com/mgallery/board/view/?id=mf&no=1044939) · [1044153](https://gall.dcinside.com/mgallery/board/view/?id=mf&no=1044153) · [1046738](https://gall.dcinside.com/mgallery/board/view/?id=mf&no=1046738) · [1050989](https://gall.dcinside.com/mgallery/board/view/?id=mf&no=1050989))
6. **타 플랫폼 이탈** — [pann/373026834](https://pann.nate.com/talk/373026834) "**흐물흐물한** 후드티 … **어떻게 검색해야나오냐**" / 댓글 "그런 보세맨투맨은 **에이블리에 더 많아**"

## ⚠️ 반대 근거 1건 — 발표 전에 반드시 알고 있을 것

[루리웹 댓글](https://bbs.ruliweb.com/etcs/board/300143/read/70246727) (2025-04-12) —
"**옷 살때 필터 기능이 압도적임 다른 곳도 써봤는데 무신사만큼 세분화 필터 걸어서 살 수 있는데가 없음**"

→ **"무신사 필터가 부족하다"로 단정하면 반박당한다.** 안전한 프레이밍은
**"필터 축은 많다. 그런데 색을 바탕/프린트로 쪼개는 축이 없다"** — 이건 C-1 댓글로 방어된다.

## 1번 조사에서 못 찾은 것 / 접근 불가

- ⚠️ **지식iN 본문 검증 실패** — `kin.naver.com`·`search.naver.com`이 브라우저·WebFetch 양쪽 차단.
  A의 지식iN 항목은 전부 **Google 스니펫 인용**이다. **발표에 쓰려면 직접 브라우저로 열어 확인할 것.**
  A-1·A-8은 태그 목록 URL만 확보돼 **개별 글 URL이 없다.**
- 네이버 카페/블로그 — 같은 이유로 미탐색
- **뽐뿌** — 본문 EUC-KR 깨짐. 미회수 2건([style/120372](https://www.ppomppu.co.kr/zboard/view.php?id=style&no=120372), [help/1365142](https://www.ppomppu.co.kr/zboard/view.php?id=help&no=1365142)). `스타일공간` 보드는 **재시도 가치 높음**
- 더쿠 검색 엔드포인트 403(본문만 열림) / 오늘의유머 검색 403 / 클리앙은 검색 되나 관련 글 0건 / 인스티즈 유의미 0건
- **가설인데 근거 못 찾음**: "대표 이미지만 보여서 상세페이지를 일일이 들어가야 한다"는 **독립 불만 글 없음**
  (fmkorea 색상칩 글이 사실상 같은 문제를 다루지만 그 프레이밍의 글은 아님)

# 3. 영어권 Reddit + 이커머스 검색 업계 (완료)

> **재현 자료: [`research-reddit/`](research-reddit/)** — `corpus.json.gz`(원시 5,137건), `rows.json`(n=308 분류 결과),
> `fetch.py`·`analyze.py`(수집·집계 스크립트). `python3 analyze.py`로 아래 A 수치 전부 재현된다.

## A. 묘사 방식 정량 집계 (n=308)

**표본 방법(재현 가능)**: arctic-shift API(curl) → 5개 서브레딧(findfashion, HelpMeFind, streetwear,
malefashionadvice, femalefashionadvice) × 7쿼리(print/graphic/tee/shirt/hoodie/logo/sweatshirt) × 3페이지
→ 원시 **5,137건** → 로컬 필터(상의 + 그래픽 프린트 + 찾기요청 + 중복제거) → **n=308**

| 항목                                | 건수         | 비율         |
| ----------------------------------- | ------------ | ------------ |
| 바탕색 언급                         | 65           | 21%          |
| 프린트색 언급                       | 29           | 9%           |
| 프린트 위치 언급                    | 75           | 24%          |
| **바탕색+프린트색 분리 서술** | **21** | **7%** |
| 바탕+프린트색+위치 3개 모두         | 10           | 3%           |
| 색을 아예 안 씀                     | 235          | 76%          |

> **★ 가장 중요한 수치: 프린트색을 말한 29건 중 21건(72%)이 바탕색도 함께 말한다.**
> 즉 **프린트색을 말하기 시작하면 거의 항상 바탕색과 나눠서 말한다.** 다만 애초에 색을 텍스트로 쓰는 사람이 적다(사진을 첨부하니까).
> → **1번(한국) 조사의 "사진 못 올릴 때만 분리 묘사가 나온다"와 완전히 같은 결론. 두 언어권에서 독립적으로 재현됐다.**

**대표 인용**

1. **사용자가 스스로 라벨을 붙인 글** ([r/findfashion](https://reddit.com/r/findfashion/comments/1uhg5me/)) — "**Color:** Cloud Dancer (White) … **Design:** **Front:** Small Mickey Mouse eating noodles with the text 'Yummm!' **Back:** Large print of Mickey eating noodles"
   → `Color / Design / Front / Back` — **우리 스키마와 사실상 동일.** 이렇게 라벨까지 붙인 글은 308건 중 3건.
2. [r/findfashion](https://reddit.com/r/findfashion/comments/1tepuis/) — "**black shirt** with a **tiny logo on the left side of the chest** and **for the back it was pink letters**"
3. [r/HelpMeFind](https://reddit.com/r/HelpMeFind/comments/1ufvttc/) — "black hoodie with **skull on the front** and **red text on the arm** … **on the side in red**"
4. [r/streetwear](https://reddit.com/r/streetwear/comments/qress1/) — "**white sweatshirt with red lettering**" (제목만으로 완결)
5. [r/findfashion](https://reddit.com/r/findfashion/comments/1v2ozwx/) — "**white t shirt** with **on the front** … (**one red, one blue**) … **On the back** it was a list of team's name"
6. [r/HelpMeFind](https://reddit.com/r/HelpMeFind/comments/1tey621/) — "**navy blue hoodie with yellow text**"
7. [r/findfashion](https://reddit.com/r/findfashion/comments/1ughrmb/) — "**Color:** Cream/beige … **Graphic:** 3 minimalist **black line-art** silhouettes **across the chest**"

**편향 (반드시 같이 쓸 것)**

- **최근 편중**: 2026년 글이 230/308(75%). arctic-shift가 최신순 반환. **시계열 주장 불가.**
- **서브레딧 편중**: findfashion 162 / MFA 65 / HelpMeFind 48 / streetwear 23 / **FFA 10(단독 인용 금지)**
- **과소집계**: 정규식 자동 분류라 `"Color: Cloud Dancer (White)"` 같은 구조화 표기를 못 잡음.
  실제 색 언급률은 위보다 높다 → **"최소 추정치"로 표현할 것.**
- **색 미언급 76%는 노이즈가 아니라 발견이다** — 사진이 있으면 색을 안 쓴다.
  뒤집으면 **텍스트 검색만 있는 환경에서는 이 정보가 아예 유실된다**는 뜻.

## B. 검색 불가 불만·우회 행동

**B1. 색/프린트로 검색·필터가 안 된다는 직접 불만 (5건)**

- [r/ThredUp 2023](https://reddit.com/r/ThredUp/comments/17vjzfr/) — "I can search for dress with long sleeves or patterns or condition as filters. However, **I can't filter by color anymore.**" ← 소매·패턴·컨디션은 있는데 **색만 없음**
- [r/sewing 2025](https://reddit.com/r/sewing/comments/1j74gwc/) — "a few website that at least list a pantone color, but **don't let you actually search by the pantone**" ← **표기는 하면서 검색축으로는 안 줌.** 우리 문제의식과 정확히 동일
- [r/coloranalysis 2022](https://reddit.com/r/coloranalysis/comments/zffu1x/) — "are there stores that **allow you to filter by color season**?"
- [r/ThredUp 2025](https://reddit.com/r/ThredUp/comments/1j1c3e2/) — "**I had to filter by color and select everything except black.**" ← 색 필터가 **있어도** 역필터를 써야 함
- [r/SEO 2023](https://reddit.com/r/SEO/comments/1625ytq/) (판매자 측) — faceted navigation을 "**can't wrap my head around it**", 2주째 헤맴 ← 공급 측 근거

**B2. 우회 행동 (12건) — 상위 3건**

- **★[r/HelpMeFind 2025](https://reddit.com/r/HelpMeFind/comments/1jhpnvb/)** — "google reverse image search and google lens does nothing for me. **Even searching for 'blue T-shirt with yellow or gold pocket' doesn't yield anything also.**"
  → **역이미지도 실패 + "바탕색+부위색" 자연어 검색도 실패 → 커뮤니티행.
  우리 제품이 정확히 이 쿼리를 받아내는 물건이다.**
- [r/findfashion 2023](https://reddit.com/r/findfashion/comments/17ggucd/) — "I've searched **All Clothes → filter by color → red** and **scrolled through every single page** but it's nowhere"
  → **필터 존재 ≠ 문제 해결**의 결정적 근거
- [r/HelpMeFind 2024](https://reddit.com/r/HelpMeFind/comments/1gwxhtg/) — "searching **champion rice hoodie navy**, though there are a **zillion different styles** … **the letters are sewn on, white on top of grey**"
  → 브랜드+색으로도 변별 실패. 게다가 스스로 **"white on top of grey"로 바탕/프린트를 분리 서술**

커뮤니티가 우회를 **표준 절차로 권장**:

- "**reverse image searching is by far the best way to find an item**" (사이트 검색은 언급조차 안 됨)
- "your best bet would be to either Google something like **gray hoodie with red laces** or Google lens it"

> ⚠️ **수치 합산 금지.** A코퍼스(n=308, 역이미지 언급 27건=9%, 실패 명시 14건)와 B스윕(B1 5건 + B2 12건)은
> **표본틀이 다르고 중복 가능하다.** "총 41건" 식으로 더하지 말고 각각 분모와 함께 따로 쓸 것.

**시사점 3가지**

1. **불만글보다 우회 행동이 압도적으로 많다.** 사용자는 항의하지 않고 **조용히 Google Lens와 커뮤니티로 이탈**한다.
   낮은 불만 건수는 문제가 작다는 뜻이 아니라 **이탈이 조용하다**는 뜻 — 오히려 강한 근거.
2. **색 필터가 있어도 실패한다.** 경쟁사가 색 필터를 가졌다는 사실이 우리 차별점을 무효화하지 않는다.
3. **프린트/그래픽은 검색 수단이 아예 없다.** 사용자는 프린트를 자연어로 푸는데("해골 드레드 그래피티",
   "회색 후디 빨간 끈", "파란 티셔츠 노란 포켓") 이를 받는 건 Google뿐이고 **쇼핑몰은 0곳.**

## C. 업계에서 알려진 문제인가 → 판정: **명백히 알려진 문제. 단 "부위별 색"은 아직 아무도 안 풀었다**

- **상품당 색 1개 한계(머천트 실제 불만)** — [Shopify 커뮤니티](https://community.shopify.com/t/how-can-i-have-a-product-with-one-or-no-variant-but-multiple-colors-for-filtering/114326) "**the product is two colors at the same time**" → 답변 "**You can select only one color per product**" → "my question isn't possible with vanilla Shopify"
- [같은 문제 2021년부터 반복](https://community.shopify.com/c/technical-q-a/multiple-values-for-the-same-metafield/td-p/1264467) — "Can I assign multiple values to the same metafield?" → "Does anyone have a solution for this?" / "**This is the exact same challenge I'm facing.**" / "same here." (해결 없이 동조 댓글만 누적)
- **색 계열 정규화도 네이티브 미지원** — "we have **multiple green shades** … olive, mint, dark green, light green. We only want our customer to use the filter option '**green**'" → 답은 전부 서드파티 앱. **우리 코드북의 색 계열 정규화와 같은 문제.**
- **검색 벤더도 "색은 배열이어야 한다"고 명시** — [Algolia](https://www.algolia.com/blog/engineering/facets-data-model-of-json-records) "**A t-shirt can have one color or be a mix of red and blue.**" (하필 티셔츠를 예로 듦)
- **상용 플랫폼은 "실제 색상명"과 "색 계열"을 두 속성으로 분리 운영** — [Bloomreach](https://documentation.bloomreach.com/data-hub/docs/items-system-attributes-product-color-group) "normalized color family name"
- **자동 태깅 난이도는 학계도 인정** — [arXiv 1907.00157](https://arxiv.org/abs/1907.00157) "a **very hard multi-class classification problem**" / [PAE 2024](https://arxiv.org/abs/2405.17533) avg 92.5% F1 (벤치마크 참고치)

## D. Google/Amazon/Shopify는 부위별 색을 지원하는가 → **전부 미지원**

| 플랫폼           | 부위별 색(바탕vs프린트)                   | 다중 색상값           | 프린트 속성                    | 그래픽 위치                        | 판정                    |
| ---------------- | ----------------------------------------- | --------------------- | ------------------------------ | ---------------------------------- | ----------------------- |
| Google Merchant  | 없음                                      | 1필드 최대 3색(`/`) | `pattern` 1개                | 없음                               | 부분 지원               |
| Amazon           | 없음                                      | dominant color 1개    | `pattern_type`               | 없음                               | **사실상 미지원** |
| Shopify Taxonomy | 카테고리별 존재(**T셔츠엔 미배정**) | Color 단일 19색       | Pattern / Decoration technique | **`Print placement` 존재** | 부분 지원(가장 앞섬)    |

- **Google** — "**Include up to 3 colors** … **1 primary color followed by up to 2 secondary colors**" / "Submit only one attribute per variant"
  → `White/Yellow`는 "흰색이 주, 노랑이 보조"일 뿐 **"바탕 흰색 + 프린트 노랑"이 아니다.**
- **Amazon** — "**Use the dominant color**". 다중색 슬래시 표기조차 없음.
  ⚠️ 그런데 color_name 예시로 "**Mint Leaves Print**"를 허용한다 →
  **부위별 슬롯이 없으니 판매자가 프린트 정보를 색 필드에 욱여넣고, 그래서 색 필터가 무너진다.** 우리 주장의 역근거로 아주 좋음.
- **★Shopify Taxonomy 결정적 발견** (`taxonomy.json`, `2026-08-unstable` 직접 파싱)
  - `TaxonomyAttribute/10103 : **Print placement**` — "where the main graphic/logo is placed on the t-shirt"
    값: **All-over print, Back, Center chest, Front, Front & back, Hem tag, Left chest, Pocket print, Sleeve, Other**
  - `TaxonomyAttribute/10104 : Print technique` — Screen print, DTG, Embroidery, Sublimation, Puff, Foil, HTV
  - **우리가 만들려는 `print_placement`가 이미 같은 값 체계로 정의돼 있다.** 단 이 속성이 붙은 카테고리는 **단 1개**
    (Sports Fan Accessories > T-Shirts)이고, 일반 의류 T셔츠(`aa-1-13-8`)엔 **프린트 색·위치가 없다.**

> **판정: 어느 플랫폼도 "바탕색 vs 프린트색"을 지원하지 않는다.** 업계 방향은 "한 색 필드에 여러 값"이 아니라
> **속성 자체를 쪼개는 것**(Shopify식)이다. 우리의 `base_color` / `print_color` 분리는 **업계 표준 방향과 일치**하고,
> `print_placement` 값 체계를 Shopify에 맞추면 **외부 정합성 근거**가 생긴다.

## 3번 조사에서 못 찾은 것

- **"흰 티 + 노란 등판 프린트" 같은 부위별 색을 명시적으로 다룬 벤더 문서** — **없음.** 가장 근접한 게 Algolia(색=배열), Google(주색/보조색 계층)
- Constructor.io / Coveo / Lucidworks / Searchspring / Klevu / Salsify 1차 문서 — 접근 실패
- Google Shopping·Amazon 실제 색 필터 **UI 동작** — 브라우저 미사용 조건이라 미관측
- Amazon Seller Central 카테고리별 flat file valid values — 로그인 벽
- PullPush가 `"filter by colour"`, `"no color filter"`, `"filter by print"` 등 4개 쿼리를 "too complex"로 거부
  → **B1 표본을 더 늘릴 여지가 남아 있다** (`&before`/`&after`로 연도 분할하면 뚫림)
- ⚠️ **Shopify 커뮤니티 인용문은 WebFetch 추출본**이다. PRD·포트폴리오에 넣기 전 URL을 직접 열어 대조할 것.
  (Google 공식 문서와 Shopify taxonomy JSON은 직접 파싱이라 안정적)

# 4. "장비색 깔맞춤" 트리거 실존 검증 (완료)

**검증 대상 가설:** "튀는 색 운동화·장비에 옷 색을 맞춘다" — 이게 n=1 클라이머 팀원의 4시간 사건을
**세그먼트로 일반화하는 근거**였다. 진짜인지 확인이 필요했다.

## 판정: (b) 소수 존재 — 확증 33건 : 반증 26건

행동은 실재하고 원문 인용도 확보했다. 그러나 이 주제를 정면으로 다룬 스레드마다 **다수 의견은
"재고 있는 거 아무거나"** 였고, 테니스에선 깔맞춤이 오히려 조롱 대상이었다.

## ★ 가장 중요: 클라이밍이 제일 약하다

동일 쿼리(`"match my shoes"` 정확일치, PullPush 코멘트 원시 히트):

| 종목               | 서브레딧                       | 원시 히트    | 검증 유효    | 성격                                                                     |
| ------------------ | ------------------------------ | ------------ | ------------ | ------------------------------------------------------------------------ |
| **러닝**     | r/running + r/RunningShoeGeeks | **25** | **17** | 상의·싱글렛·양말을 신발색에 맞춤.**한국어 사례도 여기서만 나옴** |
| 골프               | r/golf                         | 11           | 5            | 벨트·모자·공 중심 —**상의 매칭이 아님**                         |
| 테니스             | r/10s                          | 3            | 7            | 색보다**브랜드 통일**이 주제. 깔맞춤은 조롱 대상                   |
| **클라이밍** | r/climbing + r/bouldering      | **1**  | **1**  | 담론 전체가**핏·사이즈**. 색 언급 사실상 없음                     |
| 배드민턴           | r/badminton                    | 0            | 0            | 없음                                                                     |

**러닝 ≫ 골프 > 테니스 ≫ 클라이밍 > 배드민턴.**
r/climbing이 r/10s보다 서브레딧 규모가 훨씬 큰데도 1건인 건 **의미 있는 음성 신호**다.
그 1건마저 자조적이다 — "The Katanas are bright yellow and match my indoor climbing pants —
**that's about all the thought that went into it**" ([r/climbing](https://reddit.com/r/climbing/comments/17zu739/the_dick/ka2yzf8/))

## A. ★ 옷 살 때 실제 불편을 말한 사례 (6건) — 제품이 붙을 자리

1. [r/RunningShoeGeeks](https://reddit.com/r/RunningShoeGeeks/comments/1j6eu7w/weekend_discussion_adidas_running_shoes/mgpcyge/) — "I want my race kit to match my shoes but **Adidas doesn't make racing shorts or tanks?!**"
2. [디시 러닝갤 &#34;깔맞춤 쉽지않네&#34;](https://gall.dcinside.com/mgallery/board/view/?id=running&no=1085409) (2026-07-19) — "아디다스 런닝화가 맘애 들어서 싱글렛 쇼츠 이런것도 아디다스로 맞출려고하니 ... 아쉽네 **걍 딴거사야겠다**" ← **신발에 맞춰 사려다 구매 포기**
3. [디시 러닝갤 &#34;메타스피드 양말깔맞춤&#34;](https://gall.dcinside.com/mgallery/board/view/?id=running&no=1088874) (조회 689, 댓글 11) — "이렇게 이쁘게 세팅할 수 있는데 **왜 따로 파는거지 마케팅 진짜 노이해다**"
4. [r/running](https://reddit.com/r/running/comments/12c7or7/what_are_you_wearing_wednesday_weekly_gear_thread/jf4kjei/) — "I'd love something in red **to match my shoes** but **I've had a tough time finding a lot of variety**."
5. [브런치 테니스룩](https://brunch.co.kr/@wonlytoon/30) — "옷과 신발은 보라색인데 모자는 주황색이라면? **깔맞춤 성애자에겐 정말 참기 힘든 상황이다**" / "**너무 다양한 색상을 사다보면 나중에 맞춰 입기 매우 어렵다**"
6. [r/10s](https://reddit.com/r/10s/comments/1ip1vnw/is_there_anybody_else_whose_tennis_outfits_are/mcoldfh/) — "I would have loved to get nike **to match their shoes** ... but I am not paying 2x just for the logo."

**러닝 — 행동 자체 (발췌)**

- "ordered the perfect matching singlet **to match my shoes** for my first marathon"
- "For trail races I usually go grey and blue **to match my shoes**... (**the unmatching shoes are going to drive me crazy**)"
- "**ME TOO!!! I buy outfits to match my shoes.** My first shoes had neon 'don't hit me' yellow and I was SOOOO excited to wear neon."
- "I still **struggle with matching socks** though"

**테니스 — 규범으로 존재** — [r/10s](https://reddit.com/r/10s/comments/1kisext/how_can_i_make_my_forehand_prettier/mrhbk7q/) "**coordinate your shoes and shirt - the mismatched yellows don't work**" (제3자가 지적)

## C. 반대 증거 (26건) — 이쪽도 만만치 않다

**"기능만 본다"** — [r/running 색상 스레드](https://reddit.com/r/running/comments/vybl5x/colorful_or_blackwhite_shoes/)에서 **최다 추천(11점)이 반대편**:

- "**Which ever is in stock or on sale in my size. I don't care what color.**" (최상위)
- "**Function over fashion in the end.**"

**테니스는 깔맞춤이 사회적으로 처벌됨** — 가장 강한 반증:

- "**If you care that much about how you look, are you even there to play?**"
- "to avoid looking like a **full kit wanker**"
- "**I intentionally make sure to NOT match an entire outfit**"
- 매칭 세트 입었다가 "**I got clowned on for it, lol. So maybe don't do that**"

**한국어 반대 — 같은 글 댓글에서 바로 나옴:**

- 디시 러닝갤 1085409 댓글 — "**너무 맞추면** 지나갈 때 쌍따봉 받으면서 화이팅 당해. 가다가 퍼짐" / "**ㅋㅋㅋ 대충해**"
- 디시 러닝갤 1088874 댓글 — "**이런게 진짜 아재스타일인듯** 뭔가 깔맞춤하려고하는"
- [디시 남자패션갤](https://gall.dcinside.com/mgallery/board/view/?id=mf&no=269287) — "뉴비필독) **톤온톤, 깔맞춤 함부로 시도하지마라**"

**클라이밍은 담론 자체가 딴 데 있다** — 신발 스레드는 전부 핏·사이즈: "**Fit is the most important thing.**"

## 이 결과가 제품 판단에 주는 함의

1. **타겟을 클라이머로 잡는 건 근거가 없다.** 클라이밍 신발 담론은 사실상 100% 핏·사이즈다.
2. **가장 뾰족한 건 러닝**이고, 불편의 형태가 구체적이다 — "브랜드가 매칭되는 상의를 아예 안 만든다",
   "세트로 안 팔고 따로 판다", "그 색 상의는 종류가 없다". **검색·필터 제품이 붙을 자리가 여기다.**
3. **"스포츠 전반"으로 넓히면 신호가 희석된다.** 골프는 벨트·모자, 테니스는 브랜드 통일 —
   행동의 성격이 다르고 테니스는 사회적 페널티까지 있다.
4. **반대 목소리를 PRD에 같이 써야 한다.** 세그먼트를 "러너 전체"가 아니라
   **"신발색에 옷을 맞추려는 러너"** 로 좁혀야 하며, **그 크기는 이번 조사로 모른다**(빈도 비율 미측정).

## 4번 조사에서 못 찾은 것

- **에펨코리아** 검색 경로 확보 실패 0건 / **네이버 카페** 원문 인덱싱 안 됨(브런치 1건만)
- **인스타·유튜브** 코디 콘텐츠 — 브라우저 미사용 조건이라 0건
- **클라이밍 한국어** — 스포츠클라이밍 마이너 갤 `깔맞춤` 검색 0건
- ⚠️ **어제의 "적토끼" 단서는 오인**이었다. 적토끼 = 리닝(Li-Ning) 赤兔 러닝화 별명이고, 해당 글들은
  전부 성능·가격 리뷰였다. 색 깔맞춤과 무관. 대신 같은 갤을 `깔맞춤`으로 직접 검색해 위 2건을 찾았다.
