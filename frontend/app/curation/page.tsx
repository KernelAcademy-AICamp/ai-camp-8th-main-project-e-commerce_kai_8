// 페이지 — /curation. 데이터는 빌드에 박힌 JSON(생성 스크립트 산출물)이라 서버 요청이 없다.
import Link from "next/link";

import curations from "@/features/curation/data/curations.json";
import { CurationList } from "@/features/curation/presentation/components/curation-list";

export default function CurationPage() {
  return (
    <main className="mx-auto max-w-md">
      <header className="relative flex items-center justify-center px-4 py-3">
        <Link
          href="/"
          aria-label="피드로 돌아가기"
          className="absolute left-3 flex h-9 w-9 items-center justify-center rounded-full text-lg text-neutral-400"
        >
          ←
        </Link>
        <h1 className="text-lg font-semibold tracking-tight text-white">큐레이션</h1>
      </header>
      <CurationList curations={curations} />
    </main>
  );
}
