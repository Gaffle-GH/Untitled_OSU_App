import { useState } from "react";
import { Search, Music2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { getBackgroundFileUrl, searchAndDownloadBeatmap } from "../../lib/api";
import { type BeatmapDifficulty } from "./DifficultySelector";
import { DifficultyResultCard } from "./DifficultyResultCard";

export type MapStatus = "Ranked" | "Loved" | "Qualified" | "Pending";

export type BeatmapSearchResult = {
  id: number;
  artist: string;
  title: string;
  difficulty: string;
  mapper: string;
  stars: number;
  bpm: number;
  status: MapStatus;
  coverUrl: string;
  backgroundUrl: string;
  difficulties: BeatmapDifficulty[];
};

function mockEntry(
  entry: Omit<BeatmapSearchResult, "difficulties"> & {
    difficulties: BeatmapDifficulty[];
  },
): BeatmapSearchResult {
  const easiest = entry.difficulties[0];
  return {
    ...entry,
    difficulty: easiest.version,
    stars: easiest.stars,
    status: normalizeMapStatus(easiest.status) || entry.status,
  };
}

export const DEFAULT_BEATMAP = mockEntry({
  id: 1843921,
  artist: "ONE OK ROCK",
  title: "One By One",
  difficulty: "Sotarks' Rampage",
  mapper: "Sotarks",
  stars: 6.2,
  bpm: 197,
  status: "Ranked",
  coverUrl:
    "https://images.unsplash.com/photo-1776557819088-b8da598348c8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=200",
  backgroundUrl:
    "https://images.unsplash.com/photo-1776557819088-b8da598348c8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
  difficulties: [
    { version: "Hard", stars: 4.1, status: "Ranked", ar: 7, od: 6, hp: 5, cs: 3.5 },
    { version: "Insane", stars: 5.2, status: "Ranked", ar: 8, od: 7.5, hp: 5.5, cs: 4 },
    { version: "Sotarks' Rampage", stars: 6.2, status: "Ranked", ar: 9.4, od: 8.8, hp: 6, cs: 4.2 },
  ],
});

export const MOCK_CATALOG: BeatmapSearchResult[] = [
  DEFAULT_BEATMAP,
  mockEntry({
    id: 2016402,
    artist: "YOASOBI",
    title: "Idol",
    difficulty: "Luscent's Extra",
    mapper: "Luscent",
    stars: 5.8,
    bpm: 166,
    status: "Loved",
    coverUrl:
      "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=200",
    backgroundUrl:
      "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
    difficulties: [
      { version: "Normal", stars: 2.8 },
      { version: "Hard", stars: 4.0 },
      { version: "Luscent's Extra", stars: 5.8 },
    ],
  }),
  mockEntry({
    id: 966339,
    artist: "Reol",
    title: "No Title",
    difficulty: "Monstrata's Expert",
    mapper: "Monstrata",
    stars: 5.4,
    bpm: 200,
    status: "Qualified",
    coverUrl:
      "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=200",
    backgroundUrl:
      "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
    difficulties: [
      { version: "Hard", stars: 3.9 },
      { version: "Insane", stars: 4.8 },
      { version: "Monstrata's Expert", stars: 5.4 },
    ],
  }),
  mockEntry({
    id: 891366,
    artist: "KANA-BOON",
    title: "Silhouette",
    difficulty: "Kroytz's Extreme",
    mapper: "Kroytz",
    stars: 6.5,
    bpm: 166,
    status: "Ranked",
    coverUrl:
      "https://images.unsplash.com/photo-1557683316-973673baf926?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=200",
    backgroundUrl:
      "https://images.unsplash.com/photo-1557683316-973673baf926?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
    difficulties: [
      { version: "Normal", stars: 2.5 },
      { version: "Insane", stars: 4.6 },
      { version: "Extra", stars: 5.9 },
      { version: "Kroytz's Extreme", stars: 6.5 },
    ],
  }),
];

function normalizeMapStatus(status: string | undefined): MapStatus {
  const value = (status || "").toLowerCase();

  if (value.includes("loved")) return "Loved";
  if (value.includes("qualified")) return "Qualified";
  if (value.includes("ranked") || value.includes("approved")) return "Ranked";

  return "Pending";
}

function mapDifficulties(
  difficulties: Array<{
    id?: number;
    version: string;
    stars: number;
    status?: string;
    ar?: number;
    cs?: number;
    hp?: number;
    od?: number;
  }>,
): BeatmapDifficulty[] {
  return [...difficulties]
    .map((difficulty) => ({
      id: difficulty.id,
      version: difficulty.version,
      stars: Math.round(difficulty.stars * 100) / 100,
      status: difficulty.status,
      ar: difficulty.ar,
      od: difficulty.od,
      hp: difficulty.hp,
      cs: difficulty.cs,
    }))
    .sort((a, b) => a.stars - b.stars);
}

function withDifficulty(
  beatmap: BeatmapSearchResult,
  difficulty: BeatmapDifficulty,
): BeatmapSearchResult {
  return {
    ...beatmap,
    difficulty: difficulty.version,
    stars: difficulty.stars,
    status: normalizeMapStatus(difficulty.status) || beatmap.status,
  };
}

type SearchPanelProps = {
  selectedId: number | null;
  selectedDifficulty: string;
  onSelect: (beatmap: BeatmapSearchResult) => void;
};

export function SearchPanel({
  selectedId,
  selectedDifficulty,
  onSelect,
}: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  const [results, setResults] = useState<BeatmapSearchResult[]>([DEFAULT_BEATMAP]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assetStatus, setAssetStatus] = useState<string | null>(null);

  async function handleSearch() {
    const q = query.trim();
    setSearchedQuery(q || null);
    setError(null);
    setAssetStatus(null);

    if (!q) {
      setResults([DEFAULT_BEATMAP]);
      setSearchedQuery(null);
      onSelect(DEFAULT_BEATMAP);
      return;
    }

    setIsLoading(true);
    try {
      const prepared = await searchAndDownloadBeatmap(parseInt(q, 10));
      const data = prepared.beatmap;
      let backgroundUrl = `https://assets.ppy.sh/beatmaps/${data.id}/covers/cover.jpg`;

      if (prepared.assets.background_image) {
        backgroundUrl = getBackgroundFileUrl(prepared.assets.background_image);
      }
      
      const difficulties = mapDifficulties(data.difficulties);
      const firstDifficulty = difficulties[0];
      const mapped: BeatmapSearchResult = {
        id: data.id,
        artist: data.artist,
        title: data.title,
        difficulty: firstDifficulty?.version || "Unknown",
        mapper: data.creator,
        stars: firstDifficulty?.stars || 0,
        bpm: 0,
        status: normalizeMapStatus(
          firstDifficulty?.status || data.difficulties[0]?.status || data.status,
        ),
        coverUrl: `https://b.ppy.sh/thumb/${data.id}l.jpg`,
        backgroundUrl: backgroundUrl,
        difficulties,
      };

      setResults([mapped]);
      setAssetStatus("assets ready");
      onSelect(mapped);
    } catch (err) {
      const filtered = MOCK_CATALOG.filter((map) => String(map.id) === q);
      setResults(filtered);
      setAssetStatus(null);
      if (filtered.length === 0) {
        const message = err instanceof Error ? err.message : "Beatmap not found";
        const isNetworkError =
          message === "Load failed" || message === "Failed to fetch";
        setError(
          isNetworkError
            ? "Backend not reachable. Close and relaunch the app."
            : message,
        );
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="search-section-locked">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Enter beatmapset ID..."
            className="app-input h-9 rounded-[10px] pl-9 tabular-nums shadow-none focus-visible:ring-0"
          />
        </div>
        <Button
          onClick={handleSearch}
          size="icon"
          aria-label="Search beatmapset ID"
          className="app-btn-primary size-9 shrink-0 rounded-[10px]"
        >
          <Search size={15} />
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <p className="app-section-label">
          {results.reduce((count, map) => count + map.difficulties.length, 0)} difficult
          {results.reduce((count, map) => count + map.difficulties.length, 0) !== 1
            ? "ies"
            : "y"}
          {searchedQuery ? (
            <span className="normal-case tracking-normal text-muted-foreground">
              {" "}
              for{" "}
              <span className="font-semibold text-foreground/85">
                &ldquo;{searchedQuery}&rdquo;
              </span>
            </span>
          ) : (
            <span className="normal-case tracking-normal text-muted-foreground">
              {" "}
              ·{" "}
              <span className="font-semibold text-foreground/85">
                {DEFAULT_BEATMAP.artist} — {DEFAULT_BEATMAP.title}
              </span>
            </span>
          )}
          {assetStatus && (
            <span className="normal-case tracking-normal text-osu-green/90">
              {" "}
              · {assetStatus}
            </span>
          )}
        </p>

        {error && (
          <div className="app-alert flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-red-400">
            <Music2 size={16} className="shrink-0 opacity-40" />
            {error}
          </div>
        )}

        <div className="search-results-box-locked app-scroll">
          {isLoading ? (
            <div className="flex h-[var(--layout-result-row-height)] items-center gap-2 px-2 text-sm text-muted-foreground">
              <Music2 size={16} className="shrink-0 opacity-40 animate-spin" />
              Downloading song, image, and OSZ...
            </div>
          ) : results.length === 0 ? (
            <div className="flex h-[var(--layout-result-row-height)] items-center gap-2 px-2 text-sm text-muted-foreground">
              <Music2 size={16} className="shrink-0 opacity-40" />
              No beatmapset found for that ID
            </div>
          ) : (
            results.flatMap((map) =>
              map.difficulties.map((difficulty, i) => (
                <DifficultyResultCard
                  key={`${map.id}-${difficulty.version}`}
                  beatmap={map}
                  difficulty={difficulty}
                  index={i}
                  selected={
                    selectedId === map.id &&
                    selectedDifficulty === difficulty.version
                  }
                  onSelect={() => onSelect(withDifficulty(map, difficulty))}
                />
              )),
            )
          )}
        </div>
      </div>
    </div>
  );
}
