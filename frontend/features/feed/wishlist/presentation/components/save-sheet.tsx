"use client";

import type { WishFolder } from "@/features/feed/wishlist/domain/wish-folders";
import {
  MAX_FOLDER_NAME,
  summarizeFolders,
} from "@/features/feed/wishlist/domain/wish-folders";
import type { WishlistEntry } from "@/features/feed/wishlist/domain/wishlist";
import { FolderThumbs } from "@/features/feed/wishlist/presentation/components/folder-thumbs";

/**
 * 담기 바텀시트 — 하트를 누르면 올라와 폴더를 고르게 한다.
 *
 * 상태·동작은 use-save-sheet 훅이 들고, 여기는 표시만 한다.
 * 그냥 닫으면(배경 탭·닫기) 찜되지 않는다 — 매번 선택이 원칙.
 */
export function SaveSheet({
  folders,
  entries,
  onPick,
  onClose,
  creating,
  onStartCreating,
  draftName,
  onDraftName,
  createError,
  saving,
  onSubmitCreate,
}: {
  folders: WishFolder[];
  /** 폴더별 개수·썸네일을 세는 목록. 보관함 화면과 같은 **화면용** 목록이다 */
  entries: readonly WishlistEntry[];
  onPick: (folderId: string | null) => void;
  onClose: () => void;
  creating: boolean;
  onStartCreating: () => void;
  draftName: string;
  onDraftName: (value: string) => void;
  createError: string | null;
  saving: boolean;
  onSubmitCreate: () => void;
}) {
  const summaries = summarizeFolders(folders, entries);

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-label="담을 폴더 고르기">
      {/* 배경 탭 = 담지 않고 닫기 */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 cursor-pointer bg-dim"
      />
      <div className="absolute right-0 bottom-0 left-0 mx-auto max-w-md rounded-t-[22px] bg-surface shadow-[0_-4px_18px_rgb(30_38_55/0.22)] pb-[max(env(safe-area-inset-bottom),1rem)]">
        <div aria-hidden className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-fill-deep" />
        <h2 className="px-5 pt-4 pb-1 text-base font-semibold text-ink">
          어디에 담을까요
        </h2>

        <ul className="max-h-[50vh] overflow-y-auto px-2">
          {summaries.map((folder) => (
            <li key={folder.id ?? "default"}>
              <button
                type="button"
                onClick={() => {
                  onPick(folder.id);
                }}
                className="flex w-full cursor-pointer items-center gap-3.5 rounded-xl px-3 py-2.5 text-left active:bg-fill-soft"
              >
                <FolderThumbs thumbs={folder.thumbs} sizePx={52} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">
                    {folder.name}
                  </span>
                  <span className="block text-sm text-ink-muted">{folder.count}개</span>
                </span>
              </button>
            </li>
          ))}

          <li className="pb-2">
            {creating ? (
              <form
                className="flex items-center gap-3.5 px-3 py-2.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSubmitCreate();
                }}
              >
                {/* + 타일과 같은 틀 — 새 폴더가 이 자리에 생긴다는 예고 */}
                <span
                  aria-hidden
                  className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border border-dashed border-line text-xl text-ink-muted"
                >
                  +
                </span>
                <span className="min-w-0 flex-1">
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(event) => {
                      onDraftName(event.target.value);
                    }}
                    maxLength={MAX_FOLDER_NAME}
                    placeholder="새 폴더 이름"
                    aria-label="새 폴더 이름"
                    className="w-full border-b border-line bg-transparent pb-1 text-ink outline-none placeholder:text-ink-muted"
                  />
                  {createError !== null && (
                    <span role="status" className="mt-1 block text-xs text-star">
                      {createError}
                    </span>
                  )}
                </span>
                <button
                  type="submit"
                  disabled={saving}
                  className="shrink-0 cursor-pointer rounded-full bg-slate neo-drop px-4 py-2 text-sm font-medium text-on-slate disabled:opacity-60"
                >
                  담기
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={onStartCreating}
                className="flex w-full cursor-pointer items-center gap-3.5 rounded-xl px-3 py-2.5 text-left active:bg-fill-soft"
              >
                <span
                  aria-hidden
                  className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border border-dashed border-line text-xl text-ink-muted"
                >
                  +
                </span>
                <span className="font-medium text-ink-soft">새 폴더</span>
              </button>
            )}
          </li>
        </ul>
      </div>
    </div>
  );
}
