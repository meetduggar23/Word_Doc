declare module 'fabric' {
  export const fabric: fabric.FabricStatic;

  namespace fabric {
    interface FabricStatic {
      Canvas: typeof Canvas;
      Object: typeof Object;
      Image: typeof Image;
      IText: typeof IText;
      Textbox: typeof Textbox;
      Rect: typeof Rect;
      Ellipse: typeof Ellipse;
      Triangle: typeof Triangle;
      Line: typeof Line;
      Polygon: typeof Polygon;
      Path: typeof Path;
      Point: typeof Point;
      ActiveSelection: typeof ActiveSelection;
    }

    class Point {
      constructor(x: number, y: number);
      x: number;
      y: number;
    }

    class Canvas {
      constructor(el: HTMLCanvasElement, options?: any);
      width: number;
      height: number;
      backgroundColor: string;
      selection: boolean;
      defaultCursor: string;
      setWidth(value: number): void;
      setHeight(value: number): void;
      add(obj: any): void;
      remove(obj: any): void;
      renderAll(): void;
      getObjects(): any[];
      getActiveObject(): any;
      setActiveObject(obj: any): void;
      discardActiveObject(): void;
      toDataURL(options?: any): string;
      toJSON(propertiesToInclude?: string[]): any;
      loadFromJSON(json: any, callback?: () => void, reviver?: any): void;
      toSVG(): string;
      dispose(): void;
      on(event: string, handler: (...args: any[]) => void): void;
      setCursor(cursor: string): void;
      getPointer(e: any): { x: number; y: number };
      getZoom(): number;
      setZoom(value: number): void;
      zoomToPoint(point: { x: number; y: number }, value: number): void;
      isDrawingMode: boolean;
      freeDrawingBrush: any;
      lowerCanvasEl: HTMLCanvasElement;
      forEachObject(callback: (obj: any, index: number, objects: any[]) => void): void;
      getObjects(type?: string): any[];
      item(index: number): any;
      isEmpty(): boolean;
      size(): number;
      _objects: any[];
    }

    class Object {
      static prototype: any;
      left: number;
      top: number;
      width: number;
      height: number;
      scaleX: number;
      scaleY: number;
      angle: number;
      type: string;
      controls: any;
      hasControls: boolean;
      hasBorders: boolean;
      lockUniScaling: boolean;
      lockScalingFlip: boolean;
      padding: number;
      evented: boolean;
      editable: boolean;
      fontSize: number;
      fontFamily: string;
      fill: string;
      backgroundColor: string;
      stroke: string;
      strokeWidth: number;
      strokeUniform: boolean;
      opacity: number;
      selectable: boolean;
      name: string;
      set(options: any): void;
      setControlsVisibility(visibility: any): void;
      setCoords(): void;
      center(): void;
      centerH(): void;
      centerV(): void;
      clone(callback: (cloned: any) => void, propertiesToInclude?: string[]): void;
      bringForward(intersecting?: boolean): void;
      sendBackwards(intersecting?: boolean): void;
      sendToBack(): void;
      bringToFront(): void;
      toDataURL(options?: any): string;
      toJSON(): any;
      toSVG(): string;
      viewportCenter(): void;
    }

    class Image extends Object {
      static fromURL(url: string, callback: (img: Image) => void, imgOptions?: any): void;
      setSrc(url: string): void;
      getSvgCommons(): string;
      getSvgFilter(): string;
    }

    class IText extends Object {
      constructor(text: string, options?: any);
      text: string;
      fontSize: number;
      fontFamily: string;
      fill: string;
      backgroundColor: string;
      padding: number;
      editable: boolean;
    }

    class Textbox extends IText {
      constructor(text: string, options?: any);
    }

    class Rect extends Object {
      constructor(options?: any);
      rx: number;
      ry: number;
    }

    class Ellipse extends Object {
      constructor(options?: any);
      rx: number;
      ry: number;
    }

    class Triangle extends Object {
      constructor(options?: any);
    }

    class Line extends Object {
      constructor(points: number[], options?: any);
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }

    class Polygon extends Object {
      constructor(points: Point[], options?: any);
      points: Point[];
    }

    class Path extends Object {
      constructor(path: string | any[], options?: any);
      path: any[];
    }

    class ActiveSelection extends Object {
      constructor(objects: any[], options?: any);
    }
  }
}
