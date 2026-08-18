// View: 이미지 중심 결과 카드 — 썸네일 + 브랜드 + 제목 + 가격 + ⭐리뷰. 클릭 시 상세로.
import Image from "next/image";
import Link from "next/link";

import type { Goods } from "@/features/catalog/domain/goods";
import { cardSummary } from "@/features/search/domain/card-summary";
import type { IntentChip } from "@/features/search/domain/query-intent-chips";
import { track } from "@/shared/analytics";
import type { ResultType } from "@/shared/analytics-params";

export default function ResultList({
  goods,
  searchId,
  resultType,
  chips = [],
}: {
  goods: Goods[];
  searchId: string;
  resultType: ResultType;
  // 해석된 검색 조건 — 호버 요약의 행 구성·순서가 질의를 따라간다.
  chips?: IntentChip[];
}) {
  return (
    <ul className="tf-grid">
      {goods.map((item, rank) => {
        const summary = cardSummary(item, chips);
        return (
          <li
            key={item.goodsNo}
            className="tf-card"
            style={{ "--i": rank } as React.CSSProperties}
          >
            <Link
              href={`/goods/${item.goodsNo}?sid=${encodeURIComponent(searchId)}&rank=${rank}&rt=${resultType}`}
              onClick={() => {
                track("result_clicked", {
                  search_id: searchId,
                  product_id: item.goodsNo,
                  rank,
                  result_type: resultType,
                });
              }}
            >
              <div className="tf-card__frame">
                {(item.displayImage?.url ?? item.thumbnail) && (
                  <Image
                    src={item.displayImage?.url ?? item.thumbnail}
                    // 교체된 색은 대체 텍스트로도 알린다(스크린리더). 교체 아니면 상품명만.
                    alt={
                      item.displayImage
                        ? `${item.title} — ${item.displayImage.color}`
                        : item.title
                    }
                    fill
                    sizes="(max-width: 640px) 50vw, 25vw"
                  />
                )}
                {summary.length > 0 && (
                  <div className="tf-card__summary" aria-hidden="true">
                    {summary.map((row) =>
                      row.items ? (
                        <div key={row.label} className="tf-card__summary-tags">
                          {row.items.map((tag) => (
                            <span key={tag} className="tf-card__summary-tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div key={row.label} className="tf-card__summary-row">
                          <span className="tf-card__summary-label">{row.label}</span>
                          <span className="tf-card__summary-value">{row.value}</span>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
              <div className="tf-card__meta">
                <p className="tf-card__brand">{item.brand}</p>
                <h3 className="tf-card__title">{item.title}</h3>
                <div className="tf-card__row">
                  <span className="tf-card__price">
                    {item.price.toLocaleString()}원
                  </span>
                  {item.reviewCount > 0 && (
                    <span className="tf-card__review">
                      ★ {item.reviewScore.toFixed(1)} ({item.reviewCount})
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
