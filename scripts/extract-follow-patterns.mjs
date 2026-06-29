import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const triggers = [
    {
        func: 'trigger_func_skrypty_ui_special_exits_follow',
        output: 'src/client/scripts/follow_special_exits_patterns.json'
    }
];

for (const { func, output } of triggers) {
    console.log(`Extracting ${func}...`);
    execSync(`node "${path.join(__dirname, 'extract-trigger-patterns.mjs')}" ${func} > "${output}"`, {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit'
    });
    console.log(`  -> ${output}`);
}

console.log('Done.');
