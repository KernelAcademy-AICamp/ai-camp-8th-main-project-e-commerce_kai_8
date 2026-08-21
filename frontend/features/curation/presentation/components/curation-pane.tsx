"use client";

import { useRef } from "react";

import curationData from "@/features/curation/data/curations.json";
import type { Curation } from "@/features/curation/domain/curation";
import { CurationDetailScreen } from "@/features/curation/presentation/components/curation-detail-screen";
import { CurationList } from "@/features/curation/presentation/components/curation-list";
import { useCurationScreen } from "@/features/curation/presentation/view-model/use-curation-screen";

const curations: Curation[] = curationData;

/**
 * FOR YOU 칸 — 큐레이션 목록과 상세(고른 상품 9개) 두 화면을 갈아 끼운다.
 *
 * 목록·상세 모두 클라이언트에서 그린다. 상세가 목록의 9개 항목 전부를 필요로 해서
 * curations.json(gzip 20KB)이 이 칸의 청크에 실린다 — 서버 렌더로 감춰 두면 그 데이터를
 * RSC 페이로드로 다시 보내야 해 오히려 커진다.
 *
 * **앱 안 상품 상세는 여기서 열리지 않는다.** 정보 카드가 판매처로 곧장 나간다.
 */
export function CurationPane() {
  // 이 화면을 굴리는 것은 자신이 놓인 칸이다(home-shell). 목록 자리를 저장·복원하는
  // 훅이 그 칸을 스스로 찾도록 자리만 알려 준다 (shared/scroll).
  const rootRef = useRef<HTMLDivElement>(null);
  const { openKey, open: openCuration, back } = useCurationScreen(rootRef);
  const open = curations.find((c) => c.key === openKey) ?? null;

  return (
    <div ref={rootRef}>
      {open ? (
        <CurationDetailScreen curation={open} onBack={back} />
      ) : (
        <CurationList curations={curations} onOpen={openCuration} />
      )}
    </div>
  );
}
