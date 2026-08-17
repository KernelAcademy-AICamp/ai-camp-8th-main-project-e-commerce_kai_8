// 미완료 삭제 요청 큐 (방침 O-32 삭제 계약).
//
// 왜 필요한가: 초기화는 서버 삭제(c_forget_device)를 요청한 뒤 로컬 기기 ID를
// 지운다. 서버 요청이 실패했는데 기기 ID를 지워 버리면 **그 ID를 다시는 알 수
// 없어** 서버에 남은 행동 기록·검색어 원문을 영원히 지울 수 없다. 설정 화면과
// 방침 문서가 약속한 "다음 접속에서 다시 시도"가 거짓이 된다.
//
// 그래서 실패한 기기 ID를 따로 적어 두고 다음 접속에 재시도한다.

import { rpcPost } from "@/shared/supabase-rpc";

const STORAGE_KEY = "atee-pending-forget";
/** 큐 상한 — 반복 실패로 무한히 쌓이지 않게 한다 */
const MAX_PENDING = 20;

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function write(ids: string[]): void {
  try {
    if (ids.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-MAX_PENDING)));
  } catch {
    // 저장 불가 환경이면 이번 세션에서만 재시도할 수 있다 — 그 이상은 방법이 없다
  }
}

/** 서버 삭제에 실패한 기기 ID를 적어 둔다 (중복은 넣지 않는다) */
export function rememberPendingForget(deviceId: string): void {
  const ids = read();
  if (ids.includes(deviceId)) return;
  write([...ids, deviceId]);
}

/** 아직 서버에서 지우지 못한 기기 ID가 있는가 — 설정 화면 안내에 쓴다 */
export function hasPendingForget(): boolean {
  return read().length > 0;
}

/**
 * 미완료 삭제를 재시도한다. 성공한 것만 큐에서 뺀다.
 * 앱 시작 시 한 번 호출한다 — 실패해도 조용히 넘어가고 다음 접속에 다시 시도한다.
 * 반환값 = 이번에 서버에서 지운 행 수 합계 (아무것도 못 지웠으면 0).
 */
export async function retryPendingForget(): Promise<number> {
  const ids = read();
  if (ids.length === 0) return 0;

  let deleted = 0;
  const failed: string[] = [];
  for (const id of ids) {
    try {
      deleted += await rpcPost<number>("c_forget_device", { p_device: id });
    } catch {
      failed.push(id); // 다음 접속에 다시 시도한다
    }
  }
  write(failed);
  return deleted;
}
