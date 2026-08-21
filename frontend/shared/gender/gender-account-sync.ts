// 로그인한 사용자의 성별을 계정과 맞춘다.
//
// **왜 별도 상태가 필요한가.** 게이트가 "설정이 없으면 선택 화면"만 보고 판단하면,
// 계정에 값이 있는 사람이 새 기기에서 열었을 때 조회가 끝나기도 전에 **다시 묻게 된다.**
// 그래서 "아직 모른다(조회 중)"와 "물어봐야 한다"를 구분한다.
//
// 실패는 값 없음이 아니다. 읽기에 실패하면 다시 묻지 않고 재시도한다. 다만 **영원히
// 막지는 않는다** — 기기 값이 있으면 그것으로 확정하고 동기화만 재시도한다.

import {
  fetchAccountGender,
  type GenderPutResult,
  putAccountGender,
} from "./account-gender-api";
import { resolveGenderOnLogin } from "./gender-resolve";
import {
  type GenderChoice,
  getGenderSnapshot,
  setGenderSetting,
} from "./gender-setting";

/** 계정 조회가 끝났는가. 게이트는 이것이 끝나기 전에는 묻지 않는다. */
export type SyncStatus = "idle" | "running" | "settled";

let status: SyncStatus = "idle";
/** 조건부 쓰기의 기준. 마지막으로 서버에서 본 갱신 시각. */
let knownUpdatedAt: string | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => {
    l();
  });
}

function setStatus(next: SyncStatus): void {
  if (status === next) return;
  status = next;
  notify();
}

export function getSyncStatus(): SyncStatus {
  return status;
}

/** 서버 렌더에는 계정이 없다 — 아직 시작도 안 한 상태다. */
export function getSyncServerStatus(): SyncStatus {
  return "idle";
}

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 마지막으로 확인한 서버 갱신 시각. 설정 화면이 저장할 때 그대로 돌려보낸다. */
export function getKnownUpdatedAt(): string | null {
  return knownUpdatedAt;
}

function installFromServer(result: GenderPutResult): void {
  knownUpdatedAt = result.updatedAt;
  setGenderSetting(result.gender);
}

/** 테스트용 — 모듈 상태를 처음으로 되돌린다. */
export function resetGenderSync(): void {
  status = "idle";
  knownUpdatedAt = null;
  notify();
}

/**
 * 계정과 맞춘다. 로그인 직후와 앱 시작 시 한 번씩 부른다.
 *
 * @param carried 비회원일 때 골라 두었다가 넘어온 값 (없으면 null)
 * @param onCarriedConsumed 승계값을 더 쓰지 않아도 될 때 부른다(보관함 비우기)
 */
export async function syncGenderWithAccount(
  carried: GenderChoice | null,
  onCarriedConsumed: () => void,
): Promise<void> {
  if (status === "running") return;
  setStatus("running");

  let account: Awaited<ReturnType<typeof fetchAccountGender>>;
  try {
    account = await fetchAccountGender();
  } catch {
    // **읽기 실패를 "값 없음"으로 오인하지 않는다.** 기기 값이 있으면 그것으로 확정하고
    // (게이트를 영원히 막지 않는다) 다음 기회에 다시 맞춘다. 없으면 묻는 수밖에 없다.
    setStatus("settled");
    return;
  }

  const decision = resolveGenderOnLogin({
    account: account?.gender ?? null,
    carried,
    device: getGenderSnapshot(),
  });

  if (decision.kind === "useAccount") {
    knownUpdatedAt = account?.updatedAt ?? null;
    setGenderSetting(decision.gender);
    // 계정이 이겼으므로 승계값은 버린다 — 남겨 두면 다음 로그인에서 되살아난다.
    if (decision.discardCarried) onCarriedConsumed();
  } else if (decision.kind === "claim") {
    try {
      // "계정에 값이 없을 때만 저장" — 읽고 나서 쓰는 사이에 다른 기기가 값을 써도
      // 계정 우선이 깨지지 않는다. 못 넣었으면 서버의 최종 값이 함께 온다.
      installFromServer(await putAccountGender(decision.gender, null));
      onCarriedConsumed();
    } catch {
      // 올리기 실패 — 보관함을 남겨 다음에 다시 시도한다. 화면은 기기 값으로 진행한다.
      setGenderSetting(decision.gender);
    }
  }
  // decision.kind === "ask"이면 아무것도 설치하지 않는다 — 게이트가 선택 화면을 띄운다.

  setStatus("settled");
}
