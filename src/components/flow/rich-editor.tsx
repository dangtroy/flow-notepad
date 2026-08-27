import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type ChainedCommands, type Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";

import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Image from "@tiptap/extension-image";
import {
  Bold,
  Code,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";

import { imageFilesFrom, prepareImage } from "@/lib/images";
import { cn } from "@/lib/utils";

export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    horizontalRule: false,
    link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } },
    codeBlock: { HTMLAttributes: { spellcheck: "false" } },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Image.configure({ allowBase64: true, HTMLAttributes: { class: "flow-image" } }),
];

/**
 * Drops or pastes images straight into the note. Each file is downscaled in the
 * browser first, so an image behaves like any other part of the text.
 */
export async function insertImageFiles(editor: Editor, files: File[]): Promise<number> {
  const images = imageFilesFrom(files);
  if (!images.length) return 0;
  let inserted = 0;
  for (const file of images) {
    try {
      const { src, alt } = await prepareImage(file);
      editor.chain().focus().setImage({ src, alt }).run();
      inserted += 1;
    } catch {
      // One bad file never stops the rest.
    }
  }
  return inserted;
}

/** Opens the file picker and inserts whatever the user chooses. */
export function pickImages(editor: Editor) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.onchange = () => void insertImageFiles(editor, Array.from(input.files ?? []));
  input.click();
}

/**
 * Block formatting acts on lines, not on the whole paragraph.
 *
 * Because Shift+Enter writes a line break inside one paragraph, a note often
 * looks like several lines while being a single block. Toggling a list or a
 * heading would then swallow every line into one item. So each line break in
 * range is first turned into its own block, then the format is applied.
 */
function perLine(editor: Editor, apply: (chain: ChainedCommands) => ChainedCommands) {
  const chain = editor.chain().focus().command(({ tr, state, dispatch }) => {
    const { $from, $to } = state.selection;
    const start = $from.depth > 0 ? $from.start($from.depth) : 0;
    const end = $to.depth > 0 ? $to.end($to.depth) : state.doc.content.size;

    const breaks: number[] = [];
    state.doc.nodesBetween(start, end, (node, pos) => {
      if (node.type.name === "hardBreak") breaks.push(pos);
    });
    if (!breaks.length || !dispatch) return true;

    for (const pos of [...breaks].reverse()) {
      const mapped = tr.mapping.map(pos);
      tr.delete(mapped, mapped + 1);
      tr.split(mapped);
    }
    tr.setSelection(
      TextSelection.create(tr.doc, tr.mapping.map(start), Math.min(tr.mapping.map(end), tr.doc.content.size - 1)),
    );
    return true;
  });
  apply(chain).run();
}


type ToolbarAction = {
  key: string;
  label: string;
  icon: typeof Bold;
  run: (editor: Editor) => void;
  active?: (editor: Editor) => boolean;
  group?: boolean;
};

