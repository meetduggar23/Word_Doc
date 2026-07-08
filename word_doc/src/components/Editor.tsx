import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { fabric } from 'fabric';
import Toolbar from './Toolbar';
import PageNavigator from './PageNavigator';
import TextEditor from './TextEditor';
import { PageData, CommentData } from '../types';
import { safeGetStorageItem, safeGetStorageJson, safeSetStorageItem } from '../utils/storage';

function generatePdfBlob(pages: Array<{ dataUrl: string; width: number; height: number }>): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const objOffsets: number[] = [];

  const write = (str: string) => chunks.push(encoder.encode(str));
  const writeBinary = (data: Uint8Array) => chunks.push(data);
  const offset = () => chunks.reduce((s, c) => s + c.length, 0);

  const imgs = pages.map(p => {
    const b64 = p.dataUrl.split(',')[1];
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return { bytes, width: p.width, height: p.height };
  });

  write('%PDF-1.4\n');

  objOffsets[1] = offset();
  write('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  const pageRefs = imgs.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  objOffsets[2] = offset();
  write(`2 0 obj\n<< /Type /Pages /Kids [${pageRefs}] /Count ${imgs.length} >>\nendobj\n`);

  let objNum = 3;
  imgs.forEach((img) => {
    const pageObjNum = objNum++;
    const contentObjNum = objNum++;
    const imageObjNum = objNum++;

    objOffsets[pageObjNum] = offset();
    write(`${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${img.width} ${img.height}] /Contents ${contentObjNum} 0 R /Resources << /XObject << /Im0 ${imageObjNum} 0 R >> >> >>\nendobj\n`);

    const stream = `q\n${img.width} 0 0 ${img.height} 0 0 cm\n/Im0 Do\nQ\n`;
    objOffsets[contentObjNum] = offset();
    write(`${contentObjNum} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);

    objOffsets[imageObjNum] = offset();
    write(`${imageObjNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
    writeBinary(img.bytes);
    write('\nendstream\nendobj\n');
  });

  const xrefOffset = offset();
  const numObjs = objNum;
  let xref = `xref\n0 ${numObjs}\n0000000000 65535 f \n`;
  for (let i = 1; i < numObjs; i++) {
    xref += `${String(objOffsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  write(xref);
  write(`trailer\n<< /Size ${numObjs} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { result.set(c, pos); pos += c.length; }
  return new Blob([result], { type: 'application/pdf' });
}

const MAX_HISTORY = 50;
const PAGE_GAP = 30;
const TEXT_PADDING_TOP = 96;
const TEXT_PADDING_BOTTOM = 80;
const TEXT_PADDING_SIDES = 96;
const MANUAL_PAGE_BREAK_ATTR = 'data-page-break';
const EMPTY_PAGE_HTML = '<p><br></p>';
const AVAILABLE_FONTS = [
  'Inter, sans-serif', 'Arial', 'Helvetica', 'Times New Roman', 'Georgia',
  'Verdana', 'Tahoma', 'Courier New', 'Trebuchet MS',
];

type ContextMenuKind = 'text' | 'empty' | 'image' | 'shape' | 'multi' | 'group' | 'link';

interface ContextMenuState {
  x: number;
  y: number;
  kind: ContextMenuKind;
}

interface ContextMenuAction {
  id: string;
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function createMeasureSurface(pageWidth: number, pageHeight: number): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed',
    'left:-99999px',
    'top:0',
    `width:${Math.max(1, pageWidth - TEXT_PADDING_SIDES * 2)}px`,
    `min-height:${pageHeight}px`,
    `padding:${TEXT_PADDING_TOP}px ${TEXT_PADDING_SIDES}px ${TEXT_PADDING_BOTTOM}px`,
    "font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    'font-size:14px',
    'line-height:1.6',
    'word-wrap:break-word',
    'white-space:pre-wrap',
    'box-sizing:border-box',
    'overflow:hidden',
    'visibility:hidden',
    'pointer-events:none',
  ].join(';');
  document.body.appendChild(el);
  return el;
}

function measureHtml(surface: HTMLDivElement, html: string): number {
  surface.innerHTML = html || EMPTY_PAGE_HTML;
  return surface.scrollHeight;
}

function isManualPageBreakNode(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).getAttribute(MANUAL_PAGE_BREAK_ATTR) === 'true';
}

function splitNodeToFit(
  node: Node,
  surface: HTMLDivElement,
  pageHeight: number
): { fitHtml: string; overflowHtml: string } {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue || '';
    if (!text) return { fitHtml: '', overflowHtml: '' };
    const test = document.createElement('div');
    const textNode = document.createTextNode('');
    test.appendChild(textNode);
    let low = 0;
    let high = text.length;
    let best = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      textNode.nodeValue = text.slice(0, mid);
      if (measureHtml(surface, test.innerHTML) <= pageHeight) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return {
      fitHtml: text.slice(0, best),
      overflowHtml: text.slice(best),
    };
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return { fitHtml: '', overflowHtml: node.textContent || '' };
  }

  const element = node as HTMLElement;
  const fitEl = element.cloneNode(false) as HTMLElement;
  const overflowEl = element.cloneNode(false) as HTMLElement;
  const children = Array.from(element.childNodes);
  let overflowMode = false;

  for (const child of children) {
    if (isManualPageBreakNode(child)) {
      overflowMode = true;
      continue;
    }

    if (overflowMode) {
      overflowEl.appendChild(child.cloneNode(true));
      continue;
    }

    const childClone = child.cloneNode(true);
    fitEl.appendChild(childClone);

    if (measureHtml(surface, fitEl.innerHTML) <= pageHeight) {
      continue;
    }

    fitEl.removeChild(childClone);

    if (fitEl.childNodes.length === 0) {
      if (child.nodeType === Node.TEXT_NODE) {
        const original = child.nodeValue || '';
        const textClone = document.createTextNode('');
        fitEl.appendChild(textClone);

        let low = 0;
        let high = original.length;
        let best = 0;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          textClone.nodeValue = original.slice(0, mid);
          if (measureHtml(surface, fitEl.innerHTML) <= pageHeight) {
            best = mid;
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }

        if (best > 0) {
          textClone.nodeValue = original.slice(0, best);
          overflowEl.appendChild(document.createTextNode(original.slice(best)));
          overflowMode = true;
        } else {
          fitEl.removeChild(textClone);
          overflowEl.appendChild(document.createTextNode(original));
          overflowMode = true;
        }
        continue;
      }

      const splitChild = splitNodeToFit(child, surface, pageHeight);
      if (splitChild.fitHtml) {
        fitEl.insertAdjacentHTML('beforeend', splitChild.fitHtml);
      }
      if (splitChild.overflowHtml) {
        overflowEl.insertAdjacentHTML('beforeend', splitChild.overflowHtml);
      }
      overflowMode = true;
      continue;
    }

    overflowMode = true;
    overflowEl.appendChild(child.cloneNode(true));
  }

  return {
    fitHtml: fitEl.innerHTML,
    overflowHtml: overflowEl.innerHTML,
  };
}

function paginateContent(html: string, pageWidth: number, pageHeight: number, columns = 1): string[] {
  const sourceHtml = html && html.trim() ? html : EMPTY_PAGE_HTML;
  const source = document.createElement('div');
  source.innerHTML = sourceHtml;
  const surface = createMeasureSurface(pageWidth, pageHeight);
  if (columns > 1) {
    surface.style.columnCount = String(columns);
    surface.style.columnGap = '32px';
  }
  const pages: string[] = [];
  let remaining = source.innerHTML;

  try {
    while (true) {
      source.innerHTML = remaining || EMPTY_PAGE_HTML;
      const split = splitNodeToFit(source, surface, pageHeight);
      const fitHtml = split.fitHtml;
      const overflowHtml = split.overflowHtml;

      pages.push(fitHtml || EMPTY_PAGE_HTML);

      if (!overflowHtml.trim() || overflowHtml === remaining) {
        break;
      }

      remaining = overflowHtml;
    }
  } finally {
    surface.remove();
  }

  return pages.length > 0 ? pages : [EMPTY_PAGE_HTML];
}

const PAGE_SIZES: Record<string, { w: number; h: number }> = {
  'a4-portrait': { w: 794, h: 1123 },
  'a4-landscape': { w: 1123, h: 794 },
  'a3-portrait': { w: 1123, h: 1587 },
  'a3-landscape': { w: 1587, h: 1123 },
  letter: { w: 816, h: 1056 },
  legal: { w: 816, h: 1344 },
  tabloid: { w: 1056, h: 1632 },
  square: { w: 800, h: 800 },
  'instagram-post': { w: 1080, h: 1080 },
  'instagram-story': { w: 1080, h: 1920 },
  'facebook-post': { w: 1200, h: 630 },
  'youtube-thumbnail': { w: 1280, h: 720 },
};

const MARGIN_PRESETS: Record<string, { t: number; b: number; l: number; r: number }> = {
  normal: { t: 96, b: 96, l: 96, r: 96 },
  narrow: { t: 48, b: 48, l: 48, r: 48 },
  moderate: { t: 96, b: 96, l: 72, r: 72 },
  wide: { t: 96, b: 96, l: 192, r: 192 },
};

const SYMBOLS = ['©','®','™','€','£','¥','¢','§','¶','•','†','‡','←','→','↑','↓','↔','↕','✓','✗','✘','★','☆','♥','♦','♣','♠','●','○','■','□','▲','△','▼','▽','◆','◇','Ω','α','β','γ','δ','ε','θ','λ','π','σ','τ','φ','ψ','∑','∫','∞','≠','≈','≤','≥','±','×','÷','∂','√','∏','∪','∩','⊂','⊃','⊆','⊇','∈','∉','∧','∨','¬','→','⇒','⇔','∀','∃'];
const ZOOM_LEVELS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5];

interface EditorProps {
  docName: string;
  setDocName: React.Dispatch<React.SetStateAction<string>>;
}

