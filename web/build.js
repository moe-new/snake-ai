'use strict';
// Build the lab as one self-contained page: web/dist/tuilu-lab.html. It inlines the engine
// (web/engine, in load order: each file reads the ones before it), the page's own code and
// styles, and the title image. No network, no dependencies.
//   node web/build.js
const fs = require('fs'), path = require('path');
const WEB = __dirname, OUT = path.join(WEB, 'dist', 'tuilu-lab.html');
const ENGINE = ['snake.js', 'four-way.js', 'hybrid.js', 'bfs-handoff.js', 'adaptive.js', 'tiled-directed.js', 'simple-directed-graph.js', 'tiled-simple.js', 'c-directed.js'];
const read = (...p) => fs.readFileSync(path.join(WEB, ...p), 'utf8');

const engine = ENGINE.map(f => `// web/engine/${f}\n${read('engine', f).trim()}`).join('\n');
const app = ['draw.js', 'play.js', 'app.js'].map(f => `// web/lab/${f}\n${read('lab', f).replace(/^'use strict';\n/, '')}`).join('\n');
const title = 'data:image/png;base64,' + fs.readFileSync(path.join(WEB, 'lab', 'title.png')).toString('base64');
const page = read('lab', 'index.html')
  .replace('/*STYLE*/', () => read('lab', 'style.css'))
  .replace('/*TITLE*/', () => title)
  .replace('/*ENGINE*/', () => engine)
  .replace('/*APP*/', () => `(function () {\n'use strict';\n${app}\n})();`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page);
console.log(`wrote ${path.relative(path.dirname(WEB), OUT)} (${(page.length / 1024).toFixed(0)} KB)`);
