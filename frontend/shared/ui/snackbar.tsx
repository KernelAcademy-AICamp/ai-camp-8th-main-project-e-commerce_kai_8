"use client";

/**
 * 바닥에 뜨는 한 줄 안내 — `use-snackbar`의 `message`를 그대로 받아 그린다.
 * 하단 dock·탭바 위에 겹치지 않게 `bottom-[110px]`에 둔다.
 */
export function Snackbar({ message }: { message: string | null }) {
  if (message === null) return null;

  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-[110px] z-[70] flex justify-center px-4"
    >
      <span className="snackbar-in rounded-full bg-raised px-4 py-2.5 text-sm font-medium text-ink neo-lg">
        {message}
      </span>
    </div>
  );
}
