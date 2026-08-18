// 검색 관련 공용 아이콘 — 여러 검색 입력에서 동일 SVG 중복을 막는다.

export function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <circle cx="10.5" cy="10.5" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M15.8 15.8 21 21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 24 24">
      <circle
        cx="12"
        cy="12"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.3"
      />
      <path d="M12 4a8 8 0 0 1 8 8" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
