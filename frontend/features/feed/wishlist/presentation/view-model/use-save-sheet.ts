"use client";

import { useCallback, useState } from "react";

import type { Product } from "@/features/feed/domain/product";
import { createAccountFolder } from "@/features/feed/wishlist/data/account-wish-actions";
import {
  DuplicateFolderError,
  FolderLimitError,
} from "@/features/feed/wishlist/data/wishlist-api";
import { normalizeFolderName } from "@/features/feed/wishlist/domain/wish-folders";

/**
 * 담기 바텀시트의 상태·동작 (docs/plans/2026-08-20-wishlist-folders.md 3단계).
 *
 * 시트는 하트를 누른 상품 하나를 들고 열린다. 폴더를 고르면 담고 닫힌다 —
 * 그냥 닫으면 찜되지 않는다(매번 선택이 원칙).
 */
export function useSaveSheet(
  save: (product: Product, folderId: string | null) => void,
) {
  /** 시트가 들고 있는 상품. null이면 닫힘. */
  const [pending, setPending] = useState<Product | null>(null);
  /** 인라인 새 폴더 입력이 펼쳐져 있는가 */
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const open = useCallback((product: Product) => {
    setPending(product);
    setCreating(false);
    setDraftName("");
    setCreateError(null);
    setSaving(false);
  }, []);

  const close = useCallback(() => {
    setPending(null);
  }, []);

  /** 폴더를 골랐다 — 담고 닫는다 */
  const pick = useCallback(
    (folderId: string | null) => {
      if (pending === null) return;
      save(pending, folderId);
      setPending(null);
    },
    [pending, save],
  );

  const startCreating = useCallback(() => {
    setCreating(true);
    setDraftName("");
    setCreateError(null);
  }, []);

  /** 새 폴더를 만들면서 바로 담는다 */
  const submitCreate = useCallback(async () => {
    const name = normalizeFolderName(draftName);
    if (name === null) {
      setCreateError("이름은 1~24자로 적어주세요");
      return;
    }
    setSaving(true);
    setCreateError(null);
    try {
      const id = await createAccountFolder(name);
      pick(id);
    } catch (error) {
      if (error instanceof DuplicateFolderError || error instanceof FolderLimitError) {
        setCreateError(error.message);
      } else {
        setCreateError("지금은 폴더를 만들지 못했어요");
      }
    } finally {
      setSaving(false);
    }
  }, [draftName, pick]);

  return {
    pending,
    open,
    close,
    pick,
    creating,
    startCreating,
    draftName,
    setDraftName,
    createError,
    saving,
    submitCreate,
  };
}
