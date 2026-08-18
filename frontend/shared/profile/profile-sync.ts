// 취향 프로필을 계정에 올리는 시점 관리자.
//
// **매 행동마다 올리지 않는다.** 프로필은 노출 하나에도 바뀌므로, 바뀔 때마다
// 올리면 쓰기가 폭증한다. 대신 "더러워졌다"만 표시해 두고 신호 큐와 같은
// 시점(일정 간격, 화면을 떠날 때)에 한 번 올린다.
//
// 올리는 중에 또 바뀌면 **끝난 뒤 한 번 더** 올린다. 중간 상태를 여러 번
// 보내지 않으면서도 마지막 상태를 놓치지 않는다.

import type { LongTermProfile } from "./profile-rules";

export interface ProfileSyncDeps {
  /** 로그인하지 않았으면 올리지 않는다 — 비회원 취향은 계정에 보관하지 않는다 */
  isSignedIn: () => boolean;
  read: () => LongTermProfile;
  upload: (profile: LongTermProfile) => Promise<void>;
}

export interface ProfileSync {
  /** 프로필이 바뀌었다고 알린다 */
  markDirty: () => void;
  /** 지금 올린다. 더럽지 않거나 이미 올리는 중이면 아무것도 하지 않는다. */
  flush: () => Promise<void>;
}

export function createProfileSync(deps: ProfileSyncDeps): ProfileSync {
  let dirty = false;
  let sending = false;

  async function drain(): Promise<void> {
    if (sending || !dirty || !deps.isSignedIn()) return;

    sending = true;
    // 보내기 **전에** 내린다. 올리는 동안 또 바뀌면 다시 더러워지고, 끝난 뒤
    // 한 번 더 보낸다. 나중에 내리면 그 사이 변경을 놓친다.
    dirty = false;

    try {
      await deps.upload(deps.read());
    } catch {
      // 올리지 못했으면 더러운 채로 되돌린다 — 다음 기회에 다시 시도한다
      dirty = true;
    } finally {
      sending = false;
    }

    // 올리는 사이에 또 바뀌었을 수 있다
    if (dirty) await drain();
  }

  return {
    markDirty() {
      dirty = true;
    },
    flush: drain,
  };
}
