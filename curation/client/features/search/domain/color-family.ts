// 색 계열 접기 + 바탕색 매핑. 순수 함수(프레임워크 독립).
// 역할 분리 계약(2026-08-10 결정): 상품 colors(판매자 옵션)가 색 값의 진실이고,
// prints 원소의 base_colors(사진 관측)는 "이 원소가 어느 컬러웨이의 관측인지"를
// colors에 연결하는 매핑 키로만 쓴다 — 검색·표시 값으로 직접 쓰지 않는다.
// (근거: 라벨 1,892건 중 40%가 표기·톤·컬러웨이 범위 차이로 colors와 불일치)

// 톤 접두 — 사진 추출은 조명에 취약해 톤 구분을 신뢰하지 않는다.
const TONE_PREFIXES = ["라이트", "다크", "딥", "페일", "연", "진"];

// 동일 계열 별칭 → 대표 계열. 네이비·카키처럼 별개 캐논 색은 넣지 않는다(과확장 금지).
// 확장(2026-08-10)은 라벨↔colors 유실 실측에서 관찰된 쌍만 — 임의 추측으로 넓히지 않는다.
// 톤 접두를 먼저 떼고 조회하므로 값은 접두 제거 후 형태로 적는다(다크베이지→베이지→브라운).
const FAMILY: Record<string, string> = {
  차콜: "그레이",
  아이보리: "화이트",
  크림: "화이트",
  라벤더: "퍼플",
  버건디: "와인",
  라임: "그린",
  // 올리브는 그린이 아니라 카키로 — 카키를 별개 캐논으로 유지하면서 올리브그린 표기를 잇는다.
  올리브그린: "카키",
  올리브: "카키",
  피치: "핑크",
  베이지: "브라운",
  오트밀: "브라운",
};

/** 색 표기를 계열 키로 접는다 — 공백 제거 → 톤 접두 제거 → 계열 별칭 접기. */
export function foldColorKey(color: string): string {
  let s = color.replace(/\s+/g, "");
  for (const p of TONE_PREFIXES) {
    if (s.startsWith(p) && s.length > p.length) {
      s = s.slice(p.length);
      break;
    }
  }
  return FAMILY[s] ?? s;
}

/**
 * 관측 바탕색들을 이 상품 colors 중 같은 계열인 판매자 표기로 연결한다.
 * 정확 일치 우선, 없으면 계열 일치. 아무 데도 연결되지 않으면 빈 배열
 * (= 다른 컬러웨이의 관측 — 이 단품의 결속·표시에 쓰지 않는다).
 */
export function mapBaseToProductColors(
  baseColors: string[],
  productColors: string[],
): string[] {
  const norm = (s: string): string => s.replace(/\s+/g, "");
  const byExact = new Map(productColors.map((c) => [norm(c), c]));
  const byFamily = new Map<string, string>();
  for (const c of productColors) {
    const key = foldColorKey(c);
    if (!byFamily.has(key)) byFamily.set(key, c);
  }

  const out: string[] = [];
  for (const base of baseColors) {
    const hit = byExact.get(norm(base)) ?? byFamily.get(foldColorKey(base));
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}
