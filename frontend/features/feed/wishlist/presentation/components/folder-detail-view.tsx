"use client";

import Link from "next/link";

import { ProductDetail } from "@/features/feed/detail/presentation/components/product-detail";
import { FeedGrid } from "@/features/feed/presentation/components/feed-grid";
import { MAX_FOLDER_NAME } from "@/features/feed/wishlist/domain/wish-folders";
import { wishlistNoticeMessage } from "@/features/feed/wishlist/domain/wishlist-notice";
import { useFolderDetail } from "@/features/feed/wishlist/presentation/view-model/use-folder-detail";
import { BackLink } from "@/shared/history/back-link";
import { BackIcon } from "@/shared/icons";

/** 폴더 상세 — 그 폴더의 찜 2열 그리드 + 이름 바꾸기·삭제(기본 폴더 제외) */
export function FolderDetailView({ folderParam }: { folderParam: string }) {
  const view = useFolderDetail(folderParam);
  const message = wishlistNoticeMessage(view.notice);

  return (
    <div className="mx-auto max-w-md px-2 pb-10">
      {/* 뒤로가기 좌표를 마이페이지와 맞춘다 — 왼쪽 16px·위 8px (전 화면 공통) */}
      <header className="flex items-center gap-1 px-2 py-2">
        <BackLink
          href="/wishlist"
          label="보관함으로 돌아가기"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft"
        >
          <BackIcon />
        </BackLink>

        {view.mode === "rename" ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void view.submitRename();
            }}
          >
            <input
              autoFocus
              value={view.draftName}
              onChange={(event) => {
                view.setDraftName(event.target.value);
              }}
              maxLength={MAX_FOLDER_NAME}
              aria-label="폴더 이름"
              className="min-w-0 flex-1 border-b border-line bg-transparent pb-0.5 text-lg font-semibold text-ink outline-none"
            />
            <button
              type="button"
              onClick={view.cancel}
              className="shrink-0 cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm text-ink-soft"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={view.busy}
              className="shrink-0 cursor-pointer rounded-full bg-slate neo-drop px-3 py-1.5 text-sm font-medium text-on-slate disabled:opacity-60"
            >
              저장
            </button>
          </form>
        ) : (
          <>
            <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-ink">
              {view.name}
              {view.count > 0 && <span className="text-ink-muted"> {view.count}</span>}
            </h1>
            {!view.isDefault && (
              <button
                type="button"
                aria-label="폴더 관리"
                aria-expanded={view.mode === "menu"}
                onClick={view.openMenu}
                className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-xl text-ink-soft"
              >
                ⋯
              </button>
            )}
          </>
        )}
      </header>

      {view.mode === "menu" && (
        <div className="mx-1 mb-2 flex gap-2">
          <button
            type="button"
            onClick={view.startRename}
            className="flex-1 cursor-pointer rounded-xl bg-well neo py-2.5 text-sm font-medium text-ink"
          >
            이름 바꾸기
          </button>
          <button
            type="button"
            onClick={view.startDelete}
            className="flex-1 cursor-pointer rounded-xl bg-well neo py-2.5 text-sm font-medium text-danger"
          >
            폴더 삭제
          </button>
        </div>
      )}

      {view.mode === "confirmDelete" && (
        <div className="mx-1 mb-3 space-y-3 rounded-xl bg-surface p-4">
          <p className="text-sm text-ink-soft">
            {/* 숨은 찜도 함께 옮겨진다 — 여기만 원본 개수를 쓴다 */}이 폴더를 지울까요?
            담긴 찜 {view.originalCount}개는 기본 폴더로 이동해요.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={view.cancel}
              className="flex-1 cursor-pointer rounded-xl bg-well neo py-2.5 text-sm font-medium text-ink"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                void view.submitDelete();
              }}
              disabled={view.busy}
              className="flex-1 cursor-pointer rounded-xl bg-danger py-2.5 text-sm font-medium text-ink disabled:opacity-60"
            >
              지우기
            </button>
          </div>
        </div>
      )}

      {view.error !== null && (
        <p role="status" className="mx-1 mb-2 text-sm text-star">
          {view.error}
        </p>
      )}

      {message !== null && (
        <p role="status" className="mx-1 mb-2 text-sm text-star">
          {message}
        </p>
      )}

      {/* 로그인 판정이 끝나기 전에는 비어 보이는 화면을 그리지 않는다 */}
      {view.access !== "in" && <div className="py-24" aria-label="불러오는 중" />}

      {/* 성별 설정 때문에 가린 것이 있으면 알린다 — 찜이 사라진 것이 아니다.
          전부 가려진 폴더에서는 아래 "비어 있어요" 대신 이 줄만 보인다. */}
      {view.access === "in" && view.hiddenCount > 0 && (
        <p role="status" className="mx-1 mb-2 text-sm text-ink-muted">
          성별 설정에 맞지 않는 {view.hiddenCount}개는 숨겼어요
        </p>
      )}

      {view.access === "in" && view.isEmpty && (
        <div className="flex flex-col items-center gap-3 py-24 text-ink-soft">
          <p>이 폴더는 아직 비어 있어요.</p>
          <Link href="/" className="rounded-xl bg-well neo px-4 py-2 text-ink">
            피드 둘러보기
          </Link>
        </div>
      )}

      {view.access === "in" && view.hasEntries && (
        <FeedGrid
          columns={view.columns}
          sentinelRef={view.sentinelRef}
          onSelect={(card, originRect) => {
            view.detail.open(card.product, originRect);
          }}
        />
      )}

      {view.detail.stack.slice(-3).map((entry, i, shown) => {
        const stackIndex = view.detail.stack.length - shown.length + i;
        return (
          <ProductDetail
            key={`wish-detail-${String(stackIndex)}-${String(entry.product.goodsNo)}`}
            entry={entry}
            active={i === shown.length - 1}
            onRequestClose={view.detail.requestClose}
            onClosed={view.detail.finishClose}
            onSelectProduct={view.detail.open}
          />
        );
      })}
    </div>
  );
}
