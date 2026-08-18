"use client";

// 페이지 2 본체 — URL의 q를 읽어 무신사 검색. 다크 오로라 + 유리 토큰 + 카드 그리드.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import type { IntentChip } from "@/features/search/domain/query-intent-chips";

import { useSearchViewModel } from "../view-model/use-search-view-model";
import IntentChips from "./IntentChips";
import ResultList from "./ResultList";
import SearchBar from "./SearchBar";

/* 0건일 때 조건 완화 제안 — 질의 문장에 그대로 들어 있는 조건 토큰만
   빼고 재검색할 수 있게 한다(문장 재작성은 하지 않는다). */
function relaxations(
  query: string,
  chips: IntentChip[],
): { label: string; nextQuery: string }[] {
  const seen = new Set<string>();
  const out: { label: string; nextQuery: string }[] = [];
  for (const chip of chips) {
    if (out.length >= 3) break;
    const token = chip.label;
    if (seen.has(token) || !query.includes(token)) continue;
    const nextQuery = query.replace(token, " ").replace(/\s+/g, " ").trim();
    if (!nextQuery) continue;
    seen.add(token);
    out.push({ label: token, nextQuery });
  }
  return out;
}

export default function SearchResults() {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  const llmOff = params.get("llm") === "off"; // 로고 토글 모드(스펙: llm-toggle-logo)
  const vm = useSearchViewModel(query, params.get("src"), llmOff);
  const go = (q: string, src = "refine") => {
    router.push(
      `/search?q=${encodeURIComponent(q)}&src=${src}${llmOff ? "&llm=off" : ""}`,
    );
  };

  const settled = query.trim() !== "" && !vm.loading;
  const showParsed = settled && vm.mode !== "failed";

  return (
    <div className="tf-page">
      <header className="tf-top">
        <Link href={llmOff ? "/?llm=off" : "/"} className="tf-top__brand">
          티:파운드{llmOff ? "(without llm)" : ""}
        </Link>
        <SearchBar key={query} initialValue={query} onSearch={go} />
      </header>

      <main className="tf-main">
        <h1 className="sr-only">
          {query.trim() ? `“${query}” 검색 결과` : "티셔츠 검색"}
        </h1>

        {showParsed && (
          <section className="tf-parsed" aria-label="해석된 검색 조건">
            <IntentChips chips={vm.chips} />
            <span className="tf-parsed__count">{vm.results.length}개</span>
          </section>
        )}

        {(() => {
          if (vm.loading) {
            return (
              <div className="tf-state" aria-live="polite">
                <p className="tf-state__title">
                  검색 중…
                  <small>조건을 분석하고 있어요.</small>
                </p>
              </div>
            );
          }
          if (!query.trim()) {
            return (
              <div className="tf-state">
                <p className="tf-state__title">
                  말로 찾아보세요
                  <small>색·핏·소재·사이즈·가격을 한 문장으로.</small>
                </p>
              </div>
            );
          }
          if (vm.mode === "failed") {
            // 근거 신호(색·브랜드·속성)가 하나도 없으면(칩 0개) = 카테고리 단어만 넣은
            // "너무 일반적인 질의"다. 기술 오류가 아니므로 '다시 시도' 대신 속성 안내를 준다.
            if (vm.chips.length === 0) {
              const examples = ["흰 반팔티", "검정 오버핏 반팔", "네이비 그래픽 티"];
              return (
                <div className="tf-state">
                  <p className="tf-state__title">
                    조금만 더 구체적으로
                    <small>색·핏·소재·프린트 같은 보이는 속성을 넣어보세요.</small>
                  </p>
                  <div className="tf-relax">
                    {examples.map((ex, i) => (
                      <button
                        key={ex}
                        type="button"
                        style={{ "--i": i } as React.CSSProperties}
                        onClick={() => {
                          go(ex);
                        }}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <div className="tf-state">
                <p className="tf-state__title">
                  검색을 완료하지 못했어요
                  <small>잠시 후 다시 시도해 주세요.</small>
                </p>
                <div className="tf-relax">
                  <button type="button" onClick={vm.retry}>
                    다시 시도
                  </button>
                </div>
              </div>
            );
          }
          if (vm.results.length === 0) {
            const suggestions = relaxations(query, vm.chips);
            return (
              <div className="tf-state">
                <p className="tf-state__title">
                  이 조합의 티는 아직 없어요
                  <small>조건을 하나만 풀면 찾을 수 있어요</small>
                </p>
                <div className="tf-relax">
                  {suggestions.map((s, i) => (
                    <button
                      key={s.label}
                      type="button"
                      style={{ "--i": i } as React.CSSProperties}
                      onClick={() => {
                        go(s.nextQuery);
                      }}
                    >
                      <b>{s.label}</b> 빼고 검색
                    </button>
                  ))}
                  <button
                    type="button"
                    style={{ "--i": suggestions.length } as React.CSSProperties}
                    onClick={() => {
                      go("반팔티");
                    }}
                  >
                    반팔티 전체 보기
                  </button>
                </div>
              </div>
            );
          }
          return (
            <>
              {vm.titleSalvage && (
                <p className="tf-note">
                  일부 조건(색·핏 등)에 맞는 상품이 없어 조건을 완화해 보여드려요.
                </p>
              )}
              {vm.mode === "lexical_only" && (
                <p className="tf-note">
                  {llmOff
                    ? "AI 해석 없이, 문장에서 읽어낸 조건만으로 찾은 결과예요."
                    : "조건 분석이 불안정해 검색어와 직접 일치하는 결과만 보여드려요."}
                </p>
              )}
              <ResultList
                goods={vm.results}
                searchId={vm.searchId}
                resultType={vm.resultType}
                chips={vm.chips}
              />
            </>
          );
        })()}
      </main>
    </div>
  );
}
