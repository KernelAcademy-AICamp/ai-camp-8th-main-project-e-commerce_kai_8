"use client";

// View: 큐레이션 상세 — 고른 상품을 한 장씩 넘기는 슬라이드.
// 세로로 쌓으면 훑고 지나가서 한마디를 안 읽는다. 한 장씩이어야 한 개씩 본다.
// 상품 정보(브랜드·상품명·가격)는 사진 위 버튼을 눌러야 나온다 — 감추는 게 아니라 순서를 정하는 것이다.
import Image from "next/image";
import type { CSSProperties } from "react";

import type { Curation } from "@/features/curation/domain/curation";
import { curationGoodsNo } from "@/features/curation/domain/curation-product";
import { useCurationSlides } from "@/features/curation/presentation/view-model/use-curation-slides";
import { formatPrice } from "@/features/feed/domain/format-price";
import { BackIcon, CloseIcon, PlusIcon } from "@/shared/icons";
import { logAction } from "@/shared/signals/signals";

/** pos가 없거나 짝이 안 맞는 상품의 버튼 자리 */
const DEFAULT_X = 50;
const DEFAULT_Y = 52;

export function CurationDetailScreen({
  curation,
  onBack,
}: {
  curation: Curation;
  onBack: () => void;
}) {
  const { trackRef, index, openInfo, onScroll, step, toggleInfo } = useCurationSlides();

  const last = curation.items.length - 1;

  return (
    /* 셸 헤더·탭바까지 덮는다 — 상품 상세와 같은 전체화면. 안 덮으면 로고줄과
       BROWSE/FOR YOU 탭이 상세 위에 남아 "지금 어디인지"가 두 겹으로 보인다.
       z는 상품 상세(z-50)보다 아래 — 여기서 상품을 열면 그게 위로 와야 한다. */
    <div
      className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-app"
      style={{ "--accent": curation.accent ?? "#FAFAFA" } as CSSProperties}
    >
      <div className="mx-auto max-w-md pb-16">
        {/* 뒤로가기 좌표를 마이페이지와 맞춘다 — 왼쪽 16px·위 8px (전 화면 공통).
            상세는 기기 뒤로 가기로도 닫힌다. */}
        <header className="flex items-center px-4 py-2">
          <button
            type="button"
            aria-label="뒤로 가기"
            onClick={onBack}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-ink-soft"
          >
            <BackIcon />
          </button>
        </header>
        <h2 className="px-4 text-2xl leading-tight font-semibold tracking-tight text-ink">
          {curation.title}
        </h2>

        <p className="px-4 pt-4 text-base leading-relaxed text-ink">{curation.lede}</p>
        <p className="mx-4 mt-3 border-t border-line pt-3 text-sm leading-relaxed text-ink-soft">
          {curation.cond.join(" · ")}
        </p>

        <p className="pt-4 pb-2 text-center font-mono text-xs tracking-wider text-ink-muted tabular-nums">
          <b className="text-sm font-semibold text-(--accent)">{index + 1}</b> /{" "}
          {curation.items.length}
        </p>

        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory scroll-smooth overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] overscroll-x-contain [&::-webkit-scrollbar]:hidden"
        >
          {curation.items.map((item, i) => {
            const x = item.pos?.[0] ?? DEFAULT_X;
            const y = item.pos?.[1] ?? DEFAULT_Y;
            return (
              <div key={item.u} className="w-full flex-none snap-center px-9">
                <div className="relative">
                  <button
                    type="button"
                    aria-expanded={openInfo === i}
                    aria-label="상품 정보 보기"
                    className="block w-full cursor-pointer"
                    onClick={() => {
                      toggleInfo(i);
                    }}
                  >
                    <Image
                      src={item.img}
                      alt={item.t}
                      width={item.w ?? 500}
                      height={item.h ?? 600}
                      sizes="100vw"
                      className="h-auto w-full rounded-xl bg-skel-1"
                    />
                    <span
                      className="absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-thumb/95 text-accent-ink shadow"
                      style={{ left: `${String(x)}%`, top: `${String(y)}%` }}
                    >
                      {openInfo === i ? <CloseIcon /> : <PlusIcon />}
                    </span>
                  </button>

                  {/* 제목과 한마디를 사진 안에 얹는다 — 사진과 말이 한 장이 된다.
                      상품 사진은 대개 흰 배경이라 그냥 얹으면 흰 글씨가 사라진다.
                      목록 카드와 같은 방식으로 글이 놓인 쪽만 어둡게 깐다.

                      **아래에만 모은다.** 위에도 깔면 모델컷에서 그늘이 얼굴을
                      가로지르는데, 사진 아래쪽은 대개 여백이거나 다리라서 덜 아깝다.
                      탭은 사진이 받아야 하므로 글은 포인터를 먹지 않는다.

                      정보 카드가 열리면 같은 자리를 카드가 쓴다 — 고른 이유 대신 상품 정보. */}
                  {openInfo !== i && (item.head ?? item.note) && (
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-xl bg-gradient-to-t from-black/75 via-black/25 via-50% to-transparent px-4 pt-16 pb-4 text-center">
                      {item.head && (
                        <span className="block text-xl leading-tight font-bold tracking-tight text-(--accent)">
                          {item.head}
                        </span>
                      )}
                      {item.note && (
                        <span className="mt-1.5 block text-[14.5px] leading-relaxed text-white">
                          {item.note}
                        </span>
                      )}
                    </span>
                  )}

                  {openInfo === i && (
                    /* 정보 카드를 누르면 **판매처(무신사)로 곧장 나간다.** 앱 안 상세를
                       한 겹 더 거치면, 큐레이션이 골라 준 한마디를 읽고 마음을 정한
                       사람이 같은 상품을 처음부터 다시 보게 된다. */
                    <a
                      href={item.u}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute inset-x-2.5 bottom-2.5 flex cursor-pointer items-center gap-2.5 rounded-lg bg-thumb neo-sm p-2.5 text-left shadow-lg"
                      onClick={() => {
                        // 나가는 것도 취향 신호다. 앱 안 상세를 거치지 않게 되면서
                        // 여기가 큐레이션에서 상품에 대한 행동을 잡는 유일한 지점이다.
                        const goodsNo = curationGoodsNo(item.u);
                        if (goodsNo !== null) logAction("outbound", goodsNo);
                      }}
                    >
                      {/* size-auto 계열을 쓰면 next/image의 width·height 속성이 무시돼
                        원본 크기로 커진다 — 픽셀을 직접 고정한다. */}
                      <Image
                        src={item.img}
                        alt=""
                        width={46}
                        height={55}
                        className="h-[55px] w-[46px] flex-none rounded object-cover"
                      />
                      <span className="min-w-0">
                        <span className="block text-[11px] text-ink">{item.b}</span>
                        <span className="block truncate text-[12.5px] font-medium text-accent-ink">
                          {item.t}
                        </span>
                        <span className="block text-[13px] font-semibold text-accent-ink tabular-nums">
                          {formatPrice(item.p)}
                        </span>
                      </span>
                    </a>
                  )}

                  {i === index && i > 0 && (
                    <button
                      type="button"
                      aria-label="이전"
                      onClick={() => {
                        step(-1);
                      }}
                      className="absolute top-1/2 -left-8 h-11 w-8 -translate-y-1/2 cursor-pointer text-3xl leading-none text-ink-muted"
                    >
                      ‹
                    </button>
                  )}
                  {i === index && i < last && (
                    <button
                      type="button"
                      aria-label="다음"
                      onClick={() => {
                        step(1);
                      }}
                      className="absolute top-1/2 -right-8 h-11 w-8 -translate-y-1/2 cursor-pointer text-3xl leading-none text-ink-muted"
                    >
                      ›
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
