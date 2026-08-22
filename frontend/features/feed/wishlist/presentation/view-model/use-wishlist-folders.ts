"use client";

import { useCallback, useMemo, useState } from "react";

import { createAccountFolder } from "@/features/feed/wishlist/data/account-wish-actions";
import {
  DuplicateFolderError,
  FolderLimitError,
} from "@/features/feed/wishlist/data/wishlist-api";
import {
  normalizeFolderName,
  summarizeFolders,
} from "@/features/feed/wishlist/domain/wish-folders";
import { useVisibleWishes } from "@/features/feed/wishlist/presentation/view-model/use-visible-wishes";
import { useWishlist } from "@/features/feed/wishlist/presentation/view-model/use-wishlist";

/**
 * 보관함 첫 화면(폴더 그리드)의 상태·동작.
 *
 * ⚠️ **여기서 화면을 옮기지 않는다.** 비회원을 로그인으로 보내는 일은 보관함
 * 화면의 몫이다. 이 훅은 프로필의 활동 요약 3칸도 같이 쓰는데, 훅이 이동을
 * 들고 있으면 **프로필에서 로그아웃하는 순간 통계 칸이 화면을 로그인으로
 * 끌고 간다** — 실제로 그랬다(2026-08-22). `access`를 그대로 내보내고 판단은
 * 화면이 한다.
 */
export function useWishlistFolders() {
  const { entries, folders, notice, access } = useWishlist();

  // 타일 개수·썸네일은 화면용이다 — 타일에 적힌 수와 폴더를 열었을 때 보이는
  // 장 수가 어긋나면 안 된다 (설계 "개수 계약").
  const visible = useVisibleWishes(entries);
  const summaries = useMemo(
    () => summarizeFolders(folders, visible.entries),
    [folders, visible.entries],
  );

  // + 타일의 인라인 입력
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startCreating = useCallback(() => {
    setCreating(true);
    setDraftName("");
    setCreateError(null);
  }, []);

  const cancelCreating = useCallback(() => {
    setCreating(false);
    setCreateError(null);
  }, []);

  const submitCreate = useCallback(async () => {
    const name = normalizeFolderName(draftName);
    if (name === null) {
      setCreateError("이름은 1~24자로 적어주세요");
      return;
    }
    setSaving(true);
    setCreateError(null);
    try {
      await createAccountFolder(name);
      setCreating(false);
      setDraftName("");
    } catch (error) {
      if (error instanceof DuplicateFolderError || error instanceof FolderLimitError) {
        setCreateError(error.message);
      } else {
        setCreateError("지금은 폴더를 만들지 못했어요");
      }
    } finally {
      setSaving(false);
    }
  }, [draftName]);

  return {
    access,
    notice,
    summaries,
    totalCount: visible.entries.length,
    /** 보이는 찜의 저장 시각들 — 활동 요약이 "이번 주 발견"을 셀 때 쓴다 */
    savedAtMs: visible.entries.map((entry) => entry.addedAtMs),
    creating,
    startCreating,
    cancelCreating,
    draftName,
    setDraftName,
    createError,
    saving,
    submitCreate,
  };
}
