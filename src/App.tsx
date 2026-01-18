import { useMemo } from "react";
import { Sparkles, Terminal, Workflow } from "lucide-react";

import { Button } from "./components/ui/button";

type QuickTask = {
  title: string;
  description: string;
};

const quickTasks: QuickTask[] = [
  { title: "Bootstrap UI", description: "Tauri + React 19 + shacn shell" },
  { title: "Plan sync", description: "Parse plan.md and render nodes" },
  { title: "Agent bridge", description: "Claude/Codex PTY adapter" },
];

function Hero() {
  const highlights = useMemo(
    () => [
      { icon: <Workflow size={18} />, label: "Canvas + plan sync" },
      { icon: <Terminal size={18} />, label: "Terminal-aware agents" },
      { icon: <Sparkles size={18} />, label: "React 19 + Tauri" },
    ],
    [],
  );

  return (
    <div className="glass-card p-8 lg:p-10 relative overflow-hidden">
      <div className="absolute inset-0 opacity-60 grid-smooth" aria-hidden />
      <div className="relative flex flex-col gap-6">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-white/60 px-3 backdrop-blur">
            <Sparkles className="h-4 w-4 text-primary" />
            Plan Visualizer
          </span>
          <span className="text-xs text-muted-foreground">Phase 0 bootstrap</span>
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
            Visual plans meet agent chat in one canvas.
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground leading-relaxed">
            React 19 + Tauri shell with TLDraw canvas, chat, and terminal continuity. This shell
            scaffolds the groundwork for syncing `plan.md` with a visual layout and bridging Claude /
            Codex sessions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="default" size="lg">
            Open Plan
          </Button>
          <Button variant="outline" size="lg">
            Start Agent Session
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {highlights.map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-border/70 bg-white/70 p-4 backdrop-blur-sm shadow-sm"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="text-primary">{item.icon}</span>
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuickList() {
  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Next steps</h2>
        <Button size="sm" variant="ghost">
          View plan.md
        </Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {quickTasks.map((item) => (
          <div key={item.title} className="rounded-lg border border-border bg-white/70 p-4">
            <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f7f8fb] via-[#eef1f8] to-[#e6ebf5] px-4 py-6 text-foreground sm:px-8 sm:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Hero />
        <QuickList />
      </div>
    </main>
  );
}
