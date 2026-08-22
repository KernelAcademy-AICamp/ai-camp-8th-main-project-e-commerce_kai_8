"use client";

import Link from "next/link";

import { MAX_FOLDER_NAME } from "@/features/feed/wishlist/domain/wish-folders";
import { wishlistNoticeMessage } from "@/features/feed/wishlist/domain/wishlist-notice";
import { FolderCover } from "@/features/feed/wishlist/presentation/components/folder-cover";
import { useWishlistFolders } from "@/features/feed/wishlist/presentation/view-model/use-wishlist-folders";
import { BackLink } from "@/shared/history/back-link";
import { BackIcon, PlusIcon } from "@/shared/icons";

/**
 * 보관함 첫 화면 — 폴더 2열 그리드 (docs/plans/2026-08-20-wishlist-folders.md 4단계).
 *
 * 시안 `.savebar`를 따른다. 그 패널은 화면 전체를 덮는 불투명 판이라, 주소를 가진
 * 이 화면으로 두어도 보이는 결과가 같다 — 주소·뒤로가기·새로고침이 그대로 산다.
 *
 * 시안과 맞춘 것 넷: **새 폴더가 맨 앞**, 이름·개수는 표지 **위**, 뒤 장은 사진이
 * 아니라 톤 카드, 목록에서는 제목을 비운다(폴더를 열면 그 자리에 폴더 이름이 온다).
 */
export function FolderGridView() {
  const view = useWishlistFolders();
  const message = wishlistNoticeMessage(view.notice);

  return (
    <div className="panel-in mx-auto max-w-md px-[22px] pb-[30px]">
      {/* 시안 `.save-head` — 닫기 원버튼과 제목. 목록에서는 제목이 비어 있다. */}
      <header className="flex items-center gap-3 pt-6 pb-5">
        <BackLink
          href="/"
          label="저장 폴더 닫기"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app text-ink-soft neo active:neo-in"
        >
          <BackIcon />
        </BackLink>
        <h1 className="sr-only">
          보관함{view.totalCount > 0 && ` ${String(view.totalCount)}`}
        </h1>
      </header>

      {message !== null && (
        <p role="status" className="mb-2 text-sm text-star">
          {message}
        </p>
      )}

      {/* 로그인 판정 전 — 완성 화면과 같은 배치의 뼈대로 영역을 잡는다 */}
      {view.access !== "in" && (
        <div aria-label="불러오는 중" className="grid grid-cols-2 gap-x-4 gap-y-[22px]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skel-fill aspect-square w-full rounded-[20px]" />
          ))}
        </div>
      )}

      {view.access === "in" && (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-[22px]">
          {/* 시안은 새 폴더를 맨 앞에 둔다 — 만들기가 늘 같은 자리에 있다 */}
          <li>
            {view.creating ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void view.submitCreate();
                }}
              >
                <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-[18px] border-[1.6px] border-dashed border-[#B9C0CF] px-4">
                  <input
                    autoFocus
                    value={view.draftName}
                    onChange={(event) => {
                      view.setDraftName(event.target.value);
                    }}
                    maxLength={MAX_FOLDER_NAME}
                    placeholder="새 폴더 이름"
                    aria-label="새 폴더 이름"
                    className="w-full border-b border-line bg-transparent pb-1 text-center text-base text-ink outline-none placeholder:text-ink-muted"
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
                      className="cursor-pointer rounded-full bg-slate px-3.5 py-1.5 text-sm font-medium text-on-slate neo-drop disabled:opacity-60"
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
                aria-label="새 폴더 만들기"
                className="relative block aspect-square w-full cursor-pointer rounded-[18px] border-[1.6px] border-dashed border-[#B9C0CF] px-[15px] py-4 text-left"
              >
                <strong className="block text-[14px] font-extrabold text-ink-soft">
                  새 폴더
                </strong>
                <span className="mt-1 block text-[11px] font-[650] text-ink-muted">
                  탭해서 만들기
                </span>
                <span className="absolute top-1/2 left-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-slate text-on-slate shadow-[0_2px_6px_rgb(30_38_55/0.25)]">
                  <PlusIcon size={19} />
                </span>
              </button>
            )}
          </li>

          {view.summaries.map((folder) => (
            <li key={folder.id ?? "default"}>
              <Link href={`/wishlist/${folder.id ?? "default"}`} className="block">
                <FolderCover
                  thumb={folder.thumbs[0]}
                  name={folder.name}
                  count={folder.count}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
