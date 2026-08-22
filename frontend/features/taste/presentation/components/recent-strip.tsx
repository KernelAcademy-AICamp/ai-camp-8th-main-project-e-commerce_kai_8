"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import {
  readRecentProducts,
  type RecentProduct,
} from "@/shared/history/recent-products";

/** 시안 `.recent-strip img` — 58px 정사각, 모서리 12px */
const TILE = 58;
/** 띠에 늘어놓는 장수. 넘치면 마지막 칸이 남은 개수를 알린다(시안 `.more-tile`) */
const SHOWN = 8;

/**
 * 최근 본 제품 띠 — 시안 `.sec-recent` + `.recent-strip`.
 *
 * 기기에 남은 기록을 읽어 가로로 늘어놓는다. 서버를 부르지 않는다 — 상세를 열
 * 때 사진 주소까지 함께 적어 두기 때문이다.
 *
 * 기록은 브라우저에만 있어 서버 렌더 결과와 다르다. 그래서 처음에는 비워 두고
 * 화면에 붙은 뒤 읽는다 — 안 그러면 서버가 그린 것과 어긋난다.
 */
export function RecentStrip() {
  const [items, setItems] = useState<RecentProduct[]>([]);

  useEffect(() => {
    // 다음 프레임에 읽는다 — 효과 안에서 곧바로 상태를 바꾸면 렌더가 한 번 더 돈다
    const frame = requestAnimationFrame(() => {
      setItems(readRecentProducts());
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  const shown = items.slice(0, SHOWN);
  const rest = items.length - shown.length;

  return (
    <section className="mt-[30px]">
      <div className="mb-[11px] flex items-baseline justify-between">
        <strong className="text-[13.5px] font-extrabold text-ink">최근 본 제품</strong>
      </div>

      {shown.length === 0 ? (
        <p className="pt-1 pb-0.5 text-xs font-[650] text-ink-muted">
          아직 열어본 제품이 없어요
        </p>
      ) : (
        <div className="flex gap-[9px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {shown.map((item) => (
            <Image
              key={item.goodsNo}
              src={item.thumbnail}
              alt=""
              width={TILE}
              height={TILE}
              sizes={`${String(TILE)}px`}
              className="h-[58px] w-[58px] shrink-0 rounded-xl object-cover"
            />
          ))}
          {rest > 0 && (
            <span className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-xl bg-fill-soft text-[11px] font-extrabold text-ink-muted">
              +{rest}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
