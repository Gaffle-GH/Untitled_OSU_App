/** osu! mod display order (scoreboard-style). */
export const MOD_DISPLAY_ORDER = [
  "NF",
  "EZ",
  "HT",
  "HD",
  "HR",
  "SD",
  "PF",
  "DT",
  "NC",
  "FL",
  "BU",
  "SQ",
  "RX",
  "AP",
  "SO",
  "FI",
  "RD",
  "CN",
  "TG",
  "TP",
  "CP",
  "SV2",
  "MR",
] as const;

export const NOMOD_KEY = "NM";

export type ModStyle = { bg: string; fg: string; label?: string };

/** Vivid mod accent colors (green=easy, red=hard, yellow=neutral, blue=special). */
export const MOD_STYLES: Record<string, ModStyle> = {
  NM: { bg: "#9aa0b5", fg: "#9aa0b5", label: "No Mod" },
  EZ: { bg: "#7ee787", fg: "#7ee787", label: "Easy" },
  NF: { bg: "#7ee787", fg: "#7ee787", label: "No Fail" },
  HT: { bg: "#7ee787", fg: "#7ee787", label: "Half Time" },
  HR: { bg: "#ff7b72", fg: "#ff7b72", label: "Hard Rock" },
  SD: { bg: "#ff7b72", fg: "#ff7b72", label: "Sudden Death" },
  PF: { bg: "#ff7b72", fg: "#ff7b72", label: "Perfect" },
  DT: { bg: "#ffb347", fg: "#ffb347", label: "Double Time" },
  NC: { bg: "#ffb347", fg: "#ffb347", label: "Nightcore" },
  HD: { bg: "#ffd966", fg: "#ffd966", label: "Hidden" },
  FL: { bg: "#ff7b72", fg: "#ff7b72", label: "Flashlight" },
  SO: { bg: "#9aa0b5", fg: "#9aa0b5", label: "Spun Out" },
  CL: { bg: "#79c0ff", fg: "#79c0ff", label: "Classic" },
  CN: { bg: "#79c0ff", fg: "#79c0ff", label: "Cinema" },
  RX: { bg: "#79c0ff", fg: "#79c0ff", label: "Relax" },
  AP: { bg: "#79c0ff", fg: "#79c0ff", label: "Autopilot" },
  TD: { bg: "#ffb347", fg: "#ffb347", label: "Touch Device" },
};

export function modStyle(mod: string): ModStyle {
  return MOD_STYLES[mod] ?? { bg: "#9aa0b5", fg: "#9aa0b5", label: mod };
}

export function sortMods(mods: string[]): string[] {
  const order = new Map(MOD_DISPLAY_ORDER.map((m, i) => [m, i]));
  return [...mods].sort((a, b) => {
    const ai = order.get(a as (typeof MOD_DISPLAY_ORDER)[number]) ?? 999;
    const bi = order.get(b as (typeof MOD_DISPLAY_ORDER)[number]) ?? 999;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
}

/** Unique mods present in top plays, ordered; includes NM when any play is nomod. */
export function modsAvailableInPlays(plays: { mods: string[] }[]): string[] {
  const present = new Set<string>();
  let hasNomod = false;

  for (const play of plays) {
    if (play.mods.length === 0) {
      hasNomod = true;
      continue;
    }
    for (const mod of play.mods) {
      present.add(mod);
    }
  }

  const ordered = MOD_DISPLAY_ORDER.filter((m) => present.has(m));
  for (const mod of present) {
    if (!MOD_DISPLAY_ORDER.includes(mod as (typeof MOD_DISPLAY_ORDER)[number])) {
      ordered.push(mod);
    }
  }

  return hasNomod ? [NOMOD_KEY, ...ordered] : ordered;
}

/** Play matches every selected mod filter (AND). NM = empty mods. */
export function playMatchesModFilters(
  play: { mods: string[] },
  selected: Set<string>,
): boolean {
  if (selected.size === 0) return true;

  for (const filter of selected) {
    if (filter === NOMOD_KEY) {
      if (play.mods.length > 0) return false;
      continue;
    }
    if (!play.mods.includes(filter)) return false;
  }

  return true;
}
