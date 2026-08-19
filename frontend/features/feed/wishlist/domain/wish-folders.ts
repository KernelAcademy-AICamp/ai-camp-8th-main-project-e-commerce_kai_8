// 보관함 폴더 — 순수 로직 (docs/plans/2026-08-20-wishlist-folders.md).
//
// 기본 폴더는 행이 없다. 폴더 참조(folderId)가 null인 찜의 묶음을 화면에서
// "기본"이라는 이름으로 보여줄 뿐이다 — 그래서 이름 변경·삭제 대상이 아니다.

import type { WishlistEntry } from "@/features/feed/wishlist/domain/wishlist";

/** 서버 상한과 같은 값 (c_wish_folder_create) */
export const MAX_FOLDERS = 20;
/** 서버 검증과 같은 값 — 화면 입력란이 먼저 막는다 */
export const MAX_FOLDER_NAME = 24;

export interface WishFolder {
  id: string;
  name: string;
}

/** 기본 폴더의 화면 식별자 — 서버에는 없는 값이다 */
export const DEFAULT_FOLDER_ID = null;
export const DEFAULT_FOLDER_NAME = "기본";

/** 폴더 타일 하나를 그리는 데 필요한 전부 */
export interface FolderSummary {
  /** null = 기본 폴더 */
  id: string | null;
  name: string;
  count: number;
  /** 겹쳐 쌓아 보여줄 최근 찜 썸네일 — 최신부터, 최대 3장 */
  thumbs: string[];
}

/** 타일에 겹쳐 보여줄 썸네일 수 */
export const PREVIEW_THUMBS = 3;

function summarize(
  id: string | null,
  name: string,
  entries: readonly WishlistEntry[],
): FolderSummary {
  const mine = entries.filter((entry) => entry.folderId === id);
  return {
    id,
    name,
    count: mine.length,
    thumbs: mine.slice(0, PREVIEW_THUMBS).map((entry) => entry.product.thumbnail),
  };
}

/**
 * 폴더 그리드가 그릴 목록. 기본 폴더가 맨 앞, 나머지는 만든 순서.
 * entries는 최신 찜부터 정렬돼 있다고 본다(c_wish_page 계약).
 */
export function summarizeFolders(
  folders: readonly WishFolder[],
  entries: readonly WishlistEntry[],
): FolderSummary[] {
  return [
    summarize(DEFAULT_FOLDER_ID, DEFAULT_FOLDER_NAME, entries),
    ...folders.map((folder) => summarize(folder.id, folder.name, entries)),
  ];
}

/** 시트·입력란이 함께 쓰는 이름 검증 — 서버(1~24자, 공백 다듬기)와 같은 규칙 */
export function normalizeFolderName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < 1 || name.length > MAX_FOLDER_NAME) return null;
  return name;
}

/** 폴더 상세가 보여줄 찜 목록 */
export function entriesInFolder(
  entries: readonly WishlistEntry[],
  folderId: string | null,
): WishlistEntry[] {
  return entries.filter((entry) => entry.folderId === folderId);
}
