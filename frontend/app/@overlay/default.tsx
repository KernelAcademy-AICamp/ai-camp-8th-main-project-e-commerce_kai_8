/**
 * 겹침 자리의 기본값 — 아무것도 그리지 않는다.
 *
 * 이 자리는 지금 화면 **위에** 무언가를 겹쳐 띄우기 위한 것이다. 겹칠 것이 없는 화면에서는
 * 비어 있어야 하므로 null을 돌려준다.
 */
export default function OverlaySlotDefault() {
  return null;
}
