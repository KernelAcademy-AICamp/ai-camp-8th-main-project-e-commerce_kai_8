"use client";

import { BackIcon } from "@/shared/icons";

/**
 * 화면 한가운데 뜨는 작은 창 — 시안 `.login-pop`.
 *
 * 로그인 안내·새 폴더·삭제 확인이 **같은 상자**를 쓴다. 각자 그리면 셋이 조금씩
 * 어긋나므로 껍데기를 하나만 둔다.
 *
 * **자리는 `inset-0` 위의 가운데 정렬로 잡는다.** 좌표를 절반씩 옮기는 방식은
 * 변형이 걸린 조상이 하나만 있어도 그 조상 기준으로 어긋난다.
 */
export function CenterPopup({
  label,
  role = "dialog",
  onDismiss,
  onBack,
  children,
}: {
  /** 읽어 주는 이름 */
  label: string;
  /** 되돌릴 수 없는 일을 묻는 창은 `alertdialog` */
  role?: "dialog" | "alertdialog";
  /**
   * 어두운 바탕을 눌러 닫을 수 있으면 준다.
   *
   * **주지 않으면 바탕은 손잡이가 아니다.** 창을 닫는 것이 보던 화면까지
   * 닫는 경우(로그인 안내)에는 바깥을 잘못 눌러 튕겨 나가면 안 되므로 시안도
   * 거기에는 아무 동작을 달지 않는다.
   */
  onDismiss?: () => void;
  /** 좌상단 화살표 — 시안 `.lp-back`. 주면 그린다. */
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[48] flex items-center justify-center">
      {onDismiss === undefined ? (
        <span aria-hidden className="absolute inset-0 bg-[rgb(23_21_15/0.25)]" />
      ) : (
        <button
          type="button"
          aria-label="닫기"
          onClick={onDismiss}
          className="absolute inset-0 cursor-pointer bg-[rgb(23_21_15/0.25)]"
        />
      )}

      <div
        role={role}
        aria-label={label}
        className="relative w-[250px] rounded-[20px] bg-app px-[22px] pt-[26px] pb-5 text-center shadow-[0_4px_16px_rgb(30_38_55/0.24)]"
      >
        {onBack !== undefined && (
          <button
            type="button"
            aria-label="뒤로가기"
            onClick={onBack}
            className="absolute top-[11px] left-[11px] flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full bg-app text-ink-soft shadow-[0_1px_3px_rgb(30_38_55/0.25)] active:scale-[0.92]"
          >
            <BackIcon size={15} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

/** 시안 `.lp-title` */
export function PopupTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[15.5px] font-extrabold text-ink">{children}</p>;
}

/** 시안 `.lp-msg` — 두 줄로 끊어 쓰는 자리 */
export function PopupMessage({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-xs leading-relaxed font-[650] text-ink-soft">{children}</p>
  );
}

/** 시안 `.del-actions` — 예/아니오가 한 줄에 반씩 */
export function PopupActions({ children }: { children: React.ReactNode }) {
  return <div className="mt-[18px] flex gap-2.5 [&>button]:flex-1">{children}</div>;
}

const TONES = {
  /** 시안 `.lp-btn` */
  primary: "bg-slate text-on-slate shadow-[0_1px_4px_rgb(30_38_55/0.28)]",
  /** 시안 `.del-yes` */
  danger: "bg-danger text-on-slate shadow-[0_1px_4px_rgb(30_38_55/0.28)]",
  /** 시안 `.del-no` — 바탕도 그림자도 없다 */
  quiet: "border border-line text-ink-soft",
} as const;

/** 시안 `.lp-btn` — 창 안의 알약 단추 */
export function PopupButton({
  tone = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: keyof typeof TONES;
}) {
  return (
    <button
      {...props}
      className={`h-[42px] w-full cursor-pointer rounded-full text-sm font-extrabold transition-shadow active:shadow-[inset_2px_2px_5px_rgb(0_0_0/0.2)] disabled:opacity-60 ${TONES[tone]} ${className}`}
    />
  );
}

/** 시안 `.nf-input` — 창 안의 한 줄 입력 */
export function PopupInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="mt-3.5 h-[42px] w-full rounded-xl border border-line bg-app px-3.5 text-sm font-[650] text-ink caret-slate outline-none placeholder:text-ink-muted focus:border-slate"
    />
  );
}
