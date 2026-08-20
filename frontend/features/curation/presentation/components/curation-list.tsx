// View: 큐레이션 목록 — 카드 하나가 통째로 버튼이다(누르면 상세 화면).
// 별개 제품 "티:파운드"(search-by-llm)의 같은 화면을 aTee 다크 팔레트로 옮긴 것이다.
// 그 프로젝트 폴더는 2026-08-20에 저장소에서 뺐다 — 원본을 보려면 git 이력을 봐야 한다.
import Image from "next/image";

import type { Curation } from "@/features/curation/domain/curation";

export function CurationList({
  curations,
  onOpen,
}: {
  curations: Curation[];
  onOpen: (key: string) => void;
}) {
  return (
    <ul className="divide-y divide-neutral-800">
      {curations.map((c) => (
        <li key={c.key}>
          <button
            type="button"
            className="block w-full cursor-pointer py-5 text-left"
            onClick={() => {
              onOpen(c.key);
            }}
          >
            {c.items.length > 0 && (
              <div className="mb-3 flex gap-px overflow-hidden rounded-xl bg-neutral-800">
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

            <div className="px-4">
              <h2 className="text-lg leading-tight font-semibold tracking-tight">
                {c.title}
              </h2>
            </div>

            <p className="px-4 pt-2 text-[13px] leading-relaxed text-neutral-400">
              {c.lede}
            </p>

            <div className="flex flex-wrap gap-1.5 px-4 pt-3">
              {c.cond.map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-300"
                >
                  {label}
                </span>
              ))}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
