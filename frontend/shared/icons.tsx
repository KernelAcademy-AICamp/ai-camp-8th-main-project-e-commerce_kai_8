// 화면 아이콘 — 인라인 SVG.
//
// **이모지를 쓰지 않는다.** `👤`·`⚙️` 같은 이모지는 플랫폼 폰트가 색을 정하기
// 때문에 CSS로 회색을 입힐 수 없다. 이 앱은 아이콘을 회색으로 통일하므로 색이
// 먹는 SVG로 그린다. `♡`(U+2661)처럼 텍스트로 표현되는 기호는 색이 먹으므로
// 그대로 써도 된다.
//
// 색은 `currentColor`를 따른다 — 감싸는 요소의 text 색을 그대로 쓴다.

interface IconProps {
  /** 정사각 한 변 (px) */
  size?: number;
}

/** 사람 — 마이페이지 */
export function PersonIcon({ size = 20 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" />
    </svg>
  );
}

/**
 * 왼쪽 갈매기 — 뒤로가기. 시안의 뒤로 버튼들과 같은 굵기·꼭짓점이다
 * (`.side-close`·`.backbtn`·`.fd-back`가 모두 이 모양을 쓴다).
 */
export function BackIcon({ size = 19 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="14.5 5 7.5 12 14.5 19" />
    </svg>
  );
}

/** 원형 화살표 — 새로고침 */
export function RefreshIcon({ size = 20 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 3v4h-4" />
    </svg>
  );
}

/** 톱니 — 설정 */
export function GearIcon({ size = 20 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 14.4a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-1.7-.3 1.5 1.5 0 0 0-.9 1.4v.2a1.8 1.8 0 1 1-3.6 0v-.1a1.5 1.5 0 0 0-1-1.4 1.5 1.5 0 0 0-1.7.3l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0 .3-1.7 1.5 1.5 0 0 0-1.4-.9h-.2a1.8 1.8 0 1 1 0-3.6h.1a1.5 1.5 0 0 0 1.4-1 1.5 1.5 0 0 0-.3-1.7l-.1-.1a1.8 1.8 0 1 1 2.6-2.6l.1.1a1.5 1.5 0 0 0 1.7.3h.1a1.5 1.5 0 0 0 .9-1.4v-.2a1.8 1.8 0 1 1 3.6 0v.1a1.5 1.5 0 0 0 .9 1.4 1.5 1.5 0 0 0 1.7-.3l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0-.3 1.7v.1a1.5 1.5 0 0 0 1.4.9h.2a1.8 1.8 0 1 1 0 3.6h-.1a1.5 1.5 0 0 0-1.4.9z" />
    </svg>
  );
}

/**
 * 더하기 — 사진 위 "상품 정보 열기".
 *
 * 글자 `+`를 쓰지 않는 이유: 글립은 em 박스 안에서 위아래가 비대칭이라(SF Pro는
 * 위 14 : 아래 3) 원 한가운데 놓으면 **1.5px 아래로 처진다.** 24px 원에서는 눈에
 * 띈다. 밀어 올리는 보정은 폰트마다 값이 달라 안드로이드에서 다시 어긋난다.
 */
export function PlusIcon({ size = 13 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

/** 가위표 — 열린 것을 닫는다. `×` 글자를 안 쓰는 이유는 PlusIcon과 같다 */
export function CloseIcon({ size = 13 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

/**
 * aTee 로고 심볼 — 모자이크 조각 네 개(스펙 2026-08-25-mosaic-logo-mark).
 *
 * 실제 홈 피드(2열 masonry)를 축약한 비대칭 배치. 색은 항상
 * `--color-accent`(세이지그린) 한 가지 — 감싸는 요소의 text 색과 무관하게
 * 고정된 브랜드 색을 쓴다(로고는 currentColor를 따르지 않는다).
 */
export function AteeMark({ size = 26 }: IconProps) {
  return (
    <svg viewBox="0 0 56 56" width={size} height={size} fill="none" aria-hidden="true">
      <rect x="8" y="8" width="20" height="26" rx="4" fill="var(--color-accent)" />
      <rect
        x="31"
        y="8"
        width="17"
        height="14"
        rx="4"
        fill="var(--color-accent)"
        fillOpacity="0.55"
      />
      <rect
        x="31"
        y="25"
        width="17"
        height="23"
        rx="4"
        fill="var(--color-accent)"
        fillOpacity="0.8"
      />
      <rect
        x="8"
        y="37"
        width="20"
        height="11"
        rx="4"
        fill="var(--color-accent)"
        fillOpacity="0.4"
      />
    </svg>
  );
}

/** 위 갈매기 — 맨 위로. 시안 `.ddock-fab`의 SVG 그대로 */
export function ArrowUpIcon({ size = 20 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="5 14.5 12 7.5 19 14.5" />
    </svg>
  );
}
