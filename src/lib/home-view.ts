/** Which home opens at "/": Focus unless the person chose the detailed dashboard. Remembered in a cookie so the server can decide before anything is drawn. */
export const HOME_VIEW_COOKIE = "home_view";
export type HomeView = "focus" | "detailed";

export function homeViewFrom(cookie: string | null | undefined): HomeView {
  return cookie === "detailed" ? "detailed" : "focus";
}

/** Called from the Focus / Detailed switch. A year, like the other interface preferences. */
export function rememberHomeView(view: HomeView) {
  document.cookie = `${HOME_VIEW_COOKIE}=${view}; path=/; max-age=31536000; samesite=lax`;
}
