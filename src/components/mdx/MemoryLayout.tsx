import React, { useState, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────

export type LockStatus = "free" | "read" | "write" | "cas";

export interface MemoryBlock {
  id: string;
  /** Display label, e.g. "Node 0", "Bucket[3]" */
  label: string;
  /** Block type hint for styling */
  type?: "header" | "data" | "pointer" | "sentinel";
  /** Size in relative units (default 1) */
  span?: number;
}

export interface ThreadAccess {
  /** Block id */
  blockId: string;
  lock: LockStatus;
}

export interface ThreadState {
  name: string;
  accesses: ThreadAccess[];
  description?: string;
}

export interface MemoryLayoutProps {
  /** Ordered list of memory blocks to render */
  blocks: MemoryBlock[];
  /** Thread access patterns to toggle between */
  threads: ThreadState[];
}

// ── Styling ──────────────────────────────────────────────────────────

const LOCK_STYLES: Record<LockStatus, { border: string; bg: string; text: string; label: string }> = {
  free:  { border: "border-border/40",      bg: "bg-muted/20",        text: "text-muted-foreground/60", label: "Free" },
  read:  { border: "border-blue-500/50",    bg: "bg-blue-500/10",     text: "text-blue-400",            label: "Read Lock" },
  write: { border: "border-amber-500/50",   bg: "bg-amber-500/10",    text: "text-amber-400",           label: "Write Lock" },
  cas:   { border: "border-purple-500/50",  bg: "bg-purple-500/10",   text: "text-purple-400",          label: "CAS" },
};

const TYPE_ACCENTS: Record<string, string> = {
  header:   "border-l-foreground/20",
  data:     "border-l-transparent",
  pointer:  "border-l-cyan-500/30",
  sentinel: "border-l-red-500/30",
};

// ── Component ────────────────────────────────────────────────────────

export default function MemoryLayout({ blocks, threads }: MemoryLayoutProps) {
  const [activeThread, setActiveThread] = useState(0);
  const [hoveredBlock, setHoveredBlock] = useState<string | null>(null);

  const thread = threads[activeThread];

  const lockMap = new Map<string, LockStatus>();
  thread.accesses.forEach((a) => lockMap.set(a.blockId, a.lock));

  const cycleThread = useCallback(() => {
    setActiveThread((c) => (c + 1) % threads.length);
  }, [threads.length]);

  return (
    <div className="my-6 rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <span className="text-sm font-medium text-foreground/80">
          Memory Layout
        </span>
        <div className="flex items-center gap-3">
          {/* Thread toggle */}
          <button
            onClick={cycleThread}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-xs border border-border/50 bg-background hover:bg-muted transition-colors"
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{
                backgroundColor:
                  activeThread === 0
                    ? "rgb(59 130 246)"
                    : "rgb(245 158 11)",
              }}
            />
            {thread.name}
          </button>
        </div>
      </div>

      {/* Memory blocks */}
      <div className="p-4">
        <div className="flex flex-wrap gap-1.5">
          {blocks.map((block) => {
            const lock = lockMap.get(block.id) ?? "free";
            const style = LOCK_STYLES[lock];
            const accent = TYPE_ACCENTS[block.type ?? "data"] ?? "";
            const isHovered = hoveredBlock === block.id;
            const span = block.span ?? 1;

            return (
              <div
                key={block.id}
                onMouseEnter={() => setHoveredBlock(block.id)}
                onMouseLeave={() => setHoveredBlock(null)}
                className={`
                  relative flex flex-col items-center justify-center
                  rounded border border-l-2
                  px-3 py-2 min-w-[4rem]
                  transition-all duration-300 ease-out cursor-default
                  ${style.border} ${style.bg} ${accent}
                  ${isHovered ? "scale-105 shadow-sm" : ""}
                `}
                style={{ flex: `${span} 1 0%` }}
              >
                <span className="text-xs font-mono text-foreground/70">
                  {block.label}
                </span>
                {block.type && (
                  <span className="text-[10px] text-muted-foreground/50 mt-0.5">
                    {block.type}
                  </span>
                )}

                {/* Lock tooltip on hover */}
                {isHovered && (
                  <div
                    className={`
                      absolute -top-8 left-1/2 -translate-x-1/2
                      px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap
                      border border-border/50 bg-background shadow-sm
                      ${style.text}
                    `}
                  >
                    {style.label}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Address ruler */}
        <div className="flex mt-1.5 text-[9px] text-muted-foreground/30 tabular-nums">
          {blocks.map((block, i) => (
            <div
              key={block.id}
              className="text-center"
              style={{ flex: `${block.span ?? 1} 1 0%` }}
            >
              0x{(i * 8).toString(16).padStart(2, "0")}
            </div>
          ))}
        </div>
      </div>

      {/* Legend + description */}
      <div className="px-4 py-3 border-t border-border/30 flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">
            {thread.description || "\u00A0"}
          </p>
        </div>
        <div className="flex gap-3 shrink-0">
          {(["free", "read", "write", "cas"] as LockStatus[]).map((status) => {
            const s = LOCK_STYLES[status];
            const isActive = thread.accesses.some((a) => a.lock === status);
            if (!isActive && status !== "free") return null;
            return (
              <div key={status} className="flex items-center gap-1">
                <div
                  className={`w-2.5 h-2.5 rounded-sm border ${s.border} ${s.bg}`}
                />
                <span className="text-[10px] text-muted-foreground">
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
