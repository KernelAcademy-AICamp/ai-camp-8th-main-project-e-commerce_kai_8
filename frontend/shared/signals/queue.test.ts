import { describe, expect, it, vi } from "vitest";

import { FLUSH_SIZE, MAX_PENDING, SignalQueue } from "./queue";
import { INSTRUMENTATION_VER, type SignalEvent } from "./types";

function makeEvent(id: string): SignalEvent {
  return {
    event_id: id,
    session_id: "s",
    event_type: "impression",
    occurred_at: "2026-08-16T00:00:00Z",
    signed_in: true,
    instr_ver: INSTRUMENTATION_VER,
    policy: "random",
    model_ver: "siglip2-base",
    profile_ver: 0,
  };
}

function makeDeps(overrides?: { send?: (events: SignalEvent[]) => Promise<number> }) {
  let saved: SignalEvent[] = [];
  return {
    saved: () => saved,
    deps: {
      send:
        overrides?.send ?? ((events: SignalEvent[]) => Promise.resolve(events.length)),
      save: (pending: SignalEvent[]) => {
        saved = pending;
      },
      load: () => saved,
    },
  };
}

describe("SignalQueue", () => {
  it("load()로 저장돼 있던 미전송분을 복구한다", () => {
    const { deps } = makeDeps();
    deps.save([makeEvent("a")]);
    const queue = new SignalQueue(deps);
    expect(queue.size()).toBe(1);
  });

  it("enqueue는 쌓고 영속화하며, FLUSH_SIZE에 도달하면 true를 반환한다", () => {
    const { deps, saved } = makeDeps();
    const queue = new SignalQueue(deps);
    for (let i = 0; i < FLUSH_SIZE - 1; i += 1) {
      expect(queue.enqueue(makeEvent(String(i)))).toBe(false);
    }
    expect(queue.enqueue(makeEvent("last"))).toBe(true);
    expect(saved()).toHaveLength(FLUSH_SIZE);
  });

  it("flush 성공 시 보낸 이벤트를 제거하고 영속화한다", async () => {
    const { deps, saved } = makeDeps();
    const queue = new SignalQueue(deps);
    queue.enqueue(makeEvent("a"));
    queue.enqueue(makeEvent("b"));
    await queue.flush();
    expect(queue.size()).toBe(0);
    expect(saved()).toHaveLength(0);
  });

  it("flush 실패 시 이벤트를 유지해 다음 전송에서 재시도한다", async () => {
    const { deps } = makeDeps({
      send: () => Promise.reject(new Error("network")),
    });
    const queue = new SignalQueue(deps);
    queue.enqueue(makeEvent("a"));
    await queue.flush();
    expect(queue.size()).toBe(1);
  });

  it("flush 도중 쌓인 이벤트는 지워지지 않는다", async () => {
    let resolveSend: ((n: number) => void) | undefined;
    const { deps } = makeDeps({
      send: () =>
        new Promise<number>((resolve) => {
          resolveSend = resolve;
        }),
    });
    const queue = new SignalQueue(deps);
    queue.enqueue(makeEvent("a"));
    const flushing = queue.flush();
    queue.enqueue(makeEvent("b")); // 전송 중 도착
    resolveSend?.(1);
    await flushing;
    expect(queue.size()).toBe(1); // b는 남아야 한다
  });

  it("flush 재진입은 무시된다 (동시 전송 방지)", async () => {
    const send = vi.fn((events: SignalEvent[]) => Promise.resolve(events.length));
    const { deps } = makeDeps({ send });
    const queue = new SignalQueue(deps);
    queue.enqueue(makeEvent("a"));
    await Promise.all([queue.flush(), queue.flush()]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("MAX_PENDING을 넘으면 오래된 이벤트부터 버린다", () => {
    const { deps } = makeDeps();
    const queue = new SignalQueue(deps);
    for (let i = 0; i < MAX_PENDING + 10; i += 1) {
      queue.enqueue(makeEvent(String(i)));
    }
    expect(queue.size()).toBe(MAX_PENDING);
  });
});
