"use client";

import {
  CenterPopup,
  PopupActions,
  PopupButton,
  PopupMessage,
  PopupTitle,
} from "@/shared/ui/popup";

/**
 * 폴더 삭제 확인 — 시안 `delPop`.
 *
 * **되돌릴 수 없는 일이라 `alertdialog`다.** 화살표를 두지 않는다 — 나가는 길은
 * "아니오"와 바깥 누르기다.
 *
 * ⚠️ **시안의 문구를 그대로 쓰지 않는다.** 시안은 "폴더가 삭제되며 되돌릴 수
 * 없습니다"라고 하지만, 이 제품에서는 **담긴 찜이 기본 폴더로 옮겨진다** —
 * 사라지지 않는다. 사실과 다른 경고는 하지 않는다. 상자와 단추는 시안 그대로다.
 */
export function DeleteFolderPopup({
  count,
  busy,
  onConfirm,
  onCancel,
}: {
  /** 담긴 찜 수. 숨겨진 것까지 포함한 원래 개수다 */
  count: number;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <CenterPopup role="alertdialog" label="폴더 삭제 확인" onDismiss={onCancel}>
      <PopupTitle>정말 삭제하시겠습니까?</PopupTitle>
      <PopupMessage>
        {count > 0 ? (
          <>
            담긴 찜 {count}개는
            <br />
            기본 폴더로 옮겨져요.
          </>
        ) : (
          <>
            비어 있는 폴더예요.
            <br />
            찜은 그대로 남아요.
          </>
        )}
      </PopupMessage>

      <PopupActions>
        <PopupButton tone="danger" onClick={onConfirm} disabled={busy}>
          예
        </PopupButton>
        <PopupButton tone="quiet" onClick={onCancel}>
          아니오
        </PopupButton>
      </PopupActions>
    </CenterPopup>
  );
}
