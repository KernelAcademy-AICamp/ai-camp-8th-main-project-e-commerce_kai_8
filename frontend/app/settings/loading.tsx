import { SettingsHeader } from "@/features/settings/presentation/components/settings-header";

/**
 * 설정으로 **이동하는 동안** 보이는 화면. 마이페이지와 같은 이유로 둔다
 * (`app/my/loading.tsx` 주석 참고) — 이 경로도 미리 만들어 둘 수 없어 누를
 * 때마다 서버 응답을 기다린다.
 *
 * 머리글은 실제 화면의 것을 **그대로 쓴다.** 기다리는 동안에도 뒤로 나갈 수
 * 있어야 하고, 도착할 때 머리글이 바뀌면 안 된다.
 *
 * **계정 삭제 영역의 자리는 잡지 않는다.** 그 영역은 로그인한 사람에게만 있다.
 * 뼈대를 깔면 비회원에게는 있던 것이 사라지는 것으로 보인다 — 아래에 내용이
 * 붙는 쪽이 사라지는 쪽보다 덜 거슬린다.
 */
export default function SettingsLoading() {
  return (
    <main className="mx-auto max-w-md px-4 pb-6 text-neutral-200">
      <SettingsHeader />

      <div aria-label="불러오는 중" className="animate-pulse">
        {/* 접힌 "개인화 안내" 줄 — 제목과 오른쪽 펼침 표시 */}
        <div className="flex items-center justify-between">
          <div className="h-6 w-24 rounded bg-neutral-800" />
          <div className="h-6 w-4 rounded bg-neutral-800" />
        </div>

        {/* "개인화 데이터 모두 지우기" 버튼 자리 */}
        <div className="mt-8 h-12 w-full rounded-xl bg-neutral-800" />
      </div>
    </main>
  );
}
