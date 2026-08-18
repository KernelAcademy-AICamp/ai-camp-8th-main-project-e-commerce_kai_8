// 페이지 3(무신사) — /goods/[goodsNo]. Next 16: params는 Promise.
import GoodsDetail from "@/features/product-detail/presentation/components/GoodsDetail";

export default async function GoodsDetailPage({
  params,
}: {
  params: Promise<{ goodsNo: string }>;
}) {
  const { goodsNo } = await params;
  return <GoodsDetail key={goodsNo} goodsNo={goodsNo} />;
}
