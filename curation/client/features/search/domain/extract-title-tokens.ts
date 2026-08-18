// 제목 lexical 레인 토큰 추출(설계 §4.5) — 브랜드 소비 토큰 + 구조화 파서가 소비했을
// 표현(색·핏·성별·가격·일반 의류어)을 스톱워드로 제거한 잔여 토큰.
// 파서는 원문 span을 주지 않으므로 스톱워드 접근. 정밀도 우선: 1자·숫자·애매한 토큰은 버린다.

const GENERIC_APPAREL = new Set([
  "티",
  "반팔",
  "반팔티",
  "티셔츠",
  "반팔티셔츠",
  "반소매",
  "숏슬리브",
  "맨투맨",
  "상의",
  "옷",
  "무지",
  "기본",
  "베이직",
  "추천",
  "스타일",
  "느낌",
  "예쁜",
  "이쁜",
  "멋진",
  "간지",
  "인기",
  "신상",
  "요즘",
  "최근",
  "지금",
  "올해",
  "유행",
  "유행하",
  "유행하는",
  "트렌드",
  "트렌디",
  "핫한",
]);
const COLOR_WORDS = new Set([
  "검정",
  "검은",
  "검정색",
  "블랙",
  "흰",
  "흰색",
  "하얀",
  "화이트",
  "회색",
  "그레이",
  "네이비",
  "남색",
  "곤색",
  "파란",
  "파랑",
  "파란색",
  "블루",
  "빨간",
  "빨강",
  "빨간색",
  "레드",
  "노란",
  "노랑",
  "노란색",
  "옐로우",
  "초록",
  "초록색",
  "그린",
  "카키",
  "베이지",
  "브라운",
  "갈색",
  "핑크",
  "분홍",
  "보라",
  "퍼플",
  "주황",
  "오렌지",
  "민트",
  "아이보리",
  "연청",
  "진청",
  "버건디",
  "와인",
]);
const FIT_SIZE_GENDER = new Set([
  "오버핏",
  "오버",
  "루즈핏",
  "루즈",
  "레귤러핏",
  "레귤러",
  "슬림핏",
  "슬림",
  "크롭",
  "박시",
  "남자",
  "남성",
  "여자",
  "여성",
  "공용",
  "남녀공용",
  "유니섹스",
  "커플",
  "사이즈",
  "프리사이즈",
  "빅사이즈",
]);
const PRICE_WORDS = new Set([
  "원",
  "만원",
  "이하",
  "이상",
  "미만",
  "이내",
  "언더",
  "만원대",
  "저렴한",
  "싼",
  "가성비",
  "세일",
]);
const ETC_STOP = new Set(["좀", "그냥", "같은", "같이", "말고", "제외", "빼고"]);

const STOPWORDS = [
  GENERIC_APPAREL,
  COLOR_WORDS,
  FIT_SIZE_GENDER,
  PRICE_WORDS,
  ETC_STOP,
];
const NUMERIC = /^\d+([만천]?원?대?)?$/;
const MAX_TITLE_TOKENS = 4;

// 설계 §4.5 — 조사 제거. 정밀도 우선의 보수적 구현: 끝에 붙은 조사 1개만,
// 제거 후 잔여 길이가 2자 이상일 때만 벗긴다(1자 잔여는 애매하므로 원문 유지).
const TWO_CHAR_JOSA = ["으로", "에서", "부터", "까지", "처럼", "마다", "조차", "보다"];
const ONE_CHAR_JOSA = [
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "의",
  "도",
  "만",
  "와",
  "과",
  "랑",
  "엔",
  "에",
];

export function stripJosa(tok: string): string {
  for (const j of TWO_CHAR_JOSA) {
    if (tok.endsWith(j) && tok.length - j.length >= 2) return tok.slice(0, -j.length);
  }
  for (const j of ONE_CHAR_JOSA) {
    if (tok.endsWith(j) && tok.length - j.length >= 2) return tok.slice(0, -j.length);
  }
  return tok;
}

export function extractTitleTokens(
  query: string,
  consumedBrandTokens: string[],
): string[] {
  const consumed = new Set(consumedBrandTokens.map((t) => t.toLowerCase()));
  const out: string[] = [];
  const seen = new Set<string>(); // 대소문자 무시 dedup 키
  for (const raw of query.normalize("NFKC").split(/\s+/)) {
    const tok = raw.trim();
    if (!tok) continue;
    const low = tok.toLowerCase();
    if (consumed.has(low)) continue;
    const stripped = stripJosa(tok);
    const key = stripped.toLowerCase();
    if (stripped.length < 2) continue; // 1자 토큰은 애매 → 버림(정밀도 우선)
    if (NUMERIC.test(key)) continue;
    if (STOPWORDS.some((set) => set.has(key))) continue;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(stripped);
    }
    if (out.length >= MAX_TITLE_TOKENS) break;
  }
  return out;
}
