import React, { useRef, useEffect, useCallback, useMemo } from 'react';

interface TextEditorProps {
  pageWidth: number;
  pageHeight: number;
  columns?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  lineNumbersMode?: 'none' | 'continuous' | 'restart-page' | 'restart-section';
  hyphenationMode?: 'none' | 'automatic' | 'manual';
  content: string;
  onChange: (html: string) => void;
  onOverflow: (overflowHtml: string, fitHtml: string) => void;
  onFocusChange: (focused: boolean) => void;
}

const TextEditor: React.FC<TextEditorProps> = ({
  pageWidth, pageHeight, columns = 1,
  paddingTop = 0, paddingRight = 0, paddingBottom = 0, paddingLeft = 0,
  lineNumbersMode = 'none', hyphenationMode = 'none',
  content, onChange, onOverflow, onFocusChange
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternal = useRef(false);
  const lastClickTime = useRef(0);
  const showLineNumbers = lineNumbersMode !== 'none';

  const lineNumbers = useMemo(() => {
    const text = (content || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>|<\/div>|<\/li>|<li[^>]*>/gi, '\n');
    const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
    const count = Math.max(1, lines.length || 1);
    return Array.from({ length: Math.min(count + 2, 99) }, (_, i) => i + 1);
  }, [content, lineNumbersMode]);

  useEffect(() => {
    if (editorRef.current && !isInternal.current) {
      const cur = editorRef.current.innerHTML;
      const target = content || '';
      if (cur !== target) {
        editorRef.current.innerHTML = target;
      }
    }
  }, [content, pageWidth, pageHeight]);

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.style.width = pageWidth + 'px';
    editorRef.current.style.height = pageHeight + 'px';
    editorRef.current.style.columnCount = columns > 1 ? String(columns) : 'auto';
    editorRef.current.style.columnGap = columns > 1 ? '32px' : '0';
    editorRef.current.style.padding = `${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px`;
    editorRef.current.style.hyphens = hyphenationMode === 'automatic' ? 'auto' : 'manual';
    editorRef.current.style.setProperty('-webkit-hyphens', hyphenationMode === 'automatic' ? 'auto' : 'manual');
    editorRef.current.style.wordBreak = hyphenationMode === 'manual' ? 'break-word' : 'normal';
  }, [pageWidth, pageHeight, columns, paddingTop, paddingRight, paddingBottom, paddingLeft, hyphenationMode]);

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.style.pointerEvents = 'auto';
  }, []);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    isInternal.current = true;
    const html = editorRef.current.innerHTML;
    onChange(html);
    isInternal.current = false;
  }, [onChange, onOverflow, pageWidth, pageHeight]);

  const handleFocus = useCallback(() => {
    onFocusChange(true);
  }, [onFocusChange]);

  const handleBlur = useCallback(() => onFocusChange(false), [onFocusChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      document.execCommand('bold');
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      document.execCommand('italic');
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
      e.preventDefault();
      document.execCommand('underline');
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
    }
    e.stopPropagation();
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (text) {
      document.execCommand('insertHTML', false, text.replace(/\n/g, '<br>'));
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.mini-toolbar') || target.closest('.choose-file-btn')) return;
    e.stopPropagation();
    if (editorRef.current && document.activeElement !== editorRef.current) {
      editorRef.current.focus();
    }
    const now = Date.now();
    if (now - lastClickTime.current < 400) {
      const sel = window.getSelection();
      if (sel && editorRef.current) {
        let node = sel.anchorNode;
        while (node && node.parentElement !== editorRef.current) {
          node = node.parentElement;
        }
        if (node) {
          const range = document.createRange();
          range.selectNodeContents(node);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
    lastClickTime.current = now;
  }, []);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const handleTripleClick = (e: MouseEvent) => {
      if (e.detail === 3) {
        const sel = window.getSelection();
        if (sel && el.contains(e.target as Node)) {
          let node: Node | null = e.target as Node;
          while (node && (node as HTMLElement).parentElement !== el) {
            node = (node as HTMLElement).parentElement;
          }
          if (node) {
            const range = document.createRange();
            range.selectNodeContents(node);
            sel.removeAllRanges();
            sel.addRange(range);
            e.preventDefault();
          }
        }
      }
    };
    el.addEventListener('mouseup', handleTripleClick);
    return () => el.removeEventListener('mouseup', handleTripleClick);
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      const range = document.createRange();
      range.setStart(editorRef.current, 0);
      range.collapse(true);
      sel.addRange(range);
    }
  }, [pageWidth, pageHeight]);

  return (
    <div className="text-editor-shell">
      {showLineNumbers && (
        <div className="text-editor-line-numbers" aria-hidden="true">
          {lineNumbers.map(n => <span key={n}>{n}</span>)}
        </div>
      )}
      <div
        ref={editorRef}
        className="text-editor-overlay"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onMouseDown={handleMouseDown}
        data-page-editor="true"
        style={showLineNumbers ? { paddingLeft: paddingLeft + 32 } : undefined}
      />
    </div>
  );
};

export function execFormatCommand(command: string, value?: string) {
  const editor = document.querySelector('[data-page-editor="true"]');
  if (editor) {
    (editor as HTMLElement).focus();
    document.execCommand(command, false, value);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  return false;
}

export function getEditorSelection(): { node: Node | null; text: string } {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    return { node: sel.anchorNode, text: sel.toString() };
  }
  return { node: null, text: '' };
}

export default TextEditor;
