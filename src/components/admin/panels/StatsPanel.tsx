import React, { useState, useEffect, useCallback } from "react";

export function StatsPanel() {
  const [stats, setStats] = useState<any>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/stats");
    if (res.ok) setStats(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!stats) return (
    <div className="space-y-6">
      <div className="border rounded-lg p-6 space-y-2">
        <div className="h-3 bg-muted rounded animate-pulse w-20" />
        <div className="h-8 bg-muted rounded animate-pulse w-16" />
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="border rounded-lg p-4 space-y-3">
          <div className="h-4 bg-muted rounded animate-pulse w-24" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 items-center">
              <div className="h-4 bg-muted rounded animate-pulse flex-1" />
              <div className="h-4 bg-muted rounded animate-pulse w-12" />
            </div>
          ))}
        </div>
        <div className="border rounded-lg p-4 space-y-3">
          <div className="h-4 bg-muted rounded animate-pulse w-32" />
          <div className="h-[120px] bg-muted rounded animate-pulse" />
        </div>
      </div>
    </div>
  );

  const maxViews = Math.max(...(stats.dailyViews?.map((d: any) => d.views) || [0]), 1);

  return (
    <div className="space-y-6">
      <div className="p-6 border rounded-lg bg-card text-card-foreground shadow-sm">
        <h3 className="text-sm font-medium text-muted-foreground">Total Views</h3>
        <p className="text-3xl font-bold mt-2">{stats.totalViews?.toLocaleString() || 0}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Posts */}
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-4">Top Posts</h3>
          <div className="space-y-3">
            {stats.topPosts?.map((post: any, index: number) => (
              <div key={post.slug} className="flex justify-between items-center text-sm">
                <div className="flex gap-3 items-center truncate pr-4">
                  <span className="text-muted-foreground font-mono w-4">{index + 1}.</span>
                  <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer" className="hover:underline truncate">
                    {post.title}
                  </a>
                </div>
                <span className="font-medium shrink-0">{post.views.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Daily Views Bar Chart */}
        <div className="border rounded-lg p-4 flex flex-col">
          <h3 className="text-sm font-medium mb-4">Views (Last 30 Days)</h3>
          <div className="flex items-end gap-[2px] h-[120px] mt-auto">
            {stats.dailyViews?.map((day: any) => (
              <div
                key={day.date}
                title={`${day.date}: ${day.views} views`}
                className="bg-primary/60 hover:bg-primary transition-colors flex-1 rounded-t-sm"
                style={{
                  height: `${(day.views / maxViews) * 100}%`,
                  minHeight: day.views > 0 ? '4px' : '1px'
                }}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>{stats.dailyViews?.[0]?.date}</span>
            <span>{stats.dailyViews?.[stats.dailyViews.length - 1]?.date}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
