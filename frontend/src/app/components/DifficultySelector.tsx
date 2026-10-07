import { cn } from "./ui/utils";
import { formatStars, getStarColor } from "../../lib/difficulty";

export type BeatmapDifficulty = {
  id?: number;
  version: string;
  stars: number;
  status?: string;
  ar?: number;
  od?: number;
  hp?: number;
  cs?: number;
};

type DifficultySelectorProps = {
  difficulties: BeatmapDifficulty[];
  selectedVersion: string;
  onSelect: (difficulty: BeatmapDifficulty) => void;
  size?: "sm" | "md";
  className?: string;
};

export function DifficultySelector({
  difficulties,
  selectedVersion,
  onSelect,
  size = "md",
  className,
}: DifficultySelectorProps) {
  const dotSize = size === "sm" ? "size-6" : "size-7";
  const innerSize = size === "sm" ? "size-3" : "size-3.5";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {difficulties.map((difficulty) => {
        const color = getStarColor(difficulty.stars);
        const selected = difficulty.version === selectedVersion;

        return (
          <button
            key={difficulty.version}
            type="button"
            title={`${difficulty.version} (${formatStars(difficulty.stars)}★)`}
            aria-label={`${difficulty.version}, ${formatStars(difficulty.stars)} stars`}
            aria-pressed={selected}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(difficulty);
            }}
            className={cn(
              "relative flex shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110",
              dotSize,
              selected &&
                "ring-2 ring-sky-400 ring-offset-1 ring-offset-osu-surface-elevated",
            )}
          >
            <span
              className="absolute inset-0 rounded-full border-2"
              style={{ borderColor: color }}
            />
            <span
              className={cn("rounded-full", innerSize)}
              style={{ backgroundColor: color }}
            />
          </button>
        );
      })}
    </div>
  );
}
