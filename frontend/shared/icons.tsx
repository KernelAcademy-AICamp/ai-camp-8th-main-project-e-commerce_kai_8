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
export function BackIcon({ size = 20 }: IconProps) {
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

/** 하트 — 저장(찜). 시안 `#heartBtn`의 SVG 그대로. `filled`면 속을 채운다 */
export function HeartIcon({
  size = 19,
  filled = false,
}: IconProps & { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

/**
 * aTee 로고 심볼 — 색이 찬 원 안에 티셔츠 글립.
 *
 * 원은 `currentColor`, 글립은 앱 배경색으로 뚫는다(시안 `.mark-glyph`).
 * 그래서 감싸는 요소의 text 색만 바꾸면 심볼 전체 색이 따라온다.
 */
export function AteeMark({ size = 26 }: IconProps) {
  return (
    <svg viewBox="0 0 26 26" width={size} height={size} fill="none" aria-hidden="true">
      <circle cx="13" cy="13" r="12" fill="currentColor" />
      <path
        d="M13 6.5C11.9 6.5 11 7.4 11 8.5C11 9.2 11.4 9.8 12 10.2V11L5.8 15.4C5.3 15.7 5.5 16.5 6.1 16.5H19.9C20.5 16.5 20.7 15.7 20.2 15.4L14 11V10.2C14.6 9.8 15 9.2 15 8.5H13.6C13.6 8.8 13.3 9.1 13 9.1C12.7 9.1 12.4 8.8 12.4 8.5C12.4 8.2 12.7 7.9 13 7.9V6.5Z"
        fill="var(--color-app)"
      />
    </svg>
  );
}

/** 상자 밖 화살표 — 판매처(외부 사이트)로 이동. 시안 `#detailLink`의 SVG 그대로 */
export function ExternalLinkIcon({ size = 18 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
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

/** 문 밖으로 나가는 화살표 — 로그아웃. 시안 `#logoutBtn`의 SVG 그대로 */
export function LogoutIcon({ size = 15 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <polyline points="15 17 20 12 15 7" />
      <line x1="20" y1="12" x2="9" y2="12" />
    </svg>
  );
}
