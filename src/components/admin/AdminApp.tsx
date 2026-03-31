import React, { useState } from "react";
import { Toaster } from "sonner";
import { BlogPanel } from "./panels/BlogPanel";
import { ProjectsPanel } from "./panels/ProjectsPanel";
import { StatusesPanel } from "./panels/StatusesPanel";
import { SkillsPanel } from "./panels/SkillsPanel";
import { TimelinePanel } from "./panels/TimelinePanel";
import { FriendsPanel } from "./panels/FriendsPanel";
import { StatsPanel } from "./panels/StatsPanel";

type Tab = "blog" | "projects" | "statuses" | "skills" | "timeline" | "friends" | "stats";

export function AdminApp() {
  const [activeTab, setActiveTab] = useState<Tab>("blog");

  const tabs: { value: Tab; label: string }[] = [
    { value: "blog", label: "Blog" },
    { value: "projects", label: "Projects" },
    { value: "statuses", label: "Statuses" },
    { value: "skills", label: "Skills" },
    { value: "timeline", label: "Timeline" },
    { value: "friends", label: "Friends" },
    { value: "stats", label: "Stats" },
  ];

  return (
    <div>
      <Toaster position="top-right" richColors />
      <div className="flex border-b mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "blog" && <BlogPanel />}
      {activeTab === "projects" && <ProjectsPanel />}
      {activeTab === "statuses" && <StatusesPanel />}
      {activeTab === "skills" && <SkillsPanel />}
      {activeTab === "timeline" && <TimelinePanel />}
      {activeTab === "friends" && <FriendsPanel />}
      {activeTab === "stats" && <StatsPanel />}
    </div>
  );
}
