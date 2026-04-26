import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { Bold, Italic, List, ListOrdered, Heading2, Heading3 } from 'lucide-react';
import { useEffect } from 'react';

interface NoteSectionEditorProps {
  value: string;
  readOnly: boolean;
  onChange: (next: string) => void;
}

function readMarkdown(editor: Editor): string {
  const storage = editor.storage as { markdown?: { getMarkdown?: () => string } };
  return storage.markdown?.getMarkdown?.() ?? editor.getText();
}

export function NoteSectionEditor({ value, readOnly, onChange }: NoteSectionEditorProps) {
  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Markdown.configure({
        html: false,
        tightLists: true,
        breaks: true,
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(readMarkdown(editor));
    },
    editorProps: {
      attributes: {
        class: 'tiptap-content',
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor) return;
    if (readMarkdown(editor) === value) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div
      className="rounded-md border"
      style={{
        borderColor: 'var(--color-border-soft)',
        background: 'var(--color-surface)',
      }}
    >
      {!readOnly && (
        <div
          className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1"
          style={{ borderColor: 'var(--color-border-soft)' }}
        >
          <ToolbarButton
            label="Bold"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold size={13} strokeWidth={2.25} />
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic size={13} strokeWidth={2.25} />
          </ToolbarButton>
          <Divider />
          <ToolbarButton
            label="Heading 2"
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 size={13} strokeWidth={2.25} />
          </ToolbarButton>
          <ToolbarButton
            label="Heading 3"
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            <Heading3 size={13} strokeWidth={2.25} />
          </ToolbarButton>
          <Divider />
          <ToolbarButton
            label="Bullet list"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List size={13} strokeWidth={2.25} />
          </ToolbarButton>
          <ToolbarButton
            label="Numbered list"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered size={13} strokeWidth={2.25} />
          </ToolbarButton>
        </div>
      )}
      <EditorContent editor={editor} className="px-3 py-2" />
    </div>
  );
}

function ToolbarButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="rounded px-1.5 py-1 transition-colors"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        color: active ? 'var(--color-fg)' : 'var(--color-fg-muted)',
        background: active ? 'var(--color-surface-2)' : 'transparent',
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <span
      className="mx-0.5 h-4 w-px self-center"
      style={{ background: 'var(--color-border-soft)' }}
      aria-hidden
    />
  );
}
