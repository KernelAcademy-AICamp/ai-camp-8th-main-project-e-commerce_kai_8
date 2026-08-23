/**
 * 온보딩 진행 표시.
 *
 * **경로의 실제 화면 수를 센다** — 새 기기는 3, 로그인 우선 경로는 2다(계획 §1-0).
 * 없는 단계를 세면 마지막 화면에서 `2 / 3`으로 끝나 사람이 한 단계를 잃어버렸다고 읽는다.
 */
export function OnboardingProgress({ index, count }: { index: number; count: number }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="text-sm text-ink-muted tabular-nums"
        aria-label={`${count.toString()}단계 중 ${index.toString()}단계`}
      >
        {index} / {count}
      </span>
      <div aria-hidden className="flex flex-1 gap-1.5">
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i < index ? "bg-slate" : "bg-line"}`}
          />
        ))}
      </div>
    </div>
  );
}
