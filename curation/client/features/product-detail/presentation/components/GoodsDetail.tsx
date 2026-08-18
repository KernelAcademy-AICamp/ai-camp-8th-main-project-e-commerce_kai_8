"use client";

// product-detail feature: 무신사 상세 — 다크 유리. 갤러리·속성 토큰·사이즈(cm)표 → 무신사 아웃바운드.
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { Goods } from "@/features/catalog/domain/goods";
import { buildSizeTable } from "@/features/product-detail/domain/size-table";
import {
  type OverflowState,
  overflowState,
  wheelToHorizontal,
} from "@/features/product-detail/domain/thumb-scroll";
import {
  groupPrintRows,
  printDetailRows,
} from "@/features/search/domain/print-summary";
import { WEAR_AXES } from "@/features/search/domain/query-intent";
import { track } from "@/shared/analytics";
import { COLOR_HEX } from "@/shared/color-swatch";

import { useGoodsDetailViewModel } from "../view-model/use-goods-detail-view-model";

function Gallery({ goods }: { goods: Goods }) {
  const imgs =
    goods.gallery.length > 0 ? goods.gallery : goods.thumbnail ? [goods.thumbnail] : [];
  const [main, setMain] = useState(imgs[0] ?? "");
  const thumbsRef = useRef<HTMLDivElement>(null);
  // 스크롤 위치에 따른 가장자리 페이드(더 있음 힌트) 상태.
  const [edges, setEdges] = useState<OverflowState>({
    overflowing: false,
    atStart: true,
    atEnd: true,
  });

  useEffect(() => {
    const el = thumbsRef.current;
    if (!el) return;
    const measure = () => {
      setEdges(
        overflowState({
          scrollLeft: el.scrollLeft,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        }),
      );
    };
    // 세로 휠을 가로 스크롤로 변환 — 마우스 사용자도 카러셀을 넘길 수 있게.
    // 넘칠 여지가 있을 때만 기본 동작을 막고, 끝에 닿으면 페이지 세로 스크롤로 흘려보낸다.
    const onWheel = (e: WheelEvent) => {
      const delta = wheelToHorizontal(e.deltaX, e.deltaY);
      if (delta === 0) return; // 가로 트랙패드 제스처는 브라우저 기본에 맡김
      const st = overflowState({
        scrollLeft: el.scrollLeft,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      });
      if (!st.overflowing) return;
      if ((delta > 0 && st.atEnd) || (delta < 0 && st.atStart)) return;
      el.scrollLeft += delta;
      e.preventDefault();
    };
    measure();
    // wheel은 passive:false여야 preventDefault가 먹는다(React onWheel은 passive라 직접 등록).
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [imgs.length]);

  return (
    <section aria-label="상품 이미지">
      <div className="tf-gallery__main">
        {main && (
          <Image
            src={main}
            alt={goods.title}
            fill
            sizes="(max-width: 640px) 100vw, 50vw"
          />
        )}
      </div>
      {imgs.length > 1 && (
        <div
          ref={thumbsRef}
          className="tf-gallery__thumbs"
          data-fade-left={edges.overflowing && !edges.atStart ? "" : undefined}
          data-fade-right={edges.overflowing && !edges.atEnd ? "" : undefined}
        >
          {imgs.map((src, i) => (
            <button
              key={src}
              type="button"
              className={src === main ? "is-active" : undefined}
              aria-pressed={src === main}
              onClick={() => {
                setMain(src);
              }}
              aria-label={`이미지 ${i + 1} 보기`}
            >
              <Image src={src} alt="" fill sizes="72px" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function TokenGroup({
  label,
  values,
  swatch = false,
}: {
  label: string;
  values: string[];
  swatch?: boolean;
}) {
  if (values.length === 0) return null;
  return (
    <div>
      <div className="tf-label">{label}</div>
      <div className="tf-tokens">
        {values.map((v) => (
          <span key={v} className="tf-token">
            {swatch && COLOR_HEX[v] && (
              <span
                className="tf-swatch"
                style={{ background: COLOR_HEX[v] }}
                aria-hidden
              />
            )}
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

// 프린트 관측 표 — 사이즈 실측표와 같은 tf-table 스타일. 컬러웨이 페어(바탕×잉크) 유지.
// 같은 바탕은 rowSpan으로 한 번만 표기(컬러웨이 단위로 묶어 읽히게).
function PrintTableView({ goods }: { goods: Goods }) {
  const groups = groupPrintRows(printDetailRows(goods.prints ?? [], goods.colors));
  if (groups.length === 0) return null;
  return (
    <div>
      <div className="tf-label">프린트</div>
      <div className="tf-table-wrap">
        <table className="tf-table tf-table--print">
          <thead>
            <tr>
              <th>바탕</th>
              <th>위치</th>
              <th>프린트</th>
              <th>문구</th>
            </tr>
          </thead>
          <tbody>
            {groups.flatMap((g, gi) =>
              g.rows.map((r, ri) => (
                <tr key={`${gi}-${ri}`}>
                  {ri === 0 && (
                    <td className="tf-table__base" rowSpan={g.rows.length}>
                      {g.base || "—"}
                    </td>
                  )}
                  <td>{r.side}</td>
                  <td>{r.print}</td>
                  <td>{r.motif || "—"}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SizeTableView({ goods }: { goods: Goods }) {
  const table = buildSizeTable(goods.sizeMeasures);
  if (table.rows.length === 0 || table.cols.length === 0) return null;
  return (
    <div>
      <div className="tf-label">사이즈 실측(cm)</div>
      <div className="tf-table-wrap">
        <table className="tf-table">
          <thead>
            <tr>
              <th>사이즈</th>
              {table.cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                {r.cells.map((v, i) => (
                  <td key={i}>{v ?? "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function GoodsDetail({ goodsNo }: { goodsNo: string }) {
  const { loading, goods } = useGoodsDetailViewModel(goodsNo);
  const router = useRouter();
  const params = useSearchParams();
  const sid = params.get("sid");
  const [reported, setReported] = useState(false);

  useEffect(() => {
    if (loading) return;
    track("detail_viewed", {
      search_id: sid,
      product_id: goodsNo,
      found: Boolean(goods),
    });
  }, [loading, goods, goodsNo, sid]);

  const wear = goods
    ? WEAR_AXES.flatMap((axis) => {
        const v = goods.wearChars[axis];
        return v ? [`${axis} ${v}`] : [];
      })
    : [];

  return (
    <div className="tf-page">
      <header className="tf-top">
        <button
          type="button"
          className="tf-back"
          aria-label="검색 결과로 돌아가기"
          onClick={() => {
            // 앱 내 히스토리가 있으면 이전 검색으로, 직접 진입(새 탭/공유링크)이면 /search 폴백.
            if (window.history.length > 1) router.back();
            else router.push("/search");
          }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
            <path
              d="M14.5 5 7.5 12l7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <Link href="/" className="tf-top__brand">
          티:파운드
        </Link>
      </header>

      {loading ? (
        <main className="tf-state" aria-live="polite">
          <h1 className="tf-state__title">
            불러오는 중…
            <small>상품 정보를 가져오고 있어요.</small>
          </h1>
        </main>
      ) : !goods ? (
        <main className="tf-state">
          <h1 className="tf-state__title">
            상품을 찾을 수 없어요
            <small>목록으로 돌아가 다시 골라주세요.</small>
          </h1>
        </main>
      ) : (
        <main className="tf-detail">
          <Gallery goods={goods} />

          <section className="tf-info">
            <div style={{ "--i": 0 } as React.CSSProperties}>
              <p className="tf-info__brand">
                {goods.brand}
                {goods.gender && ` · ${goods.gender}`}
              </p>
              <h1 className="tf-info__title">{goods.title}</h1>
              <div className="tf-info__row">
                <span className="tf-info__price">{goods.price.toLocaleString()}원</span>
                {goods.reviewCount > 0 && (
                  <span className="tf-info__review">
                    <b>★ {goods.reviewScore.toFixed(1)}</b> · 리뷰 {goods.reviewCount}
                  </span>
                )}
              </div>
            </div>

            <div style={{ "--i": 1 } as React.CSSProperties}>
              <TokenGroup label="색상" values={goods.colors} swatch />
            </div>
            <div style={{ "--i": 2 } as React.CSSProperties}>
              <TokenGroup label="패턴" values={goods.patterns} />
            </div>
            <div style={{ "--i": 3 } as React.CSSProperties}>
              <PrintTableView goods={goods} />
            </div>
            <div style={{ "--i": 4 } as React.CSSProperties}>
              <TokenGroup label="소재" values={goods.materials} />
            </div>
            <div style={{ "--i": 5 } as React.CSSProperties}>
              <TokenGroup label="핏" values={goods.fits} />
            </div>
            {wear.length > 0 && (
              <div style={{ "--i": 6 } as React.CSSProperties}>
                <TokenGroup label="착용감" values={wear} />
              </div>
            )}
            <div style={{ "--i": 7 } as React.CSSProperties}>
              <TokenGroup label="리뷰 태그" values={goods.reviewTags} />
            </div>

            <div style={{ "--i": 8 } as React.CSSProperties}>
              <SizeTableView goods={goods} />
            </div>

            <a
              className="tf-cta"
              style={{ "--i": 9 } as React.CSSProperties}
              href={goods.url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => {
                track("outbound_click", {
                  search_id: sid,
                  product_id: goods.goodsNo,
                  mall: "무신사",
                  from: "detail",
                });
              }}
            >
              무신사에서 보기
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path
                  d="M7 17 17 7M9 7h8v8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
            <p className="tf-subnote" style={{ "--i": 10 } as React.CSSProperties}>
              무신사 상품 페이지로 이동합니다
            </p>

            <div style={{ "--i": 11 } as React.CSSProperties}>
              {!reported ? (
                <button
                  type="button"
                  className="tf-report"
                  onClick={() => {
                    track("mismatch_reported", {
                      search_id: sid,
                      product_id: goods.goodsNo,
                    });
                    setReported(true);
                  }}
                >
                  검색 조건과 안 맞아요 · 신고
                </button>
              ) : (
                <p className="tf-report tf-report--done">
                  신고 접수됐어요. 고맙습니다.
                </p>
              )}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
