import { beforeEach, describe, expect, it } from "vitest";

import { emptyLongTerm, type LongTermProfile } from "./profile-rules";
import { createProfileSync } from "./profile-sync";

function profileWith(anchorCount: number): LongTermProfile {
  return {
    ...emptyLongTerm(),
    anchors: Array.from({ length: anchorCount }, (_, i) => ({
      goodsNo: 1000 + i,
      weight: 1,
      lastMs: 1,
    })),
  };
}

let uploads: LongTermProfile[] = [];
let settlers: { resolve: () => void; reject: (e: Error) => void }[] = [];
let signedIn = true;
let current: LongTermProfile;

beforeEach(() => {
  uploads = [];
  settlers = [];
  signedIn = true;
  current = profileWith(1);
});

function makeSync() {
  return createProfileSync({
    isSignedIn: () => signedIn,
    read: () => current,
    upload: (p) => {
      uploads.push(p);
      return new Promise<void>((resolve, reject) => {
        settlers.push({ resolve, reject });
      });
    },
  });
}

async function settle(index: number, ok = true) {
  const s = settlers[index];
  if (ok) s.resolve();
  else s.reject(new Error("네트워크"));
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("createProfileSync", () => {
  it("더럽지 않으면 올리지 않는다", async () => {
    const sync = makeSync();
    await sync.flush();
    expect(uploads).toEqual([]);
  });

  it("더러우면 올린다", async () => {
    const sync = makeSync();
    sync.markDirty();
    void sync.flush();
    await Promise.resolve();
    expect(uploads).toHaveLength(1);
    expect(uploads[0].anchors).toHaveLength(1);
  });

  it("올린 뒤 그대로면 또 올리지 않는다", async () => {
    const sync = makeSync();
    sync.markDirty();
    void sync.flush();
    await Promise.resolve();
    await settle(0);

    void sync.flush();
    await Promise.resolve();
    expect(uploads).toHaveLength(1);
  });

  it("로그인하지 않았으면 올리지 않는다", async () => {
    // 비회원 취향은 계정에 보관하지 않는다.
    signedIn = false;
    const sync = makeSync();
    sync.markDirty();
    await sync.flush();
    expect(uploads).toEqual([]);
  });

  it("올리는 중에 또 바뀌면 끝난 뒤 한 번 더 올린다", async () => {
    const sync = makeSync();
    sync.markDirty();
    void sync.flush();
    await Promise.resolve();
    expect(uploads).toHaveLength(1);

    current = profileWith(3);
    sync.markDirty();
    void sync.flush(); // 아직 앞의 것이 끝나지 않았다
    await Promise.resolve();
    expect(uploads).toHaveLength(1);

    await settle(0);
    expect(uploads).toHaveLength(2);
    expect(uploads[1].anchors).toHaveLength(3);
  });

  it("실패하면 더러운 채로 두어 다음 기회에 다시 올린다", async () => {
    const sync = makeSync();
    sync.markDirty();
    void sync.flush();
    await Promise.resolve();
    await settle(0, false);

    void sync.flush();
    await Promise.resolve();
    expect(uploads).toHaveLength(2);
  });

  it("겹쳐 불러도 한 번만 올린다", async () => {
    const sync = makeSync();
    sync.markDirty();
    void sync.flush();
    void sync.flush();
    await Promise.resolve();
    expect(uploads).toHaveLength(1);
  });
});
