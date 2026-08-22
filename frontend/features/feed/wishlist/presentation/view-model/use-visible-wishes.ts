"use client";

import { useMemo } from "react";

import { selectVisibleWishes } from "@/features/feed/wishlist/domain/wish-gender";
import type { WishlistEntry } from "@/features/feed/wishlist/domain/wishlist";
import { useGenderSetting } from "@/shared/gender/use-gender-setting";

/**
 * 보관함 화면이 그릴 **화면용 목록**. 원본은 그대로 두고 파생만 만든다.
 *
 * **성별을 읽는 곳은 여기 하나뿐이다.** 보관함 세 화면(폴더 그리드·폴더 상세·
 * 담기 시트)이 모두 이 훅을 통과하므로, 한 화면만 필터가 빠지는 일이 없다.
 *
 * ⚠️ **원본이 필요한 곳에 이 값을 쓰지 않는다** — 상세 화면의 하트 판정, 담기/빼기,
 * 로그인 시 기기 찜 승계는 전부 원본 기준이어야 한다. 화면용으로 승계하면 사용자
 * 데이터가 사라진다(설계 "왜 그냥 거르면 안 되나").
 */
export function useVisibleWishes(entries: readonly WishlistEntry[]) {
  const gender = useGenderSetting();
  return useMemo(() => selectVisibleWishes(entries, gender), [entries, gender]);
}
