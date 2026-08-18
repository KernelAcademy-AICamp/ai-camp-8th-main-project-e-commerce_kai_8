"use client";

// ViewModel — 상세. goodsNo로 단건 로드. 현재 goodsNo에 settle된 결과만 노출(레이스 안전).
// 상태 변경은 .then()에서만(set-state-in-effect 아님). reject는 repository가 null로 총화.
import { useEffect, useState } from "react";

import { getByGoodsNo } from "@/features/catalog/data/goods-repository";
import type { Goods } from "@/features/catalog/domain/goods";

interface Loaded {
  goodsNo: string;
  goods: Goods | null;
}

export interface GoodsDetailViewModel {
  loading: boolean;
  goods: Goods | null;
}

export function useGoodsDetailViewModel(
  goodsNo: string,
  load: (n: string) => Promise<Goods | null> = getByGoodsNo,
): GoodsDetailViewModel {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let active = true;
    void load(goodsNo).then((goods) => {
      if (active) setLoaded({ goodsNo, goods });
    });
    return () => {
      active = false;
    };
  }, [goodsNo, load]);

  const settled = loaded?.goodsNo === goodsNo;
  return { loading: !settled, goods: settled ? loaded.goods : null };
}
