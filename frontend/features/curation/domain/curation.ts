// 큐레이션 화면 데이터 모양. curation/backend/scripts/gen_curation_page.py 가 뽑아 쓴 JSON과 1:1이다.
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
  /** 손으로 쓴 한마디 (없으면 "") */ note: string;
}

export interface Curation {
  key: string;
  title: string;
  /** 선별 조건 라벨 */ cond: string[];
  /** 소개 문단 */ lede: string;
  /** 조건에 맞는 전체 상품 수 (상위 몇 개만 items에 담긴다) */ n: number;
  items: CurationItem[];
  /** 작성일 YYYY.MM.DD — DB created_at */ date: string;
}
