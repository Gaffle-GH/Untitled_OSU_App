import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Star,
  Pause,
  Download,
  Music2,
  Target,
  Zap,
  User,
  TrendingUp,
  SlidersHorizontal,
  Trophy,
  AlertCircle,
  Flame,
  Clock,
  Search,
  ArrowDownWideNarrow,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Card } from "./components/ui/card";
import { PlayerProfile } from "./components/PlayerProfile";
import { ModBadgeList } from "./components/ModBadges";
import {
  SearchPanel,
  DEFAULT_BEATMAP,
  type BeatmapSearchResult,
  type MapStatus,
} from "./components/SearchPanel";
import {
  downloadAndExtractBeatmap,
  getBackgroundFileUrl,
  getPreviewFileUrl,
  getFarmMaps,
  getAuthStatus,
  getUserStats,
  type FarmMap,
} from "../lib/api";
import { AnimatedColor, AnimatedNumber } from "./components/AnimatedValue";
import { formatStars, getStarColor } from "../lib/difficulty";

const MAP_STATUSES: MapStatus[] = ["Ranked", "Loved", "Qualified", "Pending"];

const STATUS_STYLES: Record<MapStatus, string> = {
  Ranked: "text-primary",
  Loved: "text-rose-400",
  Qualified: "text-sky-400",
  Pending: "text-amber-400",
};
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { TooltipProvider } from "./components/ui/tooltip";
import { cn } from "./components/ui/utils";

type StatKey = "AR" | "OD" | "HP" | "CS";
type DownloadState = "idle" | "downloading" | "extracted";

function formatStatValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

function statsForDifficulty(
  beatmap: BeatmapSearchResult,
): Record<StatKey, number> {
  const difficulty = beatmap.difficulties.find(
    (entry) => entry.version === beatmap.difficulty,
  );

  return {
    AR: difficulty?.ar ?? 0,
    OD: difficulty?.od ?? 0,
    HP: difficulty?.hp ?? 0,
    CS: difficulty?.cs ?? 0,
  };
}

const FARM_MODES = [
  { key: "osu", label: "osu!" },
  { key: "taiko", label: "taiko" },
  { key: "fruits", label: "catch" },
  { key: "mania", label: "mania" },
];

type FarmSortKey = "farm" | "pp" | "stars";

const FARM_SORTS: { key: FarmSortKey; label: string }[] = [
  { key: "farm", label: "Farm" },
  { key: "pp", label: "PP" },
  { key: "stars", label: "Stars" },
];

function formatLength(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function StatBox({
  value,
  overlay,
  color,
}: {
  value: number;
  overlay?: boolean;
  color?: string;
}) {
  const number = (
    <AnimatedNumber
      value={value}
      className={cn("text-xs font-bold", !color && "text-primary")}
      format={formatStatValue}
    />
  );

  return (
    <div
      className={cn(
        "flex h-7 min-w-10 items-center justify-center rounded-md border px-2 transition-colors",
        overlay
          ? "app-glass-panel border-white/10 hover:border-primary/40"
          : "app-stat hover:border-primary/30",
      )}
    >
      {color ? (
        <AnimatedColor color={color}>{number}</AnimatedColor>
      ) : (
        number
      )}
    </div>
  );
}

function MarqueeTitle({ text }: { text: string }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    if (outerRef.current && innerRef.current) {
      setOverflow(innerRef.current.scrollWidth > outerRef.current.clientWidth);
    }
  }, [text]);

  return (
    <div ref={outerRef} className="w-full overflow-hidden [contain:paint]">
      <span
        ref={innerRef}
        className={cn(
          "inline-block whitespace-nowrap text-sm font-bold text-foreground",
          overflow && "animate-marquee",
        )}
      >
        {text}
      </span>
    </div>
  );
}