const ACTIONS: ToolbarAction[] = [
  {
    key: "bold",
    label: "Bold",
    icon: Bold,
    run: (e) => e.chain().focus().toggleBold().run(),
    active: (e) => e.isActive("bold"),
  },
  {
    key: "italic",
    label: "Italic",
    icon: Italic,
    run: (e) => e.chain().focus().toggleItalic().run(),
    active: (e) => e.isActive("italic"),
  },
  {
    key: "underline",
    label: "Underline",
    icon: UnderlineIcon,
    run: (e) => e.chain().focus().toggleUnderline().run(),
    active: (e) => e.isActive("underline"),
  },
  {
    key: "strike",
    label: "Strikethrough",
    icon: Strikethrough,
    run: (e) => e.chain().focus().toggleStrike().run(),
    active: (e) => e.isActive("strike"),
  },
  {
    key: "heading",
    label: "Heading",
    icon: Heading2,
    group: true,
    run: (e) => perLine(e, (chain) => chain.toggleHeading({ level: 2 })),
    active: (e) => e.isActive("heading"),
  },
  {
    key: "bullet",
    label: "Bulleted list",
    icon: List,
    run: (e) => perLine(e, (chain) => chain.toggleBulletList()),
    active: (e) => e.isActive("bulletList"),
  },
  {
    key: "ordered",
    label: "Numbered list",
    icon: ListOrdered,
    run: (e) => perLine(e, (chain) => chain.toggleOrderedList()),
    active: (e) => e.isActive("orderedList"),
  },
  {
    key: "task",
    label: "Checklist",
    icon: ListTodo,
    run: (e) => perLine(e, (chain) => chain.toggleTaskList()),
    active: (e) => e.isActive("taskList"),
  },
  {
    key: "quote",
    label: "Quote",
    icon: Quote,
    group: true,
    run: (e) => e.chain().focus().toggleBlockquote().run(),
    active: (e) => e.isActive("blockquote"),
  },

  {
    key: "code",
    label: "Code",
    icon: Code,
    run: (e) =>
      e.isActive("codeBlock")
        ? e.chain().focus().toggleCodeBlock().run()
        : e.state.selection.empty
          ? e.chain().focus().toggleCode().run()
          : e.chain().focus().toggleCode().run(),
    active: (e) => e.isActive("code") || e.isActive("codeBlock"),
  },
  {
    key: "link",
    label: "Link",
    icon: Link2,
    run: (e) => {
      const previous = (e.getAttributes("link")["href"] as string | undefined) ?? "";
      const value = window.prompt("Link address", previous);
      if (value === null) return;
      if (!value.trim()) {
        e.chain().focus().unsetLink().run();
        return;
      }
      e.chain().focus().extendMarkRange("link").setLink({ href: value.trim() }).run();
    },
    active: (e) => e.isActive("link"),
  },
  {
    key: "image",
    label: "Image",
    icon: ImagePlus,
    group: true,
    run: (e) => pickImages(e),
  },
  {
    key: "undo",
    label: "Undo",
    icon: Undo2,
    group: true,
    run: (e) => e.chain().focus().undo().run(),
  },
  {
    key: "redo",
    label: "Redo",
    icon: Redo2,
    run: (e) => e.chain().focus().redo().run(),
  },
];


export function FlowToolbar({ editor, className }: { editor: Editor; className?: string }) {
  // Re-render on selection/content change so active states stay truthful.
  const [, force] = useState(0);
  useEffect(() => {
    const rerender = () => force((n) => n + 1);
    editor.on("selectionUpdate", rerender);
    editor.on("transaction", rerender);
    return () => {
      editor.off("selectionUpdate", rerender);
      editor.off("transaction", rerender);
    };
  }, [editor]);

  return (
    <div
      className={cn(
        "flow-scroll-x flex items-center gap-0.5 overflow-x-auto sm:flex-wrap sm:overflow-x-visible",
        className,
      )}
    >
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        const isActive = action.active?.(editor) ?? false;
        return (
          <span key={action.key} className="flex shrink-0 items-center">
            {action.group && <span className="mx-1.5 h-4 w-px shrink-0 bg-border" aria-hidden />}
            <button
              type="button"
              title={action.label}
              aria-label={action.label}
              aria-pressed={isActive}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => action.run(editor)}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 sm:h-7 sm:w-7",
                "hover:bg-elevated hover:text-foreground",
                isActive && "bg-elevated text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          </span>
        );
      })}
    </div>
  );
}

/** Coarse pointer: no hover controls, and no keyboard until the user taps. */
function isTouchDevice() {
  return typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;
}


export type UseFlowEditorOptions = {
  initialHtml?: string;
  autoFocus?: boolean;
  onSubmit?: (html: string) => void;
  onCancel?: () => void;
  onEmptyChange?: (isEmpty: boolean) => void;
  /** Return true to swallow the key — used by the composer's # autocomplete. */
  onKeyDown?: (event: KeyboardEvent) => boolean;
};

/**
 * Shared editor used by the composer and by inline message editing so writing
 * and editing behave identically.
 *
 * Enter sends, Shift+Enter breaks the line, and inside lists / quotes / code
 * Enter keeps its native meaning so long formatted entries stay comfortable.
 * Cmd/Ctrl+Enter always sends.
 */
