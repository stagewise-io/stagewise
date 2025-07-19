import type { JSX } from "react";
import { ScrollReveal } from "./scroll-reveal";
import { LucideIcon } from "lucide-react";
import { DELAY_INCREMENT } from "@/lib/constants";

interface ShowcaseCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  id: number;
  delay?: number;
}

export function ShowcaseCard({
  icon: Icon,
  title,
  description,
  id,
  delay,
}: ShowcaseCardProps) {
  return (
    <ScrollReveal key={id} delay={delay ? delay : id * DELAY_INCREMENT}>
      <div className="group relative h-full overflow-hidden rounded-3xl border border-transparent bg-gradient-to-br from-white via-white to-zinc-50/50 p-8 shadow-[0_8px_32px_rgba(128,90,213,0.12)] transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_60px_rgba(128,90,213,0.25)] dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-800/50">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-violet-500/5 to-indigo-500/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

        <div
          className="absolute inset-0 rounded-3xl bg-gradient-to-r from-blue-500/20 via-violet-500/20 to-indigo-500/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{ padding: "1px" }}
        >
          <div className="h-full w-full rounded-3xl bg-white dark:bg-zinc-900" />
        </div>

        <div className="relative z-10">
          <div className="mb-6 flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-100 via-violet-100 to-indigo-100 blur-sm transition-all duration-500 group-hover:blur-none group-hover:scale-110 dark:from-blue-900/30 dark:via-violet-900/30 dark:to-indigo-900/30" />
              <div className="relative inline-flex rounded-2xl bg-gradient-to-br from-blue-50 via-violet-50 to-indigo-50 p-4 transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 dark:from-blue-900/20 dark:via-violet-900/20 dark:to-indigo-900/20">
                <Icon className="size-8 transition-colors duration-300 group-hover:text-blue-600 dark:group-hover:text-cyan-400" />
              </div>
            </div>

            <h3 className="text-foreground font-bold text-2xl">{title}</h3>
          </div>

          <p className="text-zinc-600 transition-colors duration-300 group-hover:text-zinc-700 dark:text-zinc-400 dark:group-hover:text-zinc-300">
            {description}
          </p>
        </div>
      </div>
    </ScrollReveal>
  );
}
