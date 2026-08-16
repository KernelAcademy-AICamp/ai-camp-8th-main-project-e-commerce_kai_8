// 이벤트 전송 큐 — 순수 로직 (전송·영속화는 주입).
// 실패 시 유지·재시도하고, 중복은 서버가 event_id로 무시한다(설계 §4).

import type { SignalEvent } from "./types";

/** 이만큼 쌓이면 즉시 전송을 권한다 (서버 RPC 상한 50의 절반) */
export const FLUSH_SIZE = 25;

/** 미전송 보관 상한 — 초과 시 오래된 것부터 버린다 (최종 유실 허용, 설계 §9) */
export const MAX_PENDING = 500;

export interface QueueDeps {
  /** 이벤트 배치 전송. 성공 시 저장된 행 수를 반환한다. */
  send: (events: SignalEvent[]) => Promise<number>;
  /** 미전송분 영속화 (새로고침·이탈 대비) */
  save: (pending: SignalEvent[]) => void;
  load: () => SignalEvent[];
}

export class SignalQueue {
  private pending: SignalEvent[];
  private flushing = false;

  constructor(private readonly deps: QueueDeps) {
    this.pending = deps.load();
  }

  size(): number {
    return this.pending.length;
  }

  /** 반환값 true = 지금 flush할 만큼 쌓였다 */
  enqueue(event: SignalEvent): boolean {
    this.pending.push(event);
    if (this.pending.length > MAX_PENDING) {
      this.pending = this.pending.slice(this.pending.length - MAX_PENDING);
    }
    this.deps.save(this.pending);
    return this.pending.length >= FLUSH_SIZE;
  }

  async flush(): Promise<void> {
    if (this.flushing || this.pending.length === 0) return;
    this.flushing = true;
    // 전송 중 도착분과 구분하기 위해 스냅샷을 뜬다
    const batch = this.pending.slice(0, FLUSH_SIZE * 2);
    try {
      await this.deps.send(batch);
      const sent = new Set(batch.map((event) => event.event_id));
      this.pending = this.pending.filter((event) => !sent.has(event.event_id));
      this.deps.save(this.pending);
    } catch {
      // 실패 시 유지 — 다음 flush에서 재시도 (중복은 서버가 event_id로 무시)
    } finally {
      this.flushing = false;
    }
  }
}
