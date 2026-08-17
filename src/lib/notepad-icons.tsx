import {
  Book,
  BookOpen,
  Briefcase,
  Coffee,
  Hammer,
  Heart,
  Home,
  Lightbulb,
  Music,
  NotebookPen,
  Plane,
  Sparkles,
  Target,
} from "lucide-react";
import type { CSSProperties } from "react";

const GLYPHS: Record<string, typeof Book> = {
  notebook: NotebookPen,
  briefcase: Briefcase,
  home: Home,
  lightbulb: Lightbulb,
  hammer: Hammer,
  music: Music,
  heart: Heart,
  plane: Plane,
  book: Book,
  sparkles: Sparkles,
  target: Target,
  coffee: Coffee,
};

/** A notepad's small mark — falls back to an open book when none is chosen. */
export function NotepadGlyph({
  icon,
  className,
  style,
}: {
  icon: string | null | undefined;
  className?: string;
  style?: CSSProperties;
}) {
  const Glyph = (icon && GLYPHS[icon]) || BookOpen;
  return <Glyph className={className} style={style} aria-hidden />;
}
