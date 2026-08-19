"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import curationData from "@/features/curation/data/curations.json";
import type { Curation, CurationItem } from "@/features/curation/domain/curation";
import {
  curationGoodsNo,
  curationProduct,
} from "@/features/curation/domain/curation-product";
import { CurationDetailScreen } from "@/features/curation/presentation/components/curation-detail-screen";
import { CurationList } from "@/features/curation/presentation/components/curation-list";
import { fetchProduct } from "@/features/feed/data/feed-api";
import { DetailLayers } from "@/features/feed/detail/presentation/components/detail-layers";
import { useDetailState } from "@/features/feed/detail/presentation/view-model/use-detail-state";

const curations: Curation[] = curationData;

/**
 * PICKS 칸 — 큐레이션 목록과 상세(고른 상품 9개) 두 화면을 갈아 끼운다.
 *
 * 목록·상세 모두 클라이언트에서 그린다. 상세가 목록의 9개 항목 전부를 필요로 해서
 * curations.json(gzip 20KB)이 이 칸의 청크에 실린다 — 서버 렌더로 감춰 두면 그 데이터를
 * RSC 페이로드로 다시 보내야 해 오히려 커진다.
 */
export function CurationPane() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = curations.find((c) => c.key === openKey) ?? null;
  // 목록으로 돌아왔을 때 보던 자리로 — 칸이 문서 스크롤을 공유해서(use-pane-swipe)
  // 화면을 갈아 끼우면 세로 위치가 그대로 남는다
  const listScrollY = useRef(0);

  const { stack, open: openProduct, requestClose, finishClose } = useDetailState();

  // 상세를 열 때 히스토리를 한 칸 쌓는다 — 기기의 뒤로 가기(가장자리에서 옆으로 밀기,
  // 뒤로 가기 버튼)가 목록으로 되돌린다. 화면 안의 뒤로 가기 줄은 그래서 없앴다.
  // 상품 상세가 위에 떠 있으면 그쪽(use-detail-state)이 먼저 닫히고, 다 닫힌 뒤에야 목록으로.
  useEffect(() => {
    const onPopState = () => {
      if (!stack.some((entry) => entry.phase === "open")) setOpenKey(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [stack]);

  useEffect(() => {
    if (openKey === null) {
      window.scrollTo(0, listScrollY.current);
      return;
    }
    window.scrollTo(0, 0);
  }, [openKey]);

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
    <>
      {open ? (
        <CurationDetailScreen
          curation={open}
          onSelectItem={(item, thumb) => {
            void selectItem(item, thumb);
          }}
        />
      ) : (
        <CurationList
          curations={curations}
          onOpen={(key) => {
            listScrollY.current = window.scrollY;
            setOpenKey(key);
            window.history.pushState({ aTeeCuration: true }, "");
          }}
        />
      )}
      <DetailLayers
        stack={stack}
        onRequestClose={requestClose}
        onClosed={finishClose}
        onSelectProduct={openProduct}
      />
    </>
  );
}
