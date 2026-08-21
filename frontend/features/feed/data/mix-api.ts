import { type FeedProductDto, mapFeedDto } from "@/features/feed/data/feed-api";
import type { Product } from "@/features/feed/domain/product";
import { slotImageUrl } from "@/features/feed/domain/similar";
import type { GenderChoice } from "@/shared/gender/gender-setting";
import { rpcPost } from "@/shared/supabase-rpc";

// c_mix_page RPC 응답 행 — 피드 행 + 매칭 슬롯 + 포트폴리오 유형 + 신선도
export interface MixProductDto extends FeedProductDto {
  slot: number;
  source_bucket: string;
  is_fresh: boolean | null;
}

export function mapMixDto(dto: MixProductDto): Product {
  const base = mapFeedDto(dto);
  return {
    ...base,
    sourceBucket: dto.source_bucket,
    isFresh: dto.is_fresh ?? undefined,
    // 갤러리 사진이 매칭된 경우(세션·장기 슬롯) 그 사진을 카드로 보여준다 (O-27)
    matchedImage:
      dto.slot > 0
        ? { slot: dto.slot, url: slotImageUrl(base.thumbnail, base.gallery, dto.slot) }
        : undefined,
  };
}

export interface MixPageRequest {
  sessionAnchors: { goodsNo: number; weight: number }[];
  longAnchors: { goodsNo: number; weight: number }[];
  /** 최근 노출 + 이미 받은 상품 — 같은 세션 재노출 방지 (설계 §7, 상한 600) */
  exclude: number[];
  seed: number;
  size: number;
  boost: boolean;
  /** 우세 성별 하드 필터 — null이면 서버가 무시해 기존과 같은 동작 */
  /** 사람이 고른 성별. 필수 — 서버가 등식으로 거른다. */
  gender: GenderChoice;
}

/** 5유형 포트폴리오 믹스 한 페이지 (개인화 피드) */
export async function fetchMixPage(request: MixPageRequest): Promise<Product[]> {
  const toAnchor = (a: { goodsNo: number; weight: number }) => ({
    g: a.goodsNo,
    // 서버는 float 하나만 필요 — 소수 자리 축소로 페이로드를 줄인다
    w: Math.round(a.weight * 100) / 100,
  });
  const dtos = await rpcPost<MixProductDto[]>(
    "c_mix_page",
    {
      p_session: request.sessionAnchors.map(toAnchor),
      p_long: request.longAnchors.map(toAnchor),
      p_exclude: request.exclude.slice(0, 600),
      p_seed: request.seed,
      p_size: request.size,
      p_boost: request.boost,
      p_gender: request.gender,
    },
    // 서버가 느려질 때(콜드) 스켈레톤을 오래 잡고 있지 않도록 —
    // 초과 시 호출부가 무작위 피드로 폴백한다 (설계 §9)
    { timeoutMs: 5_000 },
  );
  return dtos.map(mapMixDto);
}
