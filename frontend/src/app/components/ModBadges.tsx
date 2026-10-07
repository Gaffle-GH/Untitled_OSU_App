import { motion } from "motion/react";
import { cn } from "./ui/utils";
import { modStyle, NOMOD_KEY, sortMods } from "../../lib/mods";

type ModBadgeSize = "xs" | "sm";

const sizeClasses: Record<ModBadgeSize, string> = {
  xs: "h-[15px] px-1 text-[9px] rounded-[4px]",
  sm: "h-[22px] px-2 text-[11px] rounded-md",
};

const spring = { type: "spring" as const, stiffness: 420, damping: 28 };

export function ModBadge({
  mod,
  size = "xs",
  active = false,
  className,
}: {
  mod: string;
  size?: ModBadgeSize;
  active?: boolean;
  className?: string;
}) {
  const { bg, fg, label } = modStyle(mod);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-bold uppercase leading-none tracking-wider tabular-nums",
        sizeClasses[size],
        className,
      )}
      style={{
        backgroundColor: `${bg}18`,
        color: bg,
        border: `1px solid ${bg}40`,
      }}
      title={label ?? mod}
    >
      {mod}
    </span>
  );
}

export function ModBadgeList({
  mods,
  size = "xs",
  className,
}: {
  mods: string[];
  size?: ModBadgeSize;
  className?: string;
}) {
  const sorted = mods.length === 0 ? [NOMOD_KEY] : sortMods(mods);

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {sorted.map((mod, i) => (
        <motion.span
          key={mod}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: i * 0.03 }}
        >
          <ModBadge mod={mod} size={size} />
        </motion.span>
      ))}
    </span>
  );
}

export function ModFilterBadge({
  mod,
  active,
  onClick,
  index = 0,
}: {
  mod: string;
  active: boolean;
  onClick: () => void;
  index?: number;
}) {
  const { bg, label } = modStyle(mod);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      title={label ?? mod}
      initial={{ opacity: 0, y: 6, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring, delay: index * 0.03 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="rounded-md outline-none focus-visible:ring-1 focus-visible:ring-white/20"
      style={
        active
          ? {
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              color: bg,
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }
          : {
              backgroundColor: "transparent",
              color: bg,
              border: `1px solid ${bg}28`,
              opacity: 0.65,
            }
      }
    >
      <span className="flex h-[22px] items-center px-2 text-[11px] font-bold uppercase tracking-wider">
        {mod}
      </span>
    </motion.button>
  );
}

export function ModFilterBar({
  availableMods,
  activeMods,
  onToggle,
  onClear,
}: {
  availableMods: string[];
  activeMods: Set<string>;
  onToggle: (mod: string) => void;
  onClear: () => void;
}) {
  const allActive = activeMods.size === 0;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mb-3 overflow-hidden"
    >
      <div className="app-toolbar flex flex-wrap items-center gap-1.5 rounded-lg px-2.5 py-2">
        <motion.button
          type="button"
          onClick={onClear}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          transition={spring}
          className={cn(
            "flex h-[22px] items-center rounded-md border px-2.5 text-[11px] font-bold tracking-wide app-chip",
            allActive
              ? "app-chip-active"
              : "app-chip-idle",
          )}
        >
          All
        </motion.button>

        <span className="mx-0.5 h-4 w-px shrink-0 bg-osu-border/80" aria-hidden />

        {availableMods.map((mod, i) => (
          <ModFilterBadge
            key={mod}
            mod={mod}
            active={activeMods.has(mod)}
            onClick={() => onToggle(mod)}
            index={i}
          />
        ))}
      </div>
    </motion.div>
  );
}
