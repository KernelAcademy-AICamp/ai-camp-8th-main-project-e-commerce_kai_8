// View: 큐레이션 목록 — 상단 썸네일 4장 + 제목 + 소개 + 조건 라벨. 상세 화면은 아직 없다.
import Image from "next/image";

import type { Curation } from "@/features/curation/domain/curation";

export default function CurationList({ curations }: { curations: Curation[] }) {
  return (
    <ul>
      {curations.map((c) => (
        <li key={c.key} className="border-b border-black py-4">
          {c.items.length > 0 && (
            <div className="mb-3 flex gap-px border-y border-black bg-black">
              {c.items.slice(0, 4).map((item) => (
                <div key={item.u} className="relative aspect-square flex-1">
                  <Image
                    src={item.img}
                    alt={item.t}
                    fill
                    sizes="25vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="px-3.5">
            <h2 className="text-xl leading-tight font-extrabold tracking-tight">
              {c.title}
            </h2>
          </div>

          <p className="px-3.5 pt-2 text-[12.5px] leading-relaxed text-neutral-700">
            {c.lede}
          </p>

          <div className="flex flex-wrap gap-1.5 px-3.5 pt-3">
            {c.cond.map((label) => (
              <span
                key={label}
                className="bg-neutral-200 px-2 py-0.5 font-mono text-[11px] tracking-wide text-neutral-600"
              >
                {label}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
