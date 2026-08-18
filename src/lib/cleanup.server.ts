/**
 * AI writing cleanup: light-touch grammar/spelling/punctuation repair that keeps
 * the user's own voice. Deliberately separate from organize.server.ts — cleanup
 * never touches tags, and tagging never touches the text.
 */

const SYSTEM_PROMPT = [
  "You clean up one short personal note. This is cleanup, NOT rewriting.",
  "Fix obvious grammar and spelling mistakes, improve punctuation and capitalization, and make fragmented thoughts easier to read.",
  "Preserve the user's original wording wherever possible, and preserve their tone and personality exactly.",
  "Keep names, company names, product names, abbreviations, slang, shorthand, profanity and casual language exactly as intended (you may fix their capitalization, e.g. 'shiphero' -> 'ShipHero').",
  "Never invent information, never add details, never change meaning, never make casual writing sound corporate or formal.",
  "Keep the same line structure: same number of lines, same order.",
  "Protect pasted or reference content. If the note looks pasted or written by someone else — meeting notes, an email, a document excerpt, quotes, bullet or numbered lists, or a long block of prose — make only very light punctuation and obvious typo fixes and do NOT rewrite it into the user's voice.",
  "Never remove, shorten or modify URLs, markdown links, email addresses or code. Keep list markers, bullets, numbering and quote markers exactly as they are.",
  "Return ONLY the cleaned note text with no quotes, labels or commentary.",
].join("\n");

/** Returns the cleaned plain text for a note, or throws when the AI is unavailable. */
export async function cleanUpText(text: string): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-lite",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    }),
  });

  if (!response.ok) throw new Error(`AI gateway error ${response.status}`);

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const cleaned = (payload.choices?.[0]?.message?.content ?? "").trim();
  if (!cleaned) throw new Error("Cleanup returned nothing");
  return cleaned;
}
