"use client";

import { useRef } from "react";

import curationData from "@/features/curation/data/curations.json";
import type { Curation } from "@/features/curation/domain/curation";
import { CurationDetailScreen } from "@/features/curation/presentation/components/curation-detail-screen";
import { CurationList } from "@/features/curation/presentation/components/curation-list";
import { useCurationScreen } from "@/features/curation/presentation/view-model/use-curation-screen";
import { useForYouOrder } from "@/features/curation/presentation/view-model/use-for-you-order";
import { getDisplayName, type SignedInState } from "@/shared/supabase/session-state";
import { useSignedIn } from "@/shared/supabase/use-signed-in";

const curations: Curation[] = curationData;

/**
 * 목록 위 한 줄.
 *
 * 판정 전(unknown)에는 로그인 여부를 말하지 않는다 — 서버 렌더에는 세션이 없어
 * 첫 화면은 언제나 이 상태다. 여기서 "로그인하세요"를 그리면 로그인한 사람에게
 * 그 문구가 한 번 스쳤다 이름으로 바뀐다.
 */
function greeting(signedIn: SignedInState, name: string | null): string {
  if (signedIn === "unknown") return "취향대로 고른 티셔츠";
  if (signedIn === "out") return "로그인하면 취향대로 골라드려요";
  return `${name ?? "회원"}님을 위해 골랐어요`;
}

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
  const signedIn = useSignedIn();
  const {
    openKey,
    open: openCuration,
    back,
    shownCount,
    showMore,
  } = useCurationScreen(rootRef);
  // 내 성별 상품만 남기고, 내가 반응한 상품이 걸리는 큐레이션을 앞으로 — 첫 화면
  // 6장이 그 사람 것이 된다. 걸린 것이 없으면(콜드스타트·비회원) 기본 순서 그대로다.
  const ranked = useForYouOrder(curations, rootRef);
  // 상세도 **거른 목록에서** 찾는다 — 전체에서 찾으면 슬라이드에 다른 성별이 되살아난다.
  // 아직 안 붙인 큐레이션도 여기 들어 있어, 뒤로 갔다 와도 열려 있던 것이 그대로 열린다.
  const open = ranked.find((c) => c.key === openKey) ?? null;
  // 첫 화면은 앞의 몇 장만. 나머지는 바닥이 가까워질 때마다 한 묶음씩 붙는다.
  const visible = ranked.slice(0, shownCount);

  return (
    <div ref={rootRef}>
      {open ? (
        <CurationDetailScreen curation={open} onBack={back} />
      ) : (
        <>
          <p className="px-3 pt-4 text-[15px] font-bold tracking-[-0.02em] text-white">
            {greeting(signedIn, getDisplayName())}
          </p>
          <CurationList
            curations={visible}
            onOpen={openCuration}
            moreCount={ranked.length - visible.length}
            onShowMore={showMore}
          />
        </>
      )}
    </div>
  );
}
