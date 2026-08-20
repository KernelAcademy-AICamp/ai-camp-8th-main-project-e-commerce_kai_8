// Postgres 접속. 서버에서만 불린다 — 접속 정보는 브라우저로 나가지 않는다.
// 설계: docs/superpowers/specs/2026-08-20-admin-event-dashboard-design.md §2

import { Pool } from "pg";

/** 접속이 이 시간 안에 안 되면 포기한다. 화면이 무한정 도는 것보다 낫다 */
const CONNECT_TIMEOUT_MS = 10_000;

function readConnectionString(): string {
  const url = process.env.ADMIN_DATABASE_URL;
  if (url === undefined || url === "") {
    throw new Error(
      "ADMIN_DATABASE_URL 환경변수가 필요합니다 (admin/.env.example 참고)",
    );
  }
  return url;
}

/**
 * 개발 중에는 파일을 고칠 때마다 이 모듈이 다시 불린다. 그때마다 새 풀을 만들면
 * 접속이 금방 바닥나므로 전역에 하나만 둔다.
 */
const globalForPool = globalThis as typeof globalThis & { adminPool?: Pool };

/**
 * 접속 풀.
 *
 * **트랜잭션 풀러(Supavisor) 주소로 붙는 것을 전제로 한다.** Vercel은 요청마다
 * 함수가 새로 뜨므로 인스턴스마다 접속을 붙잡으면 금방 소진되고, 그러면 admin뿐
 * 아니라 실서비스도 데이터베이스에 붙지 못한다. 인스턴스당 1개만 잡고 나머지
 * 분배는 풀러에 맡긴다.
 */
export function getPool(): Pool {
  globalForPool.adminPool ??= new Pool({
    connectionString: readConnectionString(),
    max: 1,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: 10_000,
  });
  return globalForPool.adminPool;
}

/** 오류 문구만 꺼낸다. 접속 문자열이 딸려 나가지 않게 message만 쓴다 */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
