"use client";

import {
  AnimatePresence,
  MotionConfig,
  motion,
  type HTMLMotionProps,
  type Transition,
} from "motion/react";

/**
 * The design's motion rules, in one place: 120–260ms, one easing curve,
 * colour / opacity / size only — no bounce, no slide-ins, nothing looping.
 * Anything animated in the app goes through these wrappers.
 */
export const EASE = [0.2, 0, 0, 1] as const;

export const transitions = {
  fast: { duration: 0.12, ease: EASE },
  base: { duration: 0.18, ease: EASE },
  slow: { duration: 0.26, ease: EASE },
} satisfies Record<string, Transition>;

/** App-wide defaults; honours the OS "reduce motion" setting. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={transitions.base}>
      {children}
    </MotionConfig>
  );
}

/** Fades content in on mount. */
export function FadeIn({
  delay = 0,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...transitions.slow, delay }}
      {...props}
    />
  );
}

const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const staggerChild = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: transitions.slow },
};

/** Fades a group of children in one after another (tiles, cards, sections). */
export function Stagger(props: HTMLMotionProps<"div">) {
  return (
    <motion.div
      variants={staggerParent}
      initial="hidden"
      animate="show"
      {...props}
    />
  );
}

export function StaggerItem(props: HTMLMotionProps<"div">) {
  return <motion.div variants={staggerChild} {...props} />;
}

/** Opens and closes inline panels (confirm forms, "record inspection"). */
export function Collapse({
  open,
  children,
  className,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="collapse"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={transitions.base}
          className="overflow-hidden"
        >
          <div className={className}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Swaps between states with a crossfade (e.g. a banner changing tone). */
export function Crossfade({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transitions.fast}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export { AnimatePresence, motion };
