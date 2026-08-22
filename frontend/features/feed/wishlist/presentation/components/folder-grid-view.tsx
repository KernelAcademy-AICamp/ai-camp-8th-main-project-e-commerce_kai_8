"use client";

import Link from "next/link";

import { MAX_FOLDER_NAME } from "@/features/feed/wishlist/domain/wish-folders";
import { wishlistNoticeMessage } from "@/features/feed/wishlist/domain/wishlist-notice";
import { FolderThumbs } from "@/features/feed/wishlist/presentation/components/folder-thumbs";
import { useWishlistFolders } from "@/features/feed/wishlist/presentation/view-model/use-wishlist-folders";
import { BackLink } from "@/shared/history/back-link";
import { BackIcon } from "@/shared/icons";

/**
 * 보관함 첫 화면 — 폴더 2열 그리드 (docs/plans/2026-08-20-wishlist-folders.md 4단계).
 *
 * 타일 = 겹쳐 쌓인 최근 찜 + 이름·개수. 마지막 타일은 + (그 자리 인라인 입력).
 * 폴더를 누르면 상세(/wishlist/<id>)로 — 기본 폴더는 "default".
 */
export function FolderGridView() {
  const view = useWishlistFolders();
  const message = wishlistNoticeMessage(view.notice);

  return (
    <div className="mx-auto max-w-md px-4 pb-10">
      {/* 뒤로가기 좌표를 마이페이지와 맞춘다 — 왼쪽 16px·위 8px (전 화면 공통) */}
      <header className="-mx-2 flex items-center gap-1 py-2">
        <BackLink
          href="/"
          label="피드로 돌아가기"
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft"
        >
          <BackIcon />
        </BackLink>
        <h1 className="text-lg font-semibold text-ink">
          보관함{view.totalCount > 0 && ` ${String(view.totalCount)}`}
        </h1>
      </header>

      {message !== null && (
        <p role="status" className="mb-2 text-sm text-star">
          {message}
        </p>
      )}

      {/* 로그인 판정 전 — 완성 화면과 같은 배치의 스켈레톤으로 영역을 잡는다 */}
      {view.access !== "in" && (
        <div
          aria-label="불러오는 중"
          className="grid animate-pulse grid-cols-2 gap-x-3 gap-y-5 pt-2"
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className="aspect-square w-full rounded-lg bg-skel-1" />
              <div className="mt-2 h-4 w-20 rounded bg-skel-1" />
              <div className="mt-1 h-3 w-10 rounded bg-skel-1" />
            </div>
          ))}
        </div>
      )}

      {view.access === "in" && (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-5 pt-2">
          {view.summaries.map((folder) => (
            <li key={folder.id ?? "default"}>
              <Link href={`/wishlist/${folder.id ?? "default"}`} className="block">
                <FolderThumbs thumbs={folder.thumbs} />
                <span className="mt-2 block truncate font-medium text-ink">
                  {folder.name}
                </span>
                <span className="block text-sm text-ink-muted">{folder.count}개</span>
              </Link>
            </li>
          ))}

          <li>
            {view.creating ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void view.submitCreate();
                }}
              >
                <div className="flex aspect-square w-full scale-95 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line px-3">
                  <input
                    autoFocus
                    value={view.draftName}
                    onChange={(event) => {
                      view.setDraftName(event.target.value);
                    }}
                    maxLength={MAX_FOLDER_NAME}
                    placeholder="새 폴더 이름"
                    aria-label="새 폴더 이름"
                    className="w-full border-b border-line bg-transparent pb-1 text-center text-ink outline-none placeholder:text-ink-muted"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={view.cancelCreating}
                      className="cursor-pointer rounded-full border border-line px-3.5 py-1.5 text-sm text-ink-soft"
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      disabled={view.saving}
                      className="cursor-pointer rounded-full bg-slate neo-drop px-3.5 py-1.5 text-sm font-medium text-on-slate disabled:opacity-60"
                    >
                      만들기
                    </button>
                  </div>
                </div>
                {view.createError !== null && (
                  <p role="status" className="mt-2 text-xs text-star">
                    {view.createError}
                  </p>
                )}
              </form>
            ) : (
              <button
                type="button"
                onClick={view.startCreating}
                className="block w-full cursor-pointer text-left"
              >
                {/* 폴더 타일과 같은 틀, 사진 대신 + */}
                <span className="flex aspect-square w-full scale-95 items-center justify-center rounded-lg border border-dashed border-line text-3xl font-light text-ink-muted">
                  +
                </span>
                <span className="mt-2 block font-medium text-ink-soft">새 폴더</span>
              </button>
            )}
          </li>
        </ul>
      )}
    </div>
  );
}
