"use client";

/**
 * 최근 본 제품 — 상세를 연 순서대로 기억한다.
 *
 * **노출(`recentImpressions`)과 다르다.** 그쪽은 스크롤로 지나가기만 해도 쌓여
 * "본 제품"이 아니다. 여기에는 사람이 실제로 열어본 것만 들어간다.
 *
 * 사진 주소를 함께 넣어 두는 이유는, 나중에 상품번호로 다시 조회하지 않기
 * 위해서다 — 상세를 여는 순간 이미 상품을 손에 쥐고 있다.
 *
 * 기기에만 남는다(계정 동기화 없음). 저장소를 못 쓰는 환경에서는 조용히 비활성이다.
 */
const KEY = "atee.recent-products.v1";
/** 시안의 띠는 몇 장만 보여주고 나머지는 "전체 보기"로 넘긴다 */
const LIMIT = 20;

export interface RecentProduct {
  goodsNo: number;
  thumbnail: string;
  /** 본 시각(ms). 옛 기록에는 없어 0으로 읽힌다 */
  at: number;
}

function read(): RecentProduct[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 시각은 나중에 들어온 필드다 — 없는 옛 기록은 0으로 맞춰 둔다.
    return parsed.flatMap((item): RecentProduct[] => {
      if (typeof item !== "object" || item === null) return [];
      const row = item as Partial<RecentProduct>;
      if (typeof row.goodsNo !== "number" || typeof row.thumbnail !== "string") {
        return [];
      }
      return [
        {
          goodsNo: row.goodsNo,
          thumbnail: row.thumbnail,
          at: typeof row.at === "number" ? row.at : 0,
        },
      ];
    });
  } catch {
    return [];
  }
}

/** 최근 본 제품 목록 (최신 앞, 중복 없음) */
export function readRecentProducts(): RecentProduct[] {
  return read();
}

/** 상세를 열 때 부른다. 이미 있던 것은 맨 앞으로 올라온다. */
export function recordRecentProduct(entry: Omit<RecentProduct, "at">): void {
  if (entry.thumbnail === "") return;
  try {
    const stamped: RecentProduct = { ...entry, at: Date.now() };
    const next = [stamped, ...read().filter((x) => x.goodsNo !== entry.goodsNo)].slice(
      0,
      LIMIT,
    );
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 저장소를 못 쓰는 환경 — 기억하지 않는다. 화면은 빈 띠로 나온다.
  }
}
