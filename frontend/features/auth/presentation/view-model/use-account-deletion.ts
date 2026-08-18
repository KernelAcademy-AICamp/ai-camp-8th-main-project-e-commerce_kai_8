"use client";

import { useCallback, useState } from "react";

import {
  deleteMyAccount,
  signOutThisDevice,
} from "@/features/auth/data/auth-repository";
import {
  clearPendingDeletion,
  savePendingDeletion,
} from "@/features/auth/data/pending-deletion-store";
import type { AuthUser } from "@/features/auth/domain/auth-session";
import { clearSignals } from "@/shared/signals/signals";

/**
 * 탈퇴 흐름의 상태.
 *
 * 성공 상태가 없는 이유: 계정을 지우면 세션이 사라지며 페이지가 다시 로드된다.
 * 그 너머로 결과를 전달할 방법이 주소뿐이라, 성공·응답불명은 표시값을 붙여
 * 설정 화면으로 다시 들어간다.
 */
export type DeletionStatus =
  | { kind: "idle" }
  /** 지울 계정을 보여주고 한 번 더 묻는 중 */
  | { kind: "confirming" }
  | { kind: "working" }
  /** 구글 신원을 확보하지 못했다 — **삭제를 시작하지 않았다** */
  | { kind: "identityUnknown" }
  /** 표식을 남기지 못했다 — **삭제를 시작하지 않았다** */
  | { kind: "markerFailed" };

export interface AccountDeletionViewModel {
  status: DeletionStatus;
  request: () => void;
  cancel: () => void;
  confirm: () => void;
}

/**
 * 탈퇴 (설계 §4 계정 삭제).
 *
 * 순서가 곧 안전장치다.
 *   1. 표식을 남기고 **다시 읽어 확인한다.** 확인 못 하면 여기서 멈춘다 —
 *      표식 없이 파괴 호출을 보내면 응답이 유실됐을 때 손잡이가 없다.
 *   2. 계정을 지운다.
 *   3. 이 기기의 행동·검색 기록도 지운다 (계획 4단계 결정 ①).
 *   4. 표식을 정리하고 로그아웃한다.
 */
export function useAccountDeletion(user: AuthUser | null): AccountDeletionViewModel {
  const [status, setStatus] = useState<DeletionStatus>({ kind: "idle" });

  const request = useCallback(() => {
    setStatus({ kind: "confirming" });
  }, []);

  const cancel = useCallback(() => {
    setStatus({ kind: "idle" });
  }, []);

  const confirm = useCallback(() => {
    if (user === null) return;

    const { providerId } = user;
    if (providerId === null) {
      // 이 값이 없으면 응답 유실 뒤 "같은 구글 계정인가"를 판정할 수 없다.
      // 판정할 수 없는 채로 지우면 나중에 남의 새 계정을 지울 위험이 남는다.
      setStatus({ kind: "identityUnknown" });
      return;
    }

    const saved = savePendingDeletion(
      { userId: user.id, providerId, requestedAt: Date.now() },
      localStorage,
    );
    if (!saved) {
      setStatus({ kind: "markerFailed" });
      return;
    }

    setStatus({ kind: "working" });

    void deleteMyAccount().then(
      () => {
        // 0건이어도 성공이다 — 이미 지워진 것(설계 §4 재호출 계약).
        // 기기 기록 삭제는 실패해도 clearSignals가 재시도 대기 목록에 적어 둔다.
        void clearSignals()
          .catch(() => undefined)
          .then(() => {
            clearPendingDeletion(localStorage);
            return signOutThisDevice().catch(() => undefined);
          })
          .finally(() => {
            window.location.replace("/settings?auth=deleted");
          });
      },
      () => {
        // 지워졌는지 알 수 없다. **표식을 남겨 둔다** — 다음 로그인에서 판정한다.
        // "완료"라고 쓰지 않는다.
        void signOutThisDevice()
          .catch(() => undefined)
          .finally(() => {
            window.location.replace("/settings?auth=delete-unverified");
          });
      },
    );
  }, [user]);

  return { status, request, cancel, confirm };
}
