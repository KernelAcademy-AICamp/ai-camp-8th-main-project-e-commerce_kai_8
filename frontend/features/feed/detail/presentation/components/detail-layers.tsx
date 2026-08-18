"use client";

import type {
  DetailEntry,
  OriginRect,
} from "@/features/feed/detail/domain/detail-stack";
import { ProductDetail } from "@/features/feed/detail/presentation/components/product-detail";
import type { Product } from "@/features/feed/domain/product";

// 산 채로 유지하는 상세 레이어 수 — 뒤로가기 시 재마운트(번쩍임) 없이 즉시
// 드러난다. 이보다 깊은 체인은 메모리를 위해 언마운트한다(복귀 시에만 재로딩).
const LIVE_DETAIL_LAYERS = 3;

/** 상세 체인 스택을 화면에 얹는다 — 피드·큐레이션 등 상세를 여는 모든 화면이 공유한다. */
export function DetailLayers({
  stack,
  onRequestClose,
  onClosed,
  onSelectProduct,
}: {
  stack: DetailEntry[];
  onRequestClose: () => void;
  onClosed: () => void;
  onSelectProduct: (
    product: Product,
    originRect: OriginRect | null,
    currentScrollTop: number,
  ) => void;
}) {
  const liveLayers = stack.slice(-LIVE_DETAIL_LAYERS);
  return (
    <>
      {liveLayers.map((entry, i) => {
        // 스택 안 위치는 push/pop이 끝에서만 일어나 안정적 — key로 쓴다
        const stackIndex = stack.length - liveLayers.length + i;
        return (
          <ProductDetail
            key={`detail-${String(stackIndex)}-${String(entry.product.goodsNo)}`}
            entry={entry}
            active={i === liveLayers.length - 1}
            onRequestClose={onRequestClose}
            onClosed={onClosed}
            onSelectProduct={onSelectProduct}
          />
        );
      })}
    </>
  );
}
