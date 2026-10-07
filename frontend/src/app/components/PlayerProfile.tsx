import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  LogIn,
  LogOut,
  Loader2,
  Trophy,
  AlertCircle,
  Star,
  Search,
  ArrowDownWideNarrow,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { cn } from "./ui/utils";
import {
  getAuthStatus,
  getUserStats,
  getUserModes,
  signIn,
  signOut,
  type AuthStatus,
  type UserStatsData,
} from "../../lib/api";
import { formatStars, getStarColor } from "../../lib/difficulty";
import { modsAvailableInPlays, playMatchesModFilters } from "../../lib/mods";
import { ModBadgeList, ModFilterBar } from "./ModBadges";

/** osu! grade accent colors. */
function gradeStyle(grade: string): { color: string; glow: string } {
  const g = grade.toUpperCase();
  if (g === "XH" || g === "SSH" || g === "SH")
    return { color: "#dfe6f0", glow: "#dfe6f055" };
  if (g === "X" || g === "SS") return { color: "#ffd84d", glow: "#ffd84d55" };
  if (g === "S") return { color: "#ffd84d", glow: "#ffd84d55" };
  if (g === "A") return { color: "#7ee787", glow: "#7ee78755" };
  if (g === "B") return { color: "#5aa8ff", glow: "#5aa8ff55" };
  if (g === "C") return { color: "#c77dff", glow: "#c77dff55" };
  return { color: "#ff7b72", glow: "#ff7b7255" };
}

function formatRank(rank: number | null | undefined): string {
  if (rank == null) return "—";
  return `#${rank.toLocaleString()}`;
}

function formatPp(pp: number | null | undefined): string {
  if (pp == null) return "—";
  return Math.round(pp).toLocaleString();
}

function formatAccuracy(accuracy: number | null | undefined): string {
  if (accuracy == null) return "—";
  return `${accuracy.toFixed(2)}%`;
}

function formatPlayCount(count: number | null | undefined): string {
  if (count == null) return "—";
  return count.toLocaleString();
}

function initials(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

const MODE_LABELS: Record<string, string> = {
  osu: "osu!",
  taiko: "taiko",
  fruits: "catch",
  catch: "catch",
  mania: "mania",
};

function modeLabel(mode: string): string {
  return MODE_LABELS[mode] ?? mode;
}

type SortKey = "pp" | "stars" | "accuracy";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "pp", label: "PP" },
  { key: "stars", label: "Stars" },
  { key: "accuracy", label: "Accuracy" },
];

function sortValue(play: { pp: number; stars?: number | null; accuracy: number }, key: SortKey): number {
  if (key === "stars") return play.stars ?? 0;
  if (key === "accuracy") return play.accuracy ?? 0;
  return play.pp ?? 0;
}

function formatScoreAccuracy(acc: number | null | undefined): string {
  if (acc == null) return "—";
  // Score accuracy comes back as a 0..1 ratio.
  return `${(acc * 100).toFixed(2)}%`;
}

function formatScoreDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTotalScore(score: number | null | undefined): string {
  if (score == null) return "—";
  return score.toLocaleString();
}

function PlayStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-semibold tracking-wide text-muted-foreground/80 uppercase">
        {label}
      </span>
      <span
        className="truncate text-[11px] font-bold tabular-nums"
        style={{ color: accent ?? "var(--foreground)" }}
      >
        {value}
      </span>
    </div>
  );
}

