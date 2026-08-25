import { ACCENTS, type AccentKey } from "@/lib/appearance";
import { useAppearance } from "@/lib/use-appearance";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  SettingsChoices,
  SettingsHint,
  SettingsRow,
} from "@/components/flow/settings/settings-primitives";

/** Curated choices only — never raw CSS controls. */
export function AppearanceSettings() {
  const { appearance, update, mode } = useAppearance();

  return (
    <div>
      <SettingsHint>
        A few quiet choices about how Flow reads. Everything applies instantly and is remembered on
        this device.
      </SettingsHint>

      <div className="mt-4 divide-y divide-border border-t border-border">
        <div className="py-2.5">
          <SettingsRow label="Theme">
            <SettingsChoices
              value={appearance.theme}
              options={[
                { label: "Light", value: "light" },
                { label: "Dark", value: "dark" },
                { label: "System", value: "system" },
              ]}
              onSelect={(theme) => update({ theme })}
            />
          </SettingsRow>
        </div>

        <div className="py-2.5">
          <SettingsRow label="Accent">
            <div className="flex flex-wrap items-center gap-2">
              {(Object.keys(ACCENTS) as AccentKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => update({ accent: key })}
                  aria-label={ACCENTS[key].label}
                  aria-pressed={appearance.accent === key}
                  className={cn(
                    "h-4 w-4 rounded-full ring-offset-2 ring-offset-background transition-shadow",
                    appearance.accent === key && "ring-1 ring-border-strong",
                  )}
                  style={{
                    backgroundColor: mode === "dark" ? ACCENTS[key].dark : ACCENTS[key].light,
                  }}
                />
              ))}
            </div>
          </SettingsRow>
        </div>

        <div className="py-2.5">
          <SettingsRow label="Text size">
            <SettingsChoices
              value={appearance.textSize}
              options={[
                { label: "Small", value: "small" },
                { label: "Default", value: "default" },
                { label: "Large", value: "large" },
              ]}
              onSelect={(textSize) => update({ textSize })}
            />
          </SettingsRow>
        </div>

        <div className="py-2.5">
          <SettingsRow label="Density">
            <SettingsChoices
              value={appearance.density}
              options={[
                { label: "Compact", value: "compact" },
                { label: "Comfortable", value: "comfortable" },
                { label: "Spacious", value: "spacious" },
              ]}
              onSelect={(density) => update({ density })}
            />
          </SettingsRow>
        </div>

        <div className="py-2.5">
          <SettingsRow label="Timestamps & tags" description="Show them at rest or on hover">
            <SettingsChoices
              value={appearance.rowMeta}
              options={[
                { label: "Always", value: "always" },
                { label: "On hover", value: "hover" },
              ]}
              onSelect={(rowMeta) => update({ rowMeta })}
            />
          </SettingsRow>
        </div>
      </div>

      {/* Everything beyond the basics is tucked away until wanted. */}
      <Accordion type="single" collapsible className="mt-1">
        <AccordionItem value="more" className="border-b-0">
          <AccordionTrigger className="py-2.5 text-[13px] text-muted-foreground hover:no-underline">
            Layout &amp; borders
          </AccordionTrigger>
          <AccordionContent>
            <div className="divide-y divide-border border-t border-border">
              <div className="py-2.5">
                <SettingsRow label="Content width">
                  <SettingsChoices
                    value={appearance.contentWidth}
                    options={[
                      { label: "Narrow", value: "narrow" },
                      { label: "Default", value: "default" },
                      { label: "Wide", value: "wide" },
                      { label: "Full", value: "full" },
                    ]}
                    onSelect={(contentWidth) => update({ contentWidth })}
                  />
                </SettingsRow>
              </div>

              <div className="py-2.5">
                <SettingsRow label="Reply spacing">
                  <SettingsChoices
                    value={appearance.replySpacing}
                    options={[
                      { label: "Compact", value: "compact" },
                      { label: "Comfortable", value: "comfortable" },
                      { label: "Spacious", value: "spacious" },
                    ]}
                    onSelect={(replySpacing) => update({ replySpacing })}
                  />
                </SettingsRow>
              </div>

              <div className="py-2.5">
                <SettingsRow label="Border colour">
                  <SettingsChoices
                    value={appearance.borderTone}
                    options={[
                      { label: "Subtle", value: "subtle" },
                      { label: "Medium", value: "medium" },
                      { label: "Strong", value: "strong" },
                      { label: "Accent", value: "accent" },
                    ]}
                    onSelect={(borderTone) => update({ borderTone })}
                  />
                </SettingsRow>
              </div>

              <div className="py-2.5">
                <SettingsRow label="Border thickness">
                  <SettingsChoices
                    value={appearance.borderThickness}
                    options={[
                      { label: "Hairline", value: "hairline" },
                      { label: "Thin", value: "thin" },
                      { label: "Medium", value: "medium" },
                      { label: "Thick", value: "thick" },
                    ]}
                    onSelect={(borderThickness) => update({ borderThickness })}
                  />
                </SettingsRow>
              </div>

              <div className="py-2.5">
                <SettingsRow label="Sidebar width">
                  <SettingsChoices
                    value={appearance.sidebarWidth}
                    options={[
                      { label: "Narrow", value: "narrow" },
                      { label: "Default", value: "default" },
                      { label: "Wide", value: "wide" },
                    ]}
                    onSelect={(sidebarWidth) => update({ sidebarWidth })}
                  />
                </SettingsRow>
              </div>

              <div className="py-2.5">
                <SettingsRow label="Sidebar order">
                  <SettingsChoices
                    value={appearance.tagSort}
                    options={[
                      { label: "Name", value: "alphabetical" },
                      { label: "Most used", value: "most-used" },
                      { label: "Manual", value: "manual" },
                    ]}
                    onSelect={(tagSort) => update({ tagSort })}
                  />
                </SettingsRow>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
