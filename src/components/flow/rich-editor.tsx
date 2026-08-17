import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import {
  Bold,
  Code,
  Heading2,
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
];

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
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    active: (e) => e.isActive("heading"),
  },
  {
    key: "bullet",
    label: "Bulleted list",
    icon: List,
    run: (e) => e.chain().focus().toggleBulletList().run(),
    active: (e) => e.isActive("bulletList"),
  },
  {
    key: "ordered",
    label: "Numbered list",
    icon: ListOrdered,
    run: (e) => e.chain().focus().toggleOrderedList().run(),
    active: (e) => e.isActive("orderedList"),
  },
  {
    key: "task",
    label: "Checklist",
    icon: ListTodo,
    run: (e) => e.chain().focus().toggleTaskList().run(),
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
    <div className={cn("flex flex-wrap items-center gap-0.5", className)}>
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        const isActive = action.active?.(editor) ?? false;
        return (
          <span key={action.key} className="flex items-center">
            {action.group && <span className="mx-1.5 h-4 w-px bg-border" aria-hidden />}
            <button
              type="button"
              title={action.label}
              aria-label={action.label}
              aria-pressed={isActive}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => action.run(editor)}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150",
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

export type UseFlowEditorOptions = {
  initialHtml?: string;
  autoFocus?: boolean;
  onSubmit?: (html: string) => void;
  onCancel?: () => void;
  onEmptyChange?: (isEmpty: boolean) => void;
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
}: UseFlowEditorOptions) {
  const editorRef = useRef<Editor | null>(null);
  const handlers = useRef({ onSubmit, onCancel, onEmptyChange });
  handlers.current = { onSubmit, onCancel, onEmptyChange };

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
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: { class: "flow-prose focus:outline-none", spellcheck: "true" },
      handleKeyDown: (_view, event) => {
        const instance = editorRef.current;
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
        if (event.shiftKey) return false;
        const inStructuredBlock =
          instance.isActive("listItem") ||
          instance.isActive("taskItem") ||
          instance.isActive("codeBlock") ||
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