export function PlayerProfile() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [stats, setStats] = useState<UserStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modFilters, setModFilters] = useState<Set<string>>(new Set());
  const [modes, setModes] = useState<string[]>([]);
  const [mode, setMode] = useState<string>("osu");
  const [modeLoading, setModeLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("pp");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const playsScrollRef = useRef<HTMLDivElement>(null);
  const statsCacheRef = useRef<Record<string, UserStatsData>>({});

  useEffect(() => {
    playsScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [modFilters, query, sortKey, mode]);

  const prefetchModes = useCallback((modeList: string[], skip: string) => {
    modeList
      .filter((m) => m !== skip && !statsCacheRef.current[m])
      .forEach(async (m) => {
        try {
          const data = await getUserStats("me", m);
          statsCacheRef.current[m] = data;
        } catch {
          // Ignore prefetch failures; the mode will load on demand.
        }
      });
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    statsCacheRef.current = {};

    try {
      const status = await getAuthStatus();
      setAuth(status);

      if (!status.authenticated) {
        setStats(null);
        setModes([]);
        return;
      }

      const modeInfo = await getUserModes("me");
      const list = modeInfo.modes.length > 0 ? modeInfo.modes : ["osu"];
      const initial =
        modeInfo.main_mode && list.includes(modeInfo.main_mode)
          ? modeInfo.main_mode
          : list[0];

      setModes(list);
      setMode(initial);

      const userStats = await getUserStats("me", initial);
      statsCacheRef.current[initial] = userStats;
      setStats(userStats);
      setModFilters(new Set());

      // Warm the other modes in the background so switching is instant.
      prefetchModes(list, initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [prefetchModes]);

  const handleModeChange = useCallback(
    async (next: string) => {
      if (next === mode || modeLoading) return;

      const cached = statsCacheRef.current[next];
      if (cached) {
        setMode(next);
        setModFilters(new Set());
        setQuery("");
        setStats(cached);
        return;
      }

      setMode(next);
      setModFilters(new Set());
      setQuery("");
      setModeLoading(true);
      setError(null);

      try {
        const userStats = await getUserStats("me", next);
        statsCacheRef.current[next] = userStats;
        setStats(userStats);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load mode");
      } finally {
        setModeLoading(false);
      }
    },
    [mode, modeLoading],
  );

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSignIn = async () => {
    setSigningIn(true);
    setError(null);

    try {
      await signIn();
      await loadProfile();
      toast.success("Signed in to osu!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      setError(message);
      toast.error("Sign in failed", { description: message });
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    setError(null);

    try {
      await signOut();
      setAuth({ authenticated: false });
      setStats(null);
      statsCacheRef.current = {};
      toast.success("Signed out");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign out failed";
      setError(message);
      toast.error("Sign out failed", { description: message });
    } finally {
      setSigningOut(false);
    }
  };

  const topPlays = stats?.top_scores ?? [];

  const availableMods = useMemo(
    () => modsAvailableInPlays(topPlays),
    [topPlays],
  );

  const filteredPlays = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = topPlays.filter((play) => {
      if (!playMatchesModFilters(play, modFilters)) return false;
      if (!q) return true;
      return (
        play.title.toLowerCase().includes(q) ||
        (play.difficulty ?? "").toLowerCase().includes(q)
      );
    });
    result.sort((a, b) => sortValue(b, sortKey) - sortValue(a, sortKey));
    return result;
  }, [topPlays, modFilters, query, sortKey]);

  const toggleModFilter = (mod: string) => {
    setModFilters((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      return next;
    });
  };

  const clearModFilters = () => setModFilters(new Set());

  if (loading) {
    return (
      <Card className="flex h-full min-h-0 flex-col items-center justify-center gap-3 app-card">
        <Loader2 size={24} className="animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading profile…</p>
      </Card>
    );
  }

  if (!auth?.authenticated) {
    return (
      <Card className="flex h-full min-h-0 flex-col items-center justify-center px-6 app-card">
        <div className="app-auth-hero">
          <div className="app-auth-glow" aria-hidden />
          <Avatar className="app-auth-avatar size-20">
            <AvatarFallback className="bg-accent text-lg font-bold text-primary">
              osu
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Sign in to osu!
            </h2>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Connect your account to view rank, PP, and top plays.
            </p>
          </div>
          <Button
            onClick={handleSignIn}
            disabled={signingIn}
            className="app-btn-primary gap-2 rounded-xl px-5"
          >
          {signingIn ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Waiting for authorization…
            </>
          ) : (
            <>
              <LogIn size={14} />
              Sign in with osu!
            </>
          )}
        </Button>
        {error && (
          <p className="flex items-center gap-1.5 text-xs text-rose-400">
            <AlertCircle size={12} />
            {error}
          </p>
        )}
        </div>
      </Card>
    );
  }

  const statCards = [
    { label: "Global Rank", value: formatRank(stats?.rank) },
    { label: "PP", value: formatPp(stats?.pp) },
    { label: "Accuracy", value: formatAccuracy(stats?.accuracy) },
    { label: "Play Count", value: formatPlayCount(stats?.play_count) },
  ];

  const coverUrl = stats?.cover_url ?? null;

  return (
    <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden app-card">
      <div className="relative isolate overflow-hidden border-b border-osu-border px-4 py-5 sm:px-6">
        {coverUrl && (
          <>
            <motion.img
              key={coverUrl}
              src={coverUrl}
              alt=""
              aria-hidden
              initial={{ opacity: 0, scale: 1.08 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover"
            />
            <div
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(9,9,9,0.95) 100%)",
              }}
            />
          </>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="size-16 shrink-0 border border-white/10">
              <AvatarImage src={stats?.avatar_url ?? auth.avatar_url ?? undefined} />
              <AvatarFallback className="bg-accent text-primary">
                {initials(stats?.username ?? auth.username ?? "?")}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-foreground">
                {stats?.username ?? auth.username}
              </h2>
              <p className="text-sm text-muted-foreground">
                {stats?.country ?? auth.country ?? "Unknown"}
                {stats?.country_rank != null &&
                  ` · ${formatRank(stats.country_rank)} country`}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {modes.map((m) => {
                  const isActive = m === mode;
                  return (
                    <motion.button
                      key={m}
                      type="button"
                      onClick={() => handleModeChange(m)}
                      disabled={modeLoading}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={cn(
                        "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold lowercase app-chip disabled:cursor-default",
                        isActive
                          ? "app-chip-active"
                          : "app-chip-idle",
                      )}
                    >
                      <span className="font-extrabold not-italic opacity-80">
                        osu!
                      </span>
                      {m !== "osu" && modeLabel(m)}
                      {isActive && modeLoading && (
                        <Loader2 size={10} className="animate-spin" />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            disabled={signingOut}
            className="shrink-0 gap-1.5 border-osu-border text-xs"
          >
            {signingOut ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <LogOut size={12} />
            )}
            Sign out
          </Button>
        </div>
        {error && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-rose-400">
            <AlertCircle size={12} />
            {error}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 py-4 sm:grid-cols-4 sm:px-6">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg app-stat px-3 py-3 text-center"
          >
            <p className="app-section-label">{stat.label}</p>
            <p className="app-stat-value mt-1 text-sm font-bold tabular-nums">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="shrink-0 px-4 pt-4 sm:px-6">
        <h3 className="app-section-head mb-3 w-full justify-between">
          <span className="flex items-center gap-2">
            <Trophy size={14} />
            Top 100 Plays
          </span>
          {topPlays.length > 0 && (
            <span className="text-[10px] font-medium text-muted-foreground">
              {modFilters.size > 0 || query.trim()
                ? `${filteredPlays.length} / ${topPlays.length} maps`
                : `${topPlays.length} maps`}
            </span>
          )}
        </h3>
        {availableMods.length > 0 && (
          <ModFilterBar
            availableMods={availableMods}
            activeMods={modFilters}
            onToggle={toggleModFilter}
            onClear={clearModFilters}
          />
        )}
        {topPlays.length > 0 && (
          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                size={13}
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search maps…"
                className="app-input h-8 w-full rounded-lg pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground/70"
              />
            </div>
            <div className="flex items-center gap-1 rounded-lg app-toolbar px-1.5">
              <ArrowDownWideNarrow
                size={12}
                className="shrink-0 text-muted-foreground"
              />
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSortKey(opt.key)}
                  className={cn(
                    "app-sort-btn h-6 px-1.5",
                    sortKey === opt.key ? "app-sort-btn-active" : "app-sort-btn-idle",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div
        ref={playsScrollRef}
        className="app-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6"
      >
        {modeLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 app-row"
              >
                <div className="size-11 shrink-0 rounded-lg app-skeleton" />
                <div className="flex flex-1 flex-col gap-2">
                  <div className="h-3 w-3/4 rounded app-skeleton" />
                  <div className="h-2.5 w-1/2 rounded app-skeleton" />
                  <div className="h-3 w-20 rounded app-skeleton" />
                </div>
                <div className="h-4 w-12 rounded app-skeleton" />
              </div>
            ))}
          </div>
        ) : topPlays.length === 0 ? (
          <div className="app-empty">
            <div className="app-empty-icon">
              <Trophy size={16} />
            </div>
            <p className="text-sm">No top plays found.</p>
          </div>
        ) : filteredPlays.length === 0 ? (
          <div className="app-empty">
            <div className="app-empty-icon">
              <Search size={16} />
            </div>
            <p className="text-sm">No plays match your search or filters.</p>
          </div>
        ) : (
          <motion.div layout className="flex flex-col gap-2">
            <AnimatePresence initial={false} mode="popLayout">
              {filteredPlays.map((play, i) => {
                const starColor = getStarColor(play.stars ?? 0);
                const grade = play.grade ? gradeStyle(play.grade) : null;
                const rowKey =
                  play.beatmap_id != null
                    ? String(play.beatmap_id)
                    : `${play.title}-${play.difficulty ?? ""}`;
                const isExpanded = expandedKey === rowKey;
                return (
                  <motion.div
                    layout="position"
                    key={rowKey}
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{
                      opacity: {
                        duration: 0.3,
                        ease: [0.22, 1, 0.36, 1],
                        delay: Math.min(i * 0.035, 0.4),
                      },
                      y: {
                        type: "spring",
                        stiffness: 260,
                        damping: 30,
                        mass: 0.9,
                        delay: Math.min(i * 0.035, 0.4),
                      },
                      scale: {
                        duration: 0.3,
                        ease: [0.22, 1, 0.36, 1],
                        delay: Math.min(i * 0.035, 0.4),
                      },
                      layout: { type: "spring", stiffness: 320, damping: 34, mass: 0.9 },
                    }}
                    className={cn(
                      "group relative flex flex-col overflow-hidden rounded-xl app-row",
                      isExpanded && "app-row-active",
                    )}
                  >
                    <span
                      className="absolute inset-y-0 left-0 w-[3px]"
                      style={{ backgroundColor: starColor }}
                      aria-hidden
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedKey((prev) => (prev === rowKey ? null : rowKey))
                      }
                      className="flex items-center gap-2.5 px-2.5 py-2 text-left"
                    >
                      <span className="w-5 shrink-0 text-center text-[11px] font-bold text-muted-foreground tabular-nums">
                        {i + 1}
                      </span>
                      <div className="relative size-11 shrink-0 overflow-hidden rounded-lg app-thumb">
                        {play.cover_url ? (
                          <img
                            src={play.cover_url}
                            alt=""
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-full w-full bg-osu-border/40" />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                        <p className="flex h-4 items-center truncate text-xs font-semibold leading-none text-foreground">
                          {play.title}
                        </p>
                        <div className="flex h-3.5 min-w-0 items-center gap-1.5 leading-none">
                          <span
                            className="truncate text-[10px] font-semibold leading-none"
                            style={{ color: play.difficulty ? starColor : undefined }}
                          >
                            {play.difficulty ?? "Unknown difficulty"}
                          </span>
                          {play.stars != null && (
                            <span
                              className="flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none tabular-nums"
                              style={{
                                color: starColor,
                                backgroundColor: `${starColor}1f`,
                              }}
                            >
                              <Star size={8} fill={starColor} color={starColor} />
                              {formatStars(play.stars)}
                            </span>
                          )}
                        </div>
                        <div className="flex h-4 items-center">
                          <ModBadgeList mods={play.mods} />
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5 pl-1">
                        <span
                          className="text-sm font-extrabold leading-none tabular-nums"
                          style={{ color: "var(--osu-pink)" }}
                        >
                          {Math.round(play.pp)}
                          <span className="ml-0.5 text-[9px] font-bold opacity-70">
                            pp
                          </span>
                        </span>
                        {grade && (
                          <span
                            className="flex h-[22px] min-w-[26px] items-center justify-center rounded-md px-1.5 text-[11px] font-bold uppercase leading-none tracking-wider tabular-nums"
                            style={{
                              backgroundColor: `${grade.color}22`,
                              color: grade.color,
                              border: `1px solid ${grade.color}66`,
                            }}
                            title={`${play.grade} rank`}
                          >
                            {play.grade}
                          </span>
                        )}
                      </div>
                    </button>
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="grid grid-cols-3 gap-2 border-t border-osu-border/70 px-3 py-2.5">
                            <PlayStat
                              label="Accuracy"
                              value={formatScoreAccuracy(play.accuracy)}
                            />
                            <PlayStat
                              label="Combo"
                              value={
                                play.max_combo != null
                                  ? play.beatmap_max_combo
                                    ? `${play.max_combo}x / ${play.beatmap_max_combo}x`
                                    : `${play.max_combo}x`
                                  : "—"
                              }
                            />
                            <PlayStat
                              label="Score"
                              value={formatTotalScore(play.score)}
                            />
                            <PlayStat
                              label="Hits"
                              value={`${play.count_300 ?? 0} / ${play.count_100 ?? 0} / ${play.count_50 ?? 0}`}
                            />
                            <PlayStat
                              label="Misses"
                              value={String(play.count_miss ?? 0)}
                              accent={
                                (play.count_miss ?? 0) > 0 ? "#ff7b72" : undefined
                              }
                            />
                            <PlayStat
                              label="Date"
                              value={formatScoreDate(play.created_at)}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </Card>
  );
}
