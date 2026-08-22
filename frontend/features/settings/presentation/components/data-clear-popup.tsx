"use client";

import type { ClearStatus } from "@/features/settings/presentation/view-model/use-privacy-settings";
import {
  CenterPopup,
  PopupActions,
  PopupButton,
  PopupMessage,
  PopupTitle,
} from "@/shared/ui/popup";

/**
 * 개인화 데이터 삭제 — 묻고, 지우는 동안 알리고, **결과까지 보여준다.**
 *
 * ⚠️ 결과를 안 보여주면 안 지워진 것으로 읽힌다. 앞 판이 `confirming`만 그려서
 * 지우기를 누르면 창이 그냥 사라졌고, 실제로는 지워졌는데도 "안 되는 것 같다"는
 * 말을 들었다(2026-08-22 제품 책임자). 설정 화면(`PrivacySettings`)은 네 상태를
 * 모두 알린다 — 같은 흐름이니 알리는 것도 같아야 한다.
 *
 * 되돌릴 수 없는 일이라 `alertdialog`이고, 지우는 중에는 바깥을 눌러도 닫히지
 * 않는다 — 진행 중인 일을 숨기지 않는다.
 */
export function DataClearPopup({
  status,
  onCancel,
  onConfirm,
}: {
  status: ClearStatus;
  /** 창 닫기 — 묻는 중이면 취소, 끝난 뒤면 확인 */
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (status.kind === "idle") return null;

  const working = status.kind === "working";

  return (
    <CenterPopup
      role="alertdialog"
      label="데이터 삭제"
      onDismiss={working ? undefined : onCancel}
    >
      {(status.kind === "confirming" || working) && (
        <>
          <PopupTitle>데이터를 지울까요?</PopupTitle>
          <PopupMessage>
            탐색 기록·취향·보여줄 성별이
            <br />
            사라집니다. 되돌릴 수 없어요.
          </PopupMessage>
          <PopupActions>
            <PopupButton tone="danger" onClick={onConfirm} disabled={working}>
              {working ? "지우는 중…" : "지우기"}
            </PopupButton>
            <PopupButton tone="quiet" onClick={onCancel} disabled={working}>
              아니오
            </PopupButton>
          </PopupActions>
        </>
      )}

      {status.kind === "done" && (
        <>
          <PopupTitle>지웠어요</PopupTitle>
          <PopupMessage>
            {status.deletedOnServer !== null
              ? `서버 기록 ${String(status.deletedOnServer)}건까지 지웠어요.`
              : "서버 기록은 다음 접속에서 다시 지웁니다."}
            <br />
            처음 온 사람과 같은 상태예요.
          </PopupMessage>
          <PopupButton className="mt-4" onClick={onCancel}>
            확인
          </PopupButton>
        </>
      )}

      {status.kind === "failed" && (
        <>
          <PopupTitle>지우지 못했어요</PopupTitle>
          <PopupMessage>
            잠시 후 다시 시도해 주세요.
            <br />이 기기의 기록은 그대로 남아 있어요.
          </PopupMessage>
          <PopupActions>
            <PopupButton tone="danger" onClick={onConfirm}>
              다시 시도
            </PopupButton>
            <PopupButton tone="quiet" onClick={onCancel}>
              닫기
            </PopupButton>
          </PopupActions>
        </>
      )}
    </CenterPopup>
  );
}
