import { useEffect } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type Transition,
} from "motion/react";
import { cn } from "./ui/utils";

const NUMBER_SPRING = { stiffness: 140, damping: 24, mass: 0.55 };
const COLOR_TRANSITION: Transition = {
  duration: 0.4,
  ease: [0.25, 0.1, 0.25, 1],
};

type AnimatedNumberProps = {
  value: number;
  className?: string;
  format?: (value: number) => string;
};

export function AnimatedNumber({ value, className, format }: AnimatedNumberProps) {
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, NUMBER_SPRING);
  const display = useTransform(spring, (latest) =>
    format ? format(latest) : String(Math.round(latest)),
  );

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  return (
    <motion.span className={cn("tabular-nums", className)}>
      {display}
    </motion.span>
  );
}

type AnimatedColorProps = {
  color: string;
  className?: string;
  children: React.ReactNode;
};

export function AnimatedColor({ color, className, children }: AnimatedColorProps) {
  return (
    <motion.span
      className={className}
      animate={{ color }}
      transition={COLOR_TRANSITION}
    >
      {children}
    </motion.span>
  );
}
