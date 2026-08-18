// 페이지 — /curation. 데이터는 빌드에 박힌 JSON(생성 스크립트 산출물)이라 서버 요청이 없다.
import curations from "@/features/curation/data/curations.json";
import CurationList from "@/features/curation/presentation/CurationList";

export default function CurationPage() {
  return (
    <main className="mx-auto max-w-[430px]">
      <h1 className="border-b border-black px-3.5 py-3 text-lg font-extrabold tracking-tight">
        큐레이션
      </h1>
      <CurationList curations={curations} />
    </main>
  );
}
