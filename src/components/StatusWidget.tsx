import React from 'react';
import type { StatusItem } from '../db/types';

interface StatusWidgetProps {
  status: StatusItem | null;
}

export function StatusWidget({ status }: StatusWidgetProps) {
  if (!status) return null;

  return (
    <div className="flex items-start space-x-3 p-4 rounded-lg border border-zinc-800 bg-zinc-950/50">
      <div className="mt-1 flex h-3 w-3 items-center justify-center">
        <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-500 opacity-75"></span>
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium text-zinc-300">
          {status.text}
        </span>
        <span className="text-xs text-zinc-600 mt-1">
          {new Date(status.createdAt).toLocaleString()}
        </span>
      </div>
    </div>
  );
}