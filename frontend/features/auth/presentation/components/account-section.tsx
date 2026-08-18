"use client";

import Link from "next/link";

import type { AuthNotice } from "@/features/auth/domain/auth-session";
import { useAccountDeletion } from "@/features/auth/presentation/view-model/use-account-deletion";
import { useAuthSession } from "@/features/auth/presentation/view-model/use-auth-session";
import { useDeletionFollowUp } from "@/features/auth/presentation/view-model/use-deletion-follow-up";

/**
 * 설정 화면의 "계정" 영역 (설계 §3 화면).
 *
 * - 판정 전에는 자리를 차지하는 표시만 둔다 — 로그아웃 화면이 먼저 보였다가
 *   로그인 화면으로 튀지 않게.
 * - "로그인하면 좋아진다"는 문구를 쓰지 않는다. 이 조각에서 실제로 좋아지는 게
 *   없어서 오해가 된다(설계 §3).
 * - 탈퇴는 **지울 계정을 보여주고 한 번 더 묻는다.** 되돌릴 수 없기 때문이다.
 */
export function AccountSection({ notice }: { notice: AuthNotice | null }) {
  const { state, busy, failed, signOut } = useAuthSession();
  const user = state.kind === "signedIn" ? state.user : null;
  const deletion = useAccountDeletion(user);
  const followUp = useDeletionFollowUp(state);

  const showFailure = failed || notice === "failed";
  const deleting = deletion.status.kind === "working";

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-base font-semibold text-white">계정</h2>

      {state.kind === "loading" && (
        <div
          className="h-12 rounded-xl bg-neutral-900"
          aria-label="계정 상태 확인 중"
        />
      )}

      {state.kind === "signedOut" && (
        <div className="space-y-3">
          {/* 구글 버튼은 앱에 한 곳만 둔다 — 상표 규칙을 지켜야 하는 요소가
              여러 군데 흩어지면 한쪽만 어긋나기 쉽다 */}
          <Link
            href="/login"
            className="block w-full rounded-xl bg-neutral-800 py-3 text-center font-medium text-white"
          >
            로그인
          </Link>
          <p className="text-sm text-neutral-400">
            로그인하면 찜한 상품이 계정에 저장돼 다른 기기에서도 보입니다. 이 기기에
            찜해둔 것이 있다면 로그인할 때 함께 올라옵니다.
          </p>
        </div>
      )}

      {state.kind === "signedIn" && (
        <div className="space-y-3">
          {/* 확인 상자가 같은 이메일을 더 크게 다시 보여주므로 여기서는 감춘다 */}
          {deletion.status.kind !== "confirming" && (
            <p className="text-[15px] text-neutral-200">
              {state.user.email ?? "구글 계정으로 로그인됨"}
            </p>
          )}

          {deletion.status.kind === "confirming" ? (
            <div className="space-y-3 rounded-xl border border-red-900/60 bg-red-950/30 p-4">
              <p className="text-[15px] text-neutral-100">
                <span className="font-medium">
                  {state.user.email ?? "이 구글 계정"}
                </span>
                을 삭제합니다.
              </p>
              <p className="text-sm text-neutral-400">
                이 기기에 쌓인 탐색·검색 기록도 함께 지워집니다.{" "}
                <span className="text-neutral-300">되돌릴 수 없습니다.</span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={deletion.cancel}
                  className="flex-1 cursor-pointer rounded-xl bg-neutral-800 py-3 font-medium text-white"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={deletion.confirm}
                  className="flex-1 cursor-pointer rounded-xl bg-red-900 py-3 font-medium text-white"
                >
                  삭제합니다
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={signOut}
                disabled={busy || deleting}
                className="w-full cursor-pointer rounded-xl bg-neutral-800 py-3 font-medium text-white disabled:opacity-60"
              >
                로그아웃
              </button>
              <button
                type="button"
                onClick={deletion.request}
                disabled={busy || deleting}
                className="w-full cursor-pointer rounded-xl py-3 text-sm text-red-400 disabled:opacity-60"
              >
                {deleting ? "삭제하는 중…" : "계정 삭제"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 시작조차 못 한 경우 — "지워졌을지도 모른다"와 섞이면 안 된다 */}
      {deletion.status.kind === "markerFailed" && (
        <p className="mt-3 text-sm text-red-400">
          이 브라우저에 안전장치를 저장하지 못해 삭제를 시작하지 않았습니다. 시크릿
          모드이거나 저장 공간이 가득 찼을 수 있습니다.
        </p>
      )}

      {deletion.status.kind === "identityUnknown" && (
        <p className="mt-3 text-sm text-red-400">
          구글 계정 정보를 확인하지 못해 삭제를 시작하지 않았습니다. 로그아웃한 뒤 다시
          로그인해 주세요.
        </p>
      )}

      {notice === "deleted" && (
        <p className="mt-3 text-sm text-neutral-300">계정을 삭제했습니다.</p>
      )}

      {/* 확인되지 않은 것을 "완료"로 쓰지 않는다 (설계 §4) */}
      {notice === "delete-unverified" && (
        <p className="mt-3 text-sm text-amber-400">
          삭제 요청을 보냈지만 결과를 확인하지 못했습니다. 같은 구글 계정으로 다시
          로그인하면 마무리합니다.
        </p>
      )}

      {followUp.kind === "otherAccount" && (
        <p className="mt-3 text-sm text-amber-400">
          지우려던 계정이 아직 남아 있을 수 있습니다. 그 계정으로 로그인해야
          마무리됩니다.
        </p>
      )}

      {followUp.kind === "retryNeeded" && (
        <p className="mt-3 text-sm text-amber-400">
          지난번 계정 삭제가 끝나지 않았습니다. 위에서 다시 시도해 주세요.
        </p>
      )}

      {showFailure && (
        <p className="mt-3 text-sm text-red-400">
          로그인에 실패했습니다. 다시 시도해 주세요.
        </p>
      )}
    </section>
  );
}
