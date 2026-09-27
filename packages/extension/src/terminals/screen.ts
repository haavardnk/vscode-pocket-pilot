import {
  SEGMENT_BOLD,
  SEGMENT_DIM,
  SEGMENT_INVERSE,
  SEGMENT_ITALIC,
  SEGMENT_STRIKETHROUGH,
  SEGMENT_UNDERLINE,
  type TerminalColor,
  type TerminalLine,
  type TerminalSegment
} from '@pocket-pilot/protocol';
import { type IBuffer, type IBufferCell, type IMarker, Terminal } from '@xterm/headless';

const COLS = 200;
const ROWS = 40;
const SCROLLBACK = 1000;
const CHUNK_LINES = 500;
const MAX_JOINED_ROWS = 50;

function chunks(data: string): string[] {
  const pieces: string[] = [];
  let start = 0;
  let count = 0;
  for (let index = data.indexOf('\n'); index !== -1; index = data.indexOf('\n', index + 1)) {
    count += 1;
    if (count < CHUNK_LINES) continue;
    pieces.push(data.slice(start, index + 1));
    start = index + 1;
    count = 0;
  }
  if (start < data.length) pieces.push(data.slice(start));
  return pieces;
}

function color(isDefault: boolean, isRgb: boolean, value: number): TerminalColor {
  if (isDefault) return null;
  return isRgb ? `#${value.toString(16).padStart(6, '0')}` : value;
}

function cellFlags(cell: IBufferCell): number {
  return (
    (cell.isBold() ? SEGMENT_BOLD : 0) |
    (cell.isDim() ? SEGMENT_DIM : 0) |
    (cell.isItalic() ? SEGMENT_ITALIC : 0) |
    (cell.isUnderline() ? SEGMENT_UNDERLINE : 0) |
    (cell.isInverse() ? SEGMENT_INVERSE : 0) |
    (cell.isStrikethrough() ? SEGMENT_STRIKETHROUGH : 0)
  );
}

function blank(segment: TerminalSegment): boolean {
  return segment.bg === null && (segment.flags & SEGMENT_INVERSE) === 0 && !segment.text.trim();
}

function trimEnd(line: TerminalLine): TerminalLine {
  while (line.length > 0 && blank(line[line.length - 1] as TerminalSegment)) line.pop();
  const last = line.at(-1);
  if (last && last.bg === null && (last.flags & SEGMENT_INVERSE) === 0) {
    last.text = last.text.trimEnd();
  }
  return line;
}

function appendRow(buffer: IBuffer, row: number, cell: IBufferCell, line: TerminalLine): void {
  const source = buffer.getLine(row);
  if (!source) return;
  for (let x = 0; x < source.length; x++) {
    source.getCell(x, cell);
    if (cell.getWidth() === 0) continue;
    const text = cell.getChars() || ' ';
    const fg = color(cell.isFgDefault(), cell.isFgRGB(), cell.getFgColor());
    const bg = color(cell.isBgDefault(), cell.isBgRGB(), cell.getBgColor());
    const flags = cellFlags(cell);
    const last = line.at(-1);
    if (last && last.fg === fg && last.bg === bg && last.flags === flags) last.text += text;
    else line.push({ text, fg, bg, flags });
  }
}

function logicalLines(
  buffer: IBuffer,
  cell: IBufferCell,
  from: number,
  to: number
): TerminalLine[] {
  const lines: TerminalLine[] = [];
  let joined = 0;
  for (let row = from; row < to; row++) {
    const current = lines.at(-1);
    const wrapped = row > from && buffer.getLine(row)?.isWrapped === true;
    if (current && wrapped && joined < MAX_JOINED_ROWS) {
      joined += 1;
      appendRow(buffer, row, cell, current);
      continue;
    }
    if (current) trimEnd(current);
    const line: TerminalLine = [];
    joined = 1;
    appendRow(buffer, row, cell, line);
    lines.push(line);
  }
  const last = lines.at(-1);
  if (last) trimEnd(last);
  return lines;
}

function withoutTrailingBlanks(lines: TerminalLine[]): TerminalLine[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1]?.length === 0) end -= 1;
  return lines.slice(0, end);
}

export class ExecutionScreen {
  readonly lines: TerminalLine[] = [];
  dropped = 0;
  tail: TerminalLine[] = [];
  alternate = false;

  private readonly terminal = new Terminal({
    cols: COLS,
    rows: ROWS,
    scrollback: SCROLLBACK,
    allowProposedApi: true
  });
  private readonly cell: IBufferCell;
  private harvested = 0;
  private anchor: IMarker | undefined;
  private written: Promise<void> = Promise.resolve();
  private readonly pending = new Set<() => void>();
  private finished = false;
  private disposed = false;
  constructor(private readonly maxLines: number) {
    this.cell = this.terminal.buffer.normal.getNullCell();
  }

  get total(): number {
    return this.dropped + this.lines.length;
  }

  write(data: string): Promise<void> {
    if (this.finished) return Promise.resolve();
    for (const chunk of chunks(data)) {
      this.written = new Promise((resolve) => {
        this.pending.add(resolve);
        this.terminal.write(chunk, () => {
          this.pending.delete(resolve);
          if (!this.disposed) this.capture();
          resolve();
        });
      });
    }
    return this.written;
  }

  async finish(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    await this.written;
    if (this.disposed) return;
    const buffer = this.terminal.buffer.normal;
    this.harvest(
      withoutTrailingBlanks(logicalLines(buffer, this.cell, this.start(buffer), buffer.length))
    );
    this.tail = [];
    this.alternate = false;
    this.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.finished = true;
    this.disposed = true;
    this.anchor?.dispose();
    this.terminal.dispose();
    for (const resolve of this.pending) resolve();
    this.pending.clear();
  }

  private start(buffer: IBuffer): number {
    if (!this.anchor) return this.harvested;
    return this.anchor.isDisposed ? 0 : Math.min(this.anchor.line, buffer.length);
  }

  private capture(): void {
    const active = this.terminal.buffer.active;
    this.alternate = active.type === 'alternate';
    if (this.alternate) {
      this.tail = withoutTrailingBlanks(
        logicalLines(active, this.cell, active.baseY, active.length)
      );
      return;
    }
    this.harvested = this.start(active);
    let end = active.baseY;
    for (
      let back = 0;
      back < MAX_JOINED_ROWS && end > this.harvested && active.getLine(end)?.isWrapped;
      back++
    ) {
      end -= 1;
    }
    if (end > this.harvested) {
      this.harvest(logicalLines(active, this.cell, this.harvested, end));
      this.harvested = end;
      this.anchor?.dispose();
      this.anchor = this.terminal.registerMarker(end - active.baseY - active.cursorY);
    }
    this.tail = withoutTrailingBlanks(
      logicalLines(active, this.cell, this.harvested, active.length)
    );
  }

  private harvest(lines: TerminalLine[]): void {
    this.lines.push(...lines);
    const excess = this.lines.length - this.maxLines;
    if (excess <= 0) return;
    this.lines.splice(0, excess);
    this.dropped += excess;
  }
}
