import xml2js from "xml2js";
import xpath from "xml2js-xpath";
import * as fs from "node:fs";

const ARKADIA_XML_URL = "https://raw.githubusercontent.com/tjurczyk/arkadia/master/Arkadia.xml";

async function generateBlockers() {
    console.log(`Downloading Arkadia.xml from ${ARKADIA_XML_URL}...`);
    const response = await fetch(ARKADIA_XML_URL);
    if (!response.ok) {
        throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }
    const data = await response.text();
    console.log("Download complete. Parsing XML...");

    let results = [];
    xml2js.parseString(data, (err, document) => {
        if (err) {
            throw err;
        }
        let matches = xpath
            .find(document, '//Trigger').filter(trigger => trigger.script.indexOf('trigger_func_mapper_blockers_blocker()') > -1)
            .map(trigger => {
                return trigger.regexCodeList[0].string.map((item, index) => ({pattern: item, type: trigger.regexCodePropertyList[0].integer[index]}))
            });
        results = results.concat(...matches);
    });
    fs.writeFileSync('./src/client/blockers.json', JSON.stringify(results, null, 2));
    console.log(`${results.length} blockers generated.`);
}

generateBlockers().catch(err => {
    console.error("Error:", err.message);
    process.exit(1);
});