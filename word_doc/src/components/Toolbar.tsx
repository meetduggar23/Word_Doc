import React, { useState, useRef, useEffect, useCallback } from 'react';

const CROP_RATIOS = ['free', '1:1', '4:3', '16:9', '3:2', 'original'];
const MARGIN_PRESETS: Record<string, { t: number; b: number; l: number; r: number }> = {
  normal: { t: 96, b: 96, l: 96, r: 96 },
  narrow: { t: 48, b: 48, l: 48, r: 48 },
  moderate: { t: 96, b: 96, l: 72, r: 72 },
  wide: { t: 96, b: 96, l: 192, r: 192 },
  mirrored: { t: 96, b: 96, l: 96, r: 96 },
};
const AVAILABLE_FONTS = [
  'Inter, sans-serif', 'Arial', 'Helvetica', 'Times New Roman', 'Georgia',
  'Verdana', 'Tahoma', 'Courier New', 'Trebuchet MS',
];
const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72];

const STYLES = [
  { id: 'normal', name: 'Normal', preview: { text: 'Aa', fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: '#1e293b', spacing: '1.15' }, desc: 'Body text' },
  { id: 'no-spacing', name: 'No Spacing', preview: { text: 'Aa', fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: '#1e293b', spacing: '1' }, desc: 'No paragraph spacing' },
  { id: 'heading1', name: 'Heading 1', preview: { text: 'Aa', fontSize: 22, fontWeight: 700, fontFamily: 'Inter, sans-serif', color: '#1e293b', spacing: '1' }, desc: 'Section heading' },
  { id: 'heading2', name: 'Heading 2', preview: { text: 'Aa', fontSize: 19, fontWeight: 700, fontFamily: 'Inter, sans-serif', color: '#1e293b', spacing: '1' }, desc: 'Subsection heading' },
  { id: 'heading3', name: 'Heading 3', preview: { text: 'Aa', fontSize: 17, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: '#1e293b', spacing: '1' }, desc: 'Sub-subsection heading' },
  { id: 'heading4', name: 'Heading 4', preview: { text: 'Aa', fontSize: 15, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: '#1e293b', spacing: '1' }, desc: 'Sub-subsection heading' },
  { id: 'heading5', name: 'Heading 5', preview: { text: 'Aa', fontSize: 14, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: '#1e293b', spacing: '1' }, desc: 'Sub-subsection heading' },
  { id: 'heading6', name: 'Heading 6', preview: { text: 'Aa', fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: '#1e293b', spacing: '1' }, desc: 'Sub-subsection heading' },
  { id: 'title', name: 'Title', preview: { text: 'Aa', fontSize: 24, fontWeight: 700, fontFamily: 'Georgia, serif', color: '#1e293b', spacing: '1' }, desc: 'Document title' },
  { id: 'subtitle', name: 'Subtitle', preview: { text: 'Aa', fontSize: 16, fontWeight: 500, fontFamily: 'Inter, sans-serif', color: '#6b7280', spacing: '1' }, desc: 'Document subtitle' },
  { id: 'quote', name: 'Quote', preview: { text: 'Aa', fontSize: 15, fontWeight: 400, fontStyle: 'italic', fontFamily: 'Georgia, serif', color: '#6b7280', spacing: '1' }, desc: 'Block quote' },
  { id: 'intense-quote', name: 'Intense Quote', preview: { text: 'Aa', fontSize: 16, fontWeight: 700, fontStyle: 'italic', fontFamily: 'Georgia, serif', color: '#1f2937', spacing: '1' }, desc: 'Emphasized quote' },
  { id: 'code', name: 'Code', preview: { text: 'Aa', fontSize: 12, fontWeight: 400, fontFamily: '"Courier New", monospace', color: '#e11d48', spacing: '1' }, desc: 'Code snippet' },
  { id: 'caption', name: 'Caption', preview: { text: 'Aa', fontSize: 10, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: '#9ca3af', spacing: '1' }, desc: 'Image caption' },
];

interface ToolbarProps {
  onAddText: () => void;
  onAddImage: () => void;
  onAddShape: (shape: string) => void;
  isTextSelected: boolean;
  isImageSelected: boolean;
  isCropMode: boolean;
  isShapeSelected: boolean;

  currentFont: string;
  onFontChange: (font: string) => void;
  currentFontSize: number;
  onFontSizeChange: (size: number) => void;
  currentTextColor: string;
  onTextColorChange: (color: string) => void;
  isBold: boolean;
  onBold: () => void;
  isItalic: boolean;
  onItalic: () => void;
  isUnderline: boolean;
  onUnderline: () => void;
  currentTextAlign: string;
  onTextAlign: (align: string) => void;
  currentShapeColor: string;
  onShapeColorChange: (color: string) => void;
  currentFilter: string;
  onApplyFilter: (filter: string) => void;

  onCrop: () => void;
  onCropApply: () => void;
  onCropCancel: () => void;
  onCropRatio: (ratio: string) => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onSetAspectRatio: (ratio: string) => void;
  onReplaceImage: () => void;

