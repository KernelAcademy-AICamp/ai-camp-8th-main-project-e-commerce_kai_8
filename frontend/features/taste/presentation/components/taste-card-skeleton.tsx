import { RefreshIcon } from "@/shared/icons";

import { AXES_IN_ORDER } from "../../domain/taste-summary";

/**
 * 취향 카드의 뼈대.
 *
 * 완성된 카드와 같은 배치(축 4줄·색 칩·브랜드)로 영역을 잡는다 — 로드 후 내용이
 * 그 자리에 그대로 들어와 화면이 튀지 않는다.
 *
 * `TasteCard`와 이동 중 화면(`app/my/loading.tsx`)이 **같은 것을 쓴다.** 각자
 * 그리면 도착하는 순간 뼈대가 미세하게 바뀌어 깜빡인 것처럼 보인다.
 *
 * 새로고침 단추는 **끈 채로 그린다.** 불러오는 중에는 실제 카드에서도 눌리지
 * 않으므로, 여기서만 눌리게 하면 아직 없는 것을 새로 고치게 된다.
 */
export function TasteCardSkeleton() {
  return (
    <section className="mt-10 rounded-2xl border border-neutral-800 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">내 취향</h2>
        <button
          type="button"
          aria-label="지금까지 본 것까지 반영해 새로고침"
          disabled
          className="-m-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-neutral-400 disabled:opacity-50"
        >
          <RefreshIcon size={17} />
        </button>
      </div>

      <div aria-label="불러오는 중" className="animate-pulse">
        <ul className="mt-6 space-y-7">
          {AXES_IN_ORDER.map((axis) => (
            <li key={axis.key}>
              <div className="flex items-center justify-between">
                <div className="h-3 w-10 rounded bg-neutral-800" />
                <div className="h-3 w-10 rounded bg-neutral-800" />
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-neutral-800" />
            </li>
          ))}
        </ul>
        <div className="mt-7">
          <div className="h-3 w-12 rounded bg-neutral-800" />
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="h-[34px] w-24 rounded-full bg-neutral-800" />
            <div className="h-[34px] w-20 rounded-full bg-neutral-800" />
            <div className="h-[34px] w-24 rounded-full bg-neutral-800" />
          </div>
        </div>
        <div className="mt-7">
          <div className="h-3 w-16 rounded bg-neutral-800" />
          <div className="mt-3 h-5 w-48 rounded bg-neutral-800" />
        </div>
      </div>
    </section>
  );
}
