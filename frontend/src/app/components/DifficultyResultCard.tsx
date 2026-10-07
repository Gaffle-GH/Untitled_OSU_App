import { motion } from "motion/react";
import { Star, Hash } from "lucide-react";
import { Badge } from "./ui/badge";
import { cn } from "./ui/utils";
import { AnimatedColor, AnimatedNumber } from "./AnimatedValue";
import { formatStars, getStarColor } from "../../lib/difficulty";
import type { BeatmapSearchResult } from "./SearchPanel";
import type { BeatmapDifficulty } from "./DifficultySelector";

type DifficultyResultCardProps = {
  beatmap: BeatmapSearchResult;
  difficulty: BeatmapDifficulty;
  selected: boolean;
  onSelect: () => void;
  index?: number;
};

export function DifficultyResultCard({
  beatmap,
  difficulty,
  selected,
  onSelect,
  index = 0,
}: DifficultyResultCardProps) {
  const starColor = getStarColor(difficulty.stars);

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={onSelect}
      className={cn(
        "flex h-[var(--layout-result-row-height)] w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left app-row",
        selected && "app-row-active",
      )}
    >
      {selected && (
        <span
          className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full"
          style={{ backgroundColor: starColor }}
          aria-hidden
        />
      )}
      <div className="size-9 shrink-0 overflow-hidden rounded-md app-thumb">
        <img
          src={beatmap.coverUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-foreground">
          {beatmap.artist} — {beatmap.title}
        </p>
        <AnimatedColor
          color={starColor}
          className="block truncate text-[10px] font-medium"
        >
          {difficulty.version}
        </AnimatedColor>
      </div>
      <Badge
        variant="outline"
        className="app-badge-soft flex shrink-0 gap-0.5 py-0 text-[9px]"
      >
        <Hash size={8} />
        {beatmap.id}
      </Badge>
      <div className="shrink-0 text-right">
        <AnimatedColor
          color={starColor}
          className="flex items-center justify-end gap-0.5"
        >
          <AnimatedNumber
            value={difficulty.stars}
            className="text-xs font-bold"
            format={formatStars}
          />
          <Star size={10} fill="currentColor" color="currentColor" />
        </AnimatedColor>
      </div>
    </motion.button>
  );
}
