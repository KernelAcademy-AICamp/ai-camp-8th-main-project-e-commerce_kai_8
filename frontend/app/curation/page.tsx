import { redirect } from "next/navigation";

// 큐레이션은 홈의 FOR YOU 칸으로 들어갔다. 옛 링크만 살려 둔다.
export default function CurationPage() {
  redirect("/");
}
