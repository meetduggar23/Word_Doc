export interface EditorElement {
  id: string;
  type: 'image' | 'text' | 'shape';
  left: number;
  top: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  data?: any;
}

export interface ClipboardData {
  type: 'copy' | 'cut';
  element: any;
}

export interface PageData {
  id: string;
  name: string;
  objects: any;
  content?: string;
  thumbnail: string;
  width: number;
  height: number;
}

export interface DocumentData {
  pages: PageData[];
  activePageIndex: number;
  title: string;
  createdAt: string;
  modifiedAt: string;
}

export interface HeaderFooterData {
  enabled: boolean;
  content: string;
  differentFirst: boolean;
}

export interface CommentData {
  id: string;
  objectId: string;
  author: string;
  text: string;
  createdAt: string;
  resolved: boolean;
}

export interface ParagraphFormat {
  lineSpacing: number;
  paragraphSpacing: number;
  indent: number;
  listType: 'none' | 'bullet' | 'number' | 'multi-level';
  listLevel: number;
}
