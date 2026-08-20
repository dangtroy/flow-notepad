import { ACCENTS, type AccentKey } from "@/lib/appearance";
import { useAppearance } from "@/lib/use-appearance";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type Option<T> = { label: string; value: T };

/** Curated choices only — never raw CSS controls. */
export function AppearanceSettings() {
  const { appearance, update, mode } = useAppearance();

  return (
    <section className="mt-14">
      <h2 className="text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Appearance
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        A few quiet choices about how Flow reads. Everything applies instantly and is remembered on
        this device.
      </p>

      <div className="mt-6 space-y-7">
        <Row label="Theme">
          <Choices
            value={appearance.theme}
            options={[
              { label: "Light", value: "light" },
              { label: "Dark", value: "dark" },
              { label: "System", value: "system" },
            ]}
            onSelect={(theme) => update({ theme })}
          />
        </Row>

        <Row label="Accent">
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(ACCENTS) as AccentKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => update({ accent: key })}
                aria-label={ACCENTS[key].label}
                aria-pressed={appearance.accent === key}
                className={cn(
                  "h-5 w-5 rounded-full ring-offset-2 ring-offset-background transition-shadow",
                  appearance.accent === key && "ring-1 ring-border-strong",
                )}
                style={{
                  backgroundColor: mode === "dark" ? ACCENTS[key].dark : ACCENTS[key].light,
                }}
              />
            ))}
          </div>
        </Row>
      </div>

      {/* Everything beyond theme and accent is tucked away until wanted. */}
      <Accordion type="single" collapsible className="mt-5">
        <AccordionItem value="more" className="border-border/70">
          <AccordionTrigger className="text-[13px] text-muted-foreground hover:no-underline">
            More appearance options
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-7 pt-2">
              <Row label="Text size">
                <Choices
                  value={appearance.textSize}
                  options={[
                    { label: "Small", value: "small" },
                    { label: "Default", value: "default" },
                    { label: "Large", value: "large" },
                  ]}
                  onSelect={(textSize) => update({ textSize })}
                />
              </Row>

              <Row label="Density">
                <Choices
                  value={appearance.density}
                  options={[
                    { label: "Compact", value: "compact" },
                    { label: "Comfortable", value: "comfortable" },
                    { label: "Spacious", value: "spacious" },
                  ]}
                  onSelect={(density) => update({ density })}
                />
              </Row>

              <Row label="Content width">
                <Choices
                  value={appearance.contentWidth}
                  options={[
                    { label: "Narrow", value: "narrow" },
                    { label: "Default", value: "default" },
                    { label: "Wide", value: "wide" },
                    { label: "Full", value: "full" },
                  ]}
                  onSelect={(contentWidth) => update({ contentWidth })}
                />
              </Row>

              <Row label="Reply spacing">
                <Choices
                  value={appearance.replySpacing}
                  options={[
                    { label: "Compact", value: "compact" },
                    { label: "Comfortable", value: "comfortable" },
                    { label: "Spacious", value: "spacious" },
                  ]}
                  onSelect={(replySpacing) => update({ replySpacing })}
                />
              </Row>

              <Row label="Border colour">
                <Choices
                  value={appearance.borderTone}
                  options={[
                    { label: "Subtle", value: "subtle" },
                    { label: "Medium", value: "medium" },
                    { label: "Strong", value: "strong" },
                    { label: "Accent", value: "accent" },
                  ]}
                  onSelect={(borderTone) => update({ borderTone })}
                />
              </Row>

              <Row label="Border thickness">
                <Choices
                  value={appearance.borderThickness}
                  options={[
                    { label: "Hairline", value: "hairline" },
                    { label: "Thin", value: "thin" },
                    { label: "Medium", value: "medium" },
                    { label: "Thick", value: "thick" },
                  ]}
                  onSelect={(borderThickness) => update({ borderThickness })}
                />
              </Row>

              <Row label="Sidebar width">
                <Choices
                  value={appearance.sidebarWidth}
                  options={[
                    { label: "Narrow", value: "narrow" },
                    { label: "Default", value: "default" },
                    { label: "Wide", value: "wide" },
                  ]}
                  onSelect={(sidebarWidth) => update({ sidebarWidth })}
                />
              </Row>

              <Row label="Sidebar order">
                <Choices
                  value={appearance.tagSort}
                  options={[
                    { label: "Name", value: "alphabetical" },
                    { label: "Number of tags", value: "most-used" },
                    { label: "Manual", value: "manual" },
                  ]}
                  onSelect={(tagSort) => update({ tagSort })}
                />
              </Row>

              <Row label="Row details">
                <Toggle
                  label="Always show details"
                  active={appearance.alwaysShowDetails}
                  onClick={() => update({ alwaysShowDetails: !appearance.alwaysShowDetails })}
                />
              </Row>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-[15px] text-foreground">{label}</span>
      {children}
    </div>
  );
}

function Choices<T extends string>({
  value,
  options,
  onSelect,
}: {
  value: T;
  options: Array<Option<T>>;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Toggle
          key={option.label}
          label={option.label}
          active={option.value === value}
          onClick={() => onSelect(option.value)}
        />
      ))}
    </div>
  );
}

function Toggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-3 py-1.5 text-[13px] transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
