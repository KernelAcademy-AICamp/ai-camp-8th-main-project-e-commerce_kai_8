/**
 * 설정 겹침 자리의 기본값 — 아무것도 그리지 않는다.
 *
 * 이 자리는 프로필 위에 설정을 겹쳐 띄우기 위한 것이다(`app/@overlay/default.tsx`와
 * 같은 이유). 겹칠 것이 없으면 비어 있어야 하므로 null을 돌려준다.
 */
export default function SettingsOverlaySlotDefault() {
  return null;
}
