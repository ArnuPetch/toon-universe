// Shared form styles (same look as the login form).

export const INPUT =
  "h-11 w-full rounded-xl bg-surface-2 px-4 text-[15px] text-text placeholder:text-faint outline-none ring-primary/60 focus:ring-2 aria-invalid:ring-2 aria-invalid:ring-hot/70";

export const LABEL = "text-sm font-semibold leading-[1.4] text-text-2";

export const PRIMARY_BUTTON =
  "h-11 rounded-full bg-primary px-6 text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60";

export const ERROR_BOX = "rounded-xl bg-hot/10 px-4 py-3 text-sm leading-[1.4] text-hot";
export const SUCCESS_BOX = "rounded-xl bg-free/10 px-4 py-3 text-sm leading-[1.4] text-free";

export const TEXTAREA =
  "min-h-[88px] w-full resize-y rounded-xl bg-surface-2 px-4 py-3 text-[15px] leading-[1.5] text-text placeholder:text-faint outline-none ring-primary/60 focus:ring-2";

export const SECONDARY_BUTTON =
  "h-10 rounded-full bg-white/12 px-5 text-sm font-semibold text-text transition-colors hover:bg-white/20 disabled:opacity-60";

/** Small text button (reply / edit / delete / report). */
export const TEXT_BUTTON =
  "rounded-md px-1 text-[13px] font-semibold leading-[1.4] text-muted transition-colors hover:text-text disabled:opacity-60";
