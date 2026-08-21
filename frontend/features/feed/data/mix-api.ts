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
  /**
   * 후보풀 커서 — **문자열이다.** 서버가 text로 내보낸다.
   *
   * bigint로 내보내면 PostgREST가 JSON 숫자로 직렬화하고 `JSON.parse`가 53비트로
   * 깎는다(실측: `-9174854730392098679`가 137 어긋났다).
   *
   * 그 어긋남이 **지금 데이터에서 상품을 건너뛰거나 되풀이하지는 않는다** — 이웃
   * 해시 간격이 최소 4.8억인데 반올림 오차는 최대 1,024다. text로 두는 것은
   * 버그를 막아서가 아니라 데이터에 기댄 그 여유를 공짜로 없앨 수 있어서다.
   * 자세한 근거는 마이그레이션 20260822300000 머리주석.
   */
  next_hk: string | null;
  next_no: string | null;
  /** 커서 뒤에 후보풀 행이 더 없다 — 뜻은 이것 하나뿐이다 */
  pool_exhausted: boolean | null;
}

/** 후보풀 커서. 절대 number로 바꾸지 않는다 (위 주석). */
export interface MixCursor {
  hk: string;
  no: string;
}

export interface MixPage {
  products: Product[];
  /** 다음 요청에 그대로 실어 보낸다. 응답이 비었으면 null — 호출부가 들고 있던 값을 유지한다 */
  cursor: MixCursor | null;
  exhausted: boolean;
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
  /** 지난 응답의 커서. 첫 페이지면 null. */
  after: MixCursor | null;
}

/** 5유형 포트폴리오 믹스 한 페이지 (개인화 피드) */
export async function fetchMixPage(request: MixPageRequest): Promise<MixPage> {
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
      // **뒤에서** 자른다. 앞에서 자르면 오래된 600개에 고정돼, 그 뒤에 받은 상품이
      // 영원히 무방비가 된다 — 개인화 피드가 630개에서 멎던 원인이다.
      p_exclude: request.exclude.slice(-600),
      p_seed: request.seed,
      p_size: request.size,
      p_boost: request.boost,
      p_gender: request.gender,
      p_after_hk: request.after?.hk ?? null,
      p_after_no: request.after?.no ?? null,
    },
    // 서버가 느려질 때(콜드) 스켈레톤을 오래 잡고 있지 않도록 —
    // 초과 시 호출부가 무작위 피드로 폴백한다 (설계 §9)
    { timeoutMs: 5_000 },
  );
  // 응답이 비면 커서도 소진 신호도 실려 오지 않는다(행에 붙어 오기 때문이다).
  // 호출부는 들고 있던 커서를 유지하고, 빈 페이지는 기존 소진 처리가 맡는다.
  if (dtos.length === 0) return { products: [], cursor: null, exhausted: false };
  // 커서는 모든 행에 같은 값으로 실려 온다 — 첫 행만 보면 된다.
  const [head] = dtos;
  return {
    products: dtos.map(mapMixDto),
    cursor:
      head.next_hk !== null && head.next_no !== null
        ? { hk: head.next_hk, no: head.next_no }
        : null,
    exhausted: head.pool_exhausted === true,
  };
}
