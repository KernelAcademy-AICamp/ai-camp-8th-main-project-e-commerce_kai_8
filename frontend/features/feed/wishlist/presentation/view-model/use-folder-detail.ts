"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDetailState } from "@/features/feed/detail/presentation/view-model/use-detail-state";
import { formatPrice } from "@/features/feed/domain/format-price";
import { distributeToColumns } from "@/features/feed/domain/masonry";
import type { FeedCardViewData } from "@/features/feed/presentation/view-model/use-feed-view-model";
import {
  deleteAccountFolder,
  renameAccountFolder,
} from "@/features/feed/wishlist/data/account-wish-actions";
import { DuplicateFolderError } from "@/features/feed/wishlist/data/wishlist-api";
import {
  DEFAULT_FOLDER_NAME,
  entriesInFolder,
  normalizeFolderName,
} from "@/features/feed/wishlist/domain/wish-folders";
import { useWishlist } from "@/features/feed/wishlist/presentation/view-model/use-wishlist";

/**
 * 폴더 상세의 상태·동작. 라우트 조각 "default"가 기본 폴더다.
 *
 * 이름 바꾸기·삭제는 기본 폴더에는 없다 — 기본은 서버에 행이 없는 "폴더 미지정"
 * 묶음이라 바꿀 대상 자체가 없다.
 */
export function useFolderDetail(folderParam: string) {
  const router = useRouter();
  const { entries, folders, notice, access } = useWishlist();
  const folderId = folderParam === "default" ? null : folderParam;
  const isDefault = folderId === null;

  useEffect(() => {
    if (access === "out") router.replace("/login");
  }, [access, router]);

  const folder = isDefault ? null : folders.find((f) => f.id === folderId);
  // 지워진(또는 남의) 폴더로 들어오면 그리드로 돌려보낸다. 폴더 목록이 아직
  // 안 읽혔을 수도 있으므로, 목록이 있는데 없을 때만 판단한다.
  useEffect(() => {
    if (access === "in" && !isDefault && folders.length > 0 && folder === undefined) {
      router.replace("/wishlist");
    }
  }, [access, isDefault, folders.length, folder, router]);

  const name = isDefault ? DEFAULT_FOLDER_NAME : (folder?.name ?? "");

  const mine = useMemo(() => entriesInFolder(entries, folderId), [entries, folderId]);
  const columns = useMemo(() => {
    const cards: FeedCardViewData[] = mine.map((entry, index) => ({
      feedKey: `wish-${String(entry.product.goodsNo)}`,
      product: entry.product,
      priceLabel: formatPrice(entry.product.priceFinal),
      width: entry.product.width,
      height: entry.product.height,
      rank: index,
    }));
    return distributeToColumns(cards, 2);
  }, [mine]);

  const detail = useDetailState("wishlist");
  // 폴더 상세는 무한 스크롤이 없다 — FeedGrid 계약용 더미 센티널
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ── 관리 (이름 바꾸기·삭제) ──
  const [mode, setMode] = useState<"view" | "menu" | "rename" | "confirmDelete">(
    "view",
  );
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openMenu = useCallback(() => {
    setMode((current) => (current === "view" ? "menu" : "view"));
    setError(null);
  }, []);

  const startRename = useCallback(() => {
    setMode("rename");
    setDraftName(name);
    setError(null);
  }, [name]);

  const startDelete = useCallback(() => {
    setMode("confirmDelete");
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    setMode("view");
    setError(null);
  }, []);

  const submitRename = useCallback(async () => {
    if (folderId === null) return;
    const next = normalizeFolderName(draftName);
    if (next === null) {
      setError("이름은 1~24자로 적어주세요");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await renameAccountFolder(folderId, next);
      setMode("view");
    } catch (cause) {
      setError(
        cause instanceof DuplicateFolderError
          ? cause.message
          : "지금은 이름을 바꾸지 못했어요",
      );
    } finally {
      setBusy(false);
    }
  }, [folderId, draftName]);

  const submitDelete = useCallback(async () => {
    if (folderId === null) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccountFolder(folderId);
      router.replace("/wishlist");
    } catch {
      setError("지금은 폴더를 지우지 못했어요");
      setBusy(false);
    }
  }, [folderId, router]);

  return {
    access,
    notice,
    name,
    isDefault,
    count: mine.length,
    columns,
    hasEntries: mine.length > 0,
    detail,
    sentinelRef,
    mode,
    openMenu,
    startRename,
    startDelete,
    cancel,
    draftName,
    setDraftName,
    error,
    busy,
    submitRename,
    submitDelete,
  };
}
