"use client";

import type { AuthNotice } from "@/features/auth/domain/auth-session";
import { useAccountDeletion } from "@/features/auth/presentation/view-model/use-account-deletion";
import { useAuthSession } from "@/features/auth/presentation/view-model/use-auth-session";
import { useDeletionFollowUp } from "@/features/auth/presentation/view-model/use-deletion-follow-up";

/**
 * 설정 화면의 계정 삭제 (설계 §4 계정 삭제).
 *
 * **여기에 두는 이유:** 되돌릴 수 없는 동작 둘(개인화 데이터 지우기·계정 삭제)이
 * 한곳에 모이고, 마이페이지보다 한 단계 안쪽이라 실수로 누를 일이 줄어든다.
 *
 * 로그인한 사람에게만 보인다. 다만 지난번 삭제가 끝나지 않았다는 안내는
 * 로그인 여부와 무관하게 보여야 한다 — 그걸 보고 원래 계정으로 돌아와야 한다.
 *
 * 삭제는 **지울 계정을 보여주고 한 번 더 묻는다.** 되돌릴 수 없기 때문이다.
 */
export function AccountDeleteSection({ notice }: { notice: AuthNotice | null }) {
  const { state, busy } = useAuthSession();
  const user = state.kind === "signedIn" ? state.user : null;
  const deletion = useAccountDeletion(user);
  const followUp = useDeletionFollowUp(state);

  const deleting = deletion.status.kind === "working";
  const hasNotice =
    notice === "deleted" ||
    notice === "delete-unverified" ||
    followUp.kind !== "none" ||
    deletion.status.kind === "markerFailed" ||
    deletion.status.kind === "identityUnknown";

  if (state.kind !== "signedIn" && !hasNotice) return null;

  return (
    <section className="mt-10 border-t border-line pt-6">
      <h2 className="mb-3 text-base font-semibold text-ink">계정 삭제</h2>

      {state.kind === "signedIn" && deletion.status.kind === "confirming" && (
        <div className="space-y-3 rounded-xl border border-danger/50 bg-danger/15 p-4">
          <p className="text-[15px] text-ink">
            <span className="font-medium">{state.user.email ?? "이 구글 계정"}</span>을
            삭제합니다.
          </p>
          <p className="text-sm text-ink-soft">
            이 기기에 쌓인 탐색·검색 기록과 계정에 담긴 찜도 함께 지워집니다.{" "}
            <span className="text-ink-soft">되돌릴 수 없습니다.</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={deletion.cancel}
              className="flex-1 cursor-pointer rounded-xl bg-well neo py-3 font-medium text-ink"
            >
              취소
            </button>
            <button
              type="button"
              onClick={deletion.confirm}
              className="flex-1 cursor-pointer rounded-xl bg-danger py-3 font-medium text-ink"
            >
              삭제합니다
            </button>
          </div>
        </div>
      )}

      {state.kind === "signedIn" && deletion.status.kind !== "confirming" && (
        <div className="space-y-2">
          <p className="text-sm text-ink-soft">
            계정과 계정에 담긴 찜, 이 기기의 탐색·검색 기록이 모두 지워집니다.
          </p>
          <button
            type="button"
            onClick={deletion.request}
            disabled={busy || deleting}
            className="w-full cursor-pointer rounded-xl border border-danger/50 py-3 font-medium text-danger disabled:opacity-60"
          >
            {deleting ? "삭제하는 중…" : "계정 삭제"}
          </button>
        </div>
      )}

      {/* 시작조차 못 한 경우 — "지워졌을지도 모른다"와 섞이면 안 된다 */}
      {deletion.status.kind === "markerFailed" && (
        <p className="mt-3 text-sm text-danger">
          이 브라우저에 안전장치를 저장하지 못해 삭제를 시작하지 않았습니다. 시크릿
          모드이거나 저장 공간이 가득 찼을 수 있습니다.
        </p>
      )}

      {deletion.status.kind === "identityUnknown" && (
        <p className="mt-3 text-sm text-danger">
          구글 계정 정보를 확인하지 못해 삭제를 시작하지 않았습니다. 로그아웃한 뒤 다시
          로그인해 주세요.
        </p>
      )}

      {notice === "deleted" && (
        <p className="mt-3 text-sm text-ink-soft">계정을 삭제했습니다.</p>
      )}

      {/* 확인되지 않은 것을 "완료"로 쓰지 않는다 (설계 §4) */}
      {notice === "delete-unverified" && (
        <p className="mt-3 text-sm text-star">
          삭제 요청을 보냈지만 결과를 확인하지 못했습니다. 같은 구글 계정으로 다시
          로그인하면 마무리합니다.
        </p>
      )}

      {followUp.kind === "otherAccount" && (
        <p className="mt-3 text-sm text-star">
          지우려던 계정이 아직 남아 있을 수 있습니다. 그 계정으로 로그인해야
          마무리됩니다.
        </p>
      )}

      {followUp.kind === "retryNeeded" && (
        <p className="mt-3 text-sm text-star">
          지난번 계정 삭제가 끝나지 않았습니다. 위에서 다시 시도해 주세요.
        </p>
      )}
    </section>
  );
}
