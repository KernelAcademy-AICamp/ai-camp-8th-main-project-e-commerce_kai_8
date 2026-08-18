import { beforeEach, describe, expect, it } from "vitest";

import { createWishSync } from "./wish-sync";

/** 원할 때 끝낼 수 있는 가짜 서버 */
function deferredPush() {
  const calls: { goodsNo: number; wanted: boolean }[] = [];
  const settlers: { resolve: () => void; reject: (e: Error) => void }[] = [];
  const push = (goodsNo: number, wanted: boolean) => {
    calls.push({ goodsNo, wanted });
    return new Promise<void>((resolve, reject) => {
      settlers.push({
        resolve,
        reject: (e) => {
          reject(e);
        },
      });
    });
  };
  return {
    calls,
    push,
    finishLast: async () => {
      settlers[settlers.length - 1]?.resolve();
      await Promise.resolve();
      await Promise.resolve();
    },
    failLast: async () => {
      settlers[settlers.length - 1]?.reject(new Error("네트워크"));
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

let reverted: { goodsNo: number; confirmed: boolean }[] = [];
let revertCauses: unknown[] = [];

beforeEach(() => {
  reverted = [];
  revertCauses = [];
});

function onRevert(goodsNo: number, confirmed: boolean, cause: unknown) {
  reverted.push({ goodsNo, confirmed });
  revertCauses.push(cause);
}

describe("createWishSync", () => {
  it("한 번 누르면 한 번 보낸다", async () => {
    const server = deferredPush();
    const sync = createWishSync(server.push, onRevert);

    sync.request(10, true);
    await Promise.resolve();

    expect(server.calls).toEqual([{ goodsNo: 10, wanted: true }]);
  });

  it("보내는 중에 다시 누르면 끝난 뒤 마지막 의도를 보낸다", async () => {
    const server = deferredPush();
    const sync = createWishSync(server.push, onRevert);

    sync.request(10, true);
    await Promise.resolve();
    sync.request(10, false); // 아직 첫 요청이 끝나지 않았다
    expect(server.calls).toHaveLength(1);

    await server.finishLast();

    expect(server.calls).toEqual([
      { goodsNo: 10, wanted: true },
      { goodsNo: 10, wanted: false },
    ]);
  });

  it("보내는 중에 두 번 눌러 원래대로 돌아오면 더 보내지 않는다", async () => {
    const server = deferredPush();
    const sync = createWishSync(server.push, onRevert);

    sync.request(10, true);
    await Promise.resolve();
    sync.request(10, false);
    sync.request(10, true); // 결국 첫 요청과 같은 상태

    await server.finishLast();

    expect(server.calls).toHaveLength(1);
  });

  it("상품마다 따로 보낸다 — 서로 막지 않는다", async () => {
    const server = deferredPush();
    const sync = createWishSync(server.push, onRevert);

    sync.request(10, true);
    sync.request(20, true);
    await Promise.resolve();

    expect(server.calls).toHaveLength(2);
  });

  it("실패하면 확정 상태로 되돌리라고 알린다", async () => {
    const server = deferredPush();
    const sync = createWishSync(server.push, onRevert);

    sync.request(10, true);
    await Promise.resolve();
    await server.failLast();

    // 서버가 받아준 적이 없으므로 확정 상태는 "찜 안 함"이다
    expect(reverted).toEqual([{ goodsNo: 10, confirmed: false }]);
  });

  it("성공한 뒤 실패하면 성공했던 상태로 되돌린다", async () => {
    const server = deferredPush();
    const sync = createWishSync(server.push, onRevert);

    sync.request(10, true);
    await Promise.resolve();
    await server.finishLast(); // 찜이 서버에 확정됨

    sync.request(10, false);
    await Promise.resolve();
    await server.failLast();

    expect(reverted).toEqual([{ goodsNo: 10, confirmed: true }]);
  });

  it("되돌릴 때 원인을 함께 알린다 — 화면이 이유별로 다른 문구를 보여준다", async () => {
    const server = deferredPush();
    const sync = createWishSync(server.push, onRevert);

    sync.request(10, true);
    await Promise.resolve();
    await server.failLast();

    expect(revertCauses).toHaveLength(1);
    expect(revertCauses[0]).toBeInstanceOf(Error);
    expect((revertCauses[0] as Error).message).toBe("네트워크");
  });

  it("실패한 뒤에도 다시 누르면 보낸다", async () => {
    const server = deferredPush();
    const sync = createWishSync(server.push, onRevert);

    sync.request(10, true);
    await Promise.resolve();
    await server.failLast();

    sync.request(10, true);
    await Promise.resolve();

    expect(server.calls).toHaveLength(2);
  });

  it("서버에서 읽은 상태를 알려주면 그것을 되돌리는 요청이 나간다", async () => {
    // 이걸 안 하면 서버에 이미 담긴 찜을 풀 때 "이미 그 상태"로 보고 건너뛴다.
    // 화면만 줄고 서버는 그대로인 버그를 실제로 냈다.
    const server = deferredPush();
    const sync = createWishSync(server.push, onRevert);

    sync.setConfirmed(10, true);
    sync.request(10, false);
    await Promise.resolve();

    expect(server.calls).toEqual([{ goodsNo: 10, wanted: false }]);
  });

  it("보내는 중에는 서버에서 읽은 상태로 덮어쓰지 않는다", async () => {
    const server = deferredPush();
    const sync = createWishSync(server.push, onRevert);

    sync.request(10, true);
    await Promise.resolve();
    // 보내는 사이에 목록을 다시 읽어 "아직 찜 아님"이 도착했다
    sync.setConfirmed(10, false);
    await server.finishLast();

    // 방금 보낸 것이 성공했으므로 확정은 true다. 덮어썼다면 또 보냈을 것이다.
    expect(server.calls).toHaveLength(1);
  });

  it("확정 상태와 같은 요청은 보내지 않는다", async () => {
    const server = deferredPush();
    const sync = createWishSync(server.push, onRevert);

    sync.request(10, false); // 처음부터 찜 안 함 = 확정 상태와 같다
    await Promise.resolve();

    expect(server.calls).toHaveLength(0);
  });
});
