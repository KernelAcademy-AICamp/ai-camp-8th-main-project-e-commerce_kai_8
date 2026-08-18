// 내 취향 카드 — 서버 호출.
//
// 익명 통로(`shared/supabase-rpc.ts`)를 쓰지 않는다. 계정 데이터는 인증 통로로만
// 나간다(구글 로그인 설계 §2 transport 경계).
//
// **상품 번호 목록을 보내지 않는다.** 서버가 자기 앵커를 직접 읽어 집계한다 —
// 목록을 인자로 받게 하면 남의 목록을 넣어 카탈로그 속성을 캐낼 수 있다.

import { authedRpc } from "@/shared/supabase/authed-rpc";

import { readTasteSummary, type TasteSummary } from "../domain/taste-summary";

export async function fetchTasteSummary(): Promise<TasteSummary> {
  return readTasteSummary(await authedRpc<unknown>("c_taste_summary"));
}
