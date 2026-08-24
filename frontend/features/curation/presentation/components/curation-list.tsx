// View: 큐레이션 목록 — BROWSE 피드와 같은 2열 모자이크. 카드 하나가 통째로 버튼이다(누르면 상세).
// 탭을 넘겨도 손이 같은 격자를 만나도록 피드의 배치 계산을 그대로 쓴다.
// 원형은 별개 제품 "티:파운드"(search-by-llm)의 같은 화면이다. 그 폴더는 2026-08-20에
// 저장소에서 뺐다 — 원본을 보려면 git 이력을 봐야 한다.
"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

import type { Curation } from "@/features/curation/domain/curation";
// 배치 계산만 가져오는 feature 간 참조 — 두 탭의 격자 리듬이 어긋나면 안 된다.
import { distributeToColumns } from "@/features/feed/domain/masonry";
import { nearestScrollRoot } from "@/shared/scroll/nearest-scroll-root";

/** 썸네일 크기가 JSON에 없을 때. 실측 450장 중 409장이 이 크기다. */
const FALLBACK_WIDTH = 500;
const FALLBACK_HEIGHT = 600;

export function CurationList({
  curations,
  onOpen,
  moreCount,
  onShowMore,
}: {
  curations: Curation[];
  onOpen: (key: string) => void;
  /** 아직 안 붙인 큐레이션 수. 0이면 센티널을 그리지 않는다. */
  moreCount: number;
  /** 바닥이 가까워지면 다음 묶음을 붙인다. */
  onShowMore: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onShowMore();
      },
      {
        // 이 목록을 굴리는 것은 화면이 아니라 홈의 칸이다. 뷰포트를 기준으로 재면
        // 아래 600px이 칸 밖이라 잘려, 바닥에 닿아야 다음 묶음이 붙는다 (피드와 같은 이유).
        root: nearestScrollRoot(sentinel),
        rootMargin: "600px 0px",
      },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
    // 묶음이 붙어 moreCount가 줄면 다시 건다 — 센티널이 계속 보이는 동안 이어서 붙인다.
  }, [moreCount, onShowMore]);

  const sized = curations
    .filter((curation) => curation.items.length > 0)
    .map((curation) => {
      const cover = curation.items[0];
      return {
        curation,
        cover,
        width: cover.w ?? FALLBACK_WIDTH,
        height: cover.h ?? FALLBACK_HEIGHT,
      };
    });

  return (
    <>
      <div className="flex items-start gap-2 px-3 pt-3">
        {distributeToColumns(sized, 2).map((column, columnIndex) => (
          <div
            key={`curation-col-${String(columnIndex)}`}
            className="flex min-w-0 flex-1 flex-col gap-2"
          >
            {column.map(({ curation, cover, width, height }) => (
              <button
                key={curation.key}
                type="button"
                className="relative block w-full cursor-pointer overflow-hidden rounded-xl bg-surface text-left"
                onClick={() => {
                  onOpen(curation.key);
                }}
              >
                <Image
                  src={cover.img}
                  alt={curation.title}
                  width={width}
                  height={height}
                  sizes="50vw"
                  className="h-auto w-full"
                />
                {/* 카드 아래 절반만 어둡게 깐다. 짧고 진한 그라데이션은 끝나는 자리에
                    띠처럼 선이 보이므로, 길게 늘이고 옅게 깔아 경계를 지운다. */}
                <span className="absolute inset-x-0 top-1/2 bottom-0 bg-gradient-to-t from-black/70 via-black/20 via-55% to-transparent" />
                <span className="absolute inset-x-0 bottom-0 px-3 pb-3">
                  {/* 칸이 좁아 24자짜리 제목은 세 줄까지 늘어진다. 두 줄에서 자른다 —
                    사진을 덮는 것보다 뒤가 잘리는 게 낫고, 앞 두 줄이면 무슨 축인지는 읽힌다. */}
                  <span className="line-clamp-2 block text-[16px] leading-[1.25] font-bold tracking-[-0.03em] break-keep text-white">
                    {curation.title}
                  </span>
                  <span className="mt-1.5 block text-[11px] text-white/70">
                    {curation.items.length}개
                  </span>
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {moreCount > 0 && <div ref={sentinelRef} className="h-px" />}
    </>
  );
}
