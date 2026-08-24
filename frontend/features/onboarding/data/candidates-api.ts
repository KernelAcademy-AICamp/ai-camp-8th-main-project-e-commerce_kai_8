// 온보딩 후보 목록 — 서버 호출.
//
// **익명 통로를 쓴다.** 계정 데이터가 아니라 모두에게 같은 고정 목록이고, 새 기기
// 경로에서는 **로그인하기 전에** 이 화면을 본다(계획 §1-0).
//
// 서버가 자격을 잃은 후보를 빼고 준다 — 상품이 사라졌거나, 카드 자격을 잃었거나,
// 성별 라벨이 바뀌었거나, 라벨 의심으로 걸린 경우다. 우리 전수 조사가 라벨을 고치므로
// 이 일은 실제로 일어난다. 몇 장이 남았는지는 부르는 쪽이 세어 판단한다.

import type { OnboardingCandidate } from "@/features/onboarding/domain/candidate";
import type { GenderChoice } from "@/shared/gender/gender-setting";
import { rpcPost } from "@/shared/supabase-rpc";

interface CandidateDto {
  version: string;
  goods_no: number;
  ord: number;
  title: string | null;
  brand_name: string | null;
  thumbnail: string;
  width: number;
  height: number;
}

/**
 * 후보 한 판.
 *
 * **판 번호를 함께 준다.** 저장할 때 서버가 지금 판을 다시 읽으면, 화면을 보는
 * 도중 목록이 갈렸을 때 **사용자가 보지 않은 판**으로 기록된다. 어느 판을 봤는지는
 * 첫 배포 뒤 되살릴 수 없는 데이터라 추측으로 채우면 안 된다(교차 리뷰 ⑥).
 */
export interface OnboardingCandidatePage {
  version: string;
  candidates: OnboardingCandidate[];
}

export async function fetchOnboardingCandidates(
  gender: GenderChoice,
): Promise<OnboardingCandidatePage> {
  const dtos = await rpcPost<CandidateDto[]>(
    "c_onboarding_candidates_get",
    { p_gender: gender },
    // 첫 화면이라 오래 기다리게 두지 않는다. 실패하면 다시 시도할 수 있다.
    { timeoutMs: 8_000 },
  );
  // 판 번호는 모든 행에 같은 값으로 실려 온다 — 행이 없으면 알 수 없는데, 그때는
  // 고를 것도 없으므로 저장까지 갈 일이 없다. (타입은 빈 배열 접근을 걸러 주지
  // 않으므로 길이로 본다.)
  if (dtos.length === 0) return { version: "", candidates: [] };

  const candidates = dtos.map((dto) => ({
    goodsNo: dto.goods_no,
    ord: dto.ord,
    title: dto.title ?? "티셔츠",
    brandName: dto.brand_name,
    thumbnail: dto.thumbnail,
    width: dto.width,
    height: dto.height,
  }));
  return { version: dtos[0].version, candidates };
}
