import * as fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");

const SPREADSHEET_ID = "1DLHRkU-_Ms2l5zqkP3WVw55vHeuiDdd83R9ihdl4dsA";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;
const WIEDZA_URL = "https://ethel.pl/wp-admin/admin-ajax.php?action=wiedza_data";

// Column indices in the spreadsheet (0-based)
const COL_RODZAJ = 5;
const COL_WIEDZA = 6;
const COL_ID = 7;
const COL_DOMENA = 8;
const COL_LOKALIZACJA = 9;
const COL_NOTE = 10;

// Category config matching knowledgeCategories.ts order
const KNOWLEDGE_CATEGORY_CONFIG = [
    { base: "Chaos i jego twory", dative: "chaosie i jego tworach" },
    { base: "goblinoidy", dative: "goblinoidach" },
    { base: "golemy", dative: "golemach" },
    { base: "istoty demoniczne", dative: "istotach demonicznych" },
    { base: "jaszczuroludzie", dative: "jaszczuroludziach" },
    { base: "magia i jej twory", dative: "magii i jej tworach" },
    { base: "nieumarli", dative: "nieumarlych" },
    { base: "pajaki i pajakowate", dative: "pajakach i pajakowatych" },
    { base: "ryboludzie", dative: "ryboludziach" },
    { base: "smoki i smokowate", dative: "smokach i smokowatych" },
    { base: "starsze rasy", dative: "starszych rasach" },
    { base: "stwory pokoniunkcyjne", dative: "stworach pokoniunkcyjnych" },
    { base: "szczuroludzie", dative: "szczuroludziach" },
    { base: "wampiry", dative: "wampirach" },
];

const POLISH_MAP = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n',
    'ó': 'o', 'ś': 's', 'ż': 'z', 'ź': 'z',
    'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N',
    'Ó': 'O', 'Ś': 'S', 'Ż': 'Z', 'Ź': 'Z',
};

function stripPolishCharacters(input) {
    return Array.from(input).map(ch => POLISH_MAP[ch] || ch).join('');
}

function normalizeEntry(value) {
    return stripPolishCharacters(value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/u, ''));
}

// Build dative-to-base lookup
const dativeToBase = new Map();
for (const config of KNOWLEDGE_CATEGORY_CONFIG) {
    dativeToBase.set(
        stripPolishCharacters(config.dative.toLowerCase()),
        config.base,
    );
}

function rodzajToCategory(rodzaj) {
    // "Wiedza o Chaosie i jego tworach" -> "Chaosie i jego tworach" -> dative lookup
    const dativePart = rodzaj.replace(/^Wiedza o /i, "");
    const normalized = stripPolishCharacters(dativePart.trim().toLowerCase());
    return dativeToBase.get(normalized) || null;
}

function extractStrings(value) {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? [trimmed] : [];
    }
    if (Array.isArray(value)) {
        const result = [];
        for (const entry of value) {
            result.push(...extractStrings(entry));
        }
        return result;
    }
    if (value && typeof value === "object") {
        const result = [];
        for (const entry of Object.values(value)) {
            result.push(...extractStrings(entry));
        }
        return result;
    }
    return [];
}

function parseCSV(text) {
    const rows = [];
    let current = "";
    let inQuotes = false;
    let row = [];

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ",") {
                row.push(current);
                current = "";
            } else if (ch === "\n") {
                row.push(current);
                current = "";
                rows.push(row);
                row = [];
            } else if (ch !== "\r") {
                current += ch;
            }
        }
    }
    if (current || row.length > 0) {
        row.push(current);
        rows.push(row);
    }
    return rows;
}

