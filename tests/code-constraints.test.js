const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const MAX_LINES = 500;
const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_EXTENSIONS = new Set(['.html', '.js', '.css']);

function collectSourceFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

test('keeps every HTML, JS, and CSS file at or below 500 lines', () => {
  const files = collectSourceFiles(ROOT_DIR);
  assert.ok(files.length > 0, 'Expected source files to check');

  const violations = [];
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lineCount = content.split(/\r?\n/).length;
    if (lineCount > MAX_LINES) {
      violations.push(`${path.relative(ROOT_DIR, filePath)} has ${lineCount} lines (max ${MAX_LINES})`);
    }
  }

  assert.deepEqual(violations, []);
});

test('keeps HTML entry pages free of inline script logic', () => {
  for (const htmlFile of ['fleet-summary.html', 'driver-schedule.html']) {
    const html = fs.readFileSync(path.join(ROOT_DIR, htmlFile), 'utf8');
    const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    assert.ok(scriptTags.length > 0, `Expected external script tags in ${htmlFile}`);

    for (const [, attrs, body] of scriptTags) {
      assert.match(attrs, /\bsrc=/i, `Every script tag in ${htmlFile} should load an external file`);
      assert.equal(body.trim(), '', `Script tags in ${htmlFile} must not contain inline code`);
    }
  }
});
