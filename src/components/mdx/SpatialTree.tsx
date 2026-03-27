import React, { useState, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  color?: string;
}

export interface Point {
  x: number;
  y: number;
  label?: string;
}

export interface SpatialStep {
  title: string;
  description?: string;
  boxes: BoundingBox[];
  points?: Point[];
  /** Highlight specific box indices */
  highlight?: number[];
}

export interface SpatialTreeProps {
  steps: SpatialStep[];
  /** SVG viewBox width, default 400 */
  width?: number;
  /** SVG viewBox height, default 300 */
  height?: number;
}

// ── Palette ──────────────────────────────────────────────────────────

const COLORS = [
  "rgb(59 130 246)",   // blue-500
  "rgb(168 85 247)",   // purple-500
  "rgb(34 197 94)",    // green-500
  "rgb(245 158 11)",   // amber-500
  "rgb(239 68 68)",    // red-500
  "rgb(6 182 212)",    // cyan-500
];

function boxColor(index: number, explicit?: string): string {
  return explicit || COLORS[index % COLORS.length];
}

// ── Component ────────────────────────────────────────────────────────

export default function SpatialTree({
  steps,
  width = 400,
  height = 300,
}: SpatialTreeProps) {
  const [current, setCurrent] = useState(0);
  const step = steps[current];

  const prev = useCallback(
    () => setCurrent((c) => Math.max(0, c - 1)),
    [],
  );
  const next = useCallback(
    () => setCurrent((c) => Math.min(steps.length - 1, c + 1)),
    [],
  );

  const highlightSet = new Set(step.highlight ?? []);

  return (
    <div className="my-6 rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <span className="text-sm font-medium text-foreground/80">
          {step.title}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {current + 1} / {steps.length}
        </span>
      </div>

      {/* Canvas */}
      <div className="p-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto"
          style={{ maxHeight: "360px" }}
        >
          {/* Grid lines */}
          {Array.from({ length: 9 }, (_, i) => {
            const x = ((i + 1) * width) / 10;
            return (
              <line
                key={`gx-${i}`}
                x1={x} y1={0} x2={x} y2={height}
                stroke="currentColor"
                strokeOpacity={0.04}
                strokeWidth={0.5}
              />
            );
          })}
          {Array.from({ length: 6 }, (_, i) => {
            const y = ((i + 1) * height) / 7;
            return (
              <line
                key={`gy-${i}`}
                x1={0} y1={y} x2={width} y2={y}
                stroke="currentColor"
                strokeOpacity={0.04}
                strokeWidth={0.5}
              />
            );
          })}

          {/* Bounding boxes */}
          {step.boxes.map((box, i) => {
            const color = boxColor(i, box.color);
            const isHighlighted = highlightSet.has(i);
            return (
              <g key={i}>
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  fill={color}
                  fillOpacity={isHighlighted ? 0.15 : 0.06}
                  stroke={color}
                  strokeWidth={isHighlighted ? 1.5 : 0.8}
                  strokeOpacity={isHighlighted ? 0.9 : 0.5}
                  strokeDasharray={isHighlighted ? "none" : "4 2"}
                  rx={2}
                  style={{
                    transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                />
                {box.label && (
                  <text
                    x={box.x + 4}
                    y={box.y + 14}
                    fill={color}
                    fontSize={11}
                    fontWeight={500}
                    opacity={0.8}
                  >
                    {box.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Points */}
          {step.points?.map((pt, i) => (
            <g key={`pt-${i}`}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={4}
                fill="currentColor"
                fillOpacity={0.7}
                style={{
                  transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              />
              {pt.label && (
                <text
                  x={pt.x + 7}
                  y={pt.y + 4}
                  fill="currentColor"
                  fillOpacity={0.5}
                  fontSize={10}
                >
                  {pt.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>

      {/* Description + Controls */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
        <p className="text-xs text-muted-foreground flex-1 mr-4">
          {step.description || "\u00A0"}
        </p>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={prev}
            disabled={current === 0}
            className="inline-flex items-center justify-center h-7 w-7 rounded text-xs border border-border/50 bg-background hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous step"
          >
            &larr;
          </button>
          <button
            onClick={next}
            disabled={current === steps.length - 1}
            className="inline-flex items-center justify-center h-7 w-7 rounded text-xs border border-border/50 bg-background hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Next step"
          >
            &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