async function main() {
    // 1. Fetch spreadsheet data
    console.log("Fetching knowledge data from Google Sheets...");
    const csvResponse = await fetch(CSV_URL);
    if (!csvResponse.ok) {
        throw new Error(`Failed to fetch spreadsheet: ${csvResponse.status} ${csvResponse.statusText}`);
    }
    const csvText = await csvResponse.text();
    console.log("Spreadsheet download complete. Parsing CSV...");

    const rows = parseCSV(csvText);
    const entries = [];

    for (const row of rows) {
        const rodzaj = row[COL_RODZAJ]?.trim();
        const wiedza = row[COL_WIEDZA]?.trim();

        if (!rodzaj || !wiedza || rodzaj === "Rodzaj") continue;
        if (!rodzaj.startsWith("Wiedza o ")) continue;

        const idStr = row[COL_ID]?.trim();
        const id = idStr ? parseInt(idStr, 10) : null;

        entries.push({
            Rodzaj: rodzaj,
            Wiedza: wiedza,
            id: isNaN(id) ? null : id,
            Domena: row[COL_DOMENA]?.trim() || "",
            lokalizacja: row[COL_LOKALIZACJA]?.trim() || "",
            note: row[COL_NOTE]?.trim() || "",
        });
    }

    const outputPath = path.join(rootDir, "src", "client", "knowledge.json");
    fs.writeFileSync(outputPath, JSON.stringify(entries, null, 2) + "\n");
    console.log(`${entries.length} knowledge entries written to src/client/knowledge.json`);

    // 2. Fetch canonical knowledge from ethel.pl
    console.log("\nFetching canonical knowledge from ethel.pl...");
    const wiedzaResponse = await fetch(WIEDZA_URL);
    if (!wiedzaResponse.ok) {
        throw new Error(`Failed to fetch wiedza: ${wiedzaResponse.status} ${wiedzaResponse.statusText}`);
    }
    const wiedzaJson = await wiedzaResponse.json();
    const canonicalPath = path.join(rootDir, "data", "wiedza-canonical.json");
    fs.writeFileSync(canonicalPath, JSON.stringify(wiedzaJson, null, 2) + "\n");
    console.log(`Canonical knowledge written to data/wiedza-canonical.json`);

    // 3. Parse canonical data (same logic as wiedzaStore.ts)
    const apiCategories = Array.isArray(wiedzaJson?.data?.data) ? wiedzaJson.data.data : [];

    // canonical: category base name -> Set of normalized entries
    const canonicalByCategory = new Map();
    // canonical: category base name -> Map of normalized -> original string
    const canonicalOriginals = new Map();

    apiCategories.forEach((category, index) => {
        const config = KNOWLEDGE_CATEGORY_CONFIG[index];
        if (!config) return;

        const strings = extractStrings(category);
        const normalizedSet = new Set();
        const originals = new Map();

        for (const s of strings) {
            const normalized = normalizeEntry(s);
            if (normalized.length > 0 && !normalizedSet.has(normalized)) {
                normalizedSet.add(normalized);
                originals.set(normalized, s.trim());
            }
        }

        canonicalByCategory.set(config.base, normalizedSet);
        canonicalOriginals.set(config.base, originals);
    });

    // 4. Build spreadsheet lookup: category base name -> Set of normalized entries
    const spreadsheetByCategory = new Map();
    const spreadsheetOriginals = new Map();

    for (const entry of entries) {
        const category = rodzajToCategory(entry.Rodzaj);
        if (!category) continue;

        if (!spreadsheetByCategory.has(category)) {
            spreadsheetByCategory.set(category, new Set());
            spreadsheetOriginals.set(category, new Map());
        }

        const normalized = normalizeEntry(entry.Wiedza);
        if (normalized.length > 0 && !spreadsheetByCategory.get(category).has(normalized)) {
            spreadsheetByCategory.get(category).add(normalized);
            spreadsheetOriginals.get(category).set(normalized, entry.Wiedza);
        }
    }

    // 5. Compare and print differences
    console.log("\n========================================");
    console.log("  COMPARISON: Spreadsheet vs Canonical");
    console.log("========================================\n");

    let totalMissingInCanonical = 0;
    let totalMissingInSpreadsheet = 0;

    for (const config of KNOWLEDGE_CATEGORY_CONFIG) {
        const category = config.base;
        const canonical = canonicalByCategory.get(category) || new Set();
        const spreadsheet = spreadsheetByCategory.get(category) || new Set();
        const canonicalOrig = canonicalOriginals.get(category) || new Map();
        const spreadsheetOrig = spreadsheetOriginals.get(category) || new Map();

        const missingInCanonical = [];
        for (const normalized of spreadsheet) {
            if (!canonical.has(normalized)) {
                missingInCanonical.push(spreadsheetOrig.get(normalized) || normalized);
            }
        }

        const missingInSpreadsheet = [];
        for (const normalized of canonical) {
            if (!spreadsheet.has(normalized)) {
                missingInSpreadsheet.push(canonicalOrig.get(normalized) || normalized);
            }
        }

        if (missingInCanonical.length === 0 && missingInSpreadsheet.length === 0) {
            continue;
        }

        console.log(`--- ${category} (spreadsheet: ${spreadsheet.size}, canonical: ${canonical.size}) ---`);

        if (missingInCanonical.length > 0) {
            console.log(`  In spreadsheet but NOT in canonical (${missingInCanonical.length}):`);
            for (const entry of missingInCanonical) {
                console.log(`    - ${entry}`);
            }
            totalMissingInCanonical += missingInCanonical.length;
        }

        if (missingInSpreadsheet.length > 0) {
            console.log(`  In canonical but NOT in spreadsheet (${missingInSpreadsheet.length}):`);
            for (const entry of missingInSpreadsheet) {
                console.log(`    + ${entry}`);
            }
            totalMissingInSpreadsheet += missingInSpreadsheet.length;
        }

        console.log();
    }

    console.log("========================================");
    console.log(`  Total in spreadsheet but not canonical: ${totalMissingInCanonical}`);
    console.log(`  Total in canonical but not spreadsheet: ${totalMissingInSpreadsheet}`);
    console.log("========================================");
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
