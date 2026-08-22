"use client";

import { MAX_FOLDER_NAME } from "@/features/feed/wishlist/domain/wish-folders";
import { CenterPopup, PopupButton, PopupInput, PopupTitle } from "@/shared/ui/popup";

/**
 * 새 폴더 만들기 — 시안 `nfPop`.
 *
 * 빈 박스 타일을 누르면 **화면 한가운데** 창이 뜨고, 이름을 적어 만든다. 타일
 * 안에서 바로 적던 앞 판과 달리 자리가 넉넉해 이름이 잘리지 않고, 만드는 동안
 * 목록이 움직이지 않는다.
 *
 * 이름을 비워도 만들 수 있는 시안과 달리 **이름은 받아야 한다** — 이 제품의
 * 폴더 이름에는 규칙이 있고(1~24자, 중복 불가), 어긴 것은 창 안에서 알린다.
 * 글자 수 상한도 시안(12자)이 아니라 제품 규칙(24자)을 따른다.
 */
export function NewFolderPopup({
  name,
  onNameChange,
  onSubmit,
  onClose,
  busy,
  error,
}: {
  name: string;
  onNameChange: (next: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <CenterPopup label="새 폴더 만들기" onBack={onClose} onDismiss={onClose}>
      <PopupTitle>새 폴더</PopupTitle>

      {/* form이라 Enter로도 만들어진다 — 시안도 Enter를 받는다 */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <PopupInput
          autoFocus
          value={name}
          onChange={(event) => {
            onNameChange(event.target.value);
          }}
          maxLength={MAX_FOLDER_NAME}
          placeholder="폴더 이름"
          aria-label="새 폴더 이름"
        />
        <PopupButton type="submit" className="mt-4" disabled={busy}>
          만들기
        </PopupButton>
      </form>

      {error !== null && (
        <p role="status" className="mt-2 text-xs text-star">
          {error}
        </p>
      )}
    </CenterPopup>
  );
}
