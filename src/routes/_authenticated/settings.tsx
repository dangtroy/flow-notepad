import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteContextRule,
  getPreferences,
  listContextRules,
  saveContextRule,
  updatePreferences,
} from "@/lib/flow.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Flow settings — context rules and retention" },
      {
        name: "description",
        content:
          "Tell Flow how to organize your thoughts with context rules, and choose how long completed thoughts are kept.",
      },
      { property: "og:title", content: "Flow settings" },
      {
        property: "og:description",
        content: "Context rules and completed-thought retention for your Flow.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const RETENTION_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: "1 day", value: 1 },
  { label: "3 days", value: 3 },
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "Never", value: null },
];

function SettingsPage() {
  const queryClient = useQueryClient();
  const fetchPrefs = useServerFn(getPreferences);
  const savePrefs = useServerFn(updatePreferences);
  const fetchRules = useServerFn(listContextRules);
  const saveRule = useServerFn(saveContextRule);
  const removeRule = useServerFn(deleteContextRule);

  const prefs = useQuery({ queryKey: ["preferences"], queryFn: () => fetchPrefs() });
  const rules = useQuery({ queryKey: ["context-rules"], queryFn: () => fetchRules() });

  const [tagName, setTagName] = useState("");
  const [context, setContext] = useState("");

  async function chooseRetention(value: number | null) {
    try {
      await savePrefs({ data: { completedRetentionDays: value } });
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
    } catch {
      toast.error("Could not save that preference");
    }
  }

  async function addRule(event: React.FormEvent) {
    event.preventDefault();
    if (!tagName.trim()) return;
    try {
      await saveRule({ data: { tagName, context } });
      setTagName("");
      setContext("");
      queryClient.invalidateQueries({ queryKey: ["context-rules"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save that rule");
    }
  }

  async function toggleRule(rule: { id: string; tag_name: string; context: string; is_enabled: boolean }) {
    try {
      await saveRule({
        data: {
          id: rule.id,
          tagName: rule.tag_name,
          context: rule.context,
          isEnabled: !rule.is_enabled,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["context-rules"] });
    } catch {
      toast.error("Could not update that rule");
    }
  }

  async function drop(id: string) {
    try {
      await removeRule({ data: { id } });
      queryClient.invalidateQueries({ queryKey: ["context-rules"] });
    } catch {
      toast.error("Could not delete that rule");
    }
  }

  const current = prefs.data?.completedRetentionDays ?? null;

  return (
    <main className="flex-1 overflow-y-auto px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Flow
      </Link>

      <h1 className="mt-8 font-display text-3xl tracking-tight">Settings</h1>

      <section className="mt-10">
        <h2 className="text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Completed thoughts
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Finished thoughts stay in your stream, then disappear on their own. Unfinished thoughts are
          never deleted.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {RETENTION_OPTIONS.map((option) => (
            <button
              key={option.label}
              onClick={() => chooseRetention(option.value)}
              className={cn(
                "rounded-md border px-3.5 py-1.5 text-sm transition-colors",
                (prefs.data ? current : 7) === option.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Context rules
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Tell Flow how you think. Describe a concept and Flow will apply that tag whenever a thought
          relates to it.
        </p>

        <form onSubmit={addRule} className="mt-5 space-y-3">
          <input
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            placeholder="Tag, e.g. ShipHero"
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-[15px] outline-none focus:border-ring"
          />
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={3}
            placeholder="Anything related to ShipHero, warehouse inventory, inventory syncing, orders, or operations."
            className="w-full resize-none rounded-lg border border-border bg-card px-4 py-2.5 text-[15px] leading-relaxed outline-none focus:border-ring"
          />
          <button
            type="submit"
            disabled={!tagName.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            Add rule
          </button>
        </form>

        <ul className="mt-8 space-y-3">
          {(rules.data ?? []).map((rule) => (
            <li
              key={rule.id}
              className={cn(
                "rounded-lg border border-border/70 bg-card px-4 py-3",
                !rule.is_enabled && "opacity-55",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-medium">{rule.tag_name}</p>
                  {rule.context && (
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{rule.context}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                  <button onClick={() => toggleRule(rule)} className="hover:text-foreground">
                    {rule.is_enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => drop(rule.id)}
                    aria-label="Delete rule"
                    className="hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          ))}
          {rules.data?.length === 0 && (
            <li className="text-sm text-muted-foreground">No rules yet.</li>
          )}
        </ul>
      </section>

      {(prefs.data?.deletionHistory.length ?? 0) > 0 && (
        <section className="mt-12 pb-16">
          <h2 className="text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Recently removed
          </h2>
          <ul className="mt-4 space-y-2">
            {prefs.data?.deletionHistory.map((entry) => (
              <li key={entry.id} className="text-sm text-muted-foreground">
                <span className="line-through">{entry.content_snapshot}</span>{" "}
                <span className="text-muted-foreground/60">
                  · removed {new Date(entry.deleted_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
