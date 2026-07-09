const DEV = import.meta.env.DEV;

export class ExportManager {
  static isValidBase64(str: string): boolean {
    if (typeof str !== 'string' || str.length === 0) return false;
    return /^[A-Za-z0-9+/]*={0,2}$/.test(str);
  }

  static parseDataUrl(dataUrl: string): { mimeType: string; data: string; isBase64: boolean } {
    if (typeof dataUrl !== 'string') {
      throw new Error('Export failed: dataUrl must be a string.');
    }
    if (!dataUrl.includes(',')) {
      throw new Error('Export failed: Invalid data URL format (missing comma).');
    }
    const commaIdx = dataUrl.indexOf(',');
    const header = dataUrl.substring(0, commaIdx);
    const body = dataUrl.substring(commaIdx + 1);

    const mimeMatch = header.match(/^data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const isBase64 = header.includes(';base64');

    if (DEV) {
      console.log('[ExportManager] parseDataUrl:', {
        headerLength: header.length,
        bodyLength: body.length, mimeType, isBase64,
        bodyPreview: body.substring(0, 80),
      });
    }

    if (isBase64) {
      if (!ExportManager.isValidBase64(body)) {
        throw new Error('Export failed: Invalid Base64 input.');
      }
      return { mimeType, data: body, isBase64: true };
    }

    return { mimeType, data: decodeURIComponent(body), isBase64: false };
  }

  static base64ToBytes(base64: string): Uint8Array {
    if (typeof base64 !== 'string' || base64.length === 0) {
      throw new Error('Export failed: Invalid Base64 input.');
    }
    if (!ExportManager.isValidBase64(base64)) {
      throw new Error('Export failed: Invalid Base64 input.');
    }
    if (DEV) console.log('[ExportManager] base64ToBytes length:', base64.length);
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i);
    }
    return bytes;
  }

  static sanitizeHtmlContent(html: string): string {
    return html
      .replace(/<img[^>]*src="([^"]*?)"[^>]*>/gi, (_match, src) => {
        if (src && !src.startsWith('data:') && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('blob:')) {
          console.warn('[ExportManager] Removing <img> with invalid src:', src.substring(0, 80));
          return '';
        }
        return _match;
      })
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/on\w+='[^']*'/gi, '');
  }

  static async waitForFonts(): Promise<void> {
    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
        if (DEV) console.log('[ExportManager] Fonts ready');
      }
    } catch (err) {
      console.warn('[ExportManager] Font loading check failed:', err);
    }
  }

  static validateSvg(svg: string): void {
    if (!svg || typeof svg !== 'string') {
      throw new Error('Export failed: SVG input is empty or not a string.');
    }
    if (!svg.includes('xmlns="http://www.w3.org/2000/svg"')) {
      throw new Error('Export failed: SVG is missing required xmlns attribute (xmlns="http://www.w3.org/2000/svg").');
    }
    if (svg.includes('<script') || svg.includes('onload=') || svg.includes('onerror=') || svg.includes('onclick=')) {
      throw new Error('Export failed: SVG contains unsafe or unsupported event handler attributes.');
    }
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svg, 'image/svg+xml');
      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        console.error('[ExportManager] SVG parse error:', parseError.textContent);
        throw new Error('Export failed: SVG contains malformed XML. ' + (parseError.textContent || '').substring(0, 200));
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Export failed')) throw err;
      throw new Error('Export failed: Could not parse SVG for validation.');
    }
  }

  static buildCompositePageSvg(
    page: { width: number; height: number; content?: string },
    canvasDataUrl?: string
  ): string {
    const w = Math.round(page.width);
    const h = Math.round(page.height);
    const rawContent = (page.content && page.content.trim()) ? page.content : '<p><br></p>';
    const contentHtml = ExportManager.sanitizeHtmlContent(rawContent);
    const imageMarkup = canvasDataUrl
      ? `<image href="${canvasDataUrl}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" />`
      : '';

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#ffffff" />
  ${imageMarkup}
  <foreignObject x="0" y="0" width="${w}" height="${h}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;overflow:hidden;">
      ${contentHtml}
    </div>
  </foreignObject>
</svg>`;

    return svg;
  }

  static rasterizeCanvasTo(
    canvas: HTMLCanvasElement,
    mimeType: 'image/png' | 'image/jpeg',
    multiplier?: number,
    quality?: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        if (!canvas || !canvas.getContext) {
          reject(new Error('Export failed: Invalid canvas element.'));
          return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Export failed: Could not get canvas 2D context.'));
          return;
        }
        if (DEV) console.log('[ExportManager] rasterizeCanvasTo:', { mimeType, multiplier, quality });
        resolve(canvas.toDataURL(mimeType, quality ?? (mimeType === 'image/jpeg' ? 0.95 : undefined)));
      } catch (err) {
        reject(new Error('Export failed: Canvas rasterization error: ' + (err instanceof Error ? err.message : 'Unknown')));
      }
    });
  }

  static rasterizeSvg(svg: string, mimeType: 'image/png' | 'image/jpeg'): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!svg || typeof svg !== 'string') {
        reject(new Error('Export failed: Invalid SVG input.'));
        return;
      }

      try {
        ExportManager.validateSvg(svg);
      } catch (err) {
        reject(err);
        return;
      }

      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const image = new Image();

      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        URL.revokeObjectURL(url);
        reject(new Error('Export failed: SVG rasterization timed out after 15 seconds. The SVG may contain fonts or images that failed to load.'));
      }, 15000);

      image.onload = () => {
        clearTimeout(timeout);
        if (timedOut) return;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.width || 1;
          canvas.height = image.height || 1;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error('Export failed: Could not create raster canvas.'));
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0);
          URL.revokeObjectURL(url);
          if (DEV) console.log('[ExportManager] SVG rasterized successfully:', { w: canvas.width, h: canvas.height });
          resolve(canvas.toDataURL(mimeType, mimeType === 'image/jpeg' ? 0.95 : undefined));
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(new Error('Export failed: SVG rasterization canvas error: ' + (err instanceof Error ? err.message : 'Unknown')));
        }
      };

      image.onerror = (_, __, ___, ____, error) => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        const detail = error instanceof Error ? error.message : 'Could not render SVG (possibly due to unsupported elements or missing fonts/images)';
        reject(new Error('Export failed: SVG rasterization failed. ' + detail));
      };

      image.src = url;
    });
  }

  static async rasterizeSvgWithFallback(
    svg: string,
    mimeType: 'image/png' | 'image/jpeg',
    fallbackCanvas?: () => HTMLCanvasElement | null
  ): Promise<string> {
    try {
      await ExportManager.waitForFonts();
      return await ExportManager.rasterizeSvg(svg, mimeType);
    } catch (svgErr) {
      console.error('[ExportManager] SVG rasterization failed, trying fallback:', svgErr);
      if (fallbackCanvas) {
        try {
          const fc = fallbackCanvas();
          if (fc) {
            const result = await ExportManager.rasterizeCanvasTo(fc, mimeType);
            console.log('[ExportManager] Fallback canvas export succeeded');
            return result;
          }
        } catch (fallbackErr) {
          console.error('[ExportManager] Fallback canvas export also failed:', fallbackErr);
        }
      }
      throw svgErr;
    }
  }

  static generatePdfBlob(pages: Array<{ dataUrl: string; width: number; height: number }>): Blob {
    const encoder = new TextEncoder();
    const chunks: Uint8Array[] = [];
    const objOffsets: number[] = [];

    const write = (str: string) => chunks.push(encoder.encode(str));
    const writeBinary = (data: Uint8Array) => chunks.push(data);
    const offset = () => chunks.reduce((s, c) => s + c.length, 0);

    if (!pages || pages.length === 0) {
      throw new Error('Export failed: No pages to export.');
    }

    const imgs = pages.map((p, i) => {
      if (!p.dataUrl || typeof p.dataUrl !== 'string') {
        throw new Error(`Export failed: Page ${i + 1} has no image data.`);
      }
      let parsed: ReturnType<typeof ExportManager.parseDataUrl>;
      try {
        parsed = ExportManager.parseDataUrl(p.dataUrl);
      } catch {
        throw new Error(`Export failed: Page ${i + 1} has invalid image data.`);
      }
      if (!parsed.isBase64) {
        throw new Error(`Export failed: Page ${i + 1} must be a raster image (PNG/JPEG). SVG data URLs are not supported for PDF embedding.`);
      }
      const bytes = ExportManager.base64ToBytes(parsed.data);
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

  static generateDocxContent(pages: { content?: string; width: number; height: number }[], docName: string): string {
    let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><title>' + docName + '</title></head><body>';
    pages.forEach((page, i) => {
      const content = page.content && page.content.trim() ? page.content : '<p><br></p>';
      html += `<div style="page-break-after:${i === pages.length - 1 ? 'auto' : 'always'}">${content}</div>`;
    });
    html += '</body></html>';
    return html;
  }

  static downloadBlob(blob: Blob, filename: string, onSuccess?: () => void): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onSuccess?.();
  }
}