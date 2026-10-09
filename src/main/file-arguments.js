'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

function filesFromArgv(argv, cwd = process.cwd()) {
  const files = [];
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-')) continue;
    try {
      // Linux desktop launchers use %U and can deliver file:// URLs.
      const filename = /^file:/i.test(arg) ? fileURLToPath(arg) : path.resolve(cwd, arg);
      if (fs.statSync(filename).isFile() && !files.includes(filename)) files.push(filename);
    } catch { /* ignore flags, missing files and invalid URLs */ }
  }
  return files;
}
module.exports = { filesFromArgv };
