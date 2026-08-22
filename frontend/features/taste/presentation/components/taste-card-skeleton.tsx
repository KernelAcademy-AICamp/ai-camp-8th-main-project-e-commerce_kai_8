import { RefreshIcon } from "@/shared/icons";

import { GROUPS_IN_ORDER } from "../../domain/taste-summary";

/** 축 한 줄의 자리 — 라벨 두 개와 막대. 카드의 `AxisBar`와 같은 높이라야 한다. */
function AxisRowSkeleton() {
  return (
    <li>
      <div className="flex items-center justify-between">
        <div className="h-3 w-10 rounded bg-skel-1" />
        <div className="h-3 w-10 rounded bg-skel-1" />
      </div>
      {/* 삼각형 자리만큼 막대가 내려와 있다 — 카드와 같은 간격이라야 안 튄다 */}
      <div className="mt-3 h-1 rounded-full bg-skel-1" />
    </li>
  );
}

/**
 * 취향 카드의 뼈대.
 *
 * 완성된 카드와 같은 배치(머리말 한 줄·묶음별 축·색 칩·브랜드)로 영역을 잡는다 —
 * 로드 후 내용이 그 자리에 그대로 들어와 화면이 튀지 않는다.
 *
 * **묶음과 축을 `GROUPS_IN_ORDER`에서 그대로 읽는다.** 개수를 손으로 적어 두면
 * 다음에 축을 더할 때 여기만 낡아서, 도착하는 순간 카드가 길어지며 아래가 밀린다.
 *
 * ⚠️ 잴 수 없는 축은 실제 카드에서 빠지므로(실측 치수는 카탈로그 45%뿐), 뼈대가
 * 모든 축을 그리면 사람에 따라 실제보다 길다. **가장 흔한 경우를 기준으로 잡는
 * 일은 커버리지 실측 뒤로 미뤄 뒀다** — `docs/plans/2026-08-20-taste-card-axes-phase1.md` 1·4단계.
 *
 * `TasteCard`와 이동 중 화면(`app/my/loading.tsx`)이 **같은 것을 쓴다.** 각자
 * 그리면 도착하는 순간 뼈대가 미세하게 바뀌어 깜빡인 것처럼 보인다.
 *
 * 새로고침 단추는 **끈 채로 그린다.** 불러오는 중에는 실제 카드에서도 눌리지
 * 않으므로, 여기서만 눌리게 하면 아직 없는 것을 새로 고치게 된다.
 */
export function TasteCardSkeleton() {
  return (
    <section className="mt-10 rounded-2xl border border-line p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">내 취향</h2>
        <button
          type="button"
          aria-label="지금까지 본 것까지 반영해 새로고침"
          disabled
          className="-m-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-ink-soft disabled:opacity-50"
        >
          <RefreshIcon size={17} />
        </button>
      </div>

      <div aria-label="불러오는 중" className="animate-pulse">
        <div className="mt-1 h-5 w-32 rounded bg-skel-1" />
        <ul className="mt-7">
          <AxisRowSkeleton />
        </ul>
        {GROUPS_IN_ORDER.map((group) => (
          <div key={group.key} className="mt-10">
            <div className="h-3 w-12 rounded bg-skel-1" />
            <ul className="mt-3 space-y-6">
              {group.axes.map((axis) => (
                <AxisRowSkeleton key={axis.key} />
              ))}
            </ul>
          </div>
        ))}
        <div className="mt-10">
          <div className="h-3 w-12 rounded bg-skel-1" />
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="h-[34px] w-24 rounded-full bg-skel-1" />
            <div className="h-[34px] w-20 rounded-full bg-skel-1" />
            <div className="h-[34px] w-24 rounded-full bg-skel-1" />
          </div>
        </div>
        <div className="mt-10">
          <div className="h-3 w-16 rounded bg-skel-1" />
          <div className="mt-3 h-5 w-48 rounded bg-skel-1" />
        </div>
      </div>
    </section>
  );
}