const Editor: React.FC<EditorProps> = ({ docName, setDocName }) => {
  const defaultTextColor = '#1e293b';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasInstance = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);
  const [hasSelection, setHasSelection] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => {
    const stored = safeGetStorageItem('worddoc-autosave', '');
    return stored !== 'false';
  });
  const [recentDocuments] = useState<string[]>(() => {
    return safeGetStorageJson<string[]>('worddoc-recent', []);
  });
  const autoSaveTimerRef = useRef<number | null>(null);

  const [isImageSelected, setIsImageSelected] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [contextMenuIndex, setContextMenuIndex] = useState(0);
  const [showArrangeSubmenu, setShowArrangeSubmenu] = useState(false);
  const arrangeRef = useRef<HTMLDivElement>(null);
  const [arrangeSubmenuPos, setArrangeSubmenuPos] = useState<{ top: number; left: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const copiedFormattingRef = useRef<null | {
    fontFamily?: string;
    fontSize?: string;
    color?: string;
    backgroundColor?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    textAlign?: string;
  }>(null);
  const [canvasEmpty, setCanvasEmpty] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const clipboardRef = useRef<any>(null);
  const [isTextSelected, setIsTextSelected] = useState(false);
  const [currentFont, setCurrentFont] = useState('');
  const [currentFontSize, setCurrentFontSize] = useState(28);
  const [currentTextColor, setCurrentTextColor] = useState(defaultTextColor);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [currentTextAlign, setCurrentTextAlign] = useState('left');
  const [isShapeSelected, setIsShapeSelected] = useState(false);
  const [currentShapeColor, setCurrentShapeColor] = useState('#3b82f6');
  const [currentBorderColor, setCurrentBorderColor] = useState('transparent');
  const [currentBorderWidth, setCurrentBorderWidth] = useState(0);
  const [currentCornerRadius, setCurrentCornerRadius] = useState(0);
  const [isCropMode, setIsCropMode] = useState(false);
  const [isPositionLocked, setIsPositionLocked] = useState(false);
  const [currentFilter, setCurrentFilter] = useState('none');
  const [textShadow, setTextShadow] = useState(false);
  const [textBgColor, setTextBgColor] = useState('transparent');
  const [textLetterSpacing, setTextLetterSpacing] = useState(0);
  const [ribbonVisible, setRibbonVisible] = useState(() => {
    const stored = safeGetStorageItem('editor-ribbon', '');
    return stored !== 'hidden';
  });
  const cropRectRef = useRef<any>(null);
  const cropOrigRef = useRef<any>(null);
  const isCropModeRef = useRef(false);
  const rotationAngleRef = useRef(0);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [layoutPreset, setLayoutPreset] = useState('a4-portrait');
  const [marginPreset, setMarginPreset] = useState('normal');
  const [customSize, setCustomSize] = useState({ w: 1920, h: 1080 });
  const marginsRef = useRef({ t: 96, b: 96, l: 96, r: 96 });
  const pendingActionRef = useRef<() => void>(() => {});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasUnsavedChangesRef = useRef(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [showSaveFormat, setShowSaveFormat] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState('png');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpTopic, setHelpTopic] = useState<'guide' | 'shortcuts' | 'about' | 'version'>('guide');
  const [showPreferences, setShowPreferences] = useState(false);
  const [columns, setColumns] = useState(1);
  const [showPageNav, setShowPageNav] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showNavPane, setShowNavPane] = useState(false);
  const [showRuler, setShowRuler] = useState(false);
  const [showGridlines, setShowGridlines] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showQAT] = useState(true);
  const [showFormatting, setShowFormatting] = useState(true);
  const [showQATExport, setShowQATExport] = useState(false);
  const qatExportRef = useRef<HTMLDivElement>(null);
  const [exportFocusIndex, setExportFocusIndex] = useState(0);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const [pageBackgroundColor, setPageBackgroundColor] = useState('#ffffff');
  const [showPageBorder, setShowPageBorder] = useState(false);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [miniToolbar, setMiniToolbar] = useState<{ x: number; y: number } | null>(null);

  const [currentStyle, setCurrentStyle] = useState('normal');
  const [showHeaderFooter, setShowHeaderFooter] = useState(false);
  const [headerContent, setHeaderContent] = useState('');
  const [footerContent, setFooterContent] = useState('');
  const [headerEnabled, setHeaderEnabled] = useState(false);
  const [footerEnabled, setFooterEnabled] = useState(false);
  const [differentFirstPage, setDifferentFirstPage] = useState(false);
  const [imageTransparency, setImageTransparency] = useState(100);
  const [imageShadowEnabled, setImageShadowEnabled] = useState(false);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [showCommentsPanel, setShowCommentsPanel] = useState(false);
  const [commentText, setCommentText] = useState('');

  const [pages, setPages] = useState<PageData[]>([]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const pagesRef = useRef<PageData[]>([]);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const findRef = useRef<HTMLInputElement>(null);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [showGoToPage, setShowGoToPage] = useState(false);
  const [goToPageInput, setGoToPageInput] = useState('');
  const [isTextEditing, setIsTextEditing] = useState(true);
  const isTextEditingRef = useRef(true);
  const [fullDocumentHtml, setFullDocumentHtml] = useState('');
  const fullDocumentHtmlRef = useRef('');
  const [pageTextSegments, setPageTextSegments] = useState<string[]>(['']);
  const pageTextSegmentsRef = useRef<string[]>(['']);
  const paginationLockRef = useRef(false);
  const wordCount = useMemo(() => {
    const allText = (fullDocumentHtml || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return allText ? allText.split(' ').length : 0;
  }, [fullDocumentHtml]);
  const charCount = useMemo(() => {
    const allText = (fullDocumentHtml || '').replace(/<[^>]*>/g, '').replace(/\s/g, '');
    return allText.length;
  }, [fullDocumentHtml]);
  const [showInsertUrlDialog, setShowInsertUrlDialog] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  pagesRef.current = pages;

  const pageWidth = pages[0]?.width || canvasInstance.current?.width || PAGE_SIZES['a4-portrait'].w;
  const pageHeight = pages[0]?.height || canvasInstance.current?.height || PAGE_SIZES['a4-portrait'].h;

  void AVAILABLE_FONTS; void hasSelection; void showArrangeSubmenu; void arrangeRef; void arrangeSubmenuPos;
  void isPositionLocked; void isTextEditing; void canUndo; void canRedo; void currentBorderColor; void currentBorderWidth; void currentCornerRadius;
  void textShadow; void textBgColor; void textLetterSpacing; void showPageNav; void setShowPageNav;

  const execInEditor = (command: string, value?: string) => {
    const editor = document.querySelector('[data-page-editor="true"]') as HTMLElement;
    if (editor) {
      editor.focus();
      if (command === 'fontSize' && value) {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const span = document.createElement('span');
          span.style.fontSize = value + 'px';
          try {
            range.surroundContents(span);
          } catch {
            const text = range.extractContents();
            span.appendChild(text);
            range.insertNode(span);
          }
        } else {
          document.execCommand('insertHTML', false, `<span style="font-size:${value}px">\u200B</span>`);
          const r = document.createRange();
          r.selectNodeContents(editor);
          r.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(r);
        }
      } else if (command === 'fontName' && value) {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const span = document.createElement('span');
          span.style.fontFamily = value;
          try { range.surroundContents(span); }
          catch { const text = range.extractContents(); span.appendChild(text); range.insertNode(span); }
        } else {
          document.execCommand('insertHTML', false, `<span style="font-family:${value}">\u200B</span>`);
          const r = document.createRange();
          r.selectNodeContents(editor);
          r.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(r);
        }
      } else {
        document.execCommand(command, false, value);
      }
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    return false;
  };

  const generateThumbnail = useCallback((width = 140, height = 100): string => {
    const c = canvasInstance.current;
    if (!c) return '';
    const activeObj = c.getActiveObject();
    if (activeObj) c.discardActiveObject();
    c.renderAll();
    const canvasEl = c.getElement();
    const tc = document.createElement('canvas');
    tc.width = width;
    tc.height = height;
    const tctx = tc.getContext('2d')!;
    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, width, height);
    const scale = Math.min(width / c.width, height / c.height);
    const dw = c.width * scale;
    const dh = c.height * scale;
    tctx.drawImage(canvasEl, 0, 0, c.width, c.height, (width - dw) / 2, (height - dh) / 2, dw, dh);
    const dataUrl = tc.toDataURL('image/jpeg', 0.3);
    if (activeObj) c.setActiveObject(activeObj);
    c.renderAll();
    return dataUrl;
  }, []);

  const initDocument = useCallback(() => {
    const c = canvasInstance.current;
    if (!c) return;
    const json = JSON.stringify(c.toJSON(['name', 'link', 'cornerRadius']));
    const thumb = generateThumbnail();
    const defaultPage: PageData = {
      id: 'page-1',
      name: 'Page 1',
      objects: json,
      thumbnail: thumb,
      width: c.width,
      height: c.height,
    };
    setPages([defaultPage]);
    setActivePageIndex(0);
  }, [generateThumbnail]);

  const saveState = useCallback(() => {
    const c = canvasInstance.current;
    if (!c) return;
    const json = JSON.stringify(c.toJSON(['name', 'link', 'cornerRadius']));
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1);
    historyRef.current.push(json);
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    historyIdxRef.current = historyRef.current.length - 1;
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(false);
    hasUnsavedChangesRef.current = true;
  }, []);

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0 || !canvasInstance.current) return;
    historyIdxRef.current--;
    const json = historyRef.current[historyIdxRef.current];
    if (!json) return;
    canvasInstance.current.loadFromJSON(JSON.parse(json), () => {
      canvasInstance.current!.renderAll();
      checkCanvasEmpty();
      updateSelection();
    });
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(true);
  }, []);

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1 || !canvasInstance.current) return;
    historyIdxRef.current++;
    const json = historyRef.current[historyIdxRef.current];
    if (!json) return;
    canvasInstance.current.loadFromJSON(JSON.parse(json), () => {
      canvasInstance.current!.renderAll();
      checkCanvasEmpty();
      updateSelection();
    });
    setCanUndo(true);
    setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
  }, []);

  const updateSelection = useCallback(() => {
    const active = canvasInstance.current?.getActiveObject();
    setHasSelection(!!active);
    const isImg = !!active && active.type === 'image';
    setIsImageSelected(isImg);
    if (isImg) {
      const a = active as any;
      setImageDimensions({ w: Math.round(a.width * a.scaleX), h: Math.round(a.height * a.scaleY) });
    } else {
      setImageDimensions(null);
    }
    const isText = !!active && (active.type === 'i-text' || active.type === 'itext');
    setIsTextSelected(isText);
    if (isText) {
      const a = active as any;
      setCurrentFont(a.fontFamily || '');
      setCurrentFontSize(a.fontSize || 28);
      setCurrentTextColor(a.fill || '#1e293b');
      setIsBold(a.fontWeight === 'bold');
      setIsItalic(a.fontStyle === 'italic');
      setIsUnderline(!!a.underline);
      setCurrentTextAlign(a.textAlign || 'left');
      setTextShadow(!!a.shadow);
      setTextBgColor(a.backgroundColor || 'transparent');
      setTextLetterSpacing(a.charSpacing || 0);
    }
    const shapeTypes = ['rect', 'ellipse', 'triangle', 'polygon', 'path', 'line'];
    const isShape = !!active && shapeTypes.includes(active.type as string);
    setIsShapeSelected(isShape);
    if (isShape) {
      setCurrentShapeColor((active as any).fill || '#3b82f6');
    }
    if (active) {
      const a = active as any;
      const angle = ((a.angle || 0) % 360 + 360) % 360;
      rotationAngleRef.current = angle;
      setCurrentBorderColor(a.stroke || 'transparent');
      setCurrentBorderWidth(a.strokeWidth || 0);
      setCurrentCornerRadius(a.cornerRadius || 0);
      setIsPositionLocked(!!a.lockMovementX);
    } else {
      setIsPositionLocked(false);
    }
  }, []);

  const checkCanvasEmpty = useCallback(() => {
    const objs = canvasInstance.current?.getObjects();
    setCanvasEmpty(!objs || objs.length === 0);
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setContextMenuIndex(0);
    setShowArrangeSubmenu(false);
    setArrangeSubmenuPos(null);
    setShowSaveFormat(false);
  }, []);

  const getContextTargetKind = useCallback((): ContextMenuKind => {
    const c = canvasInstance.current;
    const active = c?.getActiveObject();
    if (active && active.type === 'activeSelection') return 'multi';
    if (active && active.type === 'group') return 'group';
    if (active && active.type === 'image') return 'image';
    if (active && ['rect', 'ellipse', 'triangle', 'polygon', 'path', 'line', 'circle', 'rounded-rect', 'diamond', 'pentagon', 'hexagon', 'star', 'arrow', 'heart', 'speech-bubble', 'cloud', 'cross', 'pentagram-star', 'octagon'].includes(active.type as string)) return 'shape';
    const editor = document.querySelector('[data-page-editor="true"]') as HTMLElement | null;
    const sel = window.getSelection();
    const hasTextSelection = !!editor && document.activeElement === editor && !!sel && !sel.isCollapsed && sel.toString().trim().length > 0;
    if (hasTextSelection || isTextEditingRef.current) return 'text';
    return 'empty';
  }, []);

  const clampContextMenuPosition = useCallback((x: number, y: number, width = 320, height = 360) => {
    const pad = 8;
    const maxX = Math.max(pad, window.innerWidth - width - pad);
    const maxY = Math.max(pad, window.innerHeight - height - pad);
    return {
      x: Math.min(Math.max(pad, x), maxX),
      y: Math.min(Math.max(pad, y), maxY),
    };
  }, []);

  const openContextMenuAt = useCallback((x: number, y: number, kind?: ContextMenuKind) => {
    const menuKind = kind || getContextTargetKind();
    const pos = clampContextMenuPosition(x, y);
    setContextMenu({ x: pos.x, y: pos.y, kind: menuKind });
    setContextMenuIndex(0);
    requestAnimationFrame(() => contextMenuRef.current?.focus());
  }, [clampContextMenuPosition, getContextTargetKind]);

  const runContextAction = useCallback((action: () => void) => {
    closeContextMenu();
    requestAnimationFrame(action);
  }, [closeContextMenu]);

  const escapeHtml = useCallback((value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;'), []);

  const captureFormatting = useCallback(() => {
    const editor = document.querySelector('[data-page-editor="true"]') as HTMLElement | null;
    const sel = window.getSelection();
    if (editor && document.activeElement === editor) {
      const doc = editor.ownerDocument;
      copiedFormattingRef.current = {
        fontFamily: doc.queryCommandValue('fontName') || undefined,
        fontSize: doc.queryCommandValue('fontSize') || undefined,
        color: doc.queryCommandValue('foreColor') || undefined,
        backgroundColor: doc.queryCommandValue('backColor') || undefined,
        bold: doc.queryCommandState('bold'),
        italic: doc.queryCommandState('italic'),
        underline: doc.queryCommandState('underline'),
        textAlign: doc.queryCommandState('justifyCenter') ? 'center' : doc.queryCommandState('justifyRight') ? 'right' : doc.queryCommandState('justifyFull') ? 'justify' : 'left',
      };
      return true;
    }
    const active = canvasInstance.current?.getActiveObject() as any;
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      copiedFormattingRef.current = {
        fontFamily: active.fontFamily,
        fontSize: String(active.fontSize || ''),
        color: active.fill,
        backgroundColor: active.backgroundColor,
        bold: active.fontWeight === 'bold',
        italic: active.fontStyle === 'italic',
        underline: !!active.underline,
        textAlign: active.textAlign,
      };
      return true;
    }
    if (sel && !sel.isCollapsed) {
      copiedFormattingRef.current = null;
      return true;
    }
    return false;
  }, []);

  const applyCopiedFormatting = useCallback(() => {
    const fmt = copiedFormattingRef.current;
    const editor = document.querySelector('[data-page-editor="true"]') as HTMLElement | null;
    if (editor && document.activeElement === editor && fmt) {
      if (fmt.fontFamily) execInEditor('fontName', fmt.fontFamily);
      if (fmt.fontSize) execInEditor('fontSize', fmt.fontSize);
      if (fmt.color) execInEditor('foreColor', fmt.color);
      if (fmt.backgroundColor) execInEditor('backColor', fmt.backgroundColor);
      if (fmt.bold) document.execCommand('bold');
      if (fmt.italic) document.execCommand('italic');
      if (fmt.underline) document.execCommand('underline');
      if (fmt.textAlign) execInEditor(fmt.textAlign === 'justify' ? 'justifyFull' : fmt.textAlign === 'center' ? 'justifyCenter' : fmt.textAlign === 'right' ? 'justifyRight' : 'justifyLeft');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    return false;
  }, []);

  const promptFont = useCallback(() => {
    const next = window.prompt('Font family', currentFont || 'Arial');
    if (!next) return;
    const editor = document.querySelector('[data-page-editor="true"]') as HTMLElement | null;
    if (editor && document.activeElement === editor) {
      execInEditor('fontName', next);
      return;
    }
    const active = canvasInstance.current?.getActiveObject() as any;
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      active.set('fontFamily', next);
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [currentFont, saveState]);

  const promptParagraph = useCallback(() => {
    const next = window.prompt('Paragraph alignment: left, center, right, justify', currentTextAlign || 'left');
    if (!next) return;
    const align = next.toLowerCase();
    if (['left', 'center', 'right', 'justify'].includes(align)) {
      const editor = document.querySelector('[data-page-editor="true"]') as HTMLElement | null;
      if (editor && document.activeElement === editor) {
        execInEditor(align === 'justify' ? 'justifyFull' : align === 'center' ? 'justifyCenter' : align === 'right' ? 'justifyRight' : 'justifyLeft');
      } else {
        handleTextAlign(align);
      }
    }
  }, [currentTextAlign]);

  const promptTextColor = useCallback(() => {
    const next = window.prompt('Text color (hex or CSS color)', currentTextColor || defaultTextColor);
    if (!next) return;
    handleTextColorChange(next);
  }, [currentTextColor, defaultTextColor]);

  const promptHighlight = useCallback(() => {
    const next = window.prompt('Highlight color', '#fff59d');
    if (!next) return;
    handleHighlight(next);
  }, []);

  const promptShapeFill = useCallback(() => {
    const next = window.prompt('Shape fill color', currentShapeColor || '#3b82f6');
    if (!next) return;
    handleShapeColorChange(next);
  }, [currentShapeColor]);

  const promptOutlineColor = useCallback(() => {
    const next = window.prompt('Outline color', currentBorderColor || '#000000');
    if (!next) return;
    handleBorderColor(next);
  }, [currentBorderColor]);

  const promptOutlineWidth = useCallback(() => {
    const next = window.prompt('Outline width', String(currentBorderWidth || 1));
    if (!next) return;
    const width = Number(next);
    if (Number.isFinite(width) && width >= 0) handleBorderWidth(width);
  }, [currentBorderWidth]);

  const pasteSpecial = useCallback(async () => {
    const editor = document.querySelector('[data-page-editor="true"]') as HTMLElement | null;
    if (editor && document.activeElement === editor) {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          execInEditor('insertHTML', escapeHtml(text).replace(/\r?\n/g, '<br>'));
          return;
        }
      } catch {}
      document.execCommand('paste');
      return;
    }
    handlePaste();
  }, [escapeHtml]);

  const switchToPage = useCallback((index: number) => {
    const c = canvasInstance.current;
    const currentPages = pagesRef.current;
    const currentIdx = pagesRef.current.length > 0 ? activePageIndex : 0;
    if (!c || index === currentIdx || index < 0 || index >= currentPages.length) return;

    runPagination();

    const currentHtml = pageTextSegmentsRef.current[currentIdx] || '';
    const currentJson = JSON.stringify(c.toJSON(['name', 'link', 'cornerRadius']));
    const thumb = generateThumbnail();
    const updatedPages = currentPages.map((p, i) =>
      i === currentIdx ? { ...p, objects: currentJson, thumbnail: thumb, content: currentHtml } : p
    );
    setPages(updatedPages);
    pagesRef.current = updatedPages;
    const targetPage = updatedPages[index];
    c.loadFromJSON(JSON.parse(targetPage.objects), () => {
      c.renderAll();
      checkCanvasEmpty();
      updateSelection();
      setZoom(c.getZoom());
      saveState();
    });
    setActivePageIndex(index);
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        const scrollTop = index * (pageHeight + PAGE_GAP) + 24 - 40;
        scrollContainerRef.current.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' });
      }
    });
  }, [activePageIndex, generateThumbnail, checkCanvasEmpty, updateSelection, saveState, pageHeight, runPagination]);

  const addPage = useCallback(() => {
    const c = canvasInstance.current;
    if (!c) return;
    const currentIdx = activePageIndex;
    const currentPages = pagesRef.current;
    const currentHtml = pageTextSegmentsRef.current[currentIdx] || '';
    const currentJson = JSON.stringify(c.toJSON(['name', 'link', 'cornerRadius']));
    const thumb = generateThumbnail();
    const newIdx = currentPages.length;
    const newId = `page-${Date.now()}`;
    const newPage: PageData = {
      id: newId,
      name: `Page ${newIdx + 1}`,
      objects: JSON.stringify({ version: c.version, objects: [] }),
      thumbnail: '',
      width: c.width,
      height: c.height,
    };
    const updatedPages = currentPages.map((p, i) =>
      i === currentIdx ? { ...p, objects: currentJson, thumbnail: thumb, content: currentHtml } : p
    );
    updatedPages.push(newPage);
    setPages(updatedPages);
    pagesRef.current = updatedPages;
    const newPageObj = JSON.parse(newPage.objects);
    c.loadFromJSON(newPageObj, () => {
      c.renderAll();
      checkCanvasEmpty();
      updateSelection();
    });
    setActivePageIndex(newIdx);
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' });
      }
    });
  }, [activePageIndex, generateThumbnail, checkCanvasEmpty, updateSelection, pageHeight]);

  const deletePage = useCallback((index: number) => {
    const currentPages = pagesRef.current;
    if (currentPages.length <= 1) return;
    const newPages = currentPages.filter((_, i) => i !== index);
    setPages(newPages);
    pagesRef.current = newPages;
    const newIdx = Math.min(index, newPages.length - 1);
    const c = canvasInstance.current;
    if (c) {
      c.loadFromJSON(JSON.parse(newPages[newIdx].objects), () => {
        c.renderAll();
        checkCanvasEmpty();
        updateSelection();
        setZoom(c.getZoom());
        saveState();
      });
    }
    setActivePageIndex(newIdx);
  }, [checkCanvasEmpty, updateSelection, saveState]);

  const [editingPageIndex, setEditingPageIndex] = useState<number | null>(null);
  const [editingPageName, setEditingPageName] = useState('');

  const renamePage = useCallback((index: number, newName: string) => {
    const currentPages = pagesRef.current;
    if (index < 0 || index >= currentPages.length) return;
    const name = newName.trim() || `Page ${index + 1}`;
    const newPages = currentPages.map((p, i) =>
      i === index ? { ...p, name } : p
    );
    setPages(newPages);
    pagesRef.current = newPages;
    setEditingPageIndex(null);
  }, []);

  const handleStartRename = useCallback((index: number, currentName: string) => {
    setEditingPageIndex(index);
    setEditingPageName(currentName);
  }, []);

  const handleFinishRename = useCallback(() => {
    if (editingPageIndex !== null) {
      renamePage(editingPageIndex, editingPageName);
    }
  }, [editingPageIndex, editingPageName, renamePage]);

  const duplicatePage = useCallback((index: number) => {
    const currentPages = pagesRef.current;
    const sourcePage = currentPages[index];
    const newId = `page-${Date.now()}`;
    const dupPage: PageData = {
      ...sourcePage,
      id: newId,
      name: `Page ${currentPages.length + 1}`,
    };
    const newPages = [...currentPages];
    newPages.splice(index + 1, 0, dupPage);
    setPages(newPages);
    pagesRef.current = newPages;
    switchToPage(index + 1);
  }, [switchToPage]);

  const handlePageBreak = useCallback(() => {
    if (execInEditor('insertHTML', '<div data-page-break="true" class="manual-page-break"><br></div>')) {
      runPagination();
      return;
    }
    addPage();
  }, [addPage, runPagination]);

  const handleInsertBlankPage = useCallback(() => {
    runPagination();
    addPage();
  }, [addPage, runPagination]);

  const handleInsertFromUrl = useCallback(() => {
    if (!imageUrl || !canvasInstance.current) return;
    const c = canvasInstance.current;
    fabric.Image.fromURL(imageUrl, (img: any) => {
      if (!img) return;
      const maxW = c.width * 0.6;
      const maxH = c.height * 0.6;
      let scale = 1;
      if (img.width > maxW || img.height > maxH) {
        scale = Math.min(maxW / img.width, maxH / img.height);
      }
      img.set({
        left: 50, top: 50,
        scaleX: scale, scaleY: scale,
        lockUniScaling: false, lockScalingFlip: false,
      });
      c.add(img);
      c.setActiveObject(img);
      c.renderAll();
      saveState();
      setImageUrl('');
      setShowInsertUrlDialog(false);
    });
  }, [imageUrl, saveState]);

  const handleInsertSymbol = useCallback((symbol: string) => {
    if (!canvasInstance.current) return;
    const c = canvasInstance.current;
    const active = c.getActiveObject();
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      const text = active as any;
      const selStart = text.selectionStart || text.text.length;
      const newText = text.text.substring(0, selStart) + symbol + text.text.substring(text.selectionEnd || selStart);
      text.set({ text: newText });
      text.setSelectionStart(selStart + symbol.length);
      text.setSelectionEnd(selStart + symbol.length);
      c.renderAll();
      saveState();
    } else {
      const t = new fabric.IText(symbol, {
        left: 100, top: 100, fontSize: 18,
        fontFamily: 'Arial', fill: '#333',
        selectable: true, evented: true,
      });
      c.add(t);
      c.setActiveObject(t);
      c.renderAll();
      saveState();
    }
    setShowSymbolPicker(false);
  }, [saveState]);

  const repaginateDocument = useCallback((fullHtml: string, pw: number, ph: number) => {
    const segments = paginateContent(fullHtml, pw, ph, columns);
    pageTextSegmentsRef.current = segments;
    setPageTextSegments(segments);
    const neededPages = segments.length;
    const currentPages = pagesRef.current;
    if (neededPages > currentPages.length) {
      const extras = neededPages - currentPages.length;
      const newPages = [...currentPages];
      for (let i = 0; i < extras; i++) {
        const c = canvasInstance.current;
        newPages.push({
          id: `page-${Date.now()}-${i}`,
          name: `Page ${newPages.length + 1}`,
          objects: c ? JSON.stringify({ version: c.version, objects: [] }) : '{"version":"5.5.2","objects":[]}',
          thumbnail: '',
          width: pw,
          height: ph,
        });
      }
      pagesRef.current = newPages;
      setPages(newPages);
    } else if (neededPages < currentPages.length) {
      const pagesToRemove = currentPages.length - neededPages;
      let removeCount = 0;
      const kept: PageData[] = [];
      for (let i = 0; i < currentPages.length; i++) {
        const hasCanvasObjs = i === activePageIndex
          ? (canvasInstance.current?.getObjects().length || 0) > 0
          : false;
        const pageHasContent = pageTextSegmentsRef.current[i]?.trim() || currentPages[i].objects !== '{"version":"5.5.2","objects":[]}';
        if (i >= neededPages && !hasCanvasObjs && !pageHasContent && removeCount < pagesToRemove) {
          removeCount++;
          continue;
        }
        kept.push(currentPages[i]);
      }
      if (kept.length < currentPages.length && kept.length >= 1) {
        pagesRef.current = kept;
        setPages(kept);
      }
      if (activePageIndex >= kept.length) {
        setActivePageIndex(Math.max(0, kept.length - 1));
      }
    }
    setFullDocumentHtml(fullHtml);
    fullDocumentHtmlRef.current = fullHtml;
  }, [activePageIndex, runPagination, columns]);

  const handleTextContentChange = useCallback((html: string) => {
    if (paginationLockRef.current) return;
    const currentIdx = activePageIndex;
    const segments = pageTextSegmentsRef.current;
    const fullHtml = segments.map((seg, i) => i === currentIdx ? html : seg).join('');
    fullDocumentHtmlRef.current = fullHtml;
    setFullDocumentHtml(fullHtml);
    runPagination();
  }, [activePageIndex]);

  function runPagination() {
    const html = fullDocumentHtmlRef.current || '';
    const pw = pagesRef.current[0]?.width || pageWidth;
    const ph = pagesRef.current[0]?.height || pageHeight;
    if (!html && !pw && !ph) return;
    repaginateDocument(html, pw, ph);
  }

  const handleTextOverflow = useCallback((_overflowHtml: string, _fitHtml: string) => {
    runPagination();
    const nextIdx = activePageIndex + 1;
    if (pageTextSegmentsRef.current[nextIdx]?.trim() && pagesRef.current[nextIdx]) {
      setActivePageIndex(nextIdx);
    }
  }, [runPagination, activePageIndex]);

  const handleTextFocusChange = useCallback((focused: boolean) => {
    setIsTextEditing(focused);
    isTextEditingRef.current = focused;
    if (!focused) {
      setTimeout(() => runPagination(), 0);
    }
  }, [runPagination]);

  const handleToggleOrientation = useCallback(() => {
    if (!canvasInstance.current) return;
    const c = canvasInstance.current;
    const isPortrait = c.width < c.height;
    const newW = isPortrait ? c.height : c.width;
    const newH = isPortrait ? c.width : c.height;
    c.setWidth(newW);
    c.setHeight(newH);
    c.renderAll();
    setOrientation(isPortrait ? 'landscape' : 'portrait');
    setPages(prev => prev.map(p => ({ ...p, width: newW, height: newH })));
    saveState();
  }, [saveState]);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const c = new fabric.Canvas(canvasEl, {
      width: PAGE_SIZES['a4-portrait'].w,
      height: PAGE_SIZES['a4-portrait'].h,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
      selection: true,
      defaultCursor: 'default',
    });
    canvasInstance.current = c;

    c.on('selection:created', () => { updateSelection(); checkCanvasEmpty(); });
    c.on('selection:updated', () => { updateSelection(); checkCanvasEmpty(); });
    c.on('selection:cleared', () => { updateSelection(); checkCanvasEmpty(); });
    c.on('object:modified', () => { saveState(); checkCanvasEmpty(); });
    c.on('path:created', () => { saveState(); });

    checkCanvasEmpty();
    setTimeout(() => initDocument(), 50);

    return () => {
      c.dispose();
      canvasInstance.current = null;
    };
  }, [checkCanvasEmpty, initDocument, saveState, updateSelection]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChangesRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  useEffect(() => {
    if (!canvasInstance.current) return;
    const c = canvasInstance.current;
    const vpt = c.viewportTransform;
    if (vpt) {
      vpt[4] = (c.width * (1 - c.getZoom())) / 2;
      vpt[5] = (c.height * (1 - c.getZoom())) / 2;
      c.requestRenderAll();
    }
  }, [zoom]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    if (!autoSaveEnabled) return;
    const save = () => {
      if (!canvasInstance.current || !pagesRef.current.length) return;
      const currentJson = JSON.stringify(canvasInstance.current.toJSON(['name', 'link', 'cornerRadius']));
      const thumb = '';
      const updatedPages = pagesRef.current.map((p, i) =>
        i === activePageIndex ? { ...p, objects: currentJson, thumbnail: thumb } : p
      );
      const docData = {
        version: '1.0', title: 'Word Doc Document',
        pages: updatedPages, activePageIndex,
        headerContent, footerContent, headerEnabled, footerEnabled, differentFirstPage,
        comments, columns, orientation, pageBackgroundColor,
        metadata: { pageCount: updatedPages.length, autoSaved: true },
      };
      try {
        localStorage.setItem('worddoc-autosave-doc', JSON.stringify(docData));
        localStorage.setItem('worddoc-autosave-time', new Date().toISOString());
      } catch {}
    };
    autoSaveTimerRef.current = window.setInterval(save, 30000);
    return () => { if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current); };
  }, [autoSaveEnabled, activePageIndex]);

  useEffect(() => {
    const handler = () => closeContextMenu();
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, [closeContextMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu, closeContextMenu]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'F10') {
        const kind = getContextTargetKind();
        const selection = window.getSelection();
        if (selection && selection.rangeCount) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          if (rect.width || rect.height) {
            e.preventDefault();
            openContextMenuAt(rect.left, rect.bottom + 8, kind);
            return;
          }
        }
        const active = canvasInstance.current?.getActiveObject();
        if (active && typeof active.left === 'number' && typeof active.top === 'number') {
          const bounds = active.getBoundingRect();
          e.preventDefault();
          openContextMenuAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, kind);
          return;
        }
        e.preventDefault();
        openContextMenuAt(window.innerWidth / 2, window.innerHeight / 2, kind);
      }
      if (e.key === 'ContextMenu') {
        const kind = getContextTargetKind();
        e.preventDefault();
        openContextMenuAt(window.innerWidth / 2, window.innerHeight / 2, kind);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [getContextTargetKind, openContextMenuAt]);

  useEffect(() => {
    const syncSelection = () => {
      if (!isTextEditingRef.current) return;
      const editor = document.querySelector('[data-page-editor="true"]');
      if (!editor || document.activeElement !== editor) return;
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || sel.isCollapsed) return;
      const parentEl = sel.getRangeAt(0).startContainer.parentElement;
      if (!parentEl) return;
      const doc = parentEl.ownerDocument;
      setIsBold(doc.queryCommandState('bold'));
      setIsItalic(doc.queryCommandState('italic'));
      setIsUnderline(doc.queryCommandState('underline'));
      const fontSizeStr = doc.queryCommandValue('fontSize');
      if (fontSizeStr) {
        const parsed = parseInt(fontSizeStr);
        if (!isNaN(parsed) && parsed !== 7) setCurrentFontSize(parsed);
      }
      const fontName = doc.queryCommandValue('fontName');
      if (fontName) setCurrentFont(fontName);
      const color = doc.queryCommandValue('foreColor');
      if (color && color !== '#000000') setCurrentTextColor(color);
      if (doc.queryCommandState('justifyLeft')) setCurrentTextAlign('left');
      else if (doc.queryCommandState('justifyCenter')) setCurrentTextAlign('center');
      else if (doc.queryCommandState('justifyRight')) setCurrentTextAlign('right');
      else if (doc.queryCommandState('justifyFull')) setCurrentTextAlign('justify');
    };
    document.addEventListener('selectionchange', syncSelection);
    return () => document.removeEventListener('selectionchange', syncSelection);
  }, []);

  useEffect(() => {
    if (!showQATExport) return;
    setExportFocusIndex(0);
    const timer = setTimeout(() => exportDropdownRef.current?.focus(), 50);
    const handler = (e: MouseEvent) => {
      if (qatExportRef.current && !qatExportRef.current.contains(e.target as Node)) {
        setShowQATExport(false);
      }
    };
    const escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowQATExport(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', escapeHandler);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', escapeHandler);
    };
  }, [showQATExport]);

  const handleZoom = useCallback((dir: string) => {
    if (!canvasInstance.current) return;
    const c = canvasInstance.current;
    const currentZoom = c.getZoom();
    let newZoom = currentZoom;
    if (dir === 'in') {
      for (const level of ZOOM_LEVELS) {
        if (level > currentZoom + 0.01) { newZoom = level; break; }
      }
    } else if (dir === 'out') {
      const reversed = [...ZOOM_LEVELS].reverse();
      for (const level of reversed) {
        if (level < currentZoom - 0.01) { newZoom = level; break; }
      }
    } else if (dir === 'fit') {
      const container = scrollContainerRef.current;
      if (container) {
        const containerW = container.clientWidth - 40;
        const containerH = container.clientHeight - 40;
        newZoom = Math.min(containerW / c.width, containerH / c.height);
        newZoom = Math.max(0.1, Math.min(5, newZoom));
      }
    }
    c.setZoom(newZoom);
    const vpt = c.viewportTransform;
    if (vpt) { vpt[4] = (c.width * (1 - newZoom)) / 2; vpt[5] = (c.height * (1 - newZoom)) / 2; }
    c.requestRenderAll();
    setZoom(newZoom);
  }, []);

  const handleZoomTo = useCallback((level: number) => {
    if (!canvasInstance.current) return;
    const c = canvasInstance.current;
    c.setZoom(level);
    const vpt = c.viewportTransform;
    if (vpt) { vpt[4] = (c.width * (1 - level)) / 2; vpt[5] = (c.height * (1 - level)) / 2; }
    c.requestRenderAll();
    setZoom(level);
  }, []);

  const handleAddText = useCallback(() => {
    if (!canvasInstance.current) return;
    const c = canvasInstance.current;
    const text = new fabric.IText('Type here', {
      left: 100 + Math.random() * 50, top: 100 + Math.random() * 50,
      fontSize: currentFontSize || 28, fontFamily: currentFont || 'Arial',
      fill: currentTextColor || '#1e293b', selectable: true, evented: true,
    });
    c.add(text);
    c.setActiveObject(text);
    c.renderAll();
    saveState();
    checkCanvasEmpty();
  }, [currentFontSize, currentFont, currentTextColor, saveState, checkCanvasEmpty]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleReplaceClick = useCallback(() => {
    replaceInputRef.current?.click();
  }, []);

  const handleReplaceFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canvasInstance.current) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) return;
      fabric.Image.fromURL(dataUrl, (img: any) => {
        if (!img || !canvasInstance.current) return;
        const c = canvasInstance.current;
        const active = c.getActiveObject();
        if (active && active.type === 'image') {
          const props = { left: active.left, top: active.top, scaleX: active.scaleX, scaleY: active.scaleY, angle: active.angle };
          img.set(props);
          c.remove(active);
          c.add(img);
          c.setActiveObject(img);
          c.renderAll();
          saveState();
        }
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [saveState]);

  const handleAddShape = useCallback((shapeType: string) => {
    if (!canvasInstance.current) return;
    const c = canvasInstance.current;
    const opts: any = { left: 150, top: 150, fill: currentShapeColor || '#3b82f6', selectable: true, evented: true };
    let shape: any;
    switch (shapeType) {
      case 'rect':
        shape = new fabric.Rect({ ...opts, width: 120, height: 80, rx: 0, ry: 0 }); break;
      case 'rounded-rect':
        shape = new fabric.Rect({ ...opts, width: 120, height: 80, rx: 12, ry: 12 }); break;
      case 'circle':
        shape = new fabric.Ellipse({ ...opts, rx: 50, ry: 50 }); break;
      case 'ellipse':
        shape = new fabric.Ellipse({ ...opts, rx: 70, ry: 45 }); break;
      case 'triangle':
        shape = new fabric.Triangle({ ...opts, width: 100, height: 100 }); break;
      case 'line':
        shape = new fabric.Line([50, 100, 250, 100], { ...opts, stroke: currentShapeColor, strokeWidth: 3, fill: 'transparent' }); break;
      case 'diamond': {
        const pts = [{ x: 60, y: 0 }, { x: 120, y: 60 }, { x: 60, y: 120 }, { x: 0, y: 60 }];
        shape = new fabric.Polygon(pts, { ...opts, stroke: currentShapeColor, strokeWidth: 1 }); break;
      }
      case 'pentagon': {
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < 5; i++) {
          const a = (i * 72 - 90) * Math.PI / 180;
          pts.push({ x: 60 + 50 * Math.cos(a), y: 60 + 50 * Math.sin(a) });
        }
        shape = new fabric.Polygon(pts, { ...opts, stroke: currentShapeColor, strokeWidth: 1 }); break;
      }
      case 'star': {
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < 10; i++) {
          const a = (i * 36 - 90) * Math.PI / 180;
          const r = i % 2 === 0 ? 50 : 20;
          pts.push({ x: 60 + r * Math.cos(a), y: 60 + r * Math.sin(a) });
        }
        shape = new fabric.Polygon(pts, { ...opts, stroke: currentShapeColor, strokeWidth: 1 }); break;
      }
      case 'heart':
        shape = new fabric.Path('M 60 100 C 20 60, 0 30, 30 10 C 45 -5, 60 10, 60 30 C 60 10, 75 -5, 90 10 C 120 30, 100 60, 60 100 Z', { ...opts, stroke: currentShapeColor, strokeWidth: 1 }); break;
      default:
        shape = new fabric.Rect({ ...opts, width: 120, height: 80 });
    }
    c.add(shape);
    c.setActiveObject(shape);
    c.renderAll();
    saveState();
    checkCanvasEmpty();
  }, [currentShapeColor, saveState, checkCanvasEmpty]);

  const handleFontChange = useCallback((font: string) => {
    setCurrentFont(font);
    execInEditor('fontName', font);
    const active = canvasInstance.current?.getActiveObject();
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      active.set('fontFamily', font);
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleFontSizeChange = useCallback((size: number) => {
    const clamped = Math.max(1, Math.min(999, size));
    setCurrentFontSize(clamped);
    execInEditor('fontSize', String(clamped));
    const active = canvasInstance.current?.getActiveObject();
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      active.set('fontSize', clamped);
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleTextColorChange = useCallback((color: string) => {
    setCurrentTextColor(color);
    execInEditor('foreColor', color);
    const active = canvasInstance.current?.getActiveObject();
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      active.set('fill', color);
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleBold = useCallback(() => {
    execInEditor('bold');
    setIsBold(prev => !prev);
    const active = canvasInstance.current?.getActiveObject();
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      active.set('fontWeight', active.fontWeight === 'bold' ? '' : 'bold');
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleItalic = useCallback(() => {
    execInEditor('italic');
    setIsItalic(prev => !prev);
    const active = canvasInstance.current?.getActiveObject();
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      active.set('fontStyle', active.fontStyle === 'italic' ? '' : 'italic');
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleUnderline = useCallback(() => {
    execInEditor('underline');
    setIsUnderline(prev => !prev);
    const active = canvasInstance.current?.getActiveObject();
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      active.set('underline', !active.underline);
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleTextAlign = useCallback((align: string) => {
    setCurrentTextAlign(align);
    const map: Record<string, string> = { left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull' };
    if (map[align]) { execInEditor(map[align]); }
    const active = canvasInstance.current?.getActiveObject();
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      active.set('textAlign', align);
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleSuperscript = useCallback(() => {
    execInEditor('superscript');
  }, []);

  const handleSubscript = useCallback(() => {
    execInEditor('subscript');
  }, []);

  const handleHighlight = useCallback((color: string) => {
    execInEditor('backColor', color);
    const active = canvasInstance.current?.getActiveObject();
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      active.set('backgroundColor', color);
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleStrikethrough = useCallback(() => {
    execInEditor('strikeThrough');
    const active = canvasInstance.current?.getActiveObject();
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      active.set('linethrough', !active.linethrough);
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleClearFormatting = useCallback(() => {
    execInEditor('removeFormat');
    const active = canvasInstance.current?.getActiveObject();
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      active.set({ fontStyle: '', fontWeight: '', underline: false, backgroundColor: 'transparent', linethrough: false });
      canvasInstance.current?.renderAll();
      saveState();
    }
    setIsBold(false); setIsItalic(false); setIsUnderline(false); setTextBgColor('transparent');
  }, [saveState]);

  const handleIncreaseFontSize = useCallback(() => {
    handleFontSizeChange(Math.min(999, currentFontSize + 2));
  }, [currentFontSize, handleFontSizeChange]);

  const handleDecreaseFontSize = useCallback(() => {
    handleFontSizeChange(Math.max(1, currentFontSize - 2));
  }, [currentFontSize, handleFontSizeChange]);

  const handleTextShadowToggle = useCallback(() => {
    setTextShadow(prev => !prev);
    const active = canvasInstance.current?.getActiveObject();
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      if (!active.shadow) {
        active.set('shadow', new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 4, offsetX: 2, offsetY: 2 }));
      } else {
        active.set('shadow', null);
      }
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleTextBgColorChange = useCallback((color: string) => {
    setTextBgColor(color);
    const active = canvasInstance.current?.getActiveObject();
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      active.set('backgroundColor', color);
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleTextLetterSpacingChange = useCallback((spacing: number) => {
    setTextLetterSpacing(spacing);
    const active = canvasInstance.current?.getActiveObject();
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      active.set('charSpacing', spacing);
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleAllCaps = useCallback(() => {
    const active = canvasInstance.current?.getActiveObject();
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      const t = active as any;
      t.set('text', t.text.toUpperCase());
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleSmallCaps = useCallback(() => {
    const active = canvasInstance.current?.getActiveObject();
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleDelete = useCallback(() => {
    const c = canvasInstance.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active) return;
    if (active.type === 'activeSelection') {
      (active as any).forEachObject((obj: any) => c.remove(obj));
    } else {
      c.remove(active);
    }
    c.discardActiveObject();
    c.renderAll();
    saveState();
    checkCanvasEmpty();
    updateSelection();
  }, [saveState, checkCanvasEmpty, updateSelection]);

  const handleDuplicate = useCallback(() => {
    const c = canvasInstance.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active) return;
    active.clone((cloned: any) => {
      cloned.set({ left: (cloned.left || 0) + 20, top: (cloned.top || 0) + 20 });
      c.add(cloned);
      c.setActiveObject(cloned);
      c.renderAll();
      saveState();
      checkCanvasEmpty();
    });
  }, [saveState, checkCanvasEmpty, columns]);

  const handleIndent = useCallback((dir: 'in' | 'out') => {
    execInEditor(dir === 'in' ? 'indent' : 'outdent');
  }, []);

  const handleApplyListType = useCallback((type: 'none' | 'bullet' | 'number' | 'multi-level') => {
    if (type === 'bullet') execInEditor('insertUnorderedList');
    else if (type === 'number') execInEditor('insertOrderedList');
    else if (type === 'none') {
      execInEditor('insertUnorderedList');
    }
  }, []);

  const STYLE_MAP: Record<string, { fontSize: number; fontWeight: string; fontStyle: string; fontFamily: string; fill: string; heading?: string }> = {
    normal: { fontSize: 14, fontWeight: 'normal', fontStyle: 'normal', fontFamily: 'Inter, sans-serif', fill: '#1e293b', heading: 'p' },
    'no-spacing': { fontSize: 14, fontWeight: 'normal', fontStyle: 'normal', fontFamily: 'Inter, sans-serif', fill: '#1e293b', heading: 'p' },
    title: { fontSize: 48, fontWeight: 'bold', fontStyle: 'normal', fontFamily: 'Georgia, serif', fill: '#1e293b' },
    subtitle: { fontSize: 20, fontWeight: '500', fontStyle: 'normal', fontFamily: 'Inter, sans-serif', fill: '#6b7280' },
    heading1: { fontSize: 32, fontWeight: 'bold', fontStyle: 'normal', fontFamily: 'Inter, sans-serif', fill: '#1e293b', heading: 'h1' },
    heading2: { fontSize: 24, fontWeight: 'bold', fontStyle: 'normal', fontFamily: 'Inter, sans-serif', fill: '#1e293b', heading: 'h2' },
    heading3: { fontSize: 20, fontWeight: '600', fontStyle: 'normal', fontFamily: 'Inter, sans-serif', fill: '#1e293b', heading: 'h3' },
    heading4: { fontSize: 18, fontWeight: '600', fontStyle: 'normal', fontFamily: 'Inter, sans-serif', fill: '#1e293b', heading: 'h4' },
    heading5: { fontSize: 16, fontWeight: '600', fontStyle: 'normal', fontFamily: 'Inter, sans-serif', fill: '#1e293b', heading: 'h5' },
    heading6: { fontSize: 14, fontWeight: '600', fontStyle: 'normal', fontFamily: 'Inter, sans-serif', fill: '#1e293b', heading: 'h6' },
    quote: { fontSize: 18, fontWeight: 'normal', fontStyle: 'italic', fontFamily: 'Georgia, serif', fill: '#6b7280', heading: 'blockquote' },
    'intense-quote': { fontSize: 20, fontWeight: 'bold', fontStyle: 'italic', fontFamily: 'Georgia, serif', fill: '#1f2937', heading: 'blockquote' },
    code: { fontSize: 14, fontWeight: 'normal', fontStyle: 'normal', fontFamily: '"Courier New", monospace', fill: '#e11d48' },
    caption: { fontSize: 11, fontWeight: '400', fontStyle: 'normal', fontFamily: 'Inter, sans-serif', fill: '#9ca3af' },
  };

  const handleApplyStyle = useCallback((style: string) => {
    setCurrentStyle(style);
    const props = STYLE_MAP[style];
    if (!props) return;

    const editor = document.querySelector('[data-page-editor="true"]') as HTMLElement;
    if (editor) {
      editor.focus();
      requestAnimationFrame(() => {
        if (props.heading && props.heading !== 'p') {
          document.execCommand('formatBlock', false, `<${props.heading}>`);
        } else if (props.heading === 'p') {
          document.execCommand('formatBlock', false, '<p>');
        }
        execInEditor('fontName', props.fontFamily);
        execInEditor('fontSize', String(props.fontSize));
        if (props.fontWeight === 'bold') document.execCommand('bold', false);
        if (props.fontStyle === 'italic') document.execCommand('italic', false);
        if (props.fill) document.execCommand('foreColor', false, props.fill);
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }

    const active = canvasInstance.current?.getActiveObject();
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      const t = active as any;
      t.set('fontSize', props.fontSize);
      t.set('fontFamily', props.fontFamily);
      t.set('fontWeight', props.fontWeight);
      t.set('fontStyle', props.fontStyle);
      t.set('fill', props.fill);
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleAlign = useCallback((dir: string) => {
    const c = canvasInstance.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active) return;
    const bounds = active.getBoundingRect();
    if (dir === 'left') active.set('left', 0);
    else if (dir === 'center') active.set('left', (c.width - bounds.width) / 2);
    else if (dir === 'right') active.set('left', c.width - bounds.width);
    else if (dir === 'top') active.set('top', 0);
    else if (dir === 'middle') active.set('top', (c.height - bounds.height) / 2);
    else if (dir === 'bottom') active.set('top', c.height - bounds.height);
    active.setCoords();
    c.renderAll();
    saveState();
  }, [saveState]);

  const handleDistribute = useCallback(() => {
    const c = canvasInstance.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active || active.type !== 'activeSelection') return;
    const sel = active as any;
    const objs = sel._objects || [];
    if (objs.length < 2) return;
    const sorted = [...objs].sort((a: any, b: any) => a.left - b.left);
    const totalWidth = sorted.reduce((sum: number, o: any) => sum + o.getBoundingRect().width, 0);
    const firstLeft = sorted[0].left;
    const lastRight = sorted[sorted.length - 1].left + sorted[sorted.length - 1].getBoundingRect().width;
    const gap = (lastRight - firstLeft - totalWidth) / (objs.length - 1);
    let currentLeft = firstLeft;
    for (const obj of sorted) {
      obj.set('left', currentLeft);
      obj.setCoords();
      currentLeft += obj.getBoundingRect().width + gap;
    }
    c.renderAll();
    saveState();
  }, [saveState]);

  const handleRotate90 = useCallback(() => {
    const c = canvasInstance.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active) return;
    active.set('angle', ((active.angle || 0) + 90) % 360);
    active.setCoords();
    c.renderAll();
    saveState();
  }, [saveState]);

  const handleAlignToPage = useCallback(() => {
    handleAlign('center');
  }, [handleAlign]);

  const handleGroup = useCallback(() => {
    const c = canvasInstance.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active || active.type !== 'activeSelection') return;
    const sel = active as any;
    const objs = sel._objects || [];
    if (objs.length < 2) return;
    const group = new fabric.Group(objs, { selectable: true, evented: true });
    c.remove(...objs);
    c.add(group);
    c.setActiveObject(group);
    c.renderAll();
    saveState();
  }, [saveState]);

  const handleUngroup = useCallback(() => {
    const c = canvasInstance.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active || active.type !== 'group') return;
    const group = active as any;
    const items = group._objects || [];
    group.destroy();
    items.forEach((item: any) => {
      item.set({ group: null, selectable: true, evented: true });
      c.add(item);
    });
    c.discardActiveObject();
    c.renderAll();
    saveState();
  }, [saveState]);

  const handleCopyAsImage = useCallback(() => {
    const c = canvasInstance.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active) return;
    c.discardActiveObject();
    c.renderAll();
    const dataUrl = c.toDataURL({ multiplier: 2 });
    if (active) c.setActiveObject(active);
    c.renderAll();
    fetch(dataUrl)
      .then(res => res.blob())
      .then(async blob => {
        try {
          if ('clipboard' in navigator && 'ClipboardItem' in window) {
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
          } else {
            const link = document.createElement('a');
            link.download = 'selection.png';
            link.href = dataUrl;
            link.click();
          }
        } catch {
          const link = document.createElement('a');
          link.download = 'selection.png';
          link.href = dataUrl;
          link.click();
        }
      });
  }, []);

  const handleBorderColor = useCallback((color: string) => {
    setCurrentBorderColor(color);
    const active = canvasInstance.current?.getActiveObject();
    if (active) {
      active.set('stroke', color);
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleBorderWidth = useCallback((width: number) => {
    setCurrentBorderWidth(width);
    const active = canvasInstance.current?.getActiveObject();
    if (active) {
      active.set('strokeWidth', width);
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleCornerRadius = useCallback((radius: number) => {
    setCurrentCornerRadius(radius);
    const active = canvasInstance.current?.getActiveObject();
    if (active && (active.type === 'rect' || active.type === 'rounded-rect')) {
      active.set('rx', radius);
      active.set('ry', radius);
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleShapeColorChange = useCallback((color: string) => {
    setCurrentShapeColor(color);
    const active = canvasInstance.current?.getActiveObject();
    if (active) {
      active.set('fill', color);
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleShapeGradient = useCallback((color1: string, color2: string) => {
    const active = canvasInstance.current?.getActiveObject();
    if (!active) return;
    const gradient = new fabric.Gradient({
      type: 'linear',
      coords: { x1: 0, y1: 0, x2: active.width || 100, y2: 0 },
      colorStops: [{ offset: 0, color: color1 }, { offset: 1, color: color2 }],
    });
    active.set('fill', gradient);
    canvasInstance.current?.renderAll();
    saveState();
  }, [saveState]);

  const handleCrop = useCallback(() => {
    const c = canvasInstance.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active || active.type !== 'image') return;
    setIsCropMode(true);
    isCropModeRef.current = true;
    cropOrigRef.current = { left: active.left, top: active.top, scaleX: active.scaleX, scaleY: active.scaleY };
    const rect = new fabric.Rect({
      left: active.left, top: active.top,
      width: (active as any).width * active.scaleX,
      height: (active as any).height * active.scaleY,
      fill: 'transparent', stroke: '#0078d4', strokeWidth: 2,
      strokeDashArray: [6, 3],
      evented: false, selectable: false,
    });
    cropRectRef.current = rect;
    c.add(rect);
    c.renderAll();
  }, []);

  const handleCropApply = useCallback(() => {
    if (!isCropModeRef.current || !canvasInstance.current) return;
    const c = canvasInstance.current;
    const active = c.getActiveObject();
    const cropRect = cropRectRef.current;
    if (active && active.type === 'image' && cropRect) {
      const img = active as any;
      const orig = cropOrigRef.current;
      if (orig) {
        const scaleX = img.scaleX / orig.scaleX;
        const scaleY = img.scaleY / orig.scaleY;
        const cropW = cropRect.width / img.scaleX;
        const cropH = cropRect.height / img.scaleY;
        img.set({
          left: cropRect.left, top: cropRect.top,
          scaleX: scaleX, scaleY: scaleY,
        });
        if (img.filters) {
          img.set('clipPath', new fabric.Rect({ width: cropW, height: cropH, originX: 'left', originY: 'top' }));
        }
      }
    }
    if (cropRect) c.remove(cropRect);
    cropRectRef.current = null;
    cropOrigRef.current = null;
    setIsCropMode(false);
    isCropModeRef.current = false;
    c.renderAll();
    saveState();
  }, [saveState]);

  const handleCropCancel = useCallback(() => {
    if (!isCropModeRef.current || !canvasInstance.current) return;
    const c = canvasInstance.current;
    const cropRect = cropRectRef.current;
    if (cropRect) c.remove(cropRect);
    cropRectRef.current = null;
    cropOrigRef.current = null;
    setIsCropMode(false);
    isCropModeRef.current = false;
    c.renderAll();
  }, []);

  const handleCropRatio = useCallback((ratio: string) => {
    const c = canvasInstance.current;
    if (!c || !cropRectRef.current) return;
    const active = c.getActiveObject();
    if (!active) return;
    if (ratio === 'free') return;
    const parts = ratio.split(':');
    if (parts.length !== 2) return;
    const w = parseInt(parts[0]);
    const h = parseInt(parts[1]);
    if (!w || !h) return;
    const rect = cropRectRef.current;
    const imgBounds = active.getBoundingRect();
    const rectCenter = rect.left + rect.width / 2;
    const newW = Math.min(rect.width, imgBounds.width);
    const newH = newW * h / w;
    rect.set({ width: newW, height: newH, left: rectCenter - newW / 2 });
    rect.setCoords();
    c.renderAll();
  }, []);

  const handleRotateLeft = useCallback(() => {
    const active = canvasInstance.current?.getActiveObject();
    if (!active) return;
    active.set('angle', ((active.angle || 0) - 90) % 360);
    active.setCoords();
    canvasInstance.current?.renderAll();
    saveState();
  }, [saveState]);

  const handleRotateRight = useCallback(() => {
    const active = canvasInstance.current?.getActiveObject();
    if (!active) return;
    active.set('angle', ((active.angle || 0) + 90) % 360);
    active.setCoords();
    canvasInstance.current?.renderAll();
    saveState();
  }, [saveState]);

  const handleFlipH = useCallback(() => {
    const active = canvasInstance.current?.getActiveObject();
    if (!active) return;
    active.set('flipX', !active.flipX);
    active.setCoords();
    canvasInstance.current?.renderAll();
    saveState();
  }, [saveState]);

  const handleFlipV = useCallback(() => {
    const active = canvasInstance.current?.getActiveObject();
    if (!active) return;
    active.set('flipY', !active.flipY);
    active.setCoords();
    canvasInstance.current?.renderAll();
    saveState();
  }, [saveState]);

  const handleExport = useCallback((format: string) => {
    runPagination();
    const c = canvasInstance.current;
    if (!c || !pagesRef.current.length) return;
    const active = c.getActiveObject();
    if (active) c.discardActiveObject();
    c.renderAll();
    const currentIdx = activePageIndex;
    const currentJson = JSON.stringify(c.toJSON(['name', 'link', 'cornerRadius']));
    const thumb = generateThumbnail();
    const updatedPages = pagesRef.current.map((p, i) =>
      i === currentIdx ? { ...p, objects: currentJson, thumbnail: thumb, content: pageTextSegmentsRef.current[i] || '' } : p
    );
    getAllPageData(updatedPages).then((pageDataList) => {
      if (format === 'pdf') {
        const blob = generatePdfBlob(pageDataList);
        downloadBlob(blob, `${docName}.pdf`);
      } else if (format === 'docx') {
        const content = generateDocxContent(updatedPages, pageDataList);
        const blob = new Blob([content], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        downloadBlob(blob, `${docName}.docx`);
      } else if (format === 'png') {
        const dataUrl = c.toDataURL({ format: 'png', multiplier: 2 });
        const link = document.createElement('a');
        link.download = `${docName}.png`;
        link.href = dataUrl;
        link.click();
      } else if (format === 'jpg') {
        const dataUrl = c.toDataURL({ format: 'jpeg', multiplier: 2 });
        const link = document.createElement('a');
        link.download = `${docName}.jpg`;
        link.href = dataUrl;
        link.click();
      } else if (format === 'svg') {
        const svg = c.toSVG();
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        downloadBlob(blob, `${docName}.svg`);
      }
    });
    if (active) c.setActiveObject(active);
    c.renderAll();
  }, [activePageIndex, generateThumbnail, docName]);

  const getAllPageData = useCallback(async (pagesData: PageData[]): Promise<Array<{ dataUrl: string; width: number; height: number }>> => {
    const results: Array<{ dataUrl: string; width: number; height: number }> = [];
    for (const page of pagesData) {
      const c = canvasInstance.current;
      if (c) {
        c.loadFromJSON(JSON.parse(page.objects), () => {
          c.renderAll();
          const dataUrl = c.toDataURL({ multiplier: 2 });
          results.push({ dataUrl, width: c.width, height: c.height });
        });
        await new Promise(r => setTimeout(r, 100));
      }
    }
    if (canvasInstance.current) {
      const c = canvasInstance.current;
      c.loadFromJSON(JSON.parse(pagesData[activePageIndex]?.objects || '{}'), () => {
        c.renderAll();
        updateSelection();
      });
    }
    return results;
  }, [activePageIndex, updateSelection]);

  const generateDocxContent = useCallback((pagesData: PageData[], pageDataList: Array<{ dataUrl: string; width: number; height: number }>): string => {
    let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><title>' + docName + '</title></head><body>';
    pagesData.forEach((page, i) => {
      const content = page.content || '';
      if (content) html += '<div style="page-break-after:always">' + content + '</div>';
      if (pageDataList[i]) {
        html += '<div style="page-break-after:always"><img src="' + pageDataList[i].dataUrl + '" style="width:100%"/></div>';
      }
    });
    html += '</body></html>';
    return html;
  }, [docName]);

  const downloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
  }, []);

  const handleNewDocument = useCallback(() => {
    if (hasUnsavedChangesRef.current) {
      pendingActionRef.current = () => {
        if (canvasInstance.current) {
          canvasInstance.current.clear();
          canvasInstance.current.renderAll();
        }
        setPages([]);
        setActivePageIndex(0);
        setFullDocumentHtml('');
        fullDocumentHtmlRef.current = '';
        pageTextSegmentsRef.current = [''];
      setPageTextSegments(['']);
      setDocName('Document1');
      safeSetStorageItem('worddoc-docname', 'Document1');
        historyRef.current = [];
        historyIdxRef.current = -1;
        hasUnsavedChangesRef.current = false;
        setCanUndo(false);
        setCanRedo(false);
        checkCanvasEmpty();
        setTimeout(() => initDocument(), 50);
      };
      setShowUnsavedModal(true);
      return;
    }
    if (canvasInstance.current) {
      canvasInstance.current.clear();
      canvasInstance.current.renderAll();
    }
    setPages([]);
    setActivePageIndex(0);
    setFullDocumentHtml('');
    fullDocumentHtmlRef.current = '';
    pageTextSegmentsRef.current = [''];
    setPageTextSegments(['']);
    setDocName('Document1');
    safeSetStorageItem('worddoc-docname', 'Document1');
    historyRef.current = [];
    historyIdxRef.current = -1;
    hasUnsavedChangesRef.current = false;
    setCanUndo(false);
    setCanRedo(false);
    checkCanvasEmpty();
    setTimeout(() => initDocument(), 50);
  }, [checkCanvasEmpty, initDocument]);

  const handleOpenDocument = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (Array.isArray(data.pages) && canvasInstance.current) {
            const c = canvasInstance.current;
            const loadedName = typeof data.title === 'string' && data.title.trim()
              ? data.title.trim()
              : file.name.replace(/\.json$/i, '') || 'Document1';
            const sourcePages = data.pages as PageData[];
            const fullHtml = typeof data.documentHtml === 'string'
              ? data.documentHtml
              : sourcePages.map((p: any) => p.content || '').join('');
            const pw = sourcePages[0]?.width || pageWidth;
            const ph = sourcePages[0]?.height || pageHeight;
            const nextColumns = typeof data.columns === 'number' && data.columns > 0 ? data.columns : columns;
            const segments = paginateContent(fullHtml, pw, ph, nextColumns);
            const normalizedPages: PageData[] = segments.map((segment, i) => {
              const source = sourcePages[i];
              return {
                id: source?.id || `page-${i + 1}`,
                name: source?.name || `Page ${i + 1}`,
                objects: source?.objects || JSON.stringify({ version: c.version, objects: [] }),
                thumbnail: source?.thumbnail || '',
                width: source?.width || pw,
                height: source?.height || ph,
                content: segment,
              };
            });
            const activeIdx = Math.min(Math.max(data.activePageIndex || 0, 0), normalizedPages.length - 1);
            c.loadFromJSON(JSON.parse(normalizedPages[activeIdx]?.objects || '{}'), () => {
              c.renderAll();
              setPages(normalizedPages);
              pagesRef.current = normalizedPages;
              setActivePageIndex(activeIdx);
              setColumns(nextColumns);
              fullDocumentHtmlRef.current = fullHtml;
              setFullDocumentHtml(fullHtml);
              pageTextSegmentsRef.current = segments;
              setPageTextSegments(segments);
              setDocName(loadedName);
              safeSetStorageItem('worddoc-docname', loadedName);
              hasUnsavedChangesRef.current = false;
              saveState();
              checkCanvasEmpty();
            });
          }
        } catch {
          alert('Could not open file. It may be corrupted or in an unsupported format.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [saveState, checkCanvasEmpty]);

  const handleSaveDocument = useCallback(() => {
    runPagination();
    if (!canvasInstance.current || !pagesRef.current.length) return;
    const c = canvasInstance.current;
    const currentIdx = activePageIndex;
    const currentJson = JSON.stringify(c.toJSON(['name', 'link', 'cornerRadius']));
    const segments = pageTextSegmentsRef.current;
    const updatedPages = pagesRef.current.map((p, i) =>
      i === currentIdx ? { ...p, objects: currentJson, content: segments[i] || '' } : { ...p, content: segments[i] || '' }
    );
    const docData = {
      version: '1.0', title: docName,
      documentHtml: fullDocumentHtmlRef.current || '',
      pages: updatedPages, activePageIndex: currentIdx,
      headerContent, footerContent, headerEnabled, footerEnabled, differentFirstPage,
      comments, columns, orientation, pageBackgroundColor,
      metadata: { pageCount: updatedPages.length, savedAt: new Date().toISOString() },
    };
    const blob = new Blob([JSON.stringify(docData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${docName}.json`;
    link.click();
    URL.revokeObjectURL(url);
    hasUnsavedChangesRef.current = false;
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
  }, [activePageIndex, docName, headerContent, footerContent, headerEnabled, footerEnabled, differentFirstPage, comments, columns, orientation, pageBackgroundColor]);

  const handlePrint = useCallback(() => {
    const c = canvasInstance.current;
    if (!c) return;
    const dataUrl = c.toDataURL({ multiplier: 2 });
    const win = window.open('', '_blank');
    if (win) {
      win.document.write('<html><head><title>Print</title></head><body style="text-align:center;margin:0;padding:20px">');
      win.document.write('<img src="' + dataUrl + '" style="max-width:100%;height:auto"/>');
      win.document.write('</body></html>');
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 500);
    }
  }, []);

  const handleFindReplace = useCallback(() => {
    setShowFindReplace(prev => !prev);
    setTimeout(() => findRef.current?.focus(), 100);
  }, []);

  const handleFindInCanvas = useCallback(() => {
    if (!findText.trim()) return;
    const c = canvasInstance.current;
    if (!c) return;
    c.getObjects().forEach((obj: any) => {
      if (obj.type === 'i-text' || obj.type === 'itext') {
        const text = obj.text || '';
        if (text.toLowerCase().includes(findText.toLowerCase())) {
          c.setActiveObject(obj);
        }
      }
    });
    c.renderAll();
  }, [findText]);

  const handleReplaceInCanvas = useCallback(() => {
    if (!findText.trim()) return;
    const c = canvasInstance.current;
    if (!c) return;
    c.getObjects().forEach((obj: any) => {
      if (obj.type === 'i-text' || obj.type === 'itext') {
        const text = obj.text || '';
        if (text.includes(findText)) {
          obj.set('text', text.split(findText).join(replaceText));
        }
      }
    });
    c.renderAll();
    saveState();
  }, [findText, replaceText, saveState]);

  const handleSaveFormat = useCallback((format: string) => {
    setSelectedFormat(format);
    handleExport(format);
  }, [handleExport]);

  const handleCut = useCallback(() => {
    const c = canvasInstance.current;
    const editor = document.querySelector('[data-page-editor="true"]') as HTMLElement | null;
    if (editor && document.activeElement === editor) {
      execInEditor('cut');
      return;
    }
    if (!c) return;
    const active = c.getActiveObject();
    if (!active) return;
    if (active.type === 'i-text' || active.type === 'itext') {
      execInEditor('cut'); return;
    }
    active.clone((cloned: any) => { clipboardRef.current = cloned; });
    if (active.type === 'activeSelection') {
      (active as any).forEachObject((obj: any) => c.remove(obj));
    } else {
      c.remove(active);
    }
    c.discardActiveObject();
    c.renderAll();
    saveState();
    checkCanvasEmpty();
    updateSelection();
  }, [saveState, checkCanvasEmpty, updateSelection]);

  const handleCopy = useCallback(() => {
    const c = canvasInstance.current;
    const editor = document.querySelector('[data-page-editor="true"]') as HTMLElement | null;
    if (editor && document.activeElement === editor) {
      execInEditor('copy');
      return;
    }
    if (!c) return;
    const active = c.getActiveObject();
    if (!active) return;
    if (active.type === 'i-text' || active.type === 'itext') {
      execInEditor('copy'); return;
    }
    active.clone((cloned: any) => { clipboardRef.current = cloned; });
  }, []);

  const handlePaste = useCallback(() => {
    const c = canvasInstance.current;
    const editor = document.querySelector('[data-page-editor="true"]') as HTMLElement | null;
    if (editor && document.activeElement === editor) {
      document.execCommand('paste');
      return;
    }
    if (!c || !clipboardRef.current) return;
    clipboardRef.current.clone((cloned: any) => {
      cloned.set({ left: (cloned.left || 50) + 20, top: (cloned.top || 50) + 20, evented: true, selectable: true });
      c.add(cloned);
      c.setActiveObject(cloned);
      c.renderAll();
      saveState();
      checkCanvasEmpty();
    });
  }, [saveState, checkCanvasEmpty]);

  const handlePasteEvent = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          if (!dataUrl || !canvasInstance.current) return;
          fabric.Image.fromURL(dataUrl, (img: any) => {
            if (!img || !canvasInstance.current) return;
            const c = canvasInstance.current;
            const maxW = c.width * 0.6;
            const scale = Math.min(maxW / img.width, (c.height * 0.6) / img.height);
            img.set({ left: 50, top: 50, scaleX: scale, scaleY: scale });
            c.add(img);
            c.setActiveObject(img);
            c.renderAll();
            saveState();
            checkCanvasEmpty();
          });
        };
        reader.readAsDataURL(blob);
        break;
      }
    }
  }, [saveState, checkCanvasEmpty]);

  const handleToggleRibbon = useCallback(() => {
    setRibbonVisible(prev => {
      const next = !prev;
      safeSetStorageItem('editor-ribbon', next ? 'visible' : 'hidden');
      return next;
    });
  }, []);

  const handleToggleFocusMode = useCallback(() => {
    setFocusMode(prev => !prev);
  }, []);

  const handleToggleNavPane = useCallback(() => {
    setShowNavPane(prev => !prev);
  }, []);

  const handleTogglePageThumbnails = useCallback(() => {
    setShowPageNav(prev => !prev);
  }, []);

  const handleToggleRuler = useCallback(() => {
    setShowRuler(prev => !prev);
  }, []);

  const handleToggleGridlines = useCallback(() => {
    setShowGridlines(prev => !prev);
  }, []);

  const handleToggleFullScreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      setIsFullscreen(!!document.fullscreenElement);
    }
  }, []);

  const handleToggleShowFormatting = useCallback(() => {
    setShowFormatting(prev => !prev);
  }, []);

  const handleTogglePageBorder = useCallback(() => {
    setShowPageBorder(prev => !prev);
  }, []);

  const handleToggleHeaderFooter = useCallback(() => {
    setShowHeaderFooter(prev => !prev);
  }, []);

  const handleToggleCommentsPanel = useCallback(() => {
    setShowCommentsPanel(prev => !prev);
  }, []);

  const handleAddComment = useCallback(() => {
    if (!commentText.trim()) return;
    const activeObj = canvasInstance.current?.getActiveObject();
    const newComment: CommentData = {
      id: `comment-${Date.now()}`,
      objectId: activeObj?.name || `obj-${Date.now()}`,
      text: commentText,
      author: 'User',
      createdAt: new Date().toISOString(),
      resolved: false,
    };
    setComments(prev => [...prev, newComment]);
    setCommentText('');
  }, [commentText]);

  const handleDeleteComment = useCallback((id: string) => {
    setComments(prev => prev.filter(c => c.id !== id));
  }, []);

  const handleResolveComment = useCallback((id: string) => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, resolved: true } : c));
  }, []);

  const handleImageTransparency = useCallback((value: number) => {
    setImageTransparency(value);
    const active = canvasInstance.current?.getActiveObject();
    if (active && active.type === 'image') {
      active.set('opacity', value / 100);
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleImageBorder = useCallback((color: string, width: number) => {
    const active = canvasInstance.current?.getActiveObject();
    if (active && active.type === 'image') {
      active.set({ stroke: color, strokeWidth: width });
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleImageShadow = useCallback((enabled: boolean) => {
    setImageShadowEnabled(enabled);
    const active = canvasInstance.current?.getActiveObject();
    if (active && active.type === 'image') {
      if (enabled) {
        active.set('shadow', new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 8, offsetX: 3, offsetY: 3 }));
      } else {
        active.set('shadow', null);
      }
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleImageWrap = useCallback((mode: 'inline' | 'square' | 'tight' | 'behind' | 'front') => {
    const active = canvasInstance.current?.getActiveObject();
    if (active) {
      active.set('wrapMode', mode);
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleApplyFilter = useCallback((filter: string) => {
    setCurrentFilter(filter);
    const active = canvasInstance.current?.getActiveObject();
    if (!active || active.type !== 'image') return;
    const filters: any[] = [];
    if (filter === 'grayscale') filters.push(new fabric.filters.Grayscale());
    else if (filter === 'sepia') {
      filters.push(new fabric.filters.Sepia());
    } else if (filter === 'invert') {
      filters.push(new fabric.filters.Invert());
    } else if (filter === 'brightness') {
      filters.push(new fabric.filters.Brightness({ brightness: 0.2 }));
    } else if (filter === 'contrast') {
      filters.push(new fabric.filters.Contrast({ contrast: 0.3 }));
    } else if (filter === 'blur') {
      filters.push(new fabric.filters.Blur({ blur: 2 }));
    }
    active.set('filters', filters);
    active.applyFilters();
    canvasInstance.current?.renderAll();
    saveState();
  }, [saveState]);

  const handleSetLayout = useCallback((preset: string) => {
    if (!canvasInstance.current) return;
    const c = canvasInstance.current;
    const size = PAGE_SIZES[preset];
    if (!size) return;
    c.setWidth(size.w);
    c.setHeight(size.h);
    c.renderAll();
    setLayoutPreset(preset);
    setPages(prev => prev.map(p => ({ ...p, width: size.w, height: size.h })));
    saveState();
  }, [saveState]);

  const handleSetCustomSize = useCallback((w: number, h: number) => {
    if (!canvasInstance.current) return;
    const c = canvasInstance.current;
    c.setWidth(w);
    c.setHeight(h);
    c.renderAll();
    setCustomSize({ w, h });
    setLayoutPreset('custom');
    setPages(prev => prev.map(p => ({ ...p, width: w, height: h })));
    saveState();
  }, [saveState]);

  const handleSetMargins = useCallback((preset: string) => {
    const m = MARGIN_PRESETS[preset];
    if (m) {
      marginsRef.current = m;
      setMarginPreset(preset);
    }
  }, []);

  const handleSetAspectRatio = useCallback((ratio: string) => {
    if (!canvasInstance.current) return;
    const c = canvasInstance.current;
    const parts = ratio.split(':');
    if (parts.length === 2) {
      const w = parseInt(parts[0]);
      const h = parseInt(parts[1]);
      if (w && h) {
        const area = c.width * c.height;
        const newW = Math.sqrt(area * w / h);
        const newH = newW * h / w;
        c.setWidth(Math.round(newW));
        c.setHeight(Math.round(newH));
        c.renderAll();
        setPages(prev => prev.map(p => ({ ...p, width: Math.round(newW), height: Math.round(newH) })));
        saveState();
      }
    }
  }, [saveState]);

  const handleSetPageBackground = useCallback((color: string) => {
    setPageBackgroundColor(color);
  }, []);

  const handleSetColumns = useCallback((n: number) => {
    const next = Math.max(1, Math.min(4, n));
    setColumns(next);
    requestAnimationFrame(() => runPagination());
  }, [runPagination]);

  const handleOpenLink = useCallback(() => {
    setShowLinkDialog(true);
    setLinkName('');
    setLinkUrl('');
  }, []);

  const handleOpenLinkedUrl = useCallback(() => {
    const active = canvasInstance.current?.getActiveObject();
    if (active && (active as any).link) {
      window.open((active as any).link, '_blank');
    }
  }, []);

  const handleSelectAll = useCallback(() => {
    const c = canvasInstance.current;
    if (!c) return;
    c.discardActiveObject();
    const objs = c.getObjects();
    if (objs.length > 0) {
      const sel = new fabric.ActiveSelection(objs, { canvas: c });
      c.setActiveObject(sel);
      c.renderAll();
    }
  }, []);

  const handleApplyLineSpacing = useCallback((spacing: number) => {
    const map: Record<string, string> = { '1': '1', '1.15': '1.15', '1.5': '1.5', '2': '2', '2.5': '2.5', '3': '3' };
    const val = map[String(spacing)] || '1.15';
    execInEditor('lineHeight', val);
    const active = canvasInstance.current?.getActiveObject();
    if (active && (active.type === 'i-text' || active.type === 'itext')) {
      active.set('lineHeight', spacing);
      canvasInstance.current?.renderAll();
      saveState();
    }
  }, [saveState]);

  const handleUnsavedCancel = useCallback(() => {
    setShowUnsavedModal(false);
    pendingActionRef.current = () => {};
  }, []);

  const handleUnsavedSave = useCallback(() => {
    handleSaveDocument();
    setShowUnsavedModal(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = () => {};
    setTimeout(() => action(), 100);
  }, [handleSaveDocument]);

  const handleConfirmLeave = useCallback(() => {
    setShowSaveFormat(false);
    hasUnsavedChangesRef.current = false;
    const action = pendingActionRef.current;
    pendingActionRef.current = () => {};
    action();
  }, []);

  const handleFeedback = useCallback(() => {
    setShowFeedbackDialog(true);
    setFeedbackText('');
  }, []);

  const handleFeedbackSubmit = useCallback(() => {
    if (!feedbackText.trim()) return;
    setShowFeedbackDialog(false);
    setFeedbackText('');
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
  }, [feedbackText]);

  const handleContactSupport = useCallback(() => {
    window.open('mailto:support@worddoc.app', '_blank');
  }, []);

  const handleShowTraining = useCallback(() => {
    setHelpTopic('guide');
    setShowHelpModal(true);
  }, []);

  const handleShowHelpTopic = useCallback((topic: 'guide' | 'shortcuts' | 'about' | 'version') => {
    setHelpTopic(topic);
    setShowHelpModal(true);
  }, []);

  const handleInsertPageNumber = useCallback(() => {
    const pageNum = activePageIndex + 1;
    execInEditor('insertHTML', ` <span class="page-number">${pageNum}</span> `);
  }, [activePageIndex]);

  const handleInsertDate = useCallback(() => {
    const date = new Date().toLocaleDateString();
    execInEditor('insertHTML', ` ${date} `);
  }, []);

  const handleInsertTime = useCallback(() => {
    const time = new Date().toLocaleTimeString();
    execInEditor('insertHTML', ` ${time} `);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInput = (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && !target.isContentEditable;
    const isTextEditing = isTextEditingRef.current && target.isContentEditable;

    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      if (isInput) return;
      e.preventDefault();
      handleNewDocument();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      if (isInput) return;
      e.preventDefault();
      handleOpenDocument();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      if (isInput) return;
      e.preventDefault();
      handleSaveDocument();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      if (isInput) return;
      e.preventDefault();
      handleFindReplace();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
      if (isInput) return;
      e.preventDefault();
      handleFindReplace();
      setTimeout(() => setShowFindReplace(true), 50);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
      if (isInput) return;
      e.preventDefault();
      setGoToPageInput(String(activePageIndex + 1));
      setShowGoToPage(true);
      return;
    }
    if (e.key === 'F1' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleToggleRibbon();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      if (isInput) return;
      e.preventDefault();
      handleExport('pdf');
      return;
    }
    if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'r')) {
      if (isInput) return;
      e.preventDefault();
      if (hasUnsavedChangesRef.current) {
        pendingActionRef.current = () => window.location.reload();
        setShowUnsavedModal(true);
      } else {
        window.location.reload();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      if (isInput && !isTextEditing) return;
      if (isTextEditing) {
        document.execCommand('undo');
        e.preventDefault();
        return;
      }
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      if (isInput && !isTextEditing) return;
      if (isTextEditing) {
        document.execCommand('redo');
        e.preventDefault();
        return;
      }
      e.preventDefault();
      redo();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      handleZoom('in');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') {
      e.preventDefault();
      handleZoom('out');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault();
      handleZoom('fit');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '1') {
      e.preventDefault();
      handleZoomTo(1);
      return;
    }

    if (e.key === 'Escape' && focusMode) {
      e.preventDefault();
      setFocusMode(false);
      return;
    }
    if (e.key === 'Escape' && isCropMode) {
      e.preventDefault();
      handleCropCancel();
      return;
    }
    if (e.key === 'Escape' && isTextEditingRef.current) {
      e.preventDefault();
      const editor = document.querySelector('[data-page-editor="true"]') as HTMLElement;
      if (editor) editor.blur();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (isInput) return;
      if (isTextEditingRef.current) return;
      e.preventDefault();
      handleDelete();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      if (isInput) return;
      e.preventDefault();
      handleCopy();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      if (isInput) return;
      if (canvasInstance.current) {
        e.preventDefault();
        canvasInstance.current.discardActiveObject();
        const objs = canvasInstance.current.getObjects();
        if (objs.length > 0) {
          const sel = new fabric.ActiveSelection(objs, { canvas: canvasInstance.current });
          canvasInstance.current.setActiveObject(sel);
          canvasInstance.current.renderAll();
        }
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      if (isInput) return;
      e.preventDefault();
      handleDuplicate();
    }
  }, [handleDelete, handleCopy, undo, redo, handleDuplicate, isCropMode, handleCropCancel, handleNewDocument, handleOpenDocument, handleSaveDocument, handleFindReplace, handleExport, handleToggleRibbon, switchToPage, activePageIndex, pages.length, showGoToPage, handleZoom, handleZoomTo, focusMode]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    window.addEventListener('paste', handlePasteEvent);
    return () => window.removeEventListener('paste', handlePasteEvent);
  }, [handlePasteEvent]);

  useEffect(() => {
    const handlePageClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const overlay = target.closest('.canvas-overlay');
      const pageWrapper = target.closest('.page-wrapper');
      const insideInput = target.closest('input, textarea, select, button');
      if (!overlay && !pageWrapper) return;
      if (insideInput) return;
      const editor = document.querySelector('[data-page-editor="true"]') as HTMLElement;
      if (editor) {
        if (document.activeElement !== editor) {
          editor.focus();
          const sel = window.getSelection();
          if (sel) {
            const range = document.createRange();
            if (target.closest('[data-page-editor="true"]')) {
              const clickNode = target;
              if (clickNode && editor.contains(clickNode)) {
                const clickRange = document.createRange();
                clickRange.selectNodeContents(clickNode);
                clickRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(clickRange);
              }
            } else {
              range.setStart(editor, 0);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }
        }
      }
    };
    document.addEventListener('mousedown', handlePageClick, true);
    return () => document.removeEventListener('mousedown', handlePageClick, true);
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY > 0) handleZoom('out');
        else handleZoom('in');
      }
    };
    container.addEventListener('wheel', handler, { passive: false });
    return () => container.removeEventListener('wheel', handler);
  }, [handleZoom]);

  useEffect(() => {
    if (!showUnsavedModal && !showSaveFormat) return;
    const handler = (e: KeyboardEvent) => {
      if (showUnsavedModal) {
        if (e.key === 'Escape') handleUnsavedCancel();
        if (e.key === 'Enter') handleUnsavedSave();
      }
      if (showSaveFormat) {
        if (e.key === 'Escape') setShowSaveFormat(false);
        if (e.key === 'Enter') handleConfirmLeave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showUnsavedModal, showSaveFormat, handleUnsavedCancel, handleUnsavedSave, handleConfirmLeave]);

  const exportFormats = [
    { key: 'pdf', icon: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"></path><path d="M9 12h2l1-3 2 5 1-2h2"></path>', title: 'PDF Document', desc: 'Best for printing and sharing' },
    { key: 'docx', icon: '<path d="M6 2h7l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"></path><polyline points="13 2 13 7 18 7"></polyline><line x1="9" y1="11" x2="15" y2="11"></line><line x1="9" y1="14" x2="14" y2="14"></line><line x1="9" y1="17" x2="12" y2="17"></line>', title: 'Word Document', desc: 'Editable Microsoft Word (.docx)' },
    { key: 'png', icon: '<rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="9" cy="8.5" r="1.5"></circle><path d="M3 16l5-5 3 3 4-4 6 6"></path>', title: 'PNG Image', desc: 'High-quality raster image' },
    { key: 'jpg', icon: '<rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="9.5" cy="8" r="1.5"></circle><path d="M3 15l4-4 3 3 5-5 6 6"></path>', title: 'JPEG Image', desc: 'Compressed raster image' },
    { key: 'svg', icon: '<polyline points="15 18 21 12 15 6"></polyline><polyline points="9 6 3 12 9 18"></polyline>', title: 'SVG Vector', desc: 'Scalable vector graphic' },
  ];

  const handleExportKeydown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!exportFormats.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setExportFocusIndex(prev => (prev + 1) % exportFormats.length);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setExportFocusIndex(prev => (prev - 1 + exportFormats.length) % exportFormats.length);
      return;
    }

    if (e.key === 'Home') {
      e.preventDefault();
      setExportFocusIndex(0);
      return;
    }

    if (e.key === 'End') {
      e.preventDefault();
      setExportFocusIndex(exportFormats.length - 1);
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const item = exportFormats[exportFocusIndex];
      if (item) {
        handleExport(item.key);
        setShowQATExport(false);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setShowQATExport(false);
    }
  }, [exportFocusIndex, handleExport]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !canvasInstance.current) return;
    const c = canvasInstance.current;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        if (!dataUrl) return;
        fabric.Image.fromURL(dataUrl, (img: any) => {
          if (!img) return;
          const maxW = c.width * 0.6;
          const maxH = c.height * 0.6;
          let scale = 1;
          if (img.width > maxW || img.height > maxH) {
            scale = Math.min(maxW / img.width, maxH / img.height);
          }
          img.set({ left: 50 + Math.random() * 100, top: 50 + Math.random() * 100, scaleX: scale, scaleY: scale });
          c.add(img);
          c.renderAll();
          saveState();
          checkCanvasEmpty();
        });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, [saveState, checkCanvasEmpty]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files.length || !canvasInstance.current) return;
    const c = canvasInstance.current;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        if (!dataUrl) return;
        fabric.Image.fromURL(dataUrl, (img: any) => {
          if (!img) return;
          const maxW = c.width * 0.6;
          const maxH = c.height * 0.6;
          let scale = 1;
          if (img.width > maxW || img.height > maxH) {
            scale = Math.min(maxW / img.width, maxH / img.height);
          }
          img.set({ left: 50, top: 50, scaleX: scale, scaleY: scale });
          c.add(img);
          c.setActiveObject(img);
          c.renderAll();
          saveState();
          checkCanvasEmpty();
        });
      };
      reader.readAsDataURL(file);
    });
  }, [saveState, checkCanvasEmpty]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleCenter = useCallback(() => {
    const c = canvasInstance.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active) return;
    const bounds = active.getBoundingRect();
    active.set('left', (c.width - bounds.width) / 2);
    active.set('top', (c.height - bounds.height) / 2);
    active.setCoords();
    c.renderAll();
    saveState();
  }, [saveState]);

  const handleBringForward = useCallback(() => {
    const c = canvasInstance.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active) return;
    c.bringForward(active);
    c.renderAll();
    saveState();
  }, [saveState]);

  const handleSendBackward = useCallback(() => {
    const c = canvasInstance.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active) return;
    c.sendBackwards(active);
    c.renderAll();
    saveState();
  }, [saveState]);

  const handleBringToFront = useCallback(() => {
    const c = canvasInstance.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active) return;
    c.bringToFront(active);
    c.renderAll();
    saveState();
  }, [saveState]);

  const handleSendToBack = useCallback(() => {
    const c = canvasInstance.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active) return;
    c.sendToBack(active);
    c.renderAll();
    saveState();
  }, [saveState]);

  const handleLock = useCallback(() => {
    const active = canvasInstance.current?.getActiveObject();
    if (!active) return;
    active.set({ lockMovementX: true, lockMovementY: true, lockRotation: true, lockScalingX: true, lockScalingY: true, selectable: true, evented: true });
    canvasInstance.current?.renderAll();
    setIsPositionLocked(true);
    saveState();
  }, [saveState]);

  const handleUnlock = useCallback(() => {
    const active = canvasInstance.current?.getActiveObject();
    if (!active) return;
    active.set({ lockMovementX: false, lockMovementY: false, lockRotation: false, lockScalingX: false, lockScalingY: false });
    canvasInstance.current?.renderAll();
    setIsPositionLocked(false);
    saveState();
  }, [saveState]);

  const handleApplyLink = useCallback(() => {
    const active = canvasInstance.current?.getActiveObject();
    if (!active || !linkUrl) return;
    active.set('link', { url: linkUrl, name: linkName || linkUrl });
    canvasInstance.current?.renderAll();
    saveState();
    setShowLinkDialog(false);
  }, [linkUrl, linkName, saveState]);

  const handleRemoveLink = useCallback(() => {
    const active = canvasInstance.current?.getActiveObject();
    if (!active) return;
    active.set('link', null);
    canvasInstance.current?.renderAll();
    saveState();
    setShowLinkDialog(false);
  }, [saveState]);

  const handleApplyHeader = useCallback((text: string) => {
    setHeaderContent(text);
  }, []);

  const handleApplyFooter = useCallback((text: string) => {
    setFooterContent(text);
  }, []);

  const handleToggleAutoSave = useCallback(() => {
    setAutoSaveEnabled(prev => {
      const next = !prev;
      safeSetStorageItem('worddoc-autosave', next ? 'true' : 'false');
      return next;
    });
  }, []);

  const handleUnsavedLeave = useCallback(() => {
    setShowUnsavedModal(false);
    hasUnsavedChangesRef.current = false;
    const action = pendingActionRef.current;
    pendingActionRef.current = () => {};
    action();
  }, []);

  const contextMenuItems = useMemo<ContextMenuAction[]>(() => {
    const c = canvasInstance.current;
    const active = c?.getActiveObject() as any;
    const isTextMode = contextMenu?.kind === 'text';
    const isImageMode = contextMenu?.kind === 'image';
    const isShapeMode = contextMenu?.kind === 'shape';
    const isMultiMode = contextMenu?.kind === 'multi';
    const isGroupMode = contextMenu?.kind === 'group';
    const hasLink = !!active?.link?.url;

    const textItems: ContextMenuAction[] = [
      { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', disabled: !canUndo, onClick: () => (isTextMode ? document.execCommand('undo') : undo()) },
      { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Y', disabled: !canRedo, onClick: () => (isTextMode ? document.execCommand('redo') : redo()) },
      { id: 'cut', label: 'Cut', shortcut: 'Ctrl+X', onClick: handleCut },
      { id: 'copy', label: 'Copy', shortcut: 'Ctrl+C', onClick: handleCopy },
      { id: 'paste', label: 'Paste', shortcut: 'Ctrl+V', onClick: handlePaste },
      { id: 'pasteSpecial', label: 'Paste Special', onClick: () => { void pasteSpecial(); } },
      { id: 'copyFormatting', label: 'Copy Formatting', onClick: captureFormatting },
      { id: 'font', label: 'Font...', onClick: promptFont },
      { id: 'paragraph', label: 'Paragraph...', onClick: promptParagraph },
      { id: 'bullets', label: 'Bullets', onClick: () => execInEditor('insertUnorderedList') },
      { id: 'numbering', label: 'Numbering', onClick: () => execInEditor('insertOrderedList') },
      { id: 'bold', label: 'Bold', shortcut: 'Ctrl+B', onClick: handleBold },
      { id: 'italic', label: 'Italic', shortcut: 'Ctrl+I', onClick: handleItalic },
      { id: 'underline', label: 'Underline', shortcut: 'Ctrl+U', onClick: handleUnderline },
      { id: 'strikethrough', label: 'Strikethrough', onClick: handleStrikethrough },
      { id: 'textColor', label: 'Text Color', onClick: promptTextColor },
      { id: 'highlight', label: 'Highlight', onClick: promptHighlight },
      { id: 'hyperlink', label: 'Hyperlink', onClick: handleOpenLink },
      { id: 'editHyperlink', label: 'Edit Hyperlink', disabled: !hasLink, onClick: handleOpenLink },
      { id: 'removeHyperlink', label: 'Remove Hyperlink', disabled: !hasLink, onClick: handleRemoveLink },
      { id: 'comment', label: 'Comment', onClick: handleAddComment },
      { id: 'delete', label: 'Delete', danger: true, onClick: () => { if (isTextMode) execInEditor('delete'); else handleDelete(); } },
      { id: 'selectAll', label: 'Select All', shortcut: 'Ctrl+A', onClick: handleSelectAll },
    ];

    const emptyItems: ContextMenuAction[] = [
      { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', disabled: !canUndo, onClick: undo },
      { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Y', disabled: !canRedo, onClick: redo },
      { id: 'paste', label: 'Paste', shortcut: 'Ctrl+V', onClick: handlePaste },
      { id: 'pasteSpecial', label: 'Paste Special', onClick: () => { void pasteSpecial(); } },
      { id: 'newPage', label: 'New Page', onClick: addPage },
      { id: 'pageBreak', label: 'Page Break', onClick: handlePageBreak },
      { id: 'insertText', label: 'Insert Text', onClick: handleAddText },
      { id: 'insertImage', label: 'Insert Image', onClick: handleUploadClick },
      { id: 'insertShape', label: 'Insert Shape', onClick: () => handleAddShape('rect') },
      { id: 'header', label: 'Header', onClick: handleToggleHeaderFooter },
      { id: 'footer', label: 'Footer', onClick: handleToggleHeaderFooter },
      { id: 'pageNumber', label: 'Page Number', onClick: handleInsertPageNumber },
      { id: 'docProps', label: 'Document Properties', onClick: () => setShowPreferences(true) },
      { id: 'selectAll', label: 'Select All', shortcut: 'Ctrl+A', onClick: handleSelectAll },
    ];

    const imageItems: ContextMenuAction[] = [
      { id: 'replace', label: 'Replace Image', onClick: handleReplaceClick },
      { id: 'crop', label: 'Crop', onClick: handleCrop },
      { id: 'cropShape', label: 'Crop to Shape', onClick: handleCrop },
      { id: 'rotateLeft', label: 'Rotate Left', onClick: () => { const obj = c?.getActiveObject(); if (obj) { obj.rotate(((obj.angle || 0) - 90 + 360) % 360); c?.renderAll(); saveState(); } } },
      { id: 'rotateRight', label: 'Rotate Right', onClick: () => { const obj = c?.getActiveObject(); if (obj) { obj.rotate(((obj.angle || 0) + 90) % 360); c?.renderAll(); saveState(); } } },
      { id: 'flipH', label: 'Flip Horizontal', onClick: handleFlipH },
      { id: 'flipV', label: 'Flip Vertical', onClick: handleFlipV },
      { id: 'lockAspect', label: 'Lock Aspect Ratio', onClick: () => { const obj = c?.getActiveObject() as any; if (!obj) return; obj.lockUniScaling = !obj.lockUniScaling; c?.renderAll(); saveState(); } },
      { id: 'bringForward', label: 'Bring Forward', onClick: handleBringForward },
      { id: 'sendBackward', label: 'Send Backward', onClick: handleSendBackward },
      { id: 'bringToFront', label: 'Bring To Front', onClick: handleBringToFront },
      { id: 'sendToBack', label: 'Send To Back', onClick: handleSendToBack },
      { id: 'duplicate', label: 'Duplicate', onClick: handleDuplicate },
      { id: 'delete', label: 'Delete', danger: true, onClick: handleDelete },
    ];

    const shapeItems: ContextMenuAction[] = [
      { id: 'fill', label: 'Fill Color', onClick: promptShapeFill },
      { id: 'outlineColor', label: 'Outline Color', onClick: promptOutlineColor },
      { id: 'outlineWidth', label: 'Outline Width', onClick: promptOutlineWidth },
      { id: 'shadow', label: 'Shadow', onClick: () => { const obj = c?.getActiveObject() as any; if (!obj) return; obj.set('shadow', obj.shadow ? null : new fabric.Shadow({ color: 'rgba(0,0,0,0.25)', blur: 8, offsetX: 3, offsetY: 3 })); c?.renderAll(); saveState(); } },
      { id: 'duplicate', label: 'Duplicate', onClick: handleDuplicate },
      { id: 'rotate', label: 'Rotate', onClick: handleRotate90 },
      { id: 'bringForward', label: 'Bring Forward', onClick: handleBringForward },
      { id: 'sendBackward', label: 'Send Backward', onClick: handleSendBackward },
      { id: 'delete', label: 'Delete', danger: true, onClick: handleDelete },
    ];

    const multiItems: ContextMenuAction[] = [
      { id: 'group', label: 'Group', disabled: !active || active.type !== 'activeSelection', onClick: handleGroup },
      { id: 'ungroup', label: 'Ungroup', disabled: !active || active.type !== 'group', onClick: handleUngroup },
      { id: 'alignLeft', label: 'Align Left', onClick: () => handleAlign('left') },
      { id: 'alignCenter', label: 'Align Center', onClick: () => handleAlign('center') },
      { id: 'alignRight', label: 'Align Right', onClick: () => handleAlign('right') },
      { id: 'distH', label: 'Distribute Horizontally', onClick: handleDistribute },
      { id: 'distV', label: 'Distribute Vertically', onClick: handleDistribute },
      { id: 'duplicate', label: 'Duplicate', onClick: handleDuplicate },
      { id: 'delete', label: 'Delete', danger: true, onClick: handleDelete },
    ];

    const groupItems: ContextMenuAction[] = [
      { id: 'ungroup', label: 'Ungroup', onClick: handleUngroup },
      { id: 'duplicate', label: 'Duplicate', onClick: handleDuplicate },
      { id: 'delete', label: 'Delete', danger: true, onClick: handleDelete },
    ];

    let items: ContextMenuAction[] = emptyItems;
    if (isTextMode) items = textItems;
    else if (isImageMode) items = imageItems;
    else if (isShapeMode) items = shapeItems;
    else if (isMultiMode) items = multiItems;
    else if (isGroupMode) items = groupItems;
    return items;
  }, [contextMenu?.kind, canUndo, canRedo, undo, redo, handleCut, handleCopy, handlePaste, pasteSpecial, captureFormatting, promptFont, promptParagraph, promptTextColor, promptHighlight, handleOpenLink, handleRemoveLink, handleAddComment, handleSelectAll, handleDelete, handleAddText, handleUploadClick, handleAddShape, handleToggleHeaderFooter, handleInsertPageNumber, handleReplaceClick, handleCrop, handleFlipH, handleFlipV, handleBringForward, handleSendBackward, handleBringToFront, handleSendToBack, handleDuplicate, promptShapeFill, promptOutlineColor, promptOutlineWidth, handleRotate90, handleGroup, handleUngroup, handleAlign, handleDistribute, defaultTextColor, currentTextColor, currentFont, currentTextAlign, currentShapeColor, currentBorderColor, currentBorderWidth]);

  const contextMenuDividerAfter = useMemo(() => {
    switch (contextMenu?.kind) {
      case 'text':
        return new Set(['redo', 'copyFormatting', 'numbering', 'highlight', 'removeHyperlink', 'comment', 'delete']);
      case 'empty':
        return new Set(['redo', 'pasteSpecial', 'pageBreak', 'insertShape', 'pageNumber', 'docProps']);
      case 'image':
        return new Set(['cropShape', 'lockAspect', 'sendToBack']);
      case 'shape':
        return new Set(['shadow', 'rotate', 'sendBackward']);
      case 'multi':
        return new Set(['ungroup', 'alignRight', 'distV']);
      case 'group':
        return new Set(['ungroup']);
      default:
        return new Set<string>();
    }
  }, [contextMenu?.kind]);

  const handleContextMenuItemKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!contextMenu || contextMenuRef.current == null) return;
    const enabledItems = contextMenuItems.filter(item => !item.disabled);
    if (!enabledItems.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setContextMenuIndex(prev => {
        let next = prev;
        do { next = (next + 1) % contextMenuItems.length; } while (contextMenuItems[next]?.disabled);
        return next;
      });
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setContextMenuIndex(prev => {
        let next = prev;
        do { next = (next - 1 + contextMenuItems.length) % contextMenuItems.length; } while (contextMenuItems[next]?.disabled);
        return next;
      });
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      setContextMenuIndex(contextMenuItems.findIndex(item => !item.disabled));
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      for (let i = contextMenuItems.length - 1; i >= 0; i--) {
        if (!contextMenuItems[i].disabled) { setContextMenuIndex(i); break; }
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const item = contextMenuItems[contextMenuIndex];
      if (item && !item.disabled) item.onClick();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeContextMenu();
    }
  }, [contextMenu, contextMenuIndex, contextMenuItems, closeContextMenu]);

  const handleDocumentContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.page-wrapper') && !target.closest('.text-editor-overlay') && !target.closest('#editor-canvas')) return;
    e.preventDefault();
    e.stopPropagation();
    let kind = getContextTargetKind();
    const c = canvasInstance.current;
    const found = c?.findTarget(e.nativeEvent as any);
    if (found) {
      if ((found as any).type === 'activeSelection') kind = 'multi';
      else if ((found as any).type === 'group') kind = 'group';
      else if ((found as any).type === 'image') kind = 'image';
      else if (['rect', 'ellipse', 'triangle', 'polygon', 'path', 'line', 'circle', 'rounded-rect', 'diamond', 'pentagon', 'hexagon', 'star', 'arrow', 'heart', 'speech-bubble', 'cloud', 'cross', 'pentagram-star', 'octagon'].includes((found as any).type)) kind = 'shape';
    }
    openContextMenuAt(e.clientX, e.clientY, kind);
  }, [getContextTargetKind, openContextMenuAt]);

  void orientation; void showPageBorder; void showCommentsPanel; void handleDeleteComment; void handleResolveComment; void showSymbolPicker; void showInsertUrlDialog; void imageUrl; void imageDimensions; void setImageDimensions;
  void handleTextShadowToggle; void handleTextBgColorChange; void handleTextLetterSpacingChange;
  void handleAllCaps; void handleSmallCaps;
  void handleDistribute; void handleRotate90; void handleAlignToPage;
  void handleGroup; void handleUngroup; void handleCopyAsImage;
  void applyCopiedFormatting; void handleBorderColor; void handleBorderWidth; void handleCornerRadius;
  void handleOpenLinkedUrl; void handleCenter; void handleLock; void handleUnlock;
  return (
    <div className={`editor-layout${focusMode ? ' focus-mode' : ''}${isFullscreen ? ' fullscreen-mode' : ''}`}>
      {!focusMode && ribbonVisible ? (
        <Toolbar
          onAddText={handleAddText}
          onAddImage={handleUploadClick}
          onAddShape={handleAddShape}
          isTextSelected={isTextSelected}
          isImageSelected={isImageSelected}
          isShapeSelected={isShapeSelected}
          isCropMode={isCropMode}
          currentFont={currentFont}
          onFontChange={handleFontChange}
          currentFontSize={currentFontSize}
          onFontSizeChange={handleFontSizeChange}
          currentTextColor={currentTextColor}
          onTextColorChange={handleTextColorChange}
          isBold={isBold}
          onBold={handleBold}
          isItalic={isItalic}
          onItalic={handleItalic}
          isUnderline={isUnderline}
          onUnderline={handleUnderline}
          currentTextAlign={currentTextAlign}
          onTextAlign={handleTextAlign}
          currentShapeColor={currentShapeColor}
          onShapeColorChange={handleShapeColorChange}
          onToggleRibbon={handleToggleRibbon}
          onCrop={handleCrop}
          onCropApply={handleCropApply}
          onCropCancel={handleCropCancel}
          onCropRatio={handleCropRatio}
          onRotateLeft={handleRotateLeft}
          onRotateRight={handleRotateRight}
          onFlipH={handleFlipH}
          onFlipV={handleFlipV}
          onReplaceImage={handleReplaceClick}
          onSetAspectRatio={handleSetAspectRatio}
          onSetLayout={handleSetLayout}
          onSetCustomSize={handleSetCustomSize}
          onSetMargins={handleSetMargins}
          layoutPreset={layoutPreset}
          marginPreset={marginPreset}
          customSize={customSize}
          currentFilter={currentFilter}
          onApplyFilter={handleApplyFilter}
          onContactSupport={handleContactSupport}
          onFeedback={handleFeedback}
          onShowTraining={handleShowTraining}
          onShowHelpTopic={handleShowHelpTopic}
          onZoom={handleZoom}
          onApplyListType={handleApplyListType}
          onApplyStyle={handleApplyStyle}
          currentStyle={currentStyle}
          onIndent={handleIndent}
          onSetPageBackground={handleSetPageBackground}
          pageBackgroundColor={pageBackgroundColor}
          onToggleHeaderFooter={handleToggleHeaderFooter}
          onImageTransparency={handleImageTransparency}
          onImageBorder={handleImageBorder}
          onImageShadow={handleImageShadow}
          imageTransparency={imageTransparency}
          imageShadowEnabled={imageShadowEnabled}
          onTogglePreferences={() => setShowPreferences(true)}
          onPrint={handlePrint}
          onSetColumns={handleSetColumns}
          onToggleCommentsPanel={handleToggleCommentsPanel}
          onAddComment={handleAddComment}
          commentText={commentText}
          onCommentTextChange={setCommentText}
          commentsCount={comments.length}
          onSuperscript={handleSuperscript}
          onSubscript={handleSubscript}
          onHighlight={handleHighlight}
          onImageWrap={handleImageWrap}
          onTogglePageBorder={handleTogglePageBorder}
          onPageBreak={() => { handlePageBreak(); }}
          onShapeGradient={handleShapeGradient}
          onInsertPageNumber={handleInsertPageNumber}
          onInsertDate={handleInsertDate}
          onInsertTime={handleInsertTime}
          onInsertBlankPage={handleInsertBlankPage}
          onInsertFromUrl={() => setShowInsertUrlDialog(true)}
          onToggleSymbolPicker={() => setShowSymbolPicker(prev => !prev)}
          onToggleOrientation={handleToggleOrientation}
          onToggleFocusMode={handleToggleFocusMode}
          onToggleNavPane={handleToggleNavPane}
          onStrikethrough={handleStrikethrough}
          onClearFormatting={handleClearFormatting}
          onIncreaseFontSize={handleIncreaseFontSize}
          onDecreaseFontSize={handleDecreaseFontSize}
          showFormatting={showFormatting}
          onToggleShowFormatting={handleToggleShowFormatting}
          onFindReplace={handleFindReplace}
          onSelectAll={handleSelectAll}
          onCut={handleCut}
          onCopy={handleCopy}
          onCopyAsImage={handleCopyAsImage}
          onPaste={handlePaste}
          onLineSpacing={handleApplyLineSpacing}
          onHyperlink={() => handleOpenLink()}
          onSave={handleSaveDocument}
          onOpen={handleOpenDocument}
          onNew={handleNewDocument}
          onTextDirection={(dir) => { if (!canvasInstance.current) return; const active = canvasInstance.current.getActiveObject(); if (active && (active.type === 'i-text' || active.type === 'itext')) { active.set('direction', dir); canvasInstance.current.renderAll(); saveState(); } }}
          onTogglePageThumbnails={handleTogglePageThumbnails}
          onToggleRuler={handleToggleRuler}
          onToggleGridlines={handleToggleGridlines}
          onToggleFullScreen={handleToggleFullScreen}
        />
      ) : !focusMode ? (
        <button className="show-ribbon-float" onClick={handleToggleRibbon} title="Show Ribbon">
          Show Ribbon ▼
        </button>
      ) : null}

      {showQAT && document.getElementById('qat-portal') && createPortal(
        <div className="qat-title-bar-inner">
          <button className="qat-btn" onClick={handleSaveDocument} title="Save (Ctrl+S)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
          </button>
          <button className="qat-btn" onClick={undo} title="Undo (Ctrl+Z)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          </button>
          <button className="qat-btn" onClick={redo} title="Redo (Ctrl+Y)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </button>
          <button className="qat-btn" onClick={handlePrint} title="Print (Ctrl+P)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          </button>
          <div className="qat-separator" />
          <button className="qat-btn" onClick={() => setShowPreferences(true)} title="Preferences">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <div className="qat-separator" />
          <div ref={qatExportRef} style={{ position: 'relative', display: 'inline-flex' }}>
            <button className="ribbon-btn primary" onClick={() => setShowQATExport(prev => !prev)} title="Export" style={{ flexDirection: 'row', gap: 6, minHeight: 32, fontSize: 13, padding: '4px 14px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Export
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            {showQATExport && (
              <div
                ref={exportDropdownRef}
                className="export-dropdown"
                tabIndex={-1}
                onKeyDown={handleExportKeydown}
              >
                {exportFormats.map((item, i) => (
                  <button
                    key={item.key}
                    className={`export-dropdown-item${i === exportFocusIndex ? ' focused' : ''}`}
                    onClick={() => { handleExport(item.key); setShowQATExport(false); }}
                    onMouseEnter={() => setExportFocusIndex(i)}
                  >
                    <span className="export-item-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: item.icon }} />
                    </span>
                    <div className="export-item-text">
                      <div className="export-item-title">{item.title}</div>
                      <div className="export-item-desc">{item.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.getElementById('qat-portal')!
      )}

      <div className="editor-body">
        {showNavPane && (
          <div className="nav-pane">
            <div className="nav-pane-header">Document Outline</div>
            <div className="nav-pane-content">
              {pages.map((p, i) => (
                <div key={p.id} className={`nav-pane-item${i === activePageIndex ? ' active' : ''}`} onClick={() => switchToPage(i)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect></svg>
                  <span>{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {pages.length > 0 && showPageNav && (
          <PageNavigator
            pages={pages}
            activePageIndex={activePageIndex}
            onSelectPage={switchToPage}
            onAddPage={addPage}
            onDeletePage={deletePage}
            onDuplicatePage={duplicatePage}
            onReorderPage={() => {}}
          />
        )}
      <div className="editor-main-area">
      <div
        className="document-scroll-container"
        ref={scrollContainerRef}
        onClick={closeContextMenu}
        onContextMenu={handleDocumentContextMenu}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={showGridlines ? {
          backgroundImage:
            'linear-gradient(to right, rgba(74,108,247,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(74,108,247,0.08) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          backgroundColor: 'var(--bg-primary)',
        } : undefined}
      >
        {showRuler && (
          <div className="editor-ruler" aria-hidden="true">
            <div className="editor-ruler-markers">
              {Array.from({ length: 12 }).map((_, i) => (
                <span key={i}>{i}</span>
              ))}
            </div>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} style={{ display: 'none' }} />
        <input ref={replaceInputRef} type="file" accept="image/*" onChange={handleReplaceFileChange} style={{ display: 'none' }} />

        {pages.length > 0 && (
          <div className="page-stack">
            {pages.map((page, index) => {
              const pw = (page.width || pageWidth);
              const ph = (page.height || pageHeight);
              const isFirst = index === 0;
              return (
                <div
                  key={page.id}
                  className={`page-wrapper${index === activePageIndex ? ' active' : ''}`}
                  style={{
                    width: pw,
                    height: ph,
                    marginTop: isFirst ? 24 : PAGE_GAP,
                    overflow: 'hidden',
                    position: 'relative',
                    background: pageBackgroundColor,
                    border: showPageBorder ? '1px solid #cbd5e1' : 'none',
                  }}
                  onClick={(e) => { e.stopPropagation(); switchToPage(index); }}
                >
                  {headerEnabled && (!differentFirstPage || index > 0) && (
                    <div
                      className="page-header-footer page-header"
                      style={{ top: 24, opacity: 1 }}
                    >
                      {headerContent}
                    </div>
                  )}
                  {index !== activePageIndex && (
                    <div
                      className="page-text-preview"
                      style={{
                        padding: `${TEXT_PADDING_TOP}px ${TEXT_PADDING_SIDES}px ${TEXT_PADDING_BOTTOM}px`,
                        fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
                        fontSize: 14, lineHeight: 1.6,
                        color: '#1a1a2e', wordWrap: 'break-word', whiteSpace: 'pre-wrap',
                        boxSizing: 'border-box', overflow: 'hidden', width: '100%', height: '100%',
                      }}
                      dangerouslySetInnerHTML={{ __html: pageTextSegments[index] || '' }}
                    />
                  )}
                  {footerEnabled && (!differentFirstPage || index > 0) && (
                    <div
                      className="page-header-footer page-footer"
                      style={{ bottom: 28, opacity: 1 }}
                    >
                      {footerContent}
                    </div>
                  )}
                  {index !== activePageIndex ? (
                    <div className="page-number-label">
                      <span className="page-name-display">{page.name}</span>
                      {pages.length > 1 && (
                        <button
                          className="page-delete-btn"
                          onClick={e => { e.stopPropagation(); deletePage(index); }}
                          title="Delete page"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="page-number-label active-label" style={{ zIndex: 20 }}>
                      {editingPageIndex === index ? (
                        <input
                          className="page-name-input"
                          value={editingPageName}
                          onChange={e => setEditingPageName(e.target.value)}
                          onKeyDown={e => {
                            e.stopPropagation();
                            if (e.key === 'Enter') { handleFinishRename(); }
                            if (e.key === 'Escape') { setEditingPageIndex(null); }
                          }}
                          onBlur={handleFinishRename}
                          autoFocus
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          className="page-name-display"
                          onClick={e => { e.stopPropagation(); handleStartRename(index, page.name); }}
                          title="Click to rename"
                        >
                          {page.name}
                        </span>
                      )}
                      {pages.length > 1 && (
                        <button
                          className="page-delete-btn"
                          onClick={e => { e.stopPropagation(); deletePage(index); }}
                          title="Delete page"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      )}
                    </div>
                  )}
                  <div className="page-footer-num">{index + 1}</div>
                </div>
              );
            })}
          </div>
        )}

        <div
          className="canvas-overlay"
          style={{
            position: 'absolute',
            top: (pages.length > 0 ? 24 : 0) + activePageIndex * (pageHeight + PAGE_GAP),
            left: '50%',
            transform: 'translateX(-50%)',
            width: pageWidth,
            height: pageHeight,
            zIndex: 10,
            overflow: 'hidden',
          }}
          onClick={() => {
            const editor = document.querySelector('[data-page-editor="true"]') as HTMLElement;
            if (editor && document.activeElement !== editor) {
              editor.focus();
              const sel = window.getSelection();
              if (sel) {
                const range = document.createRange();
                range.setStart(editor, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
              }
            }
          }}
        >
          <canvas ref={canvasRef} id="editor-canvas" />
          <TextEditor
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            columns={columns}
            content={pageTextSegments[activePageIndex] || ''}
            onChange={handleTextContentChange}
            onOverflow={handleTextOverflow}
            onFocusChange={handleTextFocusChange}
          />
        </div>

        {miniToolbar && !isCropMode && (
          <div className="mini-toolbar" style={{ position: 'absolute', left: miniToolbar.x, top: miniToolbar.y, zIndex: 100 }}>
            <button className="mini-toolbar-btn" onClick={() => { handleBold(); setMiniToolbar(null); }} title="Bold"><b>B</b></button>
            <button className="mini-toolbar-btn" onClick={() => { handleItalic(); setMiniToolbar(null); }} title="Italic"><i>I</i></button>
            <button className="mini-toolbar-btn" onClick={() => { handleUnderline(); setMiniToolbar(null); }} title="Underline"><u>U</u></button>
            <div className="mini-toolbar-divider" />
            <button className="mini-toolbar-btn" onClick={() => { handleDuplicate(); setMiniToolbar(null); }} title="Duplicate">⧉</button>
            <button className="mini-toolbar-btn" onClick={() => { handleDelete(); setMiniToolbar(null); }} title="Delete">🗑</button>
          </div>
        )}

        {contextMenu && (
          <div
            ref={contextMenuRef}
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            tabIndex={-1}
            role="menu"
            aria-label="Context menu"
            onKeyDown={handleContextMenuItemKeyDown}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenuItems.map((item, index) => (
              <React.Fragment key={item.id}>
                <button
                  className={`context-menu-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}${index === contextMenuIndex ? ' active' : ''}`}
                  disabled={item.disabled}
                  role="menuitem"
                  onMouseEnter={() => { if (!item.disabled) setContextMenuIndex(index); }}
                  onClick={() => { if (!item.disabled) runContextAction(item.onClick); }}
                >
                  <span>{item.label}</span>
                  {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
                </button>
                {contextMenuDividerAfter.has(item.id) && index < contextMenuItems.length - 1 && <div className="context-menu-divider" />}
              </React.Fragment>
            ))}
          </div>
        )}
        {contextMenu && (
          <div
            ref={contextMenuRef}
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            tabIndex={-1}
            role="menu"
            aria-label="Context menu"
            onKeyDown={handleContextMenuItemKeyDown}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenuItems.map((item, index) => (
              <React.Fragment key={item.id}>
                <button
                  className={`context-menu-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}${index === contextMenuIndex ? ' active' : ''}`}
                  disabled={item.disabled}
                  role="menuitem"
                  onMouseEnter={() => { if (!item.disabled) setContextMenuIndex(index); }}
                  onClick={() => { if (!item.disabled) runContextAction(item.onClick); }}
                >
                  <span>{item.label}</span>
                  {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
                </button>
                {contextMenuDividerAfter.has(item.id) && index < contextMenuItems.length - 1 && <div className="context-menu-divider" />}
              </React.Fragment>
            ))}
          </div>
        )}

        {showLinkDialog && (
          <div className="link-dialog-overlay" onClick={() => setShowLinkDialog(false)}>
            <div className="link-dialog" onClick={e => e.stopPropagation()}>
              <div className="link-dialog-header">
                {(() => { const a = canvasInstance.current?.getActiveObject() as any; return a?.link?.url ? 'Edit Link' : 'Add Link'; })()}
              </div>
              <div className="link-dialog-body">
                <label className="link-dialog-label">Display Name</label>
                <input className="link-dialog-input" type="text" placeholder="e.g. OpenAI, Google, Company Website" value={linkName} onChange={e => setLinkName(e.target.value)} autoFocus />
                <label className="link-dialog-label">URL</label>
                <input className="link-dialog-input" type="url" placeholder="e.g. https://openai.com" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleApplyLink(); }} />
              </div>
              <div className="link-dialog-footer">
                {(() => { const a = canvasInstance.current?.getActiveObject() as any; return a?.link?.url ? <button className="link-dialog-btn link-dialog-btn-danger" onClick={() => { handleRemoveLink(); closeContextMenu(); }}>Remove Link</button> : null; })()}
                <div className="link-dialog-footer-right">
                  <button className="link-dialog-btn" onClick={() => setShowLinkDialog(false)}>Cancel</button>
                  <button className="link-dialog-btn link-dialog-btn-primary" onClick={() => { handleApplyLink(); closeContextMenu(); }}>Apply</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>

      {showHeaderFooter && (
        <div className="find-replace-overlay" style={{ top: 'auto', bottom: 0, right: 0, width: 360, padding: '0 16px 16px 0' }}>
          <div className="find-replace-dialog">
            <div className="find-replace-header">Header & Footer</div>
            <div className="find-replace-body">
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Header</label>
              <input className="find-replace-input" type="text" placeholder="Header text..." value={headerContent} onChange={e => handleApplyHeader(e.target.value)} />
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 8 }}>Footer</label>
              <input className="find-replace-input" type="text" placeholder="Footer text..." value={footerContent} onChange={e => handleApplyFooter(e.target.value)} />
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                <button className="find-replace-btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => { setFooterContent('Page 1'); handleApplyFooter('Page 1'); }} title="Insert Page Number">
                  Page 1
                </button>
                <button className="find-replace-btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => { setFooterContent('Page 1 of 1'); handleApplyFooter('Page 1 of 1'); }} title="Insert Page X of Y">
                  Page 1 of 1
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={headerEnabled} onChange={e => setHeaderEnabled(e.target.checked)} />
                  Enable Header
                </label>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={footerEnabled} onChange={e => setFooterEnabled(e.target.checked)} />
                  Enable Footer
                </label>
              </div>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', marginTop: 4 }}>
                <input type="checkbox" checked={differentFirstPage} onChange={e => setDifferentFirstPage(e.target.checked)} />
                Different First Page
              </label>
            </div>
            <div className="find-replace-actions">
              <button className="find-replace-btn" onClick={() => setShowHeaderFooter(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {showGoToPage && (
        <div className="symbol-picker-overlay" onClick={() => setShowGoToPage(false)}>
          <div className="symbol-picker-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 320 }}>
            <div className="find-replace-header">Go To Page</div>
            <div className="find-replace-body" style={{ marginTop: 12 }}>
              <input className="find-replace-input" type="number" min="1" max={pages.length} placeholder={`Enter page number (1-${pages.length})...`}
                value={goToPageInput} autoFocus
                onChange={e => setGoToPageInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { const p = parseInt(goToPageInput); if (p >= 1 && p <= pages.length) { switchToPage(p - 1); setShowGoToPage(false); setGoToPageInput(''); } } }} />
            </div>
            <div className="find-replace-actions">
              <button className="find-replace-btn" onClick={() => setShowGoToPage(false)}>Cancel</button>
              <button className="find-replace-btn find-replace-btn-primary" onClick={() => { const p = parseInt(goToPageInput); if (p >= 1 && p <= pages.length) { switchToPage(p - 1); setShowGoToPage(false); setGoToPageInput(''); } }}>Go To</button>
            </div>
          </div>
        </div>
      )}

      {showInsertUrlDialog && (
        <div className="symbol-picker-overlay" onClick={() => setShowInsertUrlDialog(false)}>
          <div className="symbol-picker-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="find-replace-header">Insert Image from URL</div>
            <div className="find-replace-body" style={{ marginTop: 12 }}>
              <input className="find-replace-input" type="url" placeholder="https://example.com/image.jpg" value={imageUrl} onChange={e => setImageUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleInsertFromUrl(); }} />
            </div>
            <div className="find-replace-actions">
              <button className="find-replace-btn" onClick={() => setShowInsertUrlDialog(false)}>Cancel</button>
              <button className="find-replace-btn find-replace-btn-primary" onClick={handleInsertFromUrl} disabled={!imageUrl}>Insert</button>
            </div>
          </div>
        </div>
      )}

      {showSymbolPicker && (
        <div className="symbol-picker-overlay" onClick={() => setShowSymbolPicker(false)}>
          <div className="symbol-picker-dialog" onClick={e => e.stopPropagation()}>
            <div className="find-replace-header">Insert Symbol</div>
            <div className="symbol-picker-grid">
              {SYMBOLS.map((sym, i) => (
                <button key={i} className="symbol-picker-btn" onClick={() => handleInsertSymbol(sym)} title={sym}>{sym}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showFindReplace && (
        <div className="find-replace-overlay find-replace-centered" onClick={() => setShowFindReplace(false)}>
          <div className="find-replace-dialog" onClick={e => e.stopPropagation()}>
            <div className="find-replace-header">
              <span>Find & Replace</span>
              <button className="find-replace-close-btn" onClick={() => setShowFindReplace(false)} title="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="find-replace-body">
              <div className="find-replace-row">
                <label className="find-replace-label">Find what:</label>
                <input ref={findRef} className="find-replace-input" type="text" placeholder="Enter text to find..." value={findText} onChange={e => setFindText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleFindInCanvas(); }} />
              </div>
              <div className="find-replace-row">
                <label className="find-replace-label">Replace with:</label>
                <input className="find-replace-input" type="text" placeholder="Enter replacement text..." value={replaceText} onChange={e => setReplaceText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleReplaceInCanvas(); }} />
              </div>
            </div>
            <div className="find-replace-actions">
              <button className="find-replace-btn find-replace-btn-primary" onClick={handleFindInCanvas}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                  <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                Find Next
              </button>
              <button className="find-replace-btn" onClick={handleReplaceInCanvas}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                  <polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line>
                </svg>
                Replace All
              </button>
            </div>
          </div>
        </div>
      )}




      </div>

      {!canvasEmpty && pages.length > 0 && (
        <div className="doc-stats-bar">
          <div className="status-section" onClick={() => setShowGoToPage(true)} title="Go to page (Ctrl+G)">
            <span className="status-label">Page</span>
            <span className="status-value">{activePageIndex + 1} of {pages.length}</span>
          </div>
          <div className="status-section">
            <span className="status-value">{wordCount}</span>
            <span className="status-label">words</span>
          </div>
          <div className="status-section">
            <span className="status-value">{charCount}</span>
            <span className="status-label">chars</span>
          </div>
          <div className="status-section">
            <span className="status-value">{columns > 1 ? `${columns} columns` : '1 column'}</span>
          </div>
          <div className="status-section zoom-section">
            <button className="zoom-btn-sm" onClick={() => handleZoom('out')} title="Zoom Out">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <input type="range" className="status-zoom-slider" min="10" max="500" value={Math.round(zoom * 100)}
              onChange={e => handleZoomTo(parseInt(e.target.value) / 100)}
              title="Zoom Level" />
            <span className="status-zoom-value" onClick={() => handleZoomTo(1)} title="Reset to 100%">{Math.round(zoom * 100)}%</span>
            <button className="zoom-btn-sm" onClick={() => handleZoom('in')} title="Zoom In">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          </div>
          <div className="status-section" title="Document Language">
            <span className="status-label">Language</span>
            <span className="status-value">English (US)</span>
          </div>
        </div>
      )}

      {showPreferences && (
        <div className="unsaved-modal-overlay" onClick={() => setShowPreferences(false)}>
          <div className="unsaved-modal" onClick={e => e.stopPropagation()}>
            <h2 className="unsaved-modal-title" style={{ padding: '28px 32px 0' }}>Preferences</h2>
            <div style={{ padding: '16px 32px', minWidth: 360 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>Auto Save (every 30s)</span>
                <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22 }}>
                  <input type="checkbox" checked={autoSaveEnabled} onChange={handleToggleAutoSave} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, background: autoSaveEnabled ? 'var(--accent)' : 'var(--border-color)', borderRadius: 22, transition: '0.3s' }}>
                    <span style={{ position: 'absolute', content: '', height: 18, width: 18, left: autoSaveEnabled ? 20 : 2, bottom: 2, background: 'white', borderRadius: '50%', transition: '0.3s' }} />
                  </span>
                </label>
              </div>
              {recentDocuments.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Recent Documents</div>
                  {recentDocuments.slice(-5).reverse().map((doc, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '4px 0', borderBottom: '1px solid var(--border-light)' }}>
                      {doc}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="unsaved-modal-actions" style={{ padding: '0 32px 24px' }}>
              <button className="unsaved-modal-btn unsaved-modal-btn-primary" onClick={() => setShowPreferences(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showUnsavedModal && (
        <div className="unsaved-modal-overlay" onClick={handleUnsavedCancel}>
          <div
            className="unsaved-modal"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Unsaved changes"
          >
            <h2 className="unsaved-modal-title">Unsaved Changes</h2>
            <p className="unsaved-modal-text">You have unsaved changes. Would you like to save your project before leaving?</p>
            <div className="unsaved-modal-actions">
              <button className="unsaved-modal-btn unsaved-modal-btn-primary" onClick={handleUnsavedSave} autoFocus>
                Save Project
              </button>
              <button className="unsaved-modal-btn unsaved-modal-btn-danger" onClick={handleUnsavedLeave}>
                Leave Without Saving
              </button>
              <button className="unsaved-modal-btn" onClick={handleUnsavedCancel}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveFormat && (
        <div className="unsaved-modal-overlay" onClick={() => setShowSaveFormat(false)}>
          <div
            className="unsaved-modal"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Select format"
          >
            <h2 className="unsaved-modal-title">Save Project As</h2>
            <p className="unsaved-modal-text">Select a format to export your project.</p>
            <div className="save-format-grid">
              {['PNG', 'JPG', 'JPEG', 'SVG', 'PDF', 'JSON', 'DOCX'].map(fmt => (
                <button
                  key={fmt}
                  className={`save-format-btn${selectedFormat === fmt.toLowerCase() ? ' active' : ''}`}
                  onClick={() => handleSaveFormat(fmt.toLowerCase())}
                >
                  {fmt}
                </button>
              ))}
            </div>
            <div className="unsaved-modal-actions" style={{ marginTop: 16 }}>
              <button className="unsaved-modal-btn unsaved-modal-btn-primary" onClick={handleConfirmLeave}>
                Confirm & Leave
              </button>
              <button className="unsaved-modal-btn" onClick={() => setShowSaveFormat(false)}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="unsaved-modal-overlay">
          <div className="unsaved-modal" role="dialog" aria-modal="true" aria-label="Export success">
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <h2 className="unsaved-modal-title" style={{ marginTop: 16 }}>Success!</h2>
              <p className="unsaved-modal-text">Action completed successfully.</p>
            </div>
          </div>
        </div>
      )}

      {showFeedbackDialog && (
        <div className="unsaved-modal-overlay" onClick={() => setShowFeedbackDialog(false)}>
          <div className="unsaved-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Feedback">
            <h2 className="unsaved-modal-title" style={{ padding: '28px 32px 0' }}>Send Feedback</h2>
            <div style={{ padding: '16px 32px' }}>
              <p className="unsaved-modal-text" style={{ marginBottom: 12 }}>We'd love to hear your thoughts! Share your feedback below.</p>
              <textarea
                className="link-dialog-input"
                style={{ minHeight: 120, resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="Describe your feedback, suggestions, or issues..."
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
              />
            </div>
            <div className="unsaved-modal-actions" style={{ padding: '0 32px 24px' }}>
              <button className="unsaved-modal-btn unsaved-modal-btn-primary" onClick={handleFeedbackSubmit} disabled={!feedbackText.trim()}>
                Submit Feedback
              </button>
              <button className="unsaved-modal-btn" onClick={() => setShowFeedbackDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showHelpModal && (
        <div className="unsaved-modal-overlay" onClick={() => setShowHelpModal(false)}>
          <div className="unsaved-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Help">
            <h2 className="unsaved-modal-title" style={{ padding: '28px 32px 0' }}>
              {helpTopic === 'shortcuts' ? 'Keyboard Shortcuts' : helpTopic === 'about' ? 'About Word Doc' : helpTopic === 'version' ? 'Version' : 'Word Doc - Help'}
            </h2>
            <div style={{ padding: '16px 32px', maxHeight: '50vh', overflowY: 'auto' }}>
              {helpTopic === 'about' ? (
                <>
                  <p className="unsaved-modal-text"><strong>Word Doc</strong></p>
                  <p className="unsaved-modal-text" style={{ marginBottom: 16 }}>
                    A browser-based document editor with Word-style pages, local processing, and export support.
                  </p>
                  <p className="unsaved-modal-text" style={{ marginBottom: 16 }}>
                    Version: 1.0.0
                  </p>
                </>
              ) : helpTopic === 'version' ? (
                <p className="unsaved-modal-text">Version 1.0.0</p>
              ) : helpTopic === 'shortcuts' ? (
                <ul style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.8, paddingLeft: 20, marginBottom: 16 }}>
                  <li><strong>Ctrl+N</strong> - New Document</li>
                  <li><strong>Ctrl+O</strong> - Open Document</li>
                  <li><strong>Ctrl+S</strong> - Save Document</li>
                  <li><strong>Ctrl+Shift+S</strong> - Save As</li>
                  <li><strong>Ctrl+F</strong> - Find</li>
                  <li><strong>Ctrl+H</strong> - Find & Replace</li>
                  <li><strong>Ctrl+P</strong> - Print / PDF</li>
                  <li><strong>Ctrl+Z</strong> - Undo</li>
                  <li><strong>Ctrl+Y</strong> - Redo</li>
                  <li><strong>Ctrl+C</strong> - Copy</li>
                  <li><strong>Ctrl+V</strong> - Paste</li>
                  <li><strong>Ctrl+X</strong> - Cut</li>
                  <li><strong>Ctrl+A</strong> - Select All</li>
                  <li><strong>Delete</strong> - Delete selected</li>
                  <li><strong>Escape</strong> - Cancel crop mode</li>
                </ul>
              ) : (
                <>
                  <p className="unsaved-modal-text"><strong>Welcome to Word Doc!</strong></p>
                  <p className="unsaved-modal-text" style={{ marginBottom: 16 }}>
                    Word Doc is a free, browser-based document editor. All processing is done locally in your browser - nothing is uploaded to any server.
                  </p>
                  <p className="unsaved-modal-text" style={{ fontWeight: 600, marginTop: 12 }}>Getting Started</p>
                  <ul style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.8, paddingLeft: 20, marginBottom: 16 }}>
                    <li><strong>Add Images:</strong> Click "Add Image" or drag & drop files onto the canvas</li>
                    <li><strong>Add Text:</strong> Click the "Text" button and start typing</li>
                    <li><strong>Add Shapes:</strong> Choose from various shapes in the Insert tab</li>
                    <li><strong>Multi-Page:</strong> Pages are created automatically when content overflows</li>
                    <li><strong>Navigate Pages:</strong> Use the page sidebar to switch between pages</li>
                    <li><strong>Save Document:</strong> Ctrl+S saves the entire document with all pages</li>
                    <li><strong>Export:</strong> Export as PNG, JPG, SVG, PDF, or DOCX</li>
                  </ul>
                  <p className="unsaved-modal-text" style={{ fontWeight: 600, marginTop: 12 }}>Microsoft Word Integration</p>
                  <ul style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.8, paddingLeft: 20 }}>
                    <li><strong>Copy as Image:</strong> Home &gt; Clipboard &gt; Copy as Image - paste directly into Word</li>
                    <li><strong>Export as .docx:</strong> Export &gt; Word (.docx) - generates a Word document with your design</li>
                  </ul>
                </>
              )}
            </div>
            <div className="unsaved-modal-actions" style={{ padding: '0 32px 24px' }}>
              <button className="unsaved-modal-btn unsaved-modal-btn-primary" onClick={() => setShowHelpModal(false)}>Got It</button>
            </div>
          </div>
        </div>
      )}

      {showCommentsPanel && (
        <div className="comments-panel">
          <div className="comments-panel-header">
            <span className="comments-panel-title">Comments</span>
            <button className="comments-panel-close" onClick={() => setShowCommentsPanel(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div className="comments-panel-list">
            {comments.length === 0 ? (
              <div className="comments-panel-empty">No comments yet</div>
            ) : (
              comments.map(comment => (
                <div key={comment.id} className={`comment-item${comment.resolved ? ' resolved' : ''}`}>
                  <div className="comment-header">
                    <span className="comment-author">{comment.author}</span>
                    <span className="comment-time">{new Date(comment.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="comment-text">{comment.text}</div>
                  <div className="comment-actions">
                    {!comment.resolved && (
                      <button className="comment-action-btn" onClick={() => handleResolveComment(comment.id)}>Resolve</button>
                    )}
                    <button className="comment-action-btn danger" onClick={() => handleDeleteComment(comment.id)}>Delete</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Editor;
