"use client";

import { useCallback, useRef } from "react";

import curationData from "@/features/curation/data/curations.json";
import type { Curation, CurationItem } from "@/features/curation/domain/curation";
import {
  curationGoodsNo,
  curationProduct,
} from "@/features/curation/domain/curation-product";
import { CurationDetailScreen } from "@/features/curation/presentation/components/curation-detail-screen";
import { CurationList } from "@/features/curation/presentation/components/curation-list";
import { useCurationScreen } from "@/features/curation/presentation/view-model/use-curation-screen";
import { fetchProduct } from "@/features/feed/data/feed-api";
import { DetailLayers } from "@/features/feed/detail/presentation/components/detail-layers";
import { useDetailState } from "@/features/feed/detail/presentation/view-model/use-detail-state";

const curations: Curation[] = curationData;

/**
 * FOR YOU 칸 — 큐레이션 목록과 상세(고른 상품 9개) 두 화면을 갈아 끼운다.
 *
 * 목록·상세 모두 클라이언트에서 그린다. 상세가 목록의 9개 항목 전부를 필요로 해서
 * curations.json(gzip 20KB)이 이 칸의 청크에 실린다 — 서버 렌더로 감춰 두면 그 데이터를
 * RSC 페이로드로 다시 보내야 해 오히려 커진다.
 */
export function CurationPane() {
  // 이 화면을 굴리는 것은 자신이 놓인 칸이다(home-shell). 목록 자리를 저장·복원하는
  // 훅이 그 칸을 스스로 찾도록 자리만 알려 준다 (shared/scroll).
  const rootRef = useRef<HTMLDivElement>(null);
  const { openKey, open: openCuration, back } = useCurationScreen(rootRef);
  const open = curations.find((c) => c.key === openKey) ?? null;

  const {
    stack,
    open: openProduct,
    requestClose,
    finishClose,
  } = useDetailState("curation");

  const selectItem = useCallback(
    async (item: CurationItem, thumb: DOMRect) => {
      const goodsNo = curationGoodsNo(item.u);
      if (goodsNo === null) return;
      // 큐레이션 JSON엔 갤러리·치수가 없어 DB에서 온전한 상품을 가져온다.
      // 실패하면 가진 정보만으로 연다 — 탭이 아무 반응 없이 죽는 게 더 나쁘다.
      let product = curationProduct(item, goodsNo);
      try {
        product = (await fetchProduct(goodsNo)) ?? product;
      } catch {
        // 폴백 상품 그대로 사용
      }
      openProduct(product, {
        top: thumb.top,
        left: thumb.left,
        width: thumb.width,
        height: thumb.height,
      });
    },
    [openProduct],
  );

  return (
    <div ref={rootRef}>
      {open ? (
        <CurationDetailScreen
          curation={open}
          onBack={back}
          onSelectItem={(item, thumb) => {
            void selectItem(item, thumb);
          }}
        />
      ) : (
        <CurationList curations={curations} onOpen={openCuration} />
      )}
      <DetailLayers
        stack={stack}
        onRequestClose={requestClose}
        onClosed={finishClose}
        onSelectProduct={openProduct}
      />
    </div>
  );
}
