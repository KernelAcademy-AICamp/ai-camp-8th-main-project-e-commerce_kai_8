// 큐레이션 화면 데이터 모양. backend/scripts/gen_curation_page.py 가 뽑아 쓴 JSON과 1:1이다.
// 키가 짧은 건 목업 HTML에 그대로 인라인되던 데이터라서다 — 매핑 계층은 두지 않는다.

export interface CurationItem {
  /** 상품명 */ t: string;
  /** 브랜드 */ b: string;
  /** 판매가(원) */ p: number;
  /** 썸네일 URL */ img: string;
  /** 리뷰 수 */ rc: number;
  /** 리뷰 평점 (없으면 null) */ rs: number | null;
  /** 누적 구매 수 */ buy: number;
  /** 무신사 상품 페이지 */ u: string;
  /** 짧은 태그 최대 3개 */ tg: string[];
  /** 이 상품을 왜 넣었는지 한마디 — 리뷰 AI 요약(sentimentSummary.positive)에서 고른 문장 (없으면 "") */
  note: string;
  /** 슬라이드 한 장의 제목. 사람이 쓴다 (없으면 안 그린다) */ head?: string;
  /** 아쉬운 점 — 리뷰 AI 요약의 negative에서 고른 문장 (없으면 안 그린다) */ con?: string;
  /** 아쉬운 점 줄의 라벨. 불만이 없는 상품은 "불만 요약"으로 쓴다 */ conLabel?: string;
  /** 상품 정보를 여는 버튼을 옷 위에 놓을 자리 [x%, y%] (없으면 한가운데).
   *  JSON import가 튜플로 좁혀지지 않아 number[]로 둔다 — 읽는 쪽에서 기본값을 채운다. */
  pos?: number[];
  /** 썸네일 원본 크기. 목록 카드 영역을 미리 잡는다 (없으면 500×600 — 실측 450장 중 91%가 이 크기) */
  w?: number;
  h?: number;
}

export interface Curation {
  key: string;
  title: string;
  /** 선별 조건 라벨 */ cond: string[];
  /** 소개 문단 */ lede: string;
  /** 조건에 맞는 전체 상품 수 (상위 몇 개만 items에 담긴다) */ n: number;
  items: CurationItem[];
  /** 작성일 YYYY.MM.DD — DB created_at */ date: string;
  /** 상황 색. 상세의 번호와 장 제목에만 쓴다 (없으면 흰색) */ accent?: string;
}
