import { createAnsiClickPattern } from "./stripAnsiCodes";

export class AnsiAwareBuffer {
    private readonly raw: string;
    private readonly plainChars: string[] = [];
    private readonly plainToRaw: number[] = [];
    private rawLength = 0;

    constructor(rawLine: string) {
        this.raw = rawLine;
        this.parse();
    }

    private parse() {
        const matcher = createAnsiClickPattern("g");
        let cursor = 0;
        let match: RegExpExecArray | null;
        const appendChunk = (chunk: string) => {
            for (let i = 0; i < chunk.length; i++) {
                this.plainToRaw.push(this.rawLength);
                this.plainChars.push(chunk[i]);
                this.rawLength += 1;
            }
        };

        while ((match = matcher.exec(this.raw)) !== null) {
            const start = match.index;
            const chunk = this.raw.slice(cursor, start);
            appendChunk(chunk);
            this.rawLength += match[0].length;
            cursor = matcher.lastIndex;
        }

        const rest = this.raw.slice(cursor);
        appendChunk(rest);
    }

    getPlainText(): string {
        return this.plainChars.join("");
    }

    mapPlainIndexToRaw(index: number): number {
        if (index <= 0) {
            return 0;
        }
        if (index >= this.plainToRaw.length) {
            return this.rawLength;
        }
        return this.plainToRaw[index];
    }

    getRawLength(): number {
        return this.rawLength;
    }
}

export default AnsiAwareBuffer;
