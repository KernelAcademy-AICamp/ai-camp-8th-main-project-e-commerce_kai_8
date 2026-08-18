// 계정 통로가 쓰는 Supabase 접속 값.
//
// shared/supabase-rpc.ts(공개 카탈로그·기기 신호용 익명 통로)와 **일부러 분리**한다.
// 설계 §2 transport 경계: 계정 데이터는 인증 통로로만 나가고, 기존 익명 호출 경로를
// 전역으로 갈아끼우지 않는다.

export interface SupabaseConfig {
  url: string;
  key: string;
}

export function readSupabaseConfig(): SupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url === undefined || key === undefined || url === "" || key === "") {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 환경변수가 필요합니다 (frontend/.env.example 참고)",
    );
  }
  return { url, key };
}
