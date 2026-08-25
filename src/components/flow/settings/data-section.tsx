import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { getPreferences, updatePreferences } from "@/lib/flow.functions";
import { useActiveNotepadId } from "@/lib/use-notepad";
import { SettingsChoices, SettingsHint } from "./settings-primitives";

const RETENTION_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "1 day", value: "1" },
  { label: "3 days", value: "3" },
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "Never", value: "never" },
];

/** Retention and the recently-removed log: everything about keeping and losing notes. */
export function DataSection() {
  const queryClient = useQueryClient();
  const notepadId = useActiveNotepadId();
  const fetchPrefs = useServerFn(getPreferences);
  const savePrefs = useServerFn(updatePreferences);

  const prefs = useQuery({
    queryKey: ["preferences", notepadId ?? "none"],
    queryFn: () => fetchPrefs({ data: { notepadId } }),
    enabled: Boolean(notepadId),
  });

  async function chooseRetention(value: string) {
    try {
      await savePrefs({
        data: { completedRetentionDays: value === "never" ? null : Number(value), notepadId },
      });
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
    } catch {
      toast.error("Could not save that preference");
    }
  }

  const current = prefs.data ? prefs.data.completedRetentionDays : 7;
  const history = prefs.data?.deletionHistory ?? [];

  return (
    <div className="space-y-8">
      <div>
        <SettingsHint>
          Finished thoughts stay in your stream, then disappear on their own. Unfinished thoughts are
          never deleted.
        </SettingsHint>
        <div className="mt-3">
          <SettingsChoices
            value={current === null ? "never" : String(current)}
            options={RETENTION_OPTIONS}
            onSelect={chooseRetention}
          />
        </div>
      </div>

      {history.length > 0 && (
        <div>
          <p className="text-[13px] font-medium text-foreground">Recently removed</p>
          <ul className="mt-2 space-y-1.5">
            {history.map((entry) => (
              <li key={entry.id} className="text-[13px] text-muted-foreground">
                <span className="line-through">{entry.content_snapshot}</span>{" "}
                <span className="text-muted-foreground/60">
                  · {new Date(entry.deleted_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
