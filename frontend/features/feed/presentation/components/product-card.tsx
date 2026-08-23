"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import type { OriginRect } from "@/features/feed/detail/presentation/view-model/use-detail-state";
import type { FeedCardViewData } from "@/features/feed/presentation/view-model/use-feed-view-model";

interface ProductCardProps {
  card: FeedCardViewData;
  onSelect?: (card: FeedCardViewData, originRect: OriginRect | null) => void;
  /** 카드 절반 이상이 뷰포트에 처음 보였을 때 1회 (노출 이벤트) */
  onImpress?: (
    card: FeedCardViewData,
    dom: { cardHeight: number; screenY: number },
  ) => void;
  /** true면 화면 밖이어도 이미지를 즉시 내려받는다 (상세 하단 첫 페이지 프리로드) */
  eagerImage?: boolean;
}

export function ProductCard({
  card,
  onSelect,
  onImpress,
  eagerImage,
}: ProductCardProps) {
  const [failed, setFailed] = useState(false);
  // 시안 `.card` → `.card.in` — 화면에 들어온 뒤 아래에서 떠오른다
  const [revealed, setRevealed] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  // 콜백 정체성이 바뀌어도(부모 리렌더) 관찰을 다시 걸지 않도록 ref로 참조하고,
  // 노출은 마운트당 1회만 기록한다
  const onImpressRef = useRef(onImpress);
  useEffect(() => {
    onImpressRef.current = onImpress;
  }, [onImpress]);
  const impressedRef = useRef(false);

  // 등장 연출 전용 관찰 — 노출 계측(threshold 0.5)과 기준이 달라 따로 둔다.
  // 계측은 "절반 이상 보였는가"를 재고, 이쪽은 "조금이라도 보였는가"다.
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      // 관찰이 없는 환경(테스트 jsdom 등)에서는 연출 없이 바로 보인다.
      // 다음 프레임으로 미루는 이유는 효과 안에서 곧바로 상태를 바꾸면
      // 렌더가 한 번 더 돌기 때문이다(lint 규칙 set-state-in-effect).
      const frame = requestAnimationFrame(() => {
        setRevealed(true);
      });
      return () => {
        cancelAnimationFrame(frame);
      };
    }
    const reveal = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setRevealed(true);
        reveal.disconnect();
      },
      { threshold: 0.01 },
    );
    reveal.observe(element);
    return () => {
      reveal.disconnect();
    };
  }, []);

  useEffect(() => {
    const element = rootRef.current;
    if (!element || impressedRef.current) return;
    // 관찰 불가 환경(테스트 jsdom 등)에서는 노출 계측 없이 동작
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (!visible || impressedRef.current) return;
        impressedRef.current = true;
        observer.disconnect();
        onImpressRef.current?.(card, {
          cardHeight: Math.round(visible.boundingClientRect.height),
          screenY: Math.round(visible.boundingClientRect.top),
        });
      },
      // 기준은 **화면**이다 — 바닥 감지와 달리 여기서 굴리는 칸을 기준으로 잡으면
      // 안 된다. 지금 보고 있지 않은 칸은 가로로 화면 밖에 있을 뿐 자기 칸 안에서는
      // 멀쩡히 보이는 상태라, 칸을 기준으로 재면 사용자가 본 적 없는 카드가 노출로
      // 기록된다. 화면 기준으로 재면 칸이 세로로 잘라낸 부분도 함께 빠진다.
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [card]);

  return (
    <article
      ref={rootRef}
      className={`card-rise relative overflow-hidden rounded-card ${revealed ? "in" : ""}`}
    >
      <button
        type="button"
        className="block w-full cursor-pointer"
        onClick={(event) => {
          const image = event.currentTarget.querySelector("img");
          const rect = (image ?? event.currentTarget).getBoundingClientRect();
          onSelect?.(card, {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          });
        }}
      >
        {failed ? (
          <div
            className="flex w-full items-center justify-center"
            style={{
              aspectRatio: `${String(card.width)} / ${String(card.height)}`,
            }}
          >
            <span className="text-xs text-ink-muted">이미지를 불러오지 못했어요</span>
          </div>
        ) : (
          <Image
            src={card.product.matchedImage?.url ?? card.product.thumbnail}
            alt={card.product.title}
            width={card.width}
            height={card.height}
            sizes="50vw"
            loading={eagerImage ? "eager" : "lazy"}
            className="h-auto w-full"
            onError={() => {
              setFailed(true);
            }}
          />
        )}
        <span className="absolute right-3 bottom-3 rounded-[7px] bg-[rgb(46_52_66/0.55)] px-[7px] py-[3px] text-[10.5px] font-bold tracking-[0.01em] text-on-slate tabular-nums backdrop-blur-[6px]">
          {card.priceLabel}
        </span>
      </button>
    </article>
  );
}
