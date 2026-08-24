"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { MAX_FOLDER_NAME } from "@/features/feed/wishlist/domain/wish-folders";
import { wishlistNoticeMessage } from "@/features/feed/wishlist/domain/wishlist-notice";
import { FolderThumbs } from "@/features/feed/wishlist/presentation/components/folder-thumbs";
import { useFolderOpen } from "@/features/feed/wishlist/presentation/view-model/use-folder-open";
import { useWishlistFolders } from "@/features/feed/wishlist/presentation/view-model/use-wishlist-folders";
import { BackLink } from "@/shared/history/back-link";
import { BackIcon } from "@/shared/icons";

/**
 * 보관함 첫 화면 — 폴더 2열 그리드 (docs/plans/2026-08-20-wishlist-folders.md 4단계).
 *
 * 타일 = 겹쳐 쌓인 최근 찜 + 이름(사진 위 우측 하단 오버레이 — 홈 피드 가격 배지와 같은 자리).
 * 마지막 타일은 + (그 자리 인라인 입력).
 * 폴더를 누르면 상세(/wishlist/<id>)로 — 브라우저 View Transitions로 자연스럽게
 * 넘어간다(`useFolderOpen`). 기본 폴더는 "default".
 */
export function FolderGridView() {
  const router = useRouter();
  const view = useWishlistFolders();

  // 보관함은 회원만 볼 수 있다. **이 판단은 화면이 한다** — 훅에 두었더니 같은
  // 훅을 쓰는 프로필의 통계 칸까지 로그인으로 끌고 갔다(2026-08-22).
  const { access } = view;
  useEffect(() => {
    if (access === "out") router.replace("/login");
  }, [access, router]);

  const message = wishlistNoticeMessage(view.notice);
  const openFolder = useFolderOpen();

  return (
    <div className="mx-auto max-w-md px-4 pb-10">
      {/* 뒤로가기 좌표를 마이페이지와 맞춘다 — 왼쪽 16px·위 8px (전 화면 공통) */}
      <header className="-mx-2 flex items-center gap-1 py-2">
        <BackLink
          href="/"
          label="피드로 돌아가기"
          className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-400"
        >
          <BackIcon />
        </BackLink>
        <h1 className="text-lg font-semibold text-white">보관함</h1>
      </header>

      {message !== null && (
        <p role="status" className="mb-2 text-sm text-amber-400">
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
            <div
              key={i}
              className="relative aspect-square w-full rounded-lg bg-neutral-800"
            >
              <div className="absolute right-3 bottom-3 h-4 w-16 rounded-[7px] bg-neutral-700" />
            </div>
          ))}
        </div>
      )}

      {view.access === "in" && (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-5 pt-2">
          {view.summaries.map((folder) => (
            <li key={folder.id ?? "default"}>
              <Link
                href={`/wishlist/${folder.id ?? "default"}`}
                className="relative block"
                onClick={(event) => {
                  openFolder(event, `/wishlist/${folder.id ?? "default"}`);
                }}
              >
                <FolderThumbs thumbs={folder.thumbs} />
                {/* 홈 피드 가격 배지(product-card.tsx)와 자리·모양을 맞춘다 */}
                <span className="absolute right-3 bottom-3 max-w-[calc(100%-1.5rem)] truncate rounded-[7px] bg-[rgb(46_52_66/0.55)] px-[7px] py-[3px] text-[10.5px] font-bold tracking-[0.01em] text-on-slate backdrop-blur-[6px]">
                  {folder.name}
                </span>
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
                <div className="flex aspect-square w-full scale-95 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-neutral-700 px-3">
                  <input
                    autoFocus
                    value={view.draftName}
                    onChange={(event) => {
                      view.setDraftName(event.target.value);
                    }}
                    maxLength={MAX_FOLDER_NAME}
                    placeholder="새 폴더 이름"
                    aria-label="새 폴더 이름"
                    className="w-full border-b border-neutral-600 bg-transparent pb-1 text-center text-white outline-none placeholder:text-neutral-600"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={view.cancelCreating}
                      className="cursor-pointer rounded-full border border-neutral-700 px-3.5 py-1.5 text-sm text-neutral-300"
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      disabled={view.saving}
                      className="cursor-pointer rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-[#1f1f1f] disabled:opacity-60"
                    >
                      만들기
                    </button>
                  </div>
                </div>
                {view.createError !== null && (
                  <p role="status" className="mt-2 text-xs text-amber-400">
                    {view.createError}
                  </p>
                )}
              </form>
            ) : (
              <button
                type="button"
                onClick={view.startCreating}
                aria-label="새 폴더 만들기"
                className="block w-full cursor-pointer text-left"
              >
                {/* 폴더 타일과 같은 틀, 사진 대신 + */}
                <span className="flex aspect-square w-full scale-95 items-center justify-center rounded-lg border border-dashed border-neutral-700 text-3xl font-light text-neutral-500">
                  +
                </span>
              </button>
            )}
          </li>
        </ul>
      )}
    </div>
  );
}