  onToggleRibbon: () => void;
  onSetLayout: (preset: string) => void;
  onSetCustomSize: (w: number, h: number) => void;
  onSetMargins: (preset: string) => void;
  onOpenCustomMarginsDialog?: () => void;
  onOpenCustomSizeDialog?: () => void;
  onSetPageLayoutUnit?: (unit: 'cm' | 'in') => void;
  onSetLineNumbers?: (mode: 'none' | 'continuous' | 'restart-page' | 'restart-section') => void;
  onSetHyphenation?: (mode: 'none' | 'automatic' | 'manual') => void;
  onInsertBreak?: (kind: 'page' | 'column' | 'section-next' | 'continuous' | 'odd' | 'even') => void;
  onToggleSelectionPane?: () => void;
  onBringForward?: () => void;
  onSendBackward?: () => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
  onGroup?: () => void;
  onUngroup?: () => void;
  onRotate?: () => void;
  onAlignToPage?: () => void;
  onAlign?: (dir: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onDistribute?: () => void;
  onParagraphSpacing?: (before: number, after: number) => void;
  layoutPreset: string;
  marginPreset: string;
  customSize: { w: number; h: number };

  onContactSupport: () => void;
  onDocumentation?: () => void;
  onGitHubRepository?: () => void;
  onReportIssue?: () => void;
  onCheckForUpdates?: () => void;
  onFeedback: () => void;
  onShowTraining: () => void;
  onShowHelpTopic?: (topic: 'guide' | 'shortcuts' | 'about' | 'version') => void;
  onZoom: (dir: string) => void;
  onApplyListType: (type: 'none' | 'bullet' | 'number' | 'multi-level') => void;
  onApplyStyle: (style: string) => void;
  currentStyle?: string;
  onIndent: (dir: 'in' | 'out') => void;
  onSetPageBackground: (color: string) => void;
  pageBackgroundColor: string;
  onToggleHeaderFooter: () => void;
  onImageTransparency: (value: number) => void;
  onImageBorder: (color: string, width: number) => void;
  onImageShadow: (enabled: boolean) => void;
  imageTransparency: number;
  imageShadowEnabled: boolean;
  onTogglePreferences?: () => void;
  onPrint: () => void;
  onSetColumns: (n: number) => void;
  onToggleCommentsPanel: () => void;
  onAddComment: () => void;
  commentText: string;
  onCommentTextChange: (text: string) => void;
  commentsCount: number;
  onSuperscript: () => void;
  onSubscript: () => void;
  onHighlight: (color: string) => void;
  onImageWrap: (mode: 'inline' | 'square' | 'tight' | 'behind' | 'front') => void;
  onTogglePageBorder?: () => void;
  onPageBreak?: () => void;
  onShapeGradient: (color1: string, color2: string) => void;
  onInsertPageNumber: () => void;
  onInsertDate: () => void;
  onInsertTime: () => void;
  onInsertBlankPage: () => void;
  onInsertFromUrl: () => void;
  onToggleSymbolPicker: () => void;
  onToggleOrientation: () => void;
  onToggleFocusMode: () => void;
  onToggleNavPane: () => void;
  onStrikethrough: () => void;
  onClearFormatting: () => void;
  onIncreaseFontSize: () => void;
  onDecreaseFontSize: () => void;
  showFormatting: boolean;
  onToggleShowFormatting: () => void;
  onFindReplace?: () => void;
  onSelectAll?: () => void;
  onCut: () => void;
  onCopy: () => void;
  onCopyAsImage?: () => void;
  onFormatPainter?: never;
  onPaste: () => void;
  onLineSpacing: (spacing: number) => void;
  onHyperlink: () => void;
  onSave: () => void;
  onOpen: () => void;
  onNew: () => void;
  onTextDirection: (dir: 'ltr' | 'rtl') => void;
  onTogglePageThumbnails?: () => void;
  onToggleRuler?: () => void;
  onToggleGridlines?: () => void;
  onToggleFullScreen?: () => void;
  lineNumbersMode?: string;
  hyphenationMode?: string;
  orientation?: string;
}

const Toolbar: React.FC<ToolbarProps> = ({
  onAddText, onAddImage, onAddShape,
  isTextSelected, isImageSelected, isShapeSelected, isCropMode, currentFont, onFontChange, currentFontSize, onFontSizeChange,
  onCrop, onCropApply, onCropCancel, onCropRatio,
  onRotateLeft, onRotateRight, onFlipH, onFlipV,
  onSetAspectRatio,
  onReplaceImage,
  onToggleRibbon,
  onSetLayout, onSetCustomSize, onSetMargins,
  onOpenCustomMarginsDialog, onOpenCustomSizeDialog, onSetPageLayoutUnit,
  onSetLineNumbers, onSetHyphenation, onInsertBreak,
  onToggleSelectionPane, onBringForward, onSendBackward, onBringToFront, onSendToBack,
  onGroup, onUngroup, onRotate, onAlignToPage, onAlign, onDistribute, onParagraphSpacing,
  layoutPreset, marginPreset, customSize,
  currentTextColor, onTextColorChange,
  isBold, onBold, isItalic, onItalic, isUnderline, onUnderline,
  currentShapeColor, onShapeColorChange,
  currentFilter, onApplyFilter,
  onContactSupport, onFeedback, onShowTraining, onShowHelpTopic, onZoom,
  onDocumentation, onGitHubRepository, onReportIssue, onCheckForUpdates,
  onApplyListType, onApplyStyle, onIndent, onSetPageBackground, pageBackgroundColor,
  onToggleHeaderFooter,
  onImageTransparency, onImageBorder, onImageShadow, imageTransparency, imageShadowEnabled,
  onTogglePreferences, onPrint, onSetColumns,
  onToggleCommentsPanel, onAddComment, commentText, onCommentTextChange, commentsCount,
  onSuperscript, onSubscript, onHighlight, onImageWrap,
  onTogglePageBorder, onPageBreak, onShapeGradient,
  onInsertPageNumber, onInsertDate, onInsertTime, onInsertBlankPage, onInsertFromUrl, onToggleSymbolPicker, onToggleOrientation,
  onToggleFocusMode, onToggleNavPane,
  onTextAlign, currentTextAlign,
  onStrikethrough, onClearFormatting,
  showFormatting, onToggleShowFormatting, onFindReplace, onSelectAll,
  onLineSpacing, onHyperlink,
  onCut, onCopy, onCopyAsImage, onPaste, onIncreaseFontSize, onDecreaseFontSize,
  onTogglePageThumbnails, onToggleRuler, onToggleGridlines, onToggleFullScreen,
  currentStyle, lineNumbersMode, hyphenationMode, orientation,
}) => {
  const [activeTab, setActiveTab] = useState('home');
  const [showLayout, setShowLayout] = useState(false);
  const [layoutPos, setLayoutPos] = useState<DropdownPos | null>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [showShape, setShowShape] = useState(false);
  const [showMoreStyles, setShowMoreStyles] = useState(false);
  const [ribbonWidth, setRibbonWidth] = useState(0);
  const ribbonContentRef = useRef<HTMLDivElement>(null);
  const [showMoreGroups, setShowMoreGroups] = useState(false);
  const moreGroupsRef = useRef<HTMLDivElement>(null);
  const [moreGroupsPos, setMoreGroupsPos] = useState<DropdownPos | null>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const scrollGallery = useCallback((dir: 'left' | 'right') => {
    if (!galleryRef.current) return;
    const amount = 120;
    galleryRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  }, []);
  const updateGalleryScrollState = useCallback(() => {
    const el = galleryRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  const [showAspectRatio, setShowAspectRatio] = useState(false);
  const [showImageDropdown, setShowImageDropdown] = useState(false);
  const [showFontSize, setShowFontSize] = useState(false);
  const [listType, setListType] = useState<'none' | 'bullet' | 'number' | 'multi-level'>('none');
  const [lineSpacing, setLineSpacing] = useState(1.15);
  const shapeRef = useRef<HTMLDivElement>(null);
  const aspectRatioRef = useRef<HTMLDivElement>(null);
  const imageDropdownRef = useRef<HTMLDivElement>(null);
  const moreStylesRef = useRef<HTMLDivElement>(null);

  const hoverTimer = useRef<number | null>(null);
  const clearHover = () => { if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; } };

  interface DropdownPos { top: number; left: number; upward: boolean; }
  const [shapePos, setShapePos] = useState<DropdownPos | null>(null);
  const [aspectRatioPos, setAspectRatioPos] = useState<DropdownPos | null>(null);
  const [imageDropdownPos, setImageDropdownPos] = useState<DropdownPos | null>(null);
  const [fontSizePos, setFontSizePos] = useState<DropdownPos | null>(null);
  const [moreStylesPos, setMoreStylesPos] = useState<DropdownPos | null>(null);
  const fontSizeRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [showWrap, setShowWrap] = useState(false);
  const [wrapPos, setWrapPos] = useState<DropdownPos | null>(null);
  const hasArrangeSelection = isImageSelected || isShapeSelected;

  const calcPos = (ref: React.RefObject<HTMLDivElement | null>, width: number, alignRight = false): DropdownPos | null => {
    if (!ref.current) return null;
    const btn = ref.current.querySelector('button');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const estH = 300;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const upward = spaceBelow < estH && r.top > estH + 8;
    const left = alignRight
      ? Math.max(8, r.right - width)
      : Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const top = upward ? Math.max(4, r.top - estH - 4) : r.bottom + 4;
    return { top, left, upward };
  };

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownPosArr, setDropdownPosArr] = useState<DropdownPos | null>(null);
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleDropdown = useCallback((name: string, ref: React.RefObject<HTMLDivElement | null>, width: number) => {
    if (openDropdown === name) {
      setOpenDropdown(null);
      setDropdownPosArr(null);
      return;
    }
    if (!ref.current) return;
    const btn = ref.current.querySelector('button');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const estH = 300;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const upward = spaceBelow < estH && r.top > estH + 8;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const top = upward ? Math.max(4, r.top - estH - 4) : r.bottom + 4;
    setDropdownPosArr({ top, left, upward });
    setOpenDropdown(name);
  }, [openDropdown]);

  const closeDropdown = useCallback(() => {
    setOpenDropdown(null);
    setDropdownPosArr(null);
  }, []);

  const closeLayoutMenu = () => {
    setShowLayout(false);
    setLayoutPos(null);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (shapeRef.current && !shapeRef.current.contains(e.target as Node)) { setShowShape(false); setShapePos(null); }
      if (aspectRatioRef.current && !aspectRatioRef.current.contains(e.target as Node)) { setShowAspectRatio(false); setAspectRatioPos(null); }
      if (imageDropdownRef.current && !imageDropdownRef.current.contains(e.target as Node)) { setShowImageDropdown(false); setImageDropdownPos(null); }
      if (fontSizeRef.current && !fontSizeRef.current.contains(e.target as Node)) { setShowFontSize(false); setFontSizePos(null); }
      if (layoutRef.current && !layoutRef.current.contains(e.target as Node)) { setShowLayout(false); setLayoutPos(null); }
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setShowWrap(false); setWrapPos(null); }
      if (moreStylesRef.current && !moreStylesRef.current.contains(e.target as Node)) { setShowMoreStyles(false); setMoreStylesPos(null); }
      if (moreGroupsRef.current && !moreGroupsRef.current.contains(e.target as Node)) { setShowMoreGroups(false); setMoreGroupsPos(null); }
      if (openDropdown) {
        const container = dropdownRefs.current[openDropdown];
        if (container && !container.contains(e.target as Node)) {
          setOpenDropdown(null);
          setDropdownPosArr(null);
        }
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [openDropdown]);

  useEffect(() => {
    const el = ribbonContentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setRibbonWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const collapseThreshold = 880;
  const showCollapsed = ribbonWidth > 0 && ribbonWidth < collapseThreshold;

  const shapes = [
    { id: 'rect', label: 'Rectangle', d: 'M4 4h16v16H4z' },
    { id: 'rounded-rect', label: 'Rounded Rect', d: 'M4 8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z' },
    { id: 'circle', label: 'Circle', d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z' },
    { id: 'ellipse', label: 'Ellipse', d: 'M12 4c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8z' },
    { id: 'triangle', label: 'Triangle', d: 'M12 2L2 22h20z' },
    { id: 'diamond', label: 'Diamond', d: 'M12 2L22 12l-10 10L2 12z' },
    { id: 'pentagon', label: 'Pentagon', d: 'M12 2l10.4 7.6-4 12.4H5.6l-4-12.4z' },
    { id: 'hexagon', label: 'Hexagon', d: 'M12 2l9.5 5.5v11L12 24l-9.5-5.5v-11z' },
    { id: 'star', label: 'Star', d: 'M12 2l1.8 5.6h5.8l-4.7 3.4 1.8 5.6L12 13.2l-4.7 3.4 1.8-5.6L4.4 7.6h5.8z' },
    { id: 'arrow', label: 'Arrow', d: 'M5 12h14m-6-6l6 6-6 6' },
    { id: 'line', label: 'Line', d: 'M4 20L20 4' },
    { id: 'heart', label: 'Heart', d: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z' },
    { id: 'speech-bubble', label: 'Bubble', d: 'M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z' },
    { id: 'cloud', label: 'Cloud', d: 'M4 14.5a4.5 4.5 0 1 1 3.5-7.97A6 6 0 0 1 18 11.5a4 4 0 0 1-1 7.5H8a5 5 0 0 1-4-4.5z' },
    { id: 'cross', label: 'Cross', d: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z' },
    { id: 'pentagram-star', label: 'Pentagram Star', d: 'M12 2l1.5 4.6h4.9l-4 2.9 1.5 4.6L12 11.2l-4 2.9 1.5-4.6-4-2.9h4.9z' },
    { id: 'octagon', label: 'Octagon', d: 'M7.5 3h9L21 7.5v9L16.5 21h-9L3 16.5v-9z' },
  ];

  const filters = [
    { id: 'none', label: 'None' },
    { id: 'grayscale', label: 'Grayscale' },
    { id: 'sepia', label: 'Sepia' },
    { id: 'blur', label: 'Blur' },
    { id: 'brightness', label: 'Brightness' },
    { id: 'contrast', label: 'Contrast' },
  ];

  const TABS: { id: string; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'insert', label: 'Insert' },
    { id: 'layout', label: 'Layout' },
    { id: 'view', label: 'View' },
    { id: 'review', label: 'Review' },
    { id: 'help', label: 'Help' },
  ];

  type TabId = 'home' | 'insert' | 'layout' | 'view' | 'review' | 'help';

  const [spacingLeft, setSpacingLeft] = useState(0);
  const [spacingRight, setSpacingRight] = useState(0);
  const [spacingBefore, setSpacingBefore] = useState(0);
  const [spacingAfter, setSpacingAfter] = useState(0);

  void spacingLeft; void spacingRight; void spacingBefore; void spacingAfter; void setSpacingLeft; void setSpacingRight; void setSpacingBefore; void setSpacingAfter;
  void FONT_SIZES; void showFontSize; void fontSizePos;
  void isTextSelected;
  void onOpenCustomMarginsDialog; void onOpenCustomSizeDialog; void onSetPageLayoutUnit; void onSetLineNumbers; void onSetHyphenation; void onInsertBreak;
  void onToggleSelectionPane; void onBringForward; void onSendBackward; void onBringToFront; void onSendToBack; void onGroup; void onUngroup; void onRotate; void onAlignToPage; void onAlign; void onDistribute; void onParagraphSpacing;
  void showLayout; void layoutPos; void closeLayoutMenu; void showWrap; void wrapPos; void showAspectRatio; void aspectRatioPos; void showImageDropdown; void imageDropdownPos;
  void onCrop; void onRotateRight; void onSetAspectRatio; void onReplaceImage;
  void currentShapeColor; void onShapeColorChange; void currentFilter; void onApplyFilter;
  void onImageTransparency; void onImageBorder; void onImageShadow; void imageTransparency; void imageShadowEnabled;
  void onSetColumns; void onTogglePageBorder; void onShapeGradient; void filters;

  const exec = (cmd: string, val?: string) => {
    const editor = document.querySelector('[data-page-editor="true"]') as HTMLElement;
    if (!editor) return;
    editor.focus();
    document.execCommand(cmd, false, val ?? '');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const handleChangeCase = () => {
    const editor = document.querySelector('[data-page-editor="true"]') as HTMLElement;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return;
    const text = sel.toString();
    if (!text) return;
    const isUpper = text === text.toUpperCase() && text !== text.toLowerCase();
    const isLower = text === text.toLowerCase() && text !== text.toUpperCase();
    let newText: string;
    if (isUpper) newText = text.toLowerCase();
    else if (isLower) newText = text.replace(/\b\w/g, c => c.toUpperCase());
    else newText = text.toUpperCase();
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(newText));
    sel.removeAllRanges();
    sel.addRange(range);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const handleSort = () => {
    const editor = document.querySelector('[data-page-editor="true"]') as HTMLElement;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const text = sel.toString();
    if (!text) return;
    const lines = text.split('\n').filter(l => l.trim()).sort();
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(lines.join('\n')));
    sel.removeAllRanges();
    sel.addRange(range);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const handleBorders = () => {
    const sel = window.getSelection();
    const editor = document.querySelector('[data-page-editor="true"]') as HTMLElement;
    if (editor && document.activeElement === editor && sel && !sel.isCollapsed) {
      document.execCommand('insertHTML', false, `<span style="border:1px solid #1e293b;padding:2px 4px;">${sel.toString()}</span>`);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const active = document.querySelector('.canvas-container .active');
    if (active) {
      (active as HTMLElement).style.outline = '2px solid #4a6cf7';
    }
  };

  return (
    <div className="ribbon-toolbar">
      <div className="ribbon-tab-bar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`ribbon-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <div className="ribbon-spacer" />
        <button className="toolbar-btn ribbon-toggle-btn" onClick={onToggleRibbon} title="Hide Ribbon">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
      </div>

      {isCropMode ? (
        <div className="ribbon-content">
          <div className="fluent-group">
            <div className="fluent-group-items">
              <button className="fluent-btn primary" onClick={onCropApply} title="Apply Crop">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span className="fluent-btn-label">Apply</span>
              </button>
              <button className="fluent-btn" onClick={onCropCancel} title="Cancel Crop">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                <span className="fluent-btn-label">Cancel</span>
              </button>
            </div>
            <div className="fluent-group-label">Crop</div>
          </div>
          <div className="fluent-divider" />
          <div className="fluent-group">
            <div className="fluent-group-items">
              {CROP_RATIOS.map(r => (
                <button key={r} className="fluent-btn" onClick={() => onCropRatio(r)} title={r === 'free' ? 'Free Crop' : r}>
                  <span className="fluent-btn-label">{r === 'free' ? 'Free' : r}</span>
                </button>
              ))}
            </div>
            <div className="fluent-group-label">Ratio</div>
          </div>
        </div>
      ) : (
        <div className="ribbon-content" ref={ribbonContentRef}>
          {(activeTab as TabId) === 'home' && (
            <>
              {/* Clipboard Group */}
              <div className="fluent-group group-clipboard">
                <div className="fluent-group-inner">
                  <div className="fluent-row" style={{ justifyContent: 'center' }}>
                    <button className="fluent-btn with-icon" onClick={onPaste} title="Paste (Ctrl+V)" style={{ minWidth: 56, minHeight: 48, padding: '2px 8px' }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 8 22 13 17 18"/>
                      </svg>
                      <span className="fluent-btn-label">Paste</span>
                    </button>
                  </div>
                  <div className="fluent-row" style={{ justifyContent: 'center', gap: 4 }}>
                    <button className="fluent-icon-btn" onClick={onCut} title="Cut (Ctrl+X)" style={{ width: 30, height: 26 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="23" y1="6" x2="11" y2="18"/><path d="M21 4a3 3 0 1 0-5.5 2.5"/><path d="M3 20a3 3 0 1 0 5.5-2.5"/>
                      </svg>
                    </button>
                    <button className="fluent-icon-btn" onClick={onCopy} title="Copy (Ctrl+C)" style={{ width: 30, height: 26 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                      </svg>
                    </button>
<button className="fluent-icon-btn" onClick={onCopyAsImage} title="Copy as Image" style={{ width: 30, height: 26 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="fluent-group-label">Clipboard</div>
              </div>
              <div className="fluent-divider" />

              {/* Font Group - 2 Rows */}
              <div className="fluent-group group-font">
                <div className="fluent-group-inner">
                  <div className="fluent-row">
                    <select className="fluent-font-select" value={currentFont} onChange={e => onFontChange(e.target.value)} title="Font Family">
                      {AVAILABLE_FONTS.map(f => (
                        <option key={f} value={f}>{f.split(',')[0]}</option>
                      ))}
                    </select>
                    <div className="fluent-font-size-wrap">
                      <input type="number" className="fluent-font-size" value={currentFontSize}
                        onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) onFontSizeChange(v); }}
                        onWheel={e => { e.preventDefault(); const d = e.deltaY > 0 ? -1 : 1; onFontSizeChange(Math.max(1, Math.min(999, currentFontSize + d))); }}
                        onKeyDown={e => { if (e.key === 'ArrowUp') { e.preventDefault(); onFontSizeChange(Math.min(999, currentFontSize + 1)); } if (e.key === 'ArrowDown') { e.preventDefault(); onFontSizeChange(Math.max(1, currentFontSize - 1)); } }} />
                    </div>
                    <button className="fluent-icon-btn" onClick={onIncreaseFontSize} title="Increase Font Size">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="12 5 12 19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                    </button>
                    <button className="fluent-icon-btn" onClick={onDecreaseFontSize} title="Decrease Font Size">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                    </button>
                    <div className="fluent-separator" />
                    <button className="fluent-icon-btn" onClick={handleChangeCase} title="Change Case">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <text x="3" y="14" fontSize="10" fontWeight="bold" fill="currentColor">Aa</text><polyline points="17 8 22 13 17 18"/>
                      </svg>
                    </button>
                    <button className="fluent-icon-btn" onClick={onClearFormatting} title="Clear Formatting">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 3h10l-2 7h4l-7 14M3 3l18 18"/>
                      </svg>
                    </button>
                  </div>
                  <div className="fluent-row">
                    <button className={`fluent-icon-btn${isBold ? ' active' : ''}`} onClick={onBold} title="Bold (Ctrl+B)">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
                      </svg>
                    </button>
                    <button className={`fluent-icon-btn${isItalic ? ' active' : ''}`} onClick={onItalic} title="Italic (Ctrl+I)">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>
                      </svg>
                    </button>
                    <button className={`fluent-icon-btn${isUnderline ? ' active' : ''}`} onClick={onUnderline} title="Underline (Ctrl+U)">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/>
                      </svg>
                    </button>
                    <button className="fluent-icon-btn" onClick={onStrikethrough} title="Strikethrough">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.3 4.9c-2.3-.6-4.5-1.1-7-1-3.4.1-6.2 1.7-6.3 4.8 0 2.2 1.3 3.7 3.3 4.5"/><path d="M8.7 19.1c2.3.6 4.5 1.1 7 1 3.4-.1 6.2-1.7 6.3-4.8 0-.9-.2-1.7-.6-2.3"/><line x1="3" y1="12" x2="21" y2="12"/>
                      </svg>
                    </button>
                    <div className="fluent-separator" />
                    <button className={`fluent-icon-btn`} onClick={onSubscript} title="Subscript">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 3 6 15 12 15"/><polyline points="18 3 18 15 12 15"/><line x1="4" y1="21" x2="20" y2="21"/>
                      </svg>
                    </button>
                    <button className={`fluent-icon-btn`} onClick={onSuperscript} title="Superscript">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 3 6 15 12 15"/><polyline points="18 3 18 15 12 15"/><line x1="4" y1="3" x2="20" y2="3"/>
                      </svg>
                    </button>
                    <div className="fluent-separator" />
                    <div className="fluent-color-btn" title="Text Highlight Color" style={{ padding: '1px 2px' }}>
                      <input type="color" className="fluent-color-swatch" value="#ffff00" onChange={e => onHighlight(e.target.value)} style={{ width: 20, height: 20 }} />
                      <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                    <div className="fluent-color-btn" title="Font Color" style={{ padding: '1px 2px' }}>
                      <input type="color" className="fluent-color-swatch" value={currentTextColor} onChange={e => onTextColorChange(e.target.value)} style={{ width: 20, height: 20 }} />
                      <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                  </div>
                </div>
                <div className="fluent-group-label">Font</div>
              </div>
              <div className="fluent-divider" />

              {/* Paragraph Group - 2 Rows */}
              <div className="fluent-group group-paragraph">
                <div className="fluent-group-inner">
                  <div className="fluent-row">
                    <button className={`fluent-icon-btn${listType === 'bullet' ? ' active' : ''}`} onClick={() => { const t = listType === 'bullet' ? 'none' : 'bullet'; setListType(t); onApplyListType(t); }} title="Bullet List">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/></svg>
                    </button>
                    <button className={`fluent-icon-btn${listType === 'number' ? ' active' : ''}`} onClick={() => { const t = listType === 'number' ? 'none' : 'number'; setListType(t); onApplyListType(t); }} title="Numbered List">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="10" fontSize="8" fontWeight="bold" fill="currentColor">1</text><text x="2" y="16" fontSize="8" fontWeight="bold" fill="currentColor">2</text><text x="2" y="22" fontSize="8" fontWeight="bold" fill="currentColor">3</text></svg>
                    </button>
                    <button className={`fluent-icon-btn${listType === 'multi-level' ? ' active' : ''}`} onClick={() => { const t = listType === 'multi-level' ? 'none' : 'multi-level'; setListType(t); onApplyListType(t); }} title="Multilevel List">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="14" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="10" fontSize="6" fontWeight="bold" fill="currentColor">1.</text><text x="6" y="16" fontSize="6" fontWeight="bold" fill="currentColor">a.</text><text x="2" y="22" fontSize="6" fontWeight="bold" fill="currentColor">i.</text></svg>
                    </button>
                    <div className="fluent-separator" />
                    <button className="fluent-icon-btn" onClick={() => onIndent('out')} title="Decrease Indent">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 8 8 12 4 16"/><line x1="10" y1="12" x2="20" y2="12"/></svg>
                    </button>
                    <button className="fluent-icon-btn" onClick={() => onIndent('in')} title="Increase Indent">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 8 16 12 20 16"/><line x1="4" y1="12" x2="14" y2="12"/></svg>
                    </button>
                    <div className="fluent-separator" />
                    <button className="fluent-icon-btn" onClick={handleSort} title="Sort">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><polyline points="4 8 2 10 6 10"/><polyline points="4 14 2 12 6 12"/></svg>
                    </button>
                    <button className={`fluent-icon-btn${showFormatting ? ' active' : ''}`} onClick={onToggleShowFormatting} title="Show/Hide Formatting Marks (¶)">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                    </button>
                  </div>
                  <div className="fluent-row">
                    <div className="fluent-align-group">
                      <button className={`fluent-icon-btn${currentTextAlign === 'left' ? ' active' : ''}`} onClick={() => onTextAlign?.('left')} title="Align Left">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="15" y2="6"/><line x1="3" y1="10" x2="19" y2="10"/><line x1="3" y1="14" x2="17" y2="14"/><line x1="3" y1="18" x2="13" y2="18"/></svg>
                      </button>
                      <button className={`fluent-icon-btn${currentTextAlign === 'center' ? ' active' : ''}`} onClick={() => onTextAlign?.('center')} title="Align Center">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="6" x2="19" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="5" y1="14" x2="19" y2="14"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
                      </button>
                      <button className={`fluent-icon-btn${currentTextAlign === 'right' ? ' active' : ''}`} onClick={() => onTextAlign?.('right')} title="Align Right">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="9" y1="6" x2="21" y2="6"/><line x1="5" y1="10" x2="21" y2="10"/><line x1="7" y1="14" x2="21" y2="14"/><line x1="11" y1="18" x2="21" y2="18"/></svg>
                      </button>
                      <button className={`fluent-icon-btn${currentTextAlign === 'justify' ? ' active' : ''}`} onClick={() => onTextAlign?.('justify')} title="Justify">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                      </button>
                    </div>
                    <div className="fluent-separator" />
                    <div className="fluent-dropdown-container" style={{ position: 'relative', display: 'inline-flex' }}>
                      <button className="fluent-icon-btn" onClick={() => { const vals = [1, 1.15, 1.5, 2, 2.5, 3]; const next = vals[(vals.indexOf(lineSpacing) + 1) % vals.length]; setLineSpacing(next); onLineSpacing(next); }} title="Line Spacing">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="4" y1="6" x2="4" y2="18"/><polyline points="2 8 4 6 6 8"/><polyline points="2 16 4 18 6 16"/></svg>
                      </button>
                    </div>
                    <div className="fluent-color-btn" title="Shading Color" style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 2px' }}>
                      <input type="color" className="fluent-color-swatch" value="#ffffff" onChange={e => exec('backColor', e.target.value)} style={{ width: 20, height: 20 }} />
                    </div>
                    <button className="fluent-icon-btn" onClick={handleBorders} title="Borders">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                    </button>
                  </div>
                </div>
                <div className="fluent-group-label">Paragraph</div>
              </div>
              <div className="fluent-divider" />

              {/* Styles Gallery - Microsoft Word Style (120×60px cards) */}
              <div className="fluent-group group-styles">
                <div className="fluent-group-inner" style={{ flex: 1 }}>
                  <div className="fluent-row" style={{ flex: 1, height: '100%' }}>
                    <div className="styles-gallery-wrap" style={{ width: 'auto', flex: 1, maxWidth: 640 }}>
                      <button className="styles-gallery-scroll-btn" onClick={() => { scrollGallery('left'); setTimeout(updateGalleryScrollState, 200); }}
                        style={{ opacity: canScrollLeft ? 1 : 0.2, pointerEvents: canScrollLeft ? 'auto' : 'none', height: 60 }} title="Scroll styles left">
                        <svg width="6" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6"></polyline></svg>
                      </button>
                      <div className="styles-gallery" ref={galleryRef} onScroll={updateGalleryScrollState}>
                        {STYLES.slice(0, 5).map(s => (
                          <button key={s.id} className={`style-card${currentStyle === s.id ? ' active' : ''}`}
                            onClick={() => onApplyStyle(s.id)} title={`${s.name} - ${s.desc}`}>
                            <span className="style-card-preview" style={{
                              fontSize: s.preview.fontSize, fontWeight: s.preview.fontWeight,
                              fontFamily: s.preview.fontFamily, color: s.preview.color,
                              fontStyle: s.preview.fontStyle || 'normal',
                              letterSpacing: s.preview.spacing === '1' ? 'normal' : '0.02em',
                            }}>{s.preview.text}</span>
                            <span className="style-card-name">{s.name}</span>
                          </button>
                        ))}
                        <div ref={moreStylesRef} className="style-more-wrap">
                          <button className="style-more-btn" onClick={() => {
                            if (showMoreStyles) { setShowMoreStyles(false); setMoreStylesPos(null); }
                            else { const p = calcPos(moreStylesRef, 200); if (p) { setMoreStylesPos(p); setShowMoreStyles(true); } }
                          }} title="More Styles" style={{ height: 60 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"></polyline></svg>
                          </button>
                          {showMoreStyles && moreStylesPos && (
                            <div className={`fluent-dropdown ${moreStylesPos.upward ? 'open-upward' : ''}`} style={{ position: 'fixed', top: moreStylesPos.top, left: moreStylesPos.left, zIndex: 10000, minWidth: 200, maxHeight: 320, overflowY: 'auto' }}>
                              <div className="fluent-dropdown-label" style={{ fontSize: 11, padding: '8px 12px 4px' }}>All Styles</div>
                              {STYLES.map(s => (
                                <button key={s.id} className={`fluent-dropdown-item style-dropdown-item${currentStyle === s.id ? ' active' : ''}`}
                                  onClick={() => { onApplyStyle(s.id); setShowMoreStyles(false); setMoreStylesPos(null); }}>
                                  <span className="style-dropdown-preview" style={{
                                    fontSize: Math.min(s.preview.fontSize, 18), fontWeight: s.preview.fontWeight,
                                    fontFamily: s.preview.fontFamily, color: s.preview.color,
                                    fontStyle: s.preview.fontStyle || 'normal',
                                  }}>Aa</span>
                                  <span className="style-dropdown-name">{s.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <button className="styles-gallery-scroll-btn" onClick={() => { scrollGallery('right'); setTimeout(updateGalleryScrollState, 200); }}
                        style={{ opacity: canScrollRight ? 1 : 0.2, pointerEvents: canScrollRight ? 'auto' : 'none', height: 60 }} title="Scroll styles right">
                        <svg width="6" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6"></polyline></svg>
                      </button>
                    </div>
                  </div>
                </div>
                <div className="fluent-group-label">Styles</div>
              </div>
              <div className="fluent-divider" />

              {/* Editing Group */}
              <div className={`fluent-group group-editing${showCollapsed ? ' hidden' : ''}`}>
                <div className="fluent-group-inner">
                  <div className="fluent-row" style={{ flexDirection: 'column', gap: 1, alignItems: 'center' }}>
                    <button className="fluent-btn with-icon" onClick={() => onFindReplace?.()} title="Find (Ctrl+F)" style={{ minHeight: 34, padding: '2px 6px', minWidth: 44 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                      <span className="fluent-btn-label">Find</span>
                    </button>
                    <button className="fluent-btn with-icon" onClick={() => onFindReplace?.()} title="Replace (Ctrl+H)" style={{ minHeight: 34, padding: '2px 6px', minWidth: 44 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
                      <span className="fluent-btn-label">Replace</span>
                    </button>
                    <button className="fluent-btn with-icon" onClick={() => onSelectAll?.()} title="Select All (Ctrl+A)" style={{ minHeight: 34, padding: '2px 6px', minWidth: 44 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line></svg>
                      <span className="fluent-btn-label">Select</span>
                    </button>
                  </div>
                </div>
<div className="fluent-group-label">Editing</div>
              </div>

              {/* More (⋯) button for collapsed groups */}
              {showCollapsed && (
                <div ref={moreGroupsRef} className="fluent-group" style={{ width: 50, flexShrink: 0 }}>
                  <div className="fluent-group-items" style={{ justifyContent: 'center' }}>
                    <button
                      className="fluent-icon-btn"
                      onClick={() => {
                        if (showMoreGroups) { setShowMoreGroups(false); setMoreGroupsPos(null); }
                        else { const p = calcPos(moreGroupsRef, 260); if (p) { setMoreGroupsPos(p); setShowMoreGroups(true); } }
                      }}
                      title="More"
                      style={{ width: 36, height: 36 }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
                        <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                        <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
                      </svg>
                    </button>
                    {showMoreGroups && moreGroupsPos && (
                      <div className={`fluent-dropdown ${moreGroupsPos.upward ? 'open-upward' : ''}`} style={{ position: 'fixed', top: moreGroupsPos.top, left: moreGroupsPos.left, zIndex: 10000, minWidth: 220 }}>
                        <div className="fluent-dropdown-label" style={{ fontSize: 11, padding: '6px 12px 4px' }}>More Groups</div>
                        <button className="fluent-dropdown-item" onClick={onCut} title="Cut">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="23" y1="6" x2="11" y2="18"/><path d="M21 4a3 3 0 1 0-5.5 2.5"/><path d="M3 20a3 3 0 1 0 5.5-2.5"/></svg>
                          Cut
                        </button>
                        <button className="fluent-dropdown-item" onClick={onCopy} title="Copy">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                          Copy
                        </button>
                        <button className="fluent-dropdown-item" onClick={onPaste} title="Paste">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 8 22 13 17 18"/></svg>
                          Paste
                        </button>
                        <div className="fluent-dropdown-divider"></div>
                        <button className="fluent-dropdown-item" onClick={() => onFindReplace?.()} title="Find & Replace">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                          Find & Replace
                        </button>
                        <button className="fluent-dropdown-item" onClick={() => onSelectAll?.()} title="Select All">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>
                          Select All
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="fluent-group-label">More</div>
                </div>
              )}
            </>
          )}

          {(activeTab as TabId) === 'insert' && (
            <>
              <div className="fluent-group">
                <div className="fluent-group-items">
                  <button className="fluent-btn with-icon" onClick={onAddImage} title="Insert Image">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                    <span className="fluent-btn-label">Image</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={onAddText} title="Add Text">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>
                    <span className="fluent-btn-label">Text</span>
                  </button>
                  <div ref={shapeRef} className="fluent-dropdown-container"
                    onMouseEnter={() => { clearHover(); if (!showShape) { const p = calcPos(shapeRef, 220); if (p) { setShapePos(p); setShowShape(true); } } }}
                    onMouseLeave={() => { hoverTimer.current = window.setTimeout(() => { setShowShape(false); setShapePos(null); }, 250); }}>
                    <button className="fluent-btn with-icon" onClick={() => {
                      if (showShape) { setShowShape(false); setShapePos(null); }
                      else { const p = calcPos(shapeRef, 220); if (p) { setShapePos(p); setShowShape(true); } }
                    }} title="Add Shape">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"></polygon></svg>
                      <span className="fluent-btn-label">Shape</span>
                    </button>
                    {showShape && shapePos && (
                      <div className={`fluent-dropdown ${shapePos.upward ? 'open-upward' : ''}`} style={{ position: 'fixed', top: shapePos.top, left: shapePos.left, zIndex: 10000, minWidth: 220 }}>
                        <div className="fluent-dropdown-label">Shapes</div>
                        <div className="fluent-shape-grid">
                          {shapes.map(s => (
                            <button key={s.id} className="fluent-shape-item" onClick={() => { onAddShape(s.id); setShowShape(false); setShapePos(null); }} title={s.label}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d={s.d} />
                              </svg>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="fluent-group-label">Elements</div>
              </div>
              <div className="fluent-divider" />
              <div className="fluent-group">
                <div className="fluent-group-items">
                  <button className="fluent-btn with-icon" onClick={onInsertBlankPage} title="Insert Blank Page">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    <span className="fluent-btn-label">Blank Page</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={onPageBreak} title="Insert Page Break">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="3" x2="12" y2="21"></line><polyline points="16 7 12 3 8 7"></polyline><line x1="3" y1="12" x2="21" y2="12"></line></svg>
                    <span className="fluent-btn-label">Page Break</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={onInsertPageNumber} title="Insert Page Number">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z"></path><text x="12" y="16" fontSize="10" fontWeight="bold" textAnchor="middle" fill="currentColor">#</text></svg>
                    <span className="fluent-btn-label">Page #</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={onInsertDate} title="Insert Date">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    <span className="fluent-btn-label">Date</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={onInsertTime} title="Insert Time">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    <span className="fluent-btn-label">Time</span>
                  </button>
                </div>
                <div className="fluent-group-label">Pages</div>
              </div>
              <div className="fluent-divider" />
              <div className="fluent-group">
                <div className="fluent-group-items">
                  <button className="fluent-btn with-icon" onClick={onToggleSymbolPicker} title="Insert Symbol">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                    <span className="fluent-btn-label">Symbol</span>
                  </button>
                </div>
                <div className="fluent-group-label">Symbols</div>
              </div>
              <div className="fluent-divider" />
              <div className="fluent-group">
                <div className="fluent-group-items">
                  <button className="fluent-btn with-icon" onClick={onInsertFromUrl} title="Insert Image from URL">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                    <span className="fluent-btn-label">Online</span>
                  </button>
                </div>
                <div className="fluent-group-label">Online Pictures</div>
              </div>
              <div className="fluent-divider" />
              <div className="fluent-group">
                <div className="fluent-group-items">
                  <button className="fluent-btn with-icon" onClick={onToggleHeaderFooter} title="Header & Footer">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>
                      <line x1="8" y1="9" x2="16" y2="9"/>
                      <line x1="8" y1="15" x2="12" y2="15"/>
                    </svg>
                    <span className="fluent-btn-label">Header & Footer</span>
                  </button>
                </div>
                <div className="fluent-group-label">Header & Footer</div>
              </div>
              <div className="fluent-divider" />
              <div className="fluent-group">
                <div className="fluent-group-items">
                  <button className="fluent-btn with-icon" onClick={onHyperlink} title="Insert Hyperlink">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                    <span className="fluent-btn-label">Hyperlink</span>
                  </button>
                </div>
                <div className="fluent-group-label">Links</div>
              </div>
            </>
          )}

          {(activeTab as TabId) === 'layout' && (
            <>
              <div className="fluent-group">
                <div className="fluent-group-items">
                  <div ref={el => dropdownRefs.current['margins'] = el} className="fluent-dropdown-container"
                    onMouseEnter={() => { clearHover(); if (openDropdown !== 'margins') { const p = calcPos({current: dropdownRefs.current['margins'] as HTMLDivElement} as any, 220); if (p) { setDropdownPosArr(p); setOpenDropdown('margins'); } } }}
                    onMouseLeave={() => { hoverTimer.current = window.setTimeout(() => closeDropdown(), 250); }}>
                    <button className="fluent-btn with-icon" onClick={() => toggleDropdown('margins', {current: dropdownRefs.current['margins'] as HTMLDivElement} as any, 220)} title="Margins">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                      <span className="fluent-btn-label">Margins</span>
                    </button>
                    {openDropdown === 'margins' && dropdownPosArr && (
                      <div className={`fluent-dropdown ${dropdownPosArr.upward ? 'open-upward' : ''}`} style={{ position: 'fixed', top: dropdownPosArr.top, left: dropdownPosArr.left, zIndex: 10000, minWidth: 220 }}>
                        <div className="fluent-dropdown-label">Preset Margins</div>
                        {Object.entries(MARGIN_PRESETS).map(([key]) => (
                          <button key={key} className={`fluent-dropdown-item ${marginPreset === key ? 'active' : ''}`} onClick={() => { onSetMargins(key); closeDropdown(); }}>
                            {key.charAt(0).toUpperCase() + key.slice(1)}
                          </button>
                        ))}
                        <div className="fluent-dropdown-divider"/>
                        <button className="fluent-dropdown-item" onClick={() => { onOpenCustomMarginsDialog?.(); closeDropdown(); }}>Custom Margins...</button>
                      </div>
                    )}
                  </div>

                  <div ref={el => dropdownRefs.current['orientation-dd'] = el} className="fluent-dropdown-container"
                    onMouseEnter={() => { clearHover(); if (openDropdown !== 'orientation-dd') { const p = calcPos({current: dropdownRefs.current['orientation-dd'] as HTMLDivElement} as any, 180); if (p) { setDropdownPosArr(p); setOpenDropdown('orientation-dd'); } } }}
                    onMouseLeave={() => { hoverTimer.current = window.setTimeout(() => closeDropdown(), 250); }}>
                    <button className="fluent-btn with-icon" onClick={() => toggleDropdown('orientation-dd', {current: dropdownRefs.current['orientation-dd'] as HTMLDivElement} as any, 180)} title="Orientation">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="12" y1="6" x2="12" y2="18"/></svg>
                      <span className="fluent-btn-label">Orientation</span>
                    </button>
                    {openDropdown === 'orientation-dd' && dropdownPosArr && (
                      <div className={`fluent-dropdown ${dropdownPosArr.upward ? 'open-upward' : ''}`} style={{ position: 'fixed', top: dropdownPosArr.top, left: dropdownPosArr.left, zIndex: 10000, minWidth: 180 }}>
                        <button className={`fluent-dropdown-item${orientation === 'portrait' || !orientation ? ' active' : ''}`} onClick={() => { if (orientation !== 'landscape') onToggleOrientation(); closeDropdown(); }}>Portrait</button>
                        <button className={`fluent-dropdown-item${orientation === 'landscape' ? ' active' : ''}`} onClick={() => { if (orientation !== 'portrait') onToggleOrientation(); closeDropdown(); }}>Landscape</button>
                      </div>
                    )}
                  </div>

                  <div ref={el => dropdownRefs.current['size'] = el} className="fluent-dropdown-container"
                    onMouseEnter={() => { clearHover(); if (openDropdown !== 'size') { const p = calcPos({current: dropdownRefs.current['size'] as HTMLDivElement} as any, 220); if (p) { setDropdownPosArr(p); setOpenDropdown('size'); } } }}
                    onMouseLeave={() => { hoverTimer.current = window.setTimeout(() => closeDropdown(), 250); }}>
                    <button className="fluent-btn with-icon" onClick={() => toggleDropdown('size', {current: dropdownRefs.current['size'] as HTMLDivElement} as any, 220)} title="Page Size">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                      <span className="fluent-btn-label">Size</span>
                    </button>
                    {openDropdown === 'size' && dropdownPosArr && (
                      <div className={`fluent-dropdown ${dropdownPosArr.upward ? 'open-upward' : ''}`} style={{ position: 'fixed', top: dropdownPosArr.top, left: dropdownPosArr.left, zIndex: 10000, minWidth: 220, maxHeight: '70vh', overflowY: 'auto' }}>
                        <div className="fluent-dropdown-label">Document Pages</div>
                        <button className={`fluent-dropdown-item ${layoutPreset === 'a4' ? 'active' : ''}`} onClick={() => { onSetLayout('a4'); closeDropdown(); }}>A4 (210 × 297 mm)</button>
                        <button className={`fluent-dropdown-item ${layoutPreset === 'letter' ? 'active' : ''}`} onClick={() => { onSetLayout('letter'); closeDropdown(); }}>Letter (8.5 × 11 in)</button>
                        <button className={`fluent-dropdown-item ${layoutPreset === 'legal' ? 'active' : ''}`} onClick={() => { onSetLayout('legal'); closeDropdown(); }}>Legal (8.5 × 14 in)</button>
                        <button className={`fluent-dropdown-item ${layoutPreset === 'a3' ? 'active' : ''}`} onClick={() => { onSetLayout('a3'); closeDropdown(); }}>A3 (297 × 420 mm)</button>
                        <button className={`fluent-dropdown-item ${layoutPreset === 'executive' ? 'active' : ''}`} onClick={() => { onSetLayout('executive'); closeDropdown(); }}>Executive (7.25 × 10.5 in)</button>
                        <button className={`fluent-dropdown-item ${layoutPreset === 'tabloid' ? 'active' : ''}`} onClick={() => { onSetLayout('tabloid'); closeDropdown(); }}>Tabloid (11 × 17 in)</button>
                        <div className="fluent-dropdown-divider"/>
                        <div className="fluent-dropdown-label">Custom Size</div>
                        <div className="fluent-dropdown-item" style={{ padding: '4px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>W:</span>
                            <input type="number" className="layout-custom-input" value={customSize.w} min={1} max={9999}
                              onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) onSetCustomSize(v, customSize.h); }} />
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>H:</span>
                            <input type="number" className="layout-custom-input" value={customSize.h} min={1} max={9999}
                              onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) onSetCustomSize(customSize.w, v); }} />
                            <button className="layout-custom-apply" onClick={() => { onSetLayout('custom'); closeDropdown(); }}>Apply</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div ref={el => dropdownRefs.current['breaks'] = el} className="fluent-dropdown-container"
                    onMouseEnter={() => { clearHover(); if (openDropdown !== 'breaks') { const p = calcPos({current: dropdownRefs.current['breaks'] as HTMLDivElement} as any, 220); if (p) { setDropdownPosArr(p); setOpenDropdown('breaks'); } } }}
                    onMouseLeave={() => { hoverTimer.current = window.setTimeout(() => closeDropdown(), 250); }}>
                    <button className="fluent-btn with-icon" onClick={() => toggleDropdown('breaks', {current: dropdownRefs.current['breaks'] as HTMLDivElement} as any, 220)} title="Breaks">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="4" x2="6" y2="20"/><polyline points="10 8 6 12 10 16"/><line x1="18" y1="4" x2="18" y2="20"/><polyline points="14 8 18 12 14 16"/></svg>
                      <span className="fluent-btn-label">Breaks</span>
                    </button>
                    {openDropdown === 'breaks' && dropdownPosArr && (
                      <div className={`fluent-dropdown ${dropdownPosArr.upward ? 'open-upward' : ''}`} style={{ position: 'fixed', top: dropdownPosArr.top, left: dropdownPosArr.left, zIndex: 10000, minWidth: 220 }}>
                        <div className="fluent-dropdown-label">Page Breaks</div>
                        <button className="fluent-dropdown-item" onClick={() => { onInsertBreak?.('page'); closeDropdown(); }}>Page</button>
                        <button className="fluent-dropdown-item" onClick={() => { onInsertBreak?.('column'); closeDropdown(); }}>Column</button>
                        <div className="fluent-dropdown-divider"/>
                        <div className="fluent-dropdown-label">Section Breaks</div>
                        <button className="fluent-dropdown-item" onClick={() => { onInsertBreak?.('section-next'); closeDropdown(); }}>Next Page</button>
                        <button className="fluent-dropdown-item" onClick={() => { onInsertBreak?.('continuous'); closeDropdown(); }}>Continuous</button>
                        <button className="fluent-dropdown-item" onClick={() => { onInsertBreak?.('odd'); closeDropdown(); }}>Odd Page</button>
                        <button className="fluent-dropdown-item" onClick={() => { onInsertBreak?.('even'); closeDropdown(); }}>Even Page</button>
                      </div>
                    )}
                  </div>

                  <div ref={el => dropdownRefs.current['lineNumbers'] = el} className="fluent-dropdown-container"
                    onMouseEnter={() => { clearHover(); if (openDropdown !== 'lineNumbers') { const p = calcPos({current: dropdownRefs.current['lineNumbers'] as HTMLDivElement} as any, 200); if (p) { setDropdownPosArr(p); setOpenDropdown('lineNumbers'); } } }}
                    onMouseLeave={() => { hoverTimer.current = window.setTimeout(() => closeDropdown(), 250); }}>
                    <button className="fluent-btn with-icon" onClick={() => toggleDropdown('lineNumbers', {current: dropdownRefs.current['lineNumbers'] as HTMLDivElement} as any, 200)} title="Line Numbers">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg>
                      <span className="fluent-btn-label">Line #</span>
                    </button>
                    {openDropdown === 'lineNumbers' && dropdownPosArr && (
                      <div className={`fluent-dropdown ${dropdownPosArr.upward ? 'open-upward' : ''}`} style={{ position: 'fixed', top: dropdownPosArr.top, left: dropdownPosArr.left, zIndex: 10000, minWidth: 200 }}>
                        <button className={`fluent-dropdown-item ${lineNumbersMode === 'none' || !lineNumbersMode ? 'active' : ''}`} onClick={() => { onSetLineNumbers?.('none'); closeDropdown(); }}>None</button>
                        <button className={`fluent-dropdown-item ${lineNumbersMode === 'continuous' ? 'active' : ''}`} onClick={() => { onSetLineNumbers?.('continuous'); closeDropdown(); }}>Continuous</button>
                        <button className={`fluent-dropdown-item ${lineNumbersMode === 'restart-page' ? 'active' : ''}`} onClick={() => { onSetLineNumbers?.('restart-page'); closeDropdown(); }}>Restart Each Page</button>
                        <button className={`fluent-dropdown-item ${lineNumbersMode === 'restart-section' ? 'active' : ''}`} onClick={() => { onSetLineNumbers?.('restart-section'); closeDropdown(); }}>Restart Each Section</button>
                      </div>
                    )}
                  </div>

                  <div ref={el => dropdownRefs.current['hyphenation'] = el} className="fluent-dropdown-container"
                    onMouseEnter={() => { clearHover(); if (openDropdown !== 'hyphenation') { const p = calcPos({current: dropdownRefs.current['hyphenation'] as HTMLDivElement} as any, 180); if (p) { setDropdownPosArr(p); setOpenDropdown('hyphenation'); } } }}
                    onMouseLeave={() => { hoverTimer.current = window.setTimeout(() => closeDropdown(), 250); }}>
                    <button className="fluent-btn with-icon" onClick={() => toggleDropdown('hyphenation', {current: dropdownRefs.current['hyphenation'] as HTMLDivElement} as any, 180)} title="Hyphenation">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="8" x2="6" y2="8"/><line x1="18" y1="8" x2="21" y2="8"/></svg>
                      <span className="fluent-btn-label">Hyphenation</span>
                    </button>
                    {openDropdown === 'hyphenation' && dropdownPosArr && (
                      <div className={`fluent-dropdown ${dropdownPosArr.upward ? 'open-upward' : ''}`} style={{ position: 'fixed', top: dropdownPosArr.top, left: dropdownPosArr.left, zIndex: 10000, minWidth: 180 }}>
                        <button className={`fluent-dropdown-item ${hyphenationMode === 'none' || !hyphenationMode ? 'active' : ''}`} onClick={() => { onSetHyphenation?.('none'); closeDropdown(); }}>None</button>
                        <button className={`fluent-dropdown-item ${hyphenationMode === 'automatic' ? 'active' : ''}`} onClick={() => { onSetHyphenation?.('automatic'); closeDropdown(); }}>Automatic</button>
                        <button className={`fluent-dropdown-item ${hyphenationMode === 'manual' ? 'active' : ''}`} onClick={() => { onSetHyphenation?.('manual'); closeDropdown(); }}>Manual</button>
                      </div>
                    )}
                  </div>

                  <div className="fluent-color-btn" title="Page Background Color" style={{ marginTop: 2 }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)' }}>BG</span>
                    <input type="color" className="fluent-color-swatch" value={pageBackgroundColor} onChange={e => onSetPageBackground(e.target.value)} />
                  </div>
                </div>
                <div className="fluent-group-label">Page Setup</div>
              </div>
              <div className="fluent-divider" />

              <div className="fluent-group" style={{ minWidth: 200 }}>
                <div className="fluent-group-items" style={{ gap: 2, flexDirection: 'column', alignItems: 'stretch', padding: '4px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 26 }}>Left:</span>
                      <div style={{ position: 'relative' }}>
                        <input type="number" className="indent-spacing-input" value={spacingLeft} min={0} max={100} step={0.1} onChange={e => { const v = parseFloat(e.target.value) || 0; setSpacingLeft(v); onIndent?.('in'); }} />
                        <div className="spinner-arrows"><button tabIndex={-1} onClick={() => { setSpacingLeft(Math.min(100, spacingLeft + 0.1)); onIndent?.('in'); }}>▲</button><button tabIndex={-1} onClick={() => { setSpacingLeft(Math.max(0, spacingLeft - 0.1)); onIndent?.('out'); }}>▼</button></div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 26 }}>Right:</span>
                      <div style={{ position: 'relative' }}>
                        <input type="number" className="indent-spacing-input" value={spacingRight} min={0} max={100} step={0.1} onChange={e => setSpacingRight(parseFloat(e.target.value) || 0)} />
                        <div className="spinner-arrows"><button tabIndex={-1} onClick={() => setSpacingRight(Math.min(100, spacingRight + 0.1))}>▲</button><button tabIndex={-1} onClick={() => setSpacingRight(Math.max(0, spacingRight - 0.1))}>▼</button></div>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 36 }}>Before:</span>
                      <div style={{ position: 'relative' }}>
                        <input type="number" className="indent-spacing-input" value={spacingBefore} min={0} max={100} step={6} onChange={e => { const v = parseFloat(e.target.value) || 0; setSpacingBefore(v); onParagraphSpacing?.(v, spacingAfter); }} />
                        <div className="spinner-arrows"><button tabIndex={-1} onClick={() => { setSpacingBefore(Math.min(100, spacingBefore + 6)); onParagraphSpacing?.(Math.min(100, spacingBefore + 6), spacingAfter); }}>▲</button><button tabIndex={-1} onClick={() => { setSpacingBefore(Math.max(0, spacingBefore - 6)); onParagraphSpacing?.(Math.max(0, spacingBefore - 6), spacingAfter); }}>▼</button></div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 32 }}>After:</span>
                      <div style={{ position: 'relative' }}>
                        <input type="number" className="indent-spacing-input" value={spacingAfter} min={0} max={100} step={6} onChange={e => { const v = parseFloat(e.target.value) || 0; setSpacingAfter(v); onParagraphSpacing?.(spacingBefore, v); }} />
                        <div className="spinner-arrows"><button tabIndex={-1} onClick={() => { setSpacingAfter(Math.min(100, spacingAfter + 6)); onParagraphSpacing?.(spacingBefore, Math.min(100, spacingAfter + 6)); }}>▲</button><button tabIndex={-1} onClick={() => { setSpacingAfter(Math.max(0, spacingAfter - 6)); onParagraphSpacing?.(spacingBefore, Math.max(0, spacingAfter - 6)); }}>▼</button></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="fluent-group-label">Paragraph</div>
              </div>
              <div className="fluent-divider" />

              <div className="fluent-group">
                <div className="fluent-group-items">
                  <div ref={el => dropdownRefs.current['position'] = el} className="fluent-dropdown-container">
                    <button className={`fluent-btn with-icon${!hasArrangeSelection ? ' disabled' : ''}`} onClick={hasArrangeSelection ? () => toggleDropdown('position', {current: dropdownRefs.current['position'] as HTMLDivElement} as any, 200) : undefined} title="Position" disabled={!hasArrangeSelection}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3v18M19 3v18M3 5h18M3 19h18"/><circle cx="12" cy="12" r="3"/></svg>
                      <span className="fluent-btn-label">Position</span>
                    </button>
                    {openDropdown === 'position' && hasArrangeSelection && dropdownPosArr && (
                      <div className={`fluent-dropdown ${dropdownPosArr.upward ? 'open-upward' : ''}`} style={{ position: 'fixed', top: dropdownPosArr.top, left: dropdownPosArr.left, zIndex: 10000, minWidth: 200 }}>
                        <button className="fluent-dropdown-item" onClick={() => { onAlign?.('left'); closeDropdown(); }}>Align Left</button>
                        <button className="fluent-dropdown-item" onClick={() => { onAlign?.('center'); closeDropdown(); }}>Align Center</button>
                        <button className="fluent-dropdown-item" onClick={() => { onAlign?.('right'); closeDropdown(); }}>Align Right</button>
                        <div className="fluent-dropdown-divider"/>
                        <button className="fluent-dropdown-item" onClick={() => { onAlign?.('top'); closeDropdown(); }}>Align Top</button>
                        <button className="fluent-dropdown-item" onClick={() => { onAlign?.('middle'); closeDropdown(); }}>Align Middle</button>
                        <button className="fluent-dropdown-item" onClick={() => { onAlign?.('bottom'); closeDropdown(); }}>Align Bottom</button>
                      </div>
                    )}
                  </div>

                  <div ref={el => dropdownRefs.current['wrapText'] = el} className="fluent-dropdown-container"
                    onMouseEnter={() => { clearHover(); if (hasArrangeSelection && openDropdown !== 'wrapText') { const p = calcPos({current: dropdownRefs.current['wrapText'] as HTMLDivElement} as any, 180); if (p) { setDropdownPosArr(p); setOpenDropdown('wrapText'); } } }}
                    onMouseLeave={() => { hoverTimer.current = window.setTimeout(() => closeDropdown(), 250); }}>
                    <button className={`fluent-btn with-icon${!hasArrangeSelection ? ' disabled' : ''}`} onClick={hasArrangeSelection ? () => toggleDropdown('wrapText', {current: dropdownRefs.current['wrapText'] as HTMLDivElement} as any, 180) : undefined} title="Wrap Text" disabled={!hasArrangeSelection}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M4 12h10M4 17h6"/><path d="M17 17l3-3-3-3"/></svg>
                      <span className="fluent-btn-label">Wrap Text</span>
                    </button>
                    {openDropdown === 'wrapText' && hasArrangeSelection && dropdownPosArr && (
                      <div className={`fluent-dropdown ${dropdownPosArr.upward ? 'open-upward' : ''}`} style={{ position: 'fixed', top: dropdownPosArr.top, left: dropdownPosArr.left, zIndex: 10000, minWidth: 180 }}>
                        <button className="fluent-dropdown-item" onClick={() => { onImageWrap?.('inline'); closeDropdown(); }}>In Line with Text</button>
                        <button className="fluent-dropdown-item" onClick={() => { onImageWrap?.('square'); closeDropdown(); }}>Square</button>
                        <button className="fluent-dropdown-item" onClick={() => { onImageWrap?.('tight'); closeDropdown(); }}>Tight</button>
                        <div className="fluent-dropdown-divider"/>
                        <button className="fluent-dropdown-item" onClick={() => { onImageWrap?.('behind'); closeDropdown(); }}>Behind Text</button>
                        <button className="fluent-dropdown-item" onClick={() => { onImageWrap?.('front'); closeDropdown(); }}>In Front of Text</button>
                      </div>
                    )}
                  </div>

                  <button className={`fluent-btn with-icon${!hasArrangeSelection ? ' disabled' : ''}`} onClick={hasArrangeSelection ? onBringForward : undefined} title="Bring Forward" disabled={!hasArrangeSelection}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 15 12 20 7 15"/><path d="M12 4v16"/></svg>
                    <span className="fluent-btn-label">Bring Forward</span>
                  </button>

                  <button className={`fluent-btn with-icon${!hasArrangeSelection ? ' disabled' : ''}`} onClick={hasArrangeSelection ? onSendBackward : undefined} title="Send Backward" disabled={!hasArrangeSelection}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 9 12 4 17 9"/><path d="M12 20V4"/></svg>
                    <span className="fluent-btn-label">Send Backward</span>
                  </button>

                  <button className="fluent-btn with-icon" onClick={onToggleSelectionPane} title="Selection Pane">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                    <span className="fluent-btn-label">Selection Pane</span>
                  </button>

                  <div ref={el => dropdownRefs.current['align'] = el} className="fluent-dropdown-container"
                    onMouseEnter={() => { clearHover(); if (hasArrangeSelection && openDropdown !== 'align') { const p = calcPos({current: dropdownRefs.current['align'] as HTMLDivElement} as any, 180); if (p) { setDropdownPosArr(p); setOpenDropdown('align'); } } }}
                    onMouseLeave={() => { hoverTimer.current = window.setTimeout(() => closeDropdown(), 250); }}>
                    <button className={`fluent-btn with-icon${!hasArrangeSelection ? ' disabled' : ''}`} onClick={hasArrangeSelection ? () => toggleDropdown('align', {current: dropdownRefs.current['align'] as HTMLDivElement} as any, 180) : undefined} title="Align" disabled={!hasArrangeSelection}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="3" x2="21" y2="3"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="3" y1="21" x2="21" y2="21"/></svg>
                      <span className="fluent-btn-label">Align</span>
                    </button>
                    {openDropdown === 'align' && hasArrangeSelection && dropdownPosArr && (
                      <div className={`fluent-dropdown ${dropdownPosArr.upward ? 'open-upward' : ''}`} style={{ position: 'fixed', top: dropdownPosArr.top, left: dropdownPosArr.left, zIndex: 10000, minWidth: 180 }}>
                        <button className="fluent-dropdown-item" onClick={() => { onAlign?.('left'); closeDropdown(); }}>Align Left</button>
                        <button className="fluent-dropdown-item" onClick={() => { onAlign?.('center'); closeDropdown(); }}>Align Center</button>
                        <button className="fluent-dropdown-item" onClick={() => { onAlign?.('right'); closeDropdown(); }}>Align Right</button>
                        <div className="fluent-dropdown-divider"/>
                        <button className="fluent-dropdown-item" onClick={() => { onAlign?.('top'); closeDropdown(); }}>Align Top</button>
                        <button className="fluent-dropdown-item" onClick={() => { onAlign?.('middle'); closeDropdown(); }}>Align Middle</button>
                        <button className="fluent-dropdown-item" onClick={() => { onAlign?.('bottom'); closeDropdown(); }}>Align Bottom</button>
                      </div>
                    )}
                  </div>

                  <div ref={el => dropdownRefs.current['group-dd'] = el} className="fluent-dropdown-container"
                    onMouseEnter={() => { clearHover(); if (hasArrangeSelection && openDropdown !== 'group-dd') { const p = calcPos({current: dropdownRefs.current['group-dd'] as HTMLDivElement} as any, 160); if (p) { setDropdownPosArr(p); setOpenDropdown('group-dd'); } } }}
                    onMouseLeave={() => { hoverTimer.current = window.setTimeout(() => closeDropdown(), 250); }}>
                    <button className={`fluent-btn with-icon${!hasArrangeSelection ? ' disabled' : ''}`} onClick={hasArrangeSelection ? () => toggleDropdown('group-dd', {current: dropdownRefs.current['group-dd'] as HTMLDivElement} as any, 160) : undefined} title="Group" disabled={!hasArrangeSelection}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                      <span className="fluent-btn-label">Group</span>
                    </button>
                    {openDropdown === 'group-dd' && hasArrangeSelection && dropdownPosArr && (
                      <div className={`fluent-dropdown ${dropdownPosArr.upward ? 'open-upward' : ''}`} style={{ position: 'fixed', top: dropdownPosArr.top, left: dropdownPosArr.left, zIndex: 10000, minWidth: 160 }}>
                        <button className="fluent-dropdown-item" onClick={() => { onGroup?.(); closeDropdown(); }}>Group</button>
                        <button className="fluent-dropdown-item" onClick={() => { onUngroup?.(); closeDropdown(); }}>Ungroup</button>
                      </div>
                    )}
                  </div>

                  <div ref={el => dropdownRefs.current['rotate'] = el} className="fluent-dropdown-container"
                    onMouseEnter={() => { clearHover(); if (hasArrangeSelection && openDropdown !== 'rotate') { const p = calcPos({current: dropdownRefs.current['rotate'] as HTMLDivElement} as any, 180); if (p) { setDropdownPosArr(p); setOpenDropdown('rotate'); } } }}
                    onMouseLeave={() => { hoverTimer.current = window.setTimeout(() => closeDropdown(), 250); }}>
                    <button className={`fluent-btn with-icon${!hasArrangeSelection ? ' disabled' : ''}`} onClick={hasArrangeSelection ? () => toggleDropdown('rotate', {current: dropdownRefs.current['rotate'] as HTMLDivElement} as any, 180) : undefined} title="Rotate" disabled={!hasArrangeSelection}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                      <span className="fluent-btn-label">Rotate</span>
                    </button>
                    {openDropdown === 'rotate' && hasArrangeSelection && dropdownPosArr && (
                      <div className={`fluent-dropdown ${dropdownPosArr.upward ? 'open-upward' : ''}`} style={{ position: 'fixed', top: dropdownPosArr.top, left: dropdownPosArr.left, zIndex: 10000, minWidth: 180 }}>
                        <button className="fluent-dropdown-item" onClick={() => { onRotate?.(); closeDropdown(); }}>Rotate Right 90°</button>
                        <button className="fluent-dropdown-item" onClick={() => { onRotateLeft?.(); closeDropdown(); }}>Rotate Left 90°</button>
                        <button className="fluent-dropdown-item" onClick={() => { onFlipH?.(); closeDropdown(); }}>Flip Horizontal</button>
                        <button className="fluent-dropdown-item" onClick={() => { onFlipV?.(); closeDropdown(); }}>Flip Vertical</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="fluent-group-label">Arrange</div>
              </div>
            </>
          )}

          {(activeTab as TabId) === 'view' && (
            <>
              <div className="fluent-group">
                <div className="fluent-group-items">
                  <button className="fluent-btn with-icon" onClick={onPrint} title="Print">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 6 2 18 2 18 9"></polyline>
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                      <rect x="6" y="14" width="12" height="8"></rect>
                    </svg>
                    <span className="fluent-btn-label">Print</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={() => onZoom('in')} title="Zoom In">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                    <span className="fluent-btn-label">Zoom In</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={() => onZoom('out')} title="Zoom Out">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                    <span className="fluent-btn-label">Zoom Out</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={() => onZoom('fit')} title="Fit to Screen">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                    <span className="fluent-btn-label">Fit Screen</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={() => onZoom('actual')} title="Actual Size (100%)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path></svg>
                    <span className="fluent-btn-label">Actual Size</span>
                  </button>
                </div>
                <div className="fluent-group-label">Zoom</div>
              </div>
              <div className="fluent-divider" />
              <div className="fluent-group">
                <div className="fluent-group-items">
                  <button className="fluent-btn with-icon" onClick={onToggleFocusMode} title="Focus Mode">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                    <span className="fluent-btn-label">Focus Mode</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={onToggleNavPane} title="Navigation Pane">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                    <span className="fluent-btn-label">Nav Pane</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={onTogglePageThumbnails} title="Page Thumbnails">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1"></rect><rect x="13" y="3" width="8" height="8" rx="1"></rect><rect x="3" y="13" width="8" height="8" rx="1"></rect><rect x="13" y="13" width="8" height="8" rx="1"></rect></svg>
                    <span className="fluent-btn-label">Thumbnails</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={onToggleRuler} title="Ruler">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h18"></path><path d="M3 12h12"></path><path d="M3 17h18"></path></svg>
                    <span className="fluent-btn-label">Ruler</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={onToggleGridlines} title="Gridlines">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 9h18M3 15h18M9 3v18M15 3v18"></path></svg>
                    <span className="fluent-btn-label">Gridlines</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={onToggleFullScreen} title="Full Screen">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M16 3h3a2 2 0 0 1 2 2v3"></path><path d="M8 21H5a2 2 0 0 1-2-2v-3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg>
                    <span className="fluent-btn-label">Full Screen</span>
                  </button>
                </div>
                <div className="fluent-group-label">Show</div>
              </div>
            </>
          )}

          {(activeTab as TabId) === 'review' && (
            <>
              <div className="fluent-group">
                <div className="fluent-group-items">
                  <button className="fluent-btn with-icon" onClick={onToggleCommentsPanel} title="Comments Panel">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    <span className="fluent-btn-label">Comments {commentsCount > 0 ? `(${commentsCount})` : ''}</span>
                  </button>
                </div>
                <div className="fluent-group-label">Comments</div>
              </div>
              <div className="fluent-divider" />
              <div className="fluent-group" style={{ minWidth: 200 }}>
                <div className="fluent-group-items" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input className="find-replace-input" style={{ flex: 1, fontSize: 11, padding: '4px 8px' }} placeholder="Comment..." value={commentText} onChange={e => onCommentTextChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onAddComment(); }} />
                    <button className="find-replace-btn find-replace-btn-primary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={onAddComment}>Add</button>
                  </div>
                </div>
                <div className="fluent-group-label">Add Comment</div>
              </div>
            </>
          )}

          {(activeTab as TabId) === 'help' && (
            <>
              <div className="fluent-group">
                <div className="fluent-group-items">
                  <button className="fluent-btn with-icon" onClick={onContactSupport} title="Contact Support">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span className="fluent-btn-label">Contact Support</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={onDocumentation} title="Documentation">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 0 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                    <span className="fluent-btn-label">Documentation</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={onGitHubRepository} title="GitHub Repository">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 19c-5 1.5-5-2.5-7-3"></path>
                      <path d="M15 22v-3.5c0-1 .1-1.4-.5-2 2 0 4-.5 4-4a3.5 3.5 0 0 0-1-2.5 3.2 3.2 0 0 0-.1-2.5s-.5-.2-1.6.5a5.5 5.5 0 0 0-4.6 0c-1.1-.7-1.6-.5-1.6-.5a3.2 3.2 0 0 0-.1 2.5A3.5 3.5 0 0 0 8 12c0 3.5 2 4 4 4-.3.3-.5.8-.5 1.6V22"></path>
                    </svg>
                    <span className="fluent-btn-label">GitHub</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={onReportIssue} title="Report Issue">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M12 8v4"></path>
                      <path d="M12 16h.01"></path>
                    </svg>
                    <span className="fluent-btn-label">Report Issue</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={onCheckForUpdates} title="Check for Updates">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 0 1-15.6 6.3"></path>
                      <path d="M3 12a9 9 0 0 1 15.6-6.3"></path>
                      <path d="M3 4v6h6"></path>
                      <path d="M21 20v-6h-6"></path>
                    </svg>
                    <span className="fluent-btn-label">Check Updates</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={onFeedback} title="Send Feedback">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                    <span className="fluent-btn-label">Feedback</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={onShowTraining} title="Show Training">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                    </svg>
                    <span className="fluent-btn-label">Show Training</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={() => onShowHelpTopic?.('shortcuts')} title="Keyboard Shortcuts">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M7 9h.01M11 9h.01M15 9h.01M7 13h10"></path></svg>
                    <span className="fluent-btn-label">Shortcuts</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={() => onShowHelpTopic?.('about')} title="About">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
                    <span className="fluent-btn-label">About</span>
                  </button>
                  <button className="fluent-btn with-icon" onClick={() => onShowHelpTopic?.('version')} title="Version">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h14v16H5z"></path><path d="M8 8h8M8 12h8M8 16h5"></path></svg>
                    <span className="fluent-btn-label">Version</span>
                  </button>
                </div>
                <div className="fluent-group-label">Help</div>
              </div>
              <div className="fluent-divider" />
              <div className="fluent-group">
                <div className="fluent-group-items">
                  <button className="fluent-btn with-icon" onClick={onTogglePreferences} title="Preferences">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"></circle>
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    <span className="fluent-btn-label">Preferences</span>
                  </button>
                </div>
                <div className="fluent-group-label">More</div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Toolbar;
