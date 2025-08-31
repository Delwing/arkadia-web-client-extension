export interface Alias {
    pattern: string;
    command: string;
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseBlowtorch(text: string): Alias[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "application/xml");
    const nodes = Array.from(doc.querySelectorAll("aliases > alias"));
    const result: Alias[] = [];
    for (const el of nodes) {
        const pre = el.getAttribute("pre");
        const post = el.getAttribute("post");
        if (!pre || !post) continue;
        let pattern = escapeRegex(pre.trim());
        const matches = Array.from(post.matchAll(/\$(\d+)/g));
        if (matches.length) {
            const count = Math.max(...matches.map(m => Number(m[1])));
            for (let i = 1; i <= count; i++) {
                pattern += `\\s+(\\w+)`;
            }
        }
        pattern = `^${pattern}$`;
        result.push({ pattern, command: post.trim() });
    }
    return result;
}
