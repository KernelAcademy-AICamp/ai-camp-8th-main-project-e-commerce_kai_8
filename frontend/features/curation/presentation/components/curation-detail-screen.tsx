"use client";

// View: 큐레이션 상세 — 고른 상품을 한 장씩 넘기는 슬라이드.
// 세로로 쌓으면 훑고 지나가서 한마디를 안 읽는다. 한 장씩이어야 한 개씩 본다.
// 상품 정보(브랜드·상품명·가격)는 사진 위 버튼을 눌러야 나온다 — 감추는 게 아니라 순서를 정하는 것이다.
import Image from "next/image";
import type { CSSProperties } from "react";

import type { Curation, CurationItem } from "@/features/curation/domain/curation";
import { useCurationSlides } from "@/features/curation/presentation/view-model/use-curation-slides";
import { formatPrice } from "@/features/feed/domain/format-price";

/** pos가 없거나 짝이 안 맞는 상품의 버튼 자리 */
const DEFAULT_X = 50;
const DEFAULT_Y = 52;

export function CurationDetailScreen({
  curation,
  onBack,
  onSelectItem,
}: {
  curation: Curation;
  onBack: () => void;
  onSelectItem: (item: CurationItem, thumb: DOMRect) => void;
}) {
  const { trackRef, index, openInfo, onScroll, step, toggleInfo } = useCurationSlides();

  const last = curation.items.length - 1;

  return (
    <div
      className="pb-16"
      style={{ "--accent": curation.accent ?? "#FAFAFA" } as CSSProperties}
    >
      {/* sticky를 걸지 않는다 — 셸 헤더와 탭바가 위에 겹쳐 어차피 안 보인다.
          상세는 기기 뒤로 가기로도 닫힌다. */}
      <div className="border-b border-neutral-800 px-4 pt-2.5 pb-3">
        <button
          type="button"
          onClick={onBack}
          className="cursor-pointer text-[11px] tracking-[0.1em] text-neutral-500"
        >
          ← PICKS
        </button>
        <h2 className="pt-1 text-base leading-tight font-semibold tracking-tight text-white">
          {curation.title}
        </h2>
      </div>

      <p className="px-4 pt-4 text-[13px] leading-relaxed text-neutral-400">
        {curation.lede}
      </p>
      <p className="mx-4 mt-3 border-t border-neutral-800 pt-3 text-[11px] leading-relaxed text-neutral-500">
        {curation.cond.join(" · ")}
      </p>

      <p className="pt-4 pb-2 text-center font-mono text-xs tracking-wider text-neutral-500 tabular-nums">
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
              {item.head && (
                <h3 className="pb-3.5 text-center text-xl leading-tight font-bold tracking-tight text-(--accent)">
                  {item.head}
                </h3>
              )}

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
                    className="h-auto w-full rounded-xl bg-neutral-900"
                  />
                  <span
                    className="absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-sm leading-none text-neutral-950 shadow"
                    style={{ left: `${String(x)}%`, top: `${String(y)}%` }}
                  >
                    {openInfo === i ? "×" : "+"}
                  </span>
                </button>

                {openInfo === i && (
                  <button
                    type="button"
                    className="absolute inset-x-2.5 bottom-2.5 flex cursor-pointer items-center gap-2.5 rounded-lg bg-neutral-50 p-2.5 text-left shadow-lg"
                    onClick={(event) => {
                      onSelectItem(item, event.currentTarget.getBoundingClientRect());
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
                      <span className="block text-[11px] text-neutral-600">
                        {item.b}
                      </span>
                      <span className="block truncate text-[12.5px] font-medium text-neutral-950">
                        {item.t}
                      </span>
                      <span className="block text-[13px] font-semibold text-neutral-950 tabular-nums">
                        {formatPrice(item.p)}
                      </span>
                    </span>
                  </button>
                )}

                {i === index && i > 0 && (
                  <button
                    type="button"
                    aria-label="이전"
                    onClick={() => {
                      step(-1);
                    }}
                    className="absolute top-1/2 -left-8 h-11 w-8 -translate-y-1/2 cursor-pointer text-3xl leading-none text-neutral-500"
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
                    className="absolute top-1/2 -right-8 h-11 w-8 -translate-y-1/2 cursor-pointer text-3xl leading-none text-neutral-500"
                  >
                    ›
                  </button>
                )}
              </div>

              {item.note && (
                <p className="pt-4 text-center text-[16.5px] leading-relaxed text-white">
                  {item.note}
                </p>
              )}
              {item.con && (
                <div className="mt-4 border-t border-neutral-800 pt-3.5 text-center">
                  <span className="block text-[10px] tracking-[0.14em] text-neutral-600">
                    {item.conLabel ?? "아쉬운 점"}
                  </span>
                  <span className="mt-1.5 block text-[13px] leading-relaxed text-neutral-500">
                    {item.con}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
