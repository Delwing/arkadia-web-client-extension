import * as fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");

const SPREADSHEET_ID = "1DLHRkU-_Ms2l5zqkP3WVw55vHeuiDdd83R9ihdl4dsA";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;

// Column indices in the spreadsheet (0-based)
const COL_RODZAJ = 5;
const COL_WIEDZA = 6;
const COL_ID = 7;
const COL_DOMENA = 8;
const COL_LOKALIZACJA = 9;
const COL_NOTE = 10;

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
    console.log(`Fetching knowledge data from Google Sheets...`);
    const response = await fetch(CSV_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }
    const csvText = await response.text();
    console.log("Download complete. Parsing CSV...");

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
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
