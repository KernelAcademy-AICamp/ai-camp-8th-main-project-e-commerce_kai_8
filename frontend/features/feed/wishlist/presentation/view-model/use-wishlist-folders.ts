"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { createAccountFolder } from "@/features/feed/wishlist/data/account-wish-actions";
import {
  DuplicateFolderError,
  FolderLimitError,
} from "@/features/feed/wishlist/data/wishlist-api";
import {
  normalizeFolderName,
  summarizeFolders,
} from "@/features/feed/wishlist/domain/wish-folders";
import { useWishlist } from "@/features/feed/wishlist/presentation/view-model/use-wishlist";

/** 보관함 첫 화면(폴더 그리드)의 상태·동작 */
export function useWishlistFolders() {
  const router = useRouter();
  const { entries, folders, notice, access } = useWishlist();

  useEffect(() => {
    if (access === "out") router.replace("/login");
  }, [access, router]);

  const summaries = useMemo(
    () => summarizeFolders(folders, entries),
    [folders, entries],
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
    totalCount: entries.length,
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