export function useFlowEditor({
  initialHtml,
  autoFocus,
  onSubmit,
  onCancel,
  onEmptyChange,
  onKeyDown,
}: UseFlowEditorOptions) {
  const editorRef = useRef<Editor | null>(null);
  const handlers = useRef({ onSubmit, onCancel, onEmptyChange, onKeyDown });
  handlers.current = { onSubmit, onCancel, onEmptyChange, onKeyDown };

  function submitFromEditor() {
    const instance = editorRef.current;
    const submit = handlers.current.onSubmit;
    if (!instance || instance.isEmpty || !submit) return;
    submit(instance.getHTML());
  }

  const editor = useEditor({
    extensions: editorExtensions,
    content: initialHtml ?? "",
    immediatelyRender: false,
    // On touch, autofocus would throw up the keyboard before the user asked.
    autofocus: autoFocus && !isTouchDevice() ? "end" : false,
    editorProps: {
      attributes: { class: "flow-prose focus:outline-none", spellcheck: "true" },
      // Dropping or pasting an image writes it into the note in place.
      handleDrop: (_view, event) => {
        const instance = editorRef.current;
        const files = imageFilesFrom((event as DragEvent).dataTransfer?.files ?? null);
        if (!instance || !files.length) return false;
        event.preventDefault();
        void insertImageFiles(instance, files);
        return true;
      },
      handlePaste: (_view, event) => {
        const instance = editorRef.current;
        const files = imageFilesFrom(event.clipboardData?.files ?? null);
        if (!instance || !files.length) return false;
        event.preventDefault();
        void insertImageFiles(instance, files);
        return true;
      },

      handleKeyDown: (_view, event) => {
        const instance = editorRef.current;
        // An open autocomplete owns the arrows, Enter, Tab, and Escape first.
        if (handlers.current.onKeyDown?.(event)) {
          event.preventDefault();
          return true;
        }
        if (event.key === "Escape" && handlers.current.onCancel) {
          event.preventDefault();
          handlers.current.onCancel();
          return true;
        }
        if (event.key !== "Enter" || !handlers.current.onSubmit || !instance) return false;
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          submitFromEditor();
          return true;
        }
        // On phones and tablets Return means "new line", like every native note
        // app; sending is the send button's job.
        if (isTouchDevice()) return false;
        if (event.shiftKey) return false;

        // Inside a structured block Enter keeps its native meaning, so a
        // heading or a list can be followed by ordinary text in the same note.
        const inStructuredBlock =
          instance.isActive("listItem") ||
          instance.isActive("taskItem") ||
          instance.isActive("codeBlock") ||
          instance.isActive("heading") ||
          instance.isActive("blockquote");
        if (inStructuredBlock) return false;
        event.preventDefault();
        submitFromEditor();
        return true;
      },
    },
    onUpdate: ({ editor: instance }) => handlers.current.onEmptyChange?.(instance.isEmpty),
  });

  editorRef.current = editor ?? null;

  return editor;
}


export function FlowEditorSurface({
  editor,
  placeholder,
  isEmpty,
  className,
}: {
  editor: Editor;
  placeholder?: string;
  isEmpty: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flow-editor relative", className)}>
      {placeholder && isEmpty && (
        <span className="pointer-events-none absolute left-0 top-0 select-none text-[0.9975rem] leading-[1.72] text-muted-foreground">
          {placeholder}
        </span>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

/** The `#word` the caret currently sits in, if any — drives tag autocomplete. */
export type TagToken = { query: string; from: number; to: number };

export function readTagToken(editor: Editor): TagToken | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;
  const { $from } = selection;
  const start = $from.start();
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "\uFFFC");
  const match = /(^|\s)#([\p{L}\p{N}_-]*)$/u.exec(before);
  if (!match) return null;
  const token = `#${match[2]}`;
  return {
    query: match[2] ?? "",
    from: start + before.length - token.length,
    to: start + before.length,
  };
}

/** Removes the typed `#token` so it never lands in the saved note body. */
export function stripTagToken(editor: Editor, token: TagToken) {
  editor
    .chain()
    .focus()
    .insertContentAt({ from: token.from, to: token.to }, "")
    .run();
}
