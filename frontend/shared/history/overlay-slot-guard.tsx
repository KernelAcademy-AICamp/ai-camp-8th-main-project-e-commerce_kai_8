"use client";

import { usePathname } from "next/navigation";

/**
 * 병렬 슬롯(`@overlay`·`@settingsOverlay`)에 겹쳐 그리는 오버레이를,
 * 주소가 더는 그 오버레이의 것이 아니면 스스로 숨긴다(2026-08-25).
 *
 * Next.js의 병렬 라우트 슬롯은 **자신을 매칭한 세그먼트가 있는 동안**만
 * `default.tsx`로 되돌아간다 — 소유 레이아웃(루트 레이아웃)이 그대로면,
 * 그 슬롯과 무관한 주소로 옮겨가도(`/settings` → `/privacy`처럼 두 슬롯
 * 다 모르는 주소) 슬롯 자체는 새로 계산되지 않고 이전에 그린 내용을 그대로
 * 들고 있는다(vercel/next.js#94505). `fixed inset-0`로 전체를 덮는
 * 오버레이라 그 상태로는 **주소는 바뀌었는데 화면은 그대로** 막힌 것처럼
 * 보인다 — 뒤에서 새로 그려진 화면(`children` 슬롯)이 가려진다.
 *
 * 그래서 오버레이 자신이 `usePathname()`으로 지금 주소를 직접 확인해,
 * 자기 주소가 아니면 렌더링을 그만둔다 — 슬롯 재계산을 기다리지 않는다.
 */
export function OverlaySlotGuard({
  expectedPath,
  children,
}: {
  /** 이 오버레이가 실제로 열려 있어야 하는 주소 (예: "/my", "/settings") */
  expectedPath: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (pathname !== expectedPath) return null;
  return <>{children}</>;
}
