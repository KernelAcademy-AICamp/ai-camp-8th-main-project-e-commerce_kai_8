// View: 큐레이션 상세 — 제목·소개·조건·선별 메타 + 고른 상품 9개.
// 목업(curation/backend/scripts/큐레이션화면.html)의 detail 화면을 aTee 다크 팔레트로 옮긴 것이다.
import Image from "next/image";

import type { Curation, CurationItem } from "@/features/curation/domain/curation";
import { formatPrice } from "@/features/feed/domain/format-price";

export function CurationDetailScreen({
  curation,
  onBack,
  onSelectItem,
}: {
  curation: Curation;
  onBack: () => void;
  onSelectItem: (item: CurationItem, thumb: DOMRect) => void;
}) {
  return (
    <div className="pb-16">
      <button
        type="button"
        onClick={onBack}
        className="w-full cursor-pointer border-b border-neutral-800 px-4 py-2.5 text-left text-[11px] tracking-[0.1em] text-neutral-400"
      >
        ← 큐레이션
      </button>

      <h2 className="px-4 pt-4 text-2xl leading-tight font-semibold tracking-tight text-white">
        {curation.title}
      </h2>
      <p className="px-4 pt-2.5 text-[13px] leading-relaxed text-neutral-400">
        {curation.lede}
      </p>
      <div className="flex flex-wrap gap-1.5 px-4 pt-3">
        {curation.cond.map((label) => (
          <span
            key={label}
            className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-300"
          >
            {label}
          </span>
        ))}
      </div>
      <p className="px-4 pt-3.5 pb-4 text-[11px] tracking-[0.04em] text-neutral-500">
        {curation.date} · {curation.n.toLocaleString("ko-KR")}건 중 평점순{" "}
        {curation.items.length}건
      </p>

      <ul className="divide-y divide-neutral-800 border-t border-neutral-800">
        {curation.items.map((item) => (
          <li key={item.u}>
            <button
              type="button"
              className="block w-full cursor-pointer pb-5 text-left"
              onClick={(event) => {
                const image = event.currentTarget.querySelector("img");
                onSelectItem(
                  item,
                  (image ?? event.currentTarget).getBoundingClientRect(),
                );
              }}
            >
              <div className="relative aspect-square w-full bg-neutral-900">
                <Image
                  src={item.img}
                  alt={item.t}
                  fill
                  sizes="100vw"
                  className="object-cover"
                />
              </div>
              <p className="px-4 pt-3 text-[11px] text-neutral-400">{item.b}</p>
              <p className="px-4 pt-0.5 text-[15px] leading-snug font-medium text-white">
                {item.t}
              </p>
              {item.note && (
                <p className="px-4 pt-1.5 text-[13px] leading-relaxed text-neutral-400">
                  {item.note}
                </p>
              )}
              <p className="px-4 pt-2 text-[13px] text-neutral-300">
                {formatPrice(item.p)}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
