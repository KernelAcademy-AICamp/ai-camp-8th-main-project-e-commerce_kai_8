// 브라우저 Supabase 클라이언트(싱글턴). publishable 키 — RLS가 읽기만 허용하므로 브라우저 노출 OK.
// secret/service_role 키는 절대 여기 쓰지 않는다(전체 권한).
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// 빌드/SSR(정적 프리렌더) 단계에서는 env가 없어도 절대 throw하면 안 된다 — 여기서 throw하면
// next build가 통째로 실패한다. 브라우저에서만 누락을 큰 소리로 알리고, 서버/빌드에서는
// placeholder로 넘어간다(쿼리는 repository의 기존 에러 처리로 []/null로 degrade됨).
if (typeof window !== "undefined" && (!url || !publishableKey)) {
  throw new Error(
    "Supabase 환경변수 누락: client/.env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 " +
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 를 설정하세요 (.env.example 참고).",
  );
}

export const supabase = createClient(
  url ?? "https://placeholder.supabase.co",
  publishableKey ?? "placeholder-anon-key",
);