function StatRow({
  leftLabel,
  leftStat,
  rightStat,
  rightLabel,
  overlay,
  color,
}: {
  leftLabel: StatKey;
  leftStat: number;
  rightStat: number;
  rightLabel: StatKey;
  overlay?: boolean;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "w-7 shrink-0 text-xs font-semibold",
          overlay ? "text-white/60" : "text-muted-foreground",
        )}
      >
        {leftLabel}
      </span>
      <StatBox value={leftStat} overlay={overlay} color={color} />
      <div className="flex flex-1 items-center justify-center px-1">
        <div
          className={cn(
            "h-px w-full max-w-6",
            overlay ? "bg-white/15" : "bg-border",
          )}
        />
      </div>
      <StatBox value={rightStat} overlay={overlay} color={color} />
      <span
        className={cn(
          "w-7 shrink-0 text-right text-xs font-semibold",
          overlay ? "text-white/60" : "text-muted-foreground",
        )}
      >
        {rightLabel}
      </span>
    </div>
  );
}

function BeatmapWorkspace({ isActive }: { isActive: boolean }) {
  const [beatmap, setBeatmap] = useState<BeatmapSearchResult>(DEFAULT_BEATMAP);
  const [mapStatus, setMapStatus] = useState<MapStatus>(DEFAULT_BEATMAP.status);
  const stats = statsForDifficulty(beatmap);
  const [isPlaying, setIsPlaying] = useState(false);
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");
  const [backgroundUrl, setBackgroundUrl] = useState<string>(beatmap.backgroundUrl);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!isActive) {
      audioRef.current?.pause();
      setIsPlaying(false);
    }
  }, [isActive]);

  const artworkUrl = backgroundUrl;

  function handleSelect(map: BeatmapSearchResult) {
    setBeatmap(map);
    setMapStatus(map.status);
    setDownloadState("idle");
    setIsPlaying(false);
    setError(null);
    setBackgroundUrl(map.backgroundUrl);
  }

  function cycleMapStatus() {
    setMapStatus((current) => {
      const index = MAP_STATUSES.indexOf(current);
      return MAP_STATUSES[(index + 1) % MAP_STATUSES.length];
    });
  }

  async function handleDownload() {
    setDownloadState("downloading");
    setError(null);
    const loadingId = toast.loading(`Downloading ${beatmap.title}…`);
    try {
      const result = await downloadAndExtractBeatmap(beatmap.id);

      if (result.background_image) {
        // Update background image URL to show extracted version
        setBackgroundUrl(getBackgroundFileUrl(result.background_image));
      }

      setTimeout(() => setDownloadState("extracted"), 1400);
      toast.success("Beatmap downloaded", {
        id: loadingId,
        description: `${beatmap.artist} — ${beatmap.title}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Download failed";
      setError(message);
      setDownloadState("idle");
      toast.error("Download failed", { id: loadingId, description: message });
    }
  }

  function handlePlayPreview() {
    if (!isPlaying && audioRef.current) {
      audioRef.current.src = getPreviewFileUrl(beatmap.id);
      audioRef.current.play();
    } else if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(!isPlaying);
  }

  return (
    <Card className="editor-card-locked app-card">
      <SearchPanel
        selectedId={beatmap.id}
        selectedDifficulty={beatmap.difficulty}
        onSelect={handleSelect}
      />

      {error && (
        <div className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertCircle size={16} />
            {error}
          </div>
        </div>
      )}

      <div className="detail-panel-locked">
          <div className="detail-panel-header-locked">
            <div className="size-11 shrink-0 overflow-hidden rounded-md app-thumb">
              <img
                src={beatmap.coverUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                {beatmap.artist}
              </p>
              <div className="mt-0.5">
                <MarqueeTitle text={beatmap.title} />
              </div>
              <p className="mt-1 truncate text-[10px] text-muted-foreground/70">
                mapped by <span className="text-foreground/80">{beatmap.mapper}</span>
              </p>
            </div>
            <div className="h-10 w-px shrink-0 bg-osu-border" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Difficulty
              </p>
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={beatmap.difficulty}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="mt-0.5 truncate text-sm font-semibold"
                >
                  <AnimatedColor color={getStarColor(beatmap.stars)}>
                    {beatmap.difficulty}
                  </AnimatedColor>
                </motion.p>
              </AnimatePresence>
              <AnimatedColor
                color={getStarColor(beatmap.stars)}
                className="mt-0.5 block text-[10px] font-bold"
              >
                <AnimatedNumber
                  value={beatmap.stars}
                  format={formatStars}
                />{" "}
                ★
              </AnimatedColor>
            </div>
          </div>

          <div className="detail-panel-artwork-locked">
          <img
            src={artworkUrl}
            alt="Beatmap artwork"
            className={cn(
              "h-full w-full object-cover brightness-[0.55] saturate-[1.15]",
              downloadState === "extracted" && "object-[50%_35%]",
            )}
            onError={() => setBackgroundUrl(beatmap.backgroundUrl)}
          />
          <div className="detail-panel-artwork-vignette" aria-hidden />
          {downloadState === "extracted" && (
            <Badge className="absolute top-3 left-3 z-10 bg-osu-green/80 py-0 text-[9px] text-white hover:bg-osu-green/80">
              Background extracted
            </Badge>
          )}
          {downloadState === "downloading" && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <p className="text-xs font-medium text-white/80">Extracting background…</p>
            </div>
          )}
          <button
            type="button"
            onClick={cycleMapStatus}
            className="absolute top-3 right-3 z-10 flex min-w-[72px] items-center justify-center rounded-xl px-3 py-1.5 app-glass-panel transition-colors hover:border-primary/30"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={mapStatus}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  "block w-full text-center text-[11px] font-bold tracking-wide uppercase transition-colors duration-300",
                  STATUS_STYLES[mapStatus],
                )}
              >
                {mapStatus}
              </motion.span>
            </AnimatePresence>
          </button>
          <div className="absolute bottom-3 left-3 z-10 rounded-xl px-2.5 py-2 app-glass-panel">
            <div className="flex flex-col gap-2">
              <StatRow
                leftLabel="AR"
                leftStat={stats.AR}
                rightStat={stats.OD}
                rightLabel="OD"
                overlay
                color={getStarColor(beatmap.stars)}
              />
              <StatRow
                leftLabel="HP"
                leftStat={stats.HP}
                rightStat={stats.CS}
                rightLabel="CS"
                overlay
                color={getStarColor(beatmap.stars)}
              />
            </div>
            <div className="mt-2.5 border-t border-white/10 pt-2.5">
              <AnimatedColor
                color={getStarColor(beatmap.stars)}
                className="flex items-center gap-1.5"
              >
                <AnimatedNumber
                  value={beatmap.stars}
                  className="text-xl font-bold"
                  format={formatStars}
                />
                <Star size={16} fill="currentColor" color="currentColor" />
              </AnimatedColor>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-white/60">
                <span className="flex items-center gap-1">
                  <Target size={10} className="text-primary" />
                  aim <span className="font-semibold text-white">12.4</span>
                </span>
                <span className="flex items-center gap-1">
                  <Zap size={10} className="text-primary" />
                  spd <span className="font-semibold text-white">4.2</span>
                </span>
              </div>
            </div>
          </div>
          <div className="absolute right-3 bottom-3 z-10 flex items-center gap-2">
            <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />
            <Button
              onClick={handlePlayPreview}
              size="icon"
              aria-label={isPlaying ? "Pause preview" : "Play preview song"}
              className={cn(
                "app-btn-icon size-8 border-0 bg-white/10 text-white hover:bg-white/14",
                isPlaying && "bg-white/14",
              )}
            >
              {isPlaying ? <Pause size={14} /> : <Music2 size={14} />}
            </Button>
            <Button
              onClick={handleDownload}
              disabled={downloadState === "downloading"}
              size="icon"
              aria-label="Download beatmapset"
              className="app-btn-icon size-8 border-0 bg-white/10 text-white hover:bg-white/14"
            >
              <Download size={14} />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

type PlayerTopPlay = {
  beatmap_id?: number | null;
  pp: number;
  stars?: number | null;
};

type PlayerModel = {
  played: Set<number>;
  lowest: number;
  highest: number;
  level: number;
  starMin: number;
  starMax: number;
  count: number;
};

type FarmView = "for-you" | "all";

// How far above the lowest top-100 play to aim, in pp.
const BOOST_OPTIONS = [5, 15, 30, 50];
// Don't recommend maps worth far more than the player's best realistic play.
const CEILING_BUFFER = 60;

function buildPlayerModel(plays: PlayerTopPlay[]): PlayerModel | null {
  if (!plays.length) return null;

  const played = new Set<number>();
  for (const p of plays) {
    if (p.beatmap_id != null) played.add(p.beatmap_id);
  }

  const pps = plays.map((p) => p.pp ?? 0).sort((a, b) => b - a);
  const stars = plays
    .map((p) => p.stars ?? 0)
    .filter((s) => s > 0)
    .sort((a, b) => a - b);

  const pct = (arr: number[], p: number) =>
    arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;

  return {
    played,
    lowest: pps[pps.length - 1] ?? 0,
    highest: pps[0] ?? 0,
    level: pct(stars, 0.5),
    starMin: pct(stars, 0.1),
    starMax: (stars[stars.length - 1] ?? 0) + 0.2,
    count: plays.length,
  };
}

function PPFarm({ isActive }: { isActive: boolean }) {
  const [mode, setMode] = useState("osu");
  const [maps, setMaps] = useState<FarmMap[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<FarmSortKey>("farm");
  const [view, setView] = useState<FarmView>("for-you");
  const [boost, setBoost] = useState(15);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [topPlays, setTopPlays] = useState<PlayerTopPlay[]>([]);
  const cacheRef = useRef<Record<string, FarmMap[]>>({});
  const playerCacheRef = useRef<Record<string, PlayerTopPlay[]>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  const loadPlayer = useCallback(async (nextMode: string) => {
    if (playerCacheRef.current[nextMode]) {
      setTopPlays(playerCacheRef.current[nextMode]);
      return;
    }
    try {
      const stats = await getUserStats("me", nextMode);
      const plays = stats.top_scores.map((s) => ({
        beatmap_id: s.beatmap_id,
        pp: s.pp,
        stars: s.stars,
      }));
      playerCacheRef.current[nextMode] = plays;
      setTopPlays(plays);
    } catch {
      setTopPlays([]);
    }
  }, []);

  const loadMode = useCallback(
    async (nextMode: string) => {
      if (!cacheRef.current[nextMode]) {
        setLoading(true);
        setError(null);
        try {
          const data = await getFarmMaps(nextMode, 200);
          cacheRef.current[nextMode] = data.maps;
          setMaps(data.maps);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to load farm maps",
          );
          setMaps([]);
        } finally {
          setLoading(false);
        }
      } else {
        setMaps(cacheRef.current[nextMode]);
        setError(null);
      }
      if (authed) loadPlayer(nextMode);
    },
    [authed, loadPlayer],
  );

  // Lazy-load on first activation so the app starts fast.
  useEffect(() => {
    if (!isActive || loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      let signedIn = false;
      try {
        const status = await getAuthStatus();
        signedIn = !!status.authenticated;
      } catch {
        signedIn = false;
      }
      setAuthed(signedIn);
      if (!cacheRef.current[mode]) {
        setLoading(true);
        try {
          const data = await getFarmMaps(mode, 200);
          cacheRef.current[mode] = data.maps;
          setMaps(data.maps);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to load farm maps",
          );
        } finally {
          setLoading(false);
        }
      }
      if (signedIn) loadPlayer(mode);
      else setView("all");
    })();
  }, [isActive, mode, loadPlayer]);

  const handleModeChange = (next: string) => {
    if (next === mode) return;
    setMode(next);
    setQuery("");
    loadMode(next);
  };

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [mode, query, sortKey, view, boost]);

  const player = useMemo(() => buildPlayerModel(topPlays), [topPlays]);

  const effectiveView: FarmView = authed && player ? view : "all";

  // Lower bound: a fixed amount above the lowest top-100 play.
  const targetPp = player ? player.lowest + boost : 0;
  const ceilingPp = player ? player.highest + CEILING_BUFFER : Infinity;

  const visibleMaps = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = maps.map((m) => ({
      ...m,
      gain:
        player && m.pp != null
          ? Math.max(0, Math.round(m.pp - player.lowest))
          : 0,
    }));

    if (effectiveView === "for-you" && player) {
      result = result.filter(
        (m) =>
          m.beatmap_id != null &&
          !player.played.has(m.beatmap_id) &&
          (m.stars ?? 0) >= player.starMin - 0.4 &&
          (m.stars ?? 0) <= player.starMax &&
          (m.pp ?? 0) >= targetPp &&
          (m.pp ?? 0) <= ceilingPp,
      );
    }

    result = result.filter((m) => {
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        m.artist.toLowerCase().includes(q) ||
        m.version.toLowerCase().includes(q) ||
        m.mods.join("").toLowerCase().includes(q)
      );
    });

    if (sortKey !== "farm") {
      result.sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0));
    }
    return result;
  }, [maps, player, effectiveView, query, sortKey, targetPp, ceilingPp]);

  return (
    <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden app-card">
      <div className="border-b border-osu-border px-4 pt-4 pb-3 sm:px-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="app-section-head">
              <Flame size={14} />
              PP Farm
            </h2>
            <p className="app-section-sub">
              {effectiveView === "for-you" && player ? (
                <>
                  Tailored to your top 100 · ~
                  <span className="font-semibold text-foreground/80">
                    {formatStars(player.level)}★
                  </span>{" "}
                  · maps worth{" "}
                  <span className="font-semibold text-foreground/80">
                    {Math.round(targetPp)}pp+
                  </span>
                </>
              ) : (
                <>
                  Most overweighted maps. Data by{" "}
                  <span className="font-semibold text-foreground/80">osu-pps</span>.
                </>
              )}
            </p>
          </div>
          {authed && player && (
            <div className="flex shrink-0 items-center rounded-lg app-toolbar p-0.5 text-[10px] font-bold">
              {(["for-you", "all"] as FarmView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-md px-2 py-1 app-chip",
                    effectiveView === v
                      ? "app-chip-active"
                      : "app-chip-idle",
                  )}
                >
                  {v === "for-you" ? "For you" : "All"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {FARM_MODES.map((m) => {
            const active = m.key === mode;
            return (
              <motion.button
                key={m.key}
                type="button"
                onClick={() => handleModeChange(m.key)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold app-chip",
                  active
                    ? "app-chip-active"
                    : "app-chip-idle",
                )}
              >
                <span className="font-extrabold opacity-80">osu!</span>
                {m.key !== "osu" && m.label}
              </motion.button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={13}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search farm maps…"
              className="app-input h-8 w-full rounded-lg pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground/70"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg app-toolbar px-1.5">
            <ArrowDownWideNarrow size={12} className="shrink-0 text-muted-foreground" />
            {FARM_SORTS.map((opt) => (
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

        {effectiveView === "for-you" && player && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Target gain
            </span>
            <div className="flex items-center gap-1 rounded-lg app-toolbar px-1.5 py-0.5">
              {BOOST_OPTIONS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBoost(b)}
                  className={cn(
                    "app-sort-btn h-5 px-1.5 font-bold tabular-nums",
                    boost === b ? "app-sort-btn-active" : "app-sort-btn-idle",
                  )}
                >
                  +{b}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">
              above your {Math.round(player.lowest)}pp floor
            </span>
          </div>
        )}
      </div>

      <div ref={listRef} className="app-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
        {loading ? (
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
                </div>
                <div className="h-5 w-10 rounded app-skeleton" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="app-empty py-10">
            <div className="app-empty-icon">
              <AlertCircle size={18} />
            </div>
            <p className="text-sm">{error}</p>
          </div>
        ) : visibleMaps.length === 0 ? (
          <div className="app-empty">
            <div className="app-empty-icon">
              <Flame size={16} />
            </div>
            <p className="text-sm">
              {effectiveView === "for-you"
                ? "No new farm maps near your level — try the All view."
                : "No farm maps found."}
            </p>
          </div>
        ) : (
          <motion.div layout className="flex flex-col gap-2">
            <AnimatePresence initial={false} mode="popLayout">
              {visibleMaps.slice(0, 120).map((map, i) => {
                const starColor = getStarColor(map.stars ?? 0);
                return (
                  <motion.a
                    layout="position"
                    key={`${map.beatmap_id ?? map.title}-${map.mods.join("")}`}
                    href={
                      map.beatmapset_id
                        ? `https://osu.ppy.sh/beatmapsets/${map.beatmapset_id}#osu/${map.beatmap_id ?? ""}`
                        : undefined
                    }
                    target="_blank"
                    rel="noreferrer"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{
                      opacity: { duration: 0.25, delay: Math.min(i * 0.015, 0.25) },
                      y: { type: "spring", stiffness: 280, damping: 30 },
                      layout: { type: "spring", stiffness: 320, damping: 34 },
                    }}
                    className="group relative flex items-center gap-2.5 overflow-hidden rounded-xl px-2.5 py-2 app-row"
                  >
                    <span
                      className="absolute inset-y-0 left-0 w-[3px]"
                      style={{ backgroundColor: starColor }}
                      aria-hidden
                    />
                    <span className="w-5 shrink-0 text-center text-[11px] font-bold text-muted-foreground tabular-nums">
                      {i + 1}
                    </span>
                    <div className="relative size-11 shrink-0 overflow-hidden rounded-lg app-thumb">
                      {map.cover_url ? (
                        <img
                          src={map.cover_url}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-full w-full bg-osu-border/40" />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                      <p className="truncate text-xs font-semibold leading-none text-foreground">
                        {map.artist} - {map.title}
                      </p>
                      <div className="flex min-w-0 items-center gap-1.5 leading-none">
                        <span
                          className="truncate text-[10px] font-semibold leading-none"
                          style={{ color: starColor }}
                        >
                          {map.version || "—"}
                        </span>
                        {map.stars != null && (
                          <span
                            className="flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none tabular-nums"
                            style={{ color: starColor, backgroundColor: `${starColor}1f` }}
                          >
                            <Star size={8} fill={starColor} color={starColor} />
                            {formatStars(map.stars ?? 0)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[9px] font-medium text-muted-foreground">
                        {map.mods.length > 0 && (
                          <ModBadgeList mods={map.mods} />
                        )}
                        <span className="flex items-center gap-0.5">
                          <Clock size={9} />
                          {formatLength(map.length)}
                        </span>
                        {map.bpm != null && <span>{Math.round(map.bpm)} bpm</span>}
                        <ExternalLink
                          size={9}
                          className="opacity-0 transition-opacity group-hover:opacity-60"
                        />
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-extrabold leading-none tabular-nums text-foreground">
                        {Math.round(map.pp ?? 0)}
                        <span className="ml-0.5 text-[9px] font-bold opacity-70">pp</span>
                      </span>
                      {effectiveView === "for-you" && player && map.gain > 0 ? (
                        <span
                          className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold leading-none text-foreground app-metric-gain"
                          title="Estimated PP headroom above your lowest top-100 play"
                        >
                          +{map.gain}
                        </span>
                      ) : (
                        <span
                          className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold leading-none text-muted-foreground app-metric-farm"
                          title="Farm rating (osu-pps overweightness)"
                        >
                          <Flame size={9} />
                          {Math.round(map.farm_value ?? 0)}
                        </span>
                      )}
                    </div>
                  </motion.a>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </Card>
  );
}

const TAB_ORDER = ["editor", "profile", "pp-farm"];

function AuroraBackground() {
  return (
    <div className="ios-wallpaper pointer-events-none absolute inset-0" aria-hidden />
  );
}

function TabFlow({
  active,
  direction,
  children,
}: {
  active: boolean;
  direction: number;
  children: ReactNode;
}) {
  return (
    <motion.div
      className="flex min-h-0 flex-1 flex-col"
      initial={false}
      animate={
        active
          ? { opacity: 1, x: 0, scale: 1 }
          : { opacity: 0, x: 24 * direction, scale: 0.985 }
      }
      transition={{
        opacity: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
        x: { type: "spring", stiffness: 320, damping: 34, mass: 0.8 },
        scale: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
      }}
      style={{ pointerEvents: active ? "auto" : "none" }}
    >
      {children}
    </motion.div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("editor");
  const prevTabRef = useRef(activeTab);

  const activeIndex = TAB_ORDER.indexOf(activeTab);
  const prevIndex = TAB_ORDER.indexOf(prevTabRef.current);

  useEffect(() => {
    prevTabRef.current = activeTab;
  }, [activeTab]);

  const tabDirection = (tab: string) => {
    const idx = TAB_ORDER.indexOf(tab);
    // Active tab enters from the side it was navigated from; others rest on
    // whichever side they sit relative to the active tab.
    if (idx === activeIndex) return activeIndex >= prevIndex ? 1 : -1;
    return idx > activeIndex ? 1 : -1;
  };

  // Keyboard shortcuts: 1/2/3 jump between tabs (ignored while typing).
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        (target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable))
      ) {
        return;
      }
      const index = ["1", "2", "3"].indexOf(event.key);
      if (index !== -1) {
        event.preventDefault();
        setActiveTab(TAB_ORDER[index]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="app-layout-locked relative flex flex-col bg-background">
        <AuroraBackground />
        <header className="app-titlebar-locked relative z-10 flex shrink-0 items-end justify-center pb-1">
          <span className="app-title-ios">osu! Trainer</span>
        </header>

        <div className="app-shell-locked relative flex min-h-0 flex-1 flex-col">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="tabs-shell-locked"
          >
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="tabs-shell-locked"
            >
              <TabsList className="app-tabs grid h-10 w-full shrink-0 grid-cols-3 rounded-[11px] p-[3px]">
                <TabsTrigger
                  value="editor"
                  className="app-tab-trigger group/tab gap-1.5 rounded-[9px] text-xs"
                >
                  {activeTab === "editor" && (
                    <motion.span
                      layoutId="tab-indicator"
                      className="app-tab-indicator"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <SlidersHorizontal size={13} />
                  Editor
                  <kbd className="ml-0.5 hidden rounded bg-white/5 px-1 text-[9px] font-semibold text-muted-foreground/70 sm:inline">
                    1
                  </kbd>
                </TabsTrigger>
                <TabsTrigger
                  value="profile"
                  className="app-tab-trigger group/tab gap-1.5 rounded-[9px] text-xs"
                >
                  {activeTab === "profile" && (
                    <motion.span
                      layoutId="tab-indicator"
                      className="app-tab-indicator"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <User size={13} />
                  Profile
                  <kbd className="ml-0.5 hidden rounded bg-white/5 px-1 text-[9px] font-semibold text-muted-foreground/70 sm:inline">
                    2
                  </kbd>
                </TabsTrigger>
                <TabsTrigger
                  value="pp-farm"
                  className="app-tab-trigger group/tab gap-1.5 rounded-[9px] text-xs"
                >
                  {activeTab === "pp-farm" && (
                    <motion.span
                      layoutId="tab-indicator"
                      className="app-tab-indicator"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <TrendingUp size={13} />
                  PP Farm
                  <kbd className="ml-0.5 hidden rounded bg-white/5 px-1 text-[9px] font-semibold text-muted-foreground/70 sm:inline">
                    3
                  </kbd>
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="editor"
                forceMount
                className="mt-0 flex min-h-0 flex-1 flex-col"
              >
                <TabFlow
                  active={activeTab === "editor"}
                  direction={tabDirection("editor")}
                >
                  <BeatmapWorkspace isActive={activeTab === "editor"} />
                </TabFlow>
              </TabsContent>
              <TabsContent
                value="profile"
                forceMount
                className="mt-0 flex min-h-0 flex-1 flex-col"
              >
                <TabFlow
                  active={activeTab === "profile"}
                  direction={tabDirection("profile")}
                >
                  <PlayerProfile />
                </TabFlow>
              </TabsContent>
              <TabsContent
                value="pp-farm"
                forceMount
                className="mt-0 flex min-h-0 flex-1 flex-col"
              >
                <TabFlow
                  active={activeTab === "pp-farm"}
                  direction={tabDirection("pp-farm")}
                >
                  <PPFarm isActive={activeTab === "pp-farm"} />
                </TabFlow>
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </div>
    </TooltipProvider>
  );
}
