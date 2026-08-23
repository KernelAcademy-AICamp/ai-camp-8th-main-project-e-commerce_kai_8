"use client";

import type { Product } from "@/features/feed/domain/product";

/**
 * 최근 본 제품 — 상세를 연 순서대로 기억한다.
 *
 * **노출과 다르다.** 프로필의 `recentImpressions`는 스크롤로 지나가기만 해도 쌓여
 * "본 제품"이 아니다. 여기에는 사람이 실제로 열어본 것만 들어간다.
 *
 * **상품을 통째로 담는다.** 사진만 담으면 띠에 그릴 수는 있어도 **눌러서 다시 열
 * 수가 없다** — 상세를 여는 데 필요한 값들이 없기 때문이다. 상세를 여는 순간
 * 이미 상품을 손에 쥐고 있으므로 그때 그대로 적어 두면 나중에 다시 조회하지 않아도 된다.
 *
 * 기기에만 남는다(계정 동기화 없음). 저장소를 못 쓰는 환경에서는 조용히 비활성이다.
 */
const KEY = "atee.recent-products.v2";
/** 너무 오래 들고 있지 않는다 — 띠는 몇 장만 보여준다 */
const LIMIT = 20;

export interface RecentProduct {
  product: Product;
  /** 본 시각(ms) */
  at: number;
}

/** 이 기록이 바뀌었음을 화면에 알린다 — 같은 탭 안에서는 storage 이벤트가 안 온다 */
const CHANGED = "atee:recent-products";

function read(): RecentProduct[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): RecentProduct[] => {
      if (typeof item !== "object" || item === null) return [];
      const row = item as Partial<RecentProduct>;
      const product = row.product;
      if (
        product === undefined ||
        typeof product.goodsNo !== "number" ||
        typeof product.thumbnail !== "string"
      ) {
        return [];
      }
      return [{ product, at: typeof row.at === "number" ? row.at : 0 }];
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
export function recordRecentProduct(product: Product): void {
  if (product.thumbnail === "") return;
  try {
    const next = [
      { product, at: Date.now() },
      ...read().filter((x) => x.product.goodsNo !== product.goodsNo),
    ].slice(0, LIMIT);
    localStorage.setItem(KEY, JSON.stringify(next));
    dispatchEvent(new Event(CHANGED));
  } catch {
    // 저장소를 못 쓰는 환경 — 기억하지 않는다. 화면은 빈 띠로 나온다.
  }
}

/** 기록이 바뀔 때마다 부른다. 화면이 떠 있는 채로 새로 본 것도 바로 들어온다. */
export function onRecentProductsChange(listener: () => void): () => void {
  addEventListener(CHANGED, listener);
  return () => {
    removeEventListener(CHANGED, listener);
  };
}
