// 페이지 2 — /search. useSearchParams는 Suspense 경계가 필요.
import { Suspense } from "react";

import SearchResults from "@/features/search/presentation/components/SearchResults";

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <SearchResults />
    </Suspense>
  );
}
