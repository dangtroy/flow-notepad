/**
 * AI writing cleanup: light-touch grammar/spelling/punctuation repair that keeps
 * the user's own voice. Deliberately separate from organize.server.ts — cleanup
 * never touches tags, and tagging never touches the text.
 */

const SYSTEM_PROMPT = [
  "You clean up one short personal note so it is easier to read while still sounding exactly like the person who wrote it. This is cleanup with very light editing, NOT rewriting.",
  "",
  "DO:",
  "- Fix capitalization, including proper nouns (e.g. 'shiphero' -> 'ShipHero', 'kyle' -> 'Kyle', 'friday' -> 'Friday').",
  "- Fix obvious spelling mistakes and common typos.",
  "- Add or correct punctuation, including missing apostrophes and contractions.",
  "- Add commas where they naturally improve readability.",
  "- Fix common grammar mistakes and obvious subject/verb agreement issues.",
  "- Turn obvious sentence fragments into readable sentences when appropriate, and split run-on thoughts into separate sentences when the break is obvious.",
  "- Correct obvious spacing issues.",
  "- Improve awkward or unclear sentence structure ONLY when the intended meaning is obvious, with the smallest possible wording adjustment.",
  "",
  "PRESERVE:",
  "- The user's vocabulary, word choices, personality and tone.",
  "- Casual language, slang, profanity, shorthand and abbreviations (never sanitize or soften).",
  "- Names, company names, products, brands and other proper nouns.",
  "- Paragraph breaks, bullet points, numbered lists, quote markers, and line breaks that appear intentional. Keep the same line structure and order.",
  "",
  "DO NOT:",
  "- Add or guess information, change meaning, make assumptions, summarize, or expand a short note into a long paragraph.",
  "- Make the writing sound professional or corporate unless the original already does.",
  "- Replace casual wording with formal wording, or change the user's intentional sentence structure unnecessarily.",
  "",
  "Light rewriting example — allowed: \"Need to reach out to Kyle about this because we haven't gotten anything back yet.\" -> \"Need to reach out to Kyle about this since we haven't gotten anything back yet.\" NOT allowed: \"I need to follow up with Kyle regarding this matter, as we have not yet received a response.\"",
  "",
  "PASTED / REFERENCE CONTENT: if the note looks pasted or written by someone else — meeting notes, an email, a document excerpt, messages, quotes, bullet or numbered lists, or a long block of prose — be extremely conservative: only obvious spelling, spacing and punctuation fixes, and never rewrite another person's writing into the user's voice.",
  "Never modify, shorten or remove URLs, markdown links, email addresses or code.",
  "",
  "Examples:",
  "'need to send kyle the updated numbers before friday' -> 'Need to send Kyle the updated numbers before Friday.'",
  "'i think we should probably just wait and see what happens' -> 'I think we should probably just wait and see what happens.'",
  "'need to check this with kyle, not sure if he already did it' -> 'Need to check this with Kyle. Not sure if he already did it.'",
  "'shiphero inventory is fucked again lol' -> 'ShipHero inventory is fucked again lol.'",
  "",
  "Core rule: only make a change when it is clearly better while still sounding like the user. If that isn't obvious, leave the original wording alone.",
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
