import { type Rect, rectsIntersect } from "./geometry";

/**
 * Which elements are near a place, without looking at all of them. Scene space is cut into
 * square cells and each element is listed in every cell its bounds touch, so drawing the
 * view or moving the eraser only checks what is nearby. A cache the canvas keeps in step
 * with its scene, not state: it is rebuilt from the scene whenever in doubt.
 */
export class SpatialIndex {
  readonly cellSize: number;
  private readonly cells = new Map<string, Set<string>>();
  private readonly rects = new Map<string, Rect>();
  /** The cells each element is listed in, so removing it looks nothing up. */
  private readonly membership = new Map<string, Array<[string, Set<string>]>>();

  constructor(cellSize = 256) {
    this.cellSize = cellSize;
  }

  get size(): number {
    return this.rects.size;
  }

  private cellKeys(rect: Rect): string[] {
    const keys: string[] = [];
    const [left, top] = [Math.floor(rect.x / this.cellSize), Math.floor(rect.y / this.cellSize)];
    const right = Math.floor((rect.x + rect.width) / this.cellSize);
    const bottom = Math.floor((rect.y + rect.height) / this.cellSize);
    for (let column = left; column <= right; column += 1) {
      for (let row = top; row <= bottom; row += 1) {
        keys.push(`${column}:${row}`);
      }
    }

    return keys;
  }

  /** Adds an element, or moves it if it is already listed. */
  insert(id: string, rect: Rect): void {
    this.remove(id);
    this.rects.set(id, rect);
    const cells = this.cellKeys(rect).map((key): [string, Set<string>] => {
      const cell = this.cells.get(key) ?? new Set<string>();
      cell.add(id);
      this.cells.set(key, cell);

      return [key, cell];
    });
    this.membership.set(id, cells);
  }

  remove(id: string): void {
    for (const [key, cell] of this.membership.get(id) ?? []) {
      cell.delete(id);
      if (!cell.size) {
        this.cells.delete(key);
      }
    }
    this.membership.delete(id);
    this.rects.delete(id);
  }

  /** Every element whose bounds touch `rect`. */
  query(rect: Rect): Set<string> {
    const found = new Set<string>();
    for (const key of this.cellKeys(rect)) {
      for (const id of this.cells.get(key) ?? []) {
        const bounds = this.rects.get(id);
        if (bounds && rectsIntersect(bounds, rect)) {
          found.add(id);
        }
      }
    }

    return found;
  }

  bounds(id: string): Rect | undefined {
    return this.rects.get(id);
  }
}
