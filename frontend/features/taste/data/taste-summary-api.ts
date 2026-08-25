// 내 취향 카드 — 서버 호출.
//
// 익명 통로(`shared/supabase-rpc.ts`)를 쓰지 않는다. 계정 데이터는 인증 통로로만
// 나간다(구글 로그인 설계 §2 transport 경계).
//
// **상품 번호 목록을 보내지 않는다.** 서버가 자기 앵커를 직접 읽어 집계한다 —
// 목록을 인자로 받게 하면 남의 목록을 넣어 카탈로그 속성을 캐낼 수 있다.

import { saveAccountProfile } from "@/shared/profile/account-profile-api";
import { foldSessionProfileNow, readLongTerm } from "@/shared/profile/profile-store";
import { authedRpc } from "@/shared/supabase/authed-rpc";

import { readTasteSummary, type TasteSummary } from "../domain/taste-summary";

export async function fetchTasteSummary(): Promise<TasteSummary> {
  return readTasteSummary(await authedRpc<unknown>("c_taste_summary"));
}

/**
 * 새로고침 — "지금까지 본 것까지 반영해줘".
 *
 * 그냥 다시 조회하면 소용이 없다. 서버 집계는 장기 취향을 보는데, 이번 세션의
 * 행동은 세션이 끝나야(비활성 30분) 장기로 접히기 때문이다. 그래서 순서가
 * 접기 → 올리기 → 조회다.
 *
 * 접은 게 없으면 올리기를 건너뛴다 — 서버에 이미 같은 것이 있다. 기기 저장소가
 * 막혀 접지 못한 경우도 마찬가지로 건너뛴다: 올릴 새 내용이 없다.
 *
 * ⚠️ `foldSessionProfileNow`는 **문자열을 돌려준다.** 참·거짓으로 쓰면
 * `"no_changes"`도 참이라 접은 게 없는데 매번 올리게 된다.
 */
export async function refreshTasteSummary(): Promise<TasteSummary> {
  if (foldSessionProfileNow(Date.now()) === "folded") {
    await saveAccountProfile(readLongTerm());
  }
  return fetchTasteSummary();
}
