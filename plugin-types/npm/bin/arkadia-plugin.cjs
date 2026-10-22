#!/usr/bin/env node
// `types` lives here so it works even when ../latest is missing or broken;
// every other command belongs to the downloaded tools.
const fs = require('node:fs');
const path = require('node:path');
const { fetchTypes } = require('./fetch.cjs');

const argv = process.argv.slice(2);
const cli = path.join(__dirname, '..', 'latest', 'cli', 'arkadia-plugin.cjs');

if (argv[0] === 'types') {
  fetchTypes().catch(error => {
    console.error(`Could not download Arkadia plugin types: ${error.message}`);
    process.exit(1);
  });
} else if (!fs.existsSync(cli)) {
  console.error('arkadia-plugin: the tools are missing. Run `npx arkadia-plugin types` to download them.');
  process.exit(1);
} else {
  require(cli).main(argv).catch(error => {
    console.error(error);
    process.exit(1);
  });
}
