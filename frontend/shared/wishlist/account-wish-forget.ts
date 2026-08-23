// 계정에 담긴 찜과 폴더를 모두 지운다 — 개인화 데이터 초기화의 일부.
//
// 익명 통로(`shared/supabase-rpc.ts`)를 쓰지 않는다. 계정 데이터는 인증 통로로만
// 나간다(구글 로그인 설계 §2 transport 경계).
//
// **왜 `shared`인가.** 부르는 쪽은 설정이고 데이터는 보관함의 것이라, 어느 한쪽
// feature에 두면 다른 feature가 그것을 가져다 써야 한다 — 서로 import하지 않는다는
// 규칙(frontend/AGENTS.md)에 걸린다. 계정 취향을 지우는 `shared/profile/
// account-profile-api`와 같은 자리다.
//
// ⚠️ **한 번에 지우는 서버 함수가 없어 하나씩 지운다.** 찜이 많으면 그만큼 호출이
// 늘고, 중간에 끊기면 절반만 지워진 채 남는다(다시 시도하면 이어서 지운다).
// 일괄 삭제 함수(`c_wish_forget` 같은)를 만들면 한 번에·원자적으로 끝난다 —
// 데이터베이스 변경이 필요해 뒤로 미뤘다.

import { authedRpc } from "@/shared/supabase/authed-rpc";

interface WishIdRow {
  goods_no: number;
}

interface FolderIdRow {
  id: string;
}

/**
 * 이 계정의 찜과 폴더를 전부 지운다.
 *
 * **찜을 먼저 지운다.** 폴더를 먼저 지우면 담긴 찜이 기본 폴더로 옮겨지므로
 * (`c_wish_folder_delete`의 약속), 어차피 뒤에서 다시 훑어야 한다.
 *
 * 여러 번 불러도 안전하다 — 이미 없는 것을 지우면 서버가 0을 돌려준다.
 *
 * @throws 서버 호출이 실패하면 그대로 던진다. 부르는 쪽이 "지우지 못했다"를
 *   알리고 다시 시도하게 한다 — 조용히 삼키면 남은 찜을 지웠다고 말하게 된다.
 */
export async function forgetAccountWishes(): Promise<void> {
  const wishes = (await authedRpc<WishIdRow[] | null>("c_wish_page")) ?? [];
  for (const wish of wishes) {
    await authedRpc<number>("c_wish_remove", { p_goods: wish.goods_no });
  }

  const folders = (await authedRpc<FolderIdRow[] | null>("c_wish_folder_list")) ?? [];
  for (const folder of folders) {
    await authedRpc<number>("c_wish_folder_delete", { p_folder: folder.id });
  }
}
