/**
 * Small, dependency-free natural-language date reader for the composer.
 *
 * It only recognises the phrasings people actually type into a note ("tomorrow
 * at 3", "in 20 minutes", "friday morning") and returns nothing when it isn't
 * confident — a wrong reminder is worse than no reminder.
 */

export type ParsedReminder = {
  /** Absolute time the reminder should fire. */
  at: Date;
  /** The exact phrase that produced it, for the "from: …" hint. */
  phrase: string;
};

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const UNIT_MINUTES: Record<string, number> = {
  min: 1,
  mins: 1,
  minute: 1,
  minutes: 1,
  hour: 60,
  hours: 60,
  hr: 60,
  hrs: 60,
  day: 60 * 24,
  days: 60 * 24,
  week: 60 * 24 * 7,
  weeks: 60 * 24 * 7,
};

/** "3pm", "3:30 pm", "15:00", "at 9" → minutes past midnight. */
function readClock(source: string): { minutes: number; phrase: string } | null {
  const match =
    /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(source) ??
    /\bat\s+(\d{1,2})(?::(\d{2}))?\b/i.exec(source) ??
    /\b(\d{1,2}):(\d{2})\b/.exec(source);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const suffix = (match[3] ?? "").toLowerCase();
  if (Number.isNaN(hour) || hour > 23 || minute > 59) return null;
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  // A bare "at 8" almost always means the working day, not the small hours.
  if (!suffix && hour <= 7) hour += 12;

  return { minutes: hour * 60 + minute, phrase: match[0].trim() };
}

function atTime(base: Date, minutes: number) {
  const date = new Date(base);
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

/** Vague parts of the day, so "tonight" and "friday morning" both work. */
function readDaypart(source: string): { minutes: number; phrase: string } | null {
  const map: Array<[RegExp, number]> = [
    [/\btonight\b/i, 20 * 60],
    [/\bthis evening\b/i, 19 * 60],
    [/\bevening\b/i, 19 * 60],
    [/\bafternoon\b/i, 15 * 60],
    [/\bmorning\b/i, 9 * 60],
    [/\bnoon\b/i, 12 * 60],
    [/\bmidnight\b/i, 0],
  ];
  for (const [pattern, minutes] of map) {
    const match = pattern.exec(source);
    if (match) return { minutes, phrase: match[0] };
  }
  return null;
}

/**
 * Reads the first reminder phrase in a note. Returns null when the text has no
 * time in it, or when the time it names has already passed.
 */
export function parseReminder(text: string, now = new Date()): ParsedReminder | null {
  const source = text.replace(/\s+/g, " ").trim();
  if (!source) return null;

  // "in 20 minutes" / "in 2 hours" / "in 3 days"
  const relative = /\bin\s+(a|an|\d{1,3})\s*(min|mins|minutes?|hours?|hrs?|hr|days?|weeks?)\b/i.exec(
    source,
  );
  if (relative) {
    const rawCount = (relative[1] ?? "1").toLowerCase();
    const count = rawCount === "a" || rawCount === "an" ? 1 : Number(rawCount);
    const unit = UNIT_MINUTES[(relative[2] ?? "").toLowerCase()];
    if (count > 0 && unit) {
      return { at: new Date(now.getTime() + count * unit * 60000), phrase: relative[0] };
    }
  }

  const clock = readClock(source);
  const daypart = readDaypart(source);
  const timeOfDay = clock ?? daypart;

  // "tomorrow", optionally with a time.
  const tomorrow = /\btomorrow\b/i.exec(source);
  if (tomorrow) {
    const base = new Date(now.getTime() + 86400000);
    const at = atTime(base, timeOfDay?.minutes ?? 9 * 60);
    return { at, phrase: [tomorrow[0], timeOfDay?.phrase].filter(Boolean).join(" ") };
  }

  // "next monday" / "friday" / "on thursday", optionally with a time.
  const weekday = new RegExp(
    `\\b(next\\s+|this\\s+|on\\s+)?(${WEEKDAYS.join("|")})\\b`,
    "i",
  ).exec(source);
  if (weekday) {
    const target = WEEKDAYS.indexOf(
      (weekday[2] ?? "").toLowerCase() as (typeof WEEKDAYS)[number],
    );
    if (target >= 0) {
      const date = new Date(now);
      let delta = (target - date.getDay() + 7) % 7;
      const explicitNext = /next/i.test(weekday[1] ?? "");
      if (delta === 0) delta = 7;
      if (explicitNext && delta < 7) delta += 7;
      date.setDate(date.getDate() + delta);
      const at = atTime(date, timeOfDay?.minutes ?? 9 * 60);
      return { at, phrase: [weekday[0], timeOfDay?.phrase].filter(Boolean).join(" ") };
    }
  }

  // "tonight", "this afternoon", "at 4pm" — today, or tomorrow if it's past.
  if (timeOfDay) {
    const today = /\btoday\b/i.test(source);
    let at = atTime(now, timeOfDay.minutes);
    if (at.getTime() <= now.getTime() + 60000) {
      if (today) return null;
      at = new Date(at.getTime() + 86400000);
    }
    return { at, phrase: timeOfDay.phrase };
  }

  return null;
}

/** Short, human label for a parsed reminder: "Tomorrow 9:00 AM". */
export function reminderChipLabel(date: Date, now = new Date()) {
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, now)) return `Today ${time}`;
  if (sameDay(date, new Date(now.getTime() + 86400000))) return `Tomorrow ${time}`;
  const day = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: date.getTime() - now.getTime() > 6 * 86400000 ? "short" : undefined,
    day: date.getTime() - now.getTime() > 6 * 86400000 ? "numeric" : undefined,
  });
  return `${day} ${time}`;
}
