// build-standalone.js — 분리된 앱(index.html + css/ + js/)을 하나의 자립형
// HTML(dist/index.html)로 인라인한다. Claude Artifact 등 단일 파일
// 호스팅용. GitHub Pages 는 멀티파일 원본을 그대로 서빙하므로 불필요.
//
//   node scripts/build-standalone.js
//
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..');

const css = fs.readFileSync(path.join(R, 'css/styles.css'), 'utf8');
const js = ['js/seed.js', 'js/srs.js', 'js/store.js', 'js/app.js']
  .map((f) => `/* ===== ${f} ===== */\n` + fs.readFileSync(path.join(R, f), 'utf8'))
  .join('\n')
  // 단일 파일 빌드에는 별도 sw.js 가 없으므로 서비스워커 등록을 제거(404 방지).
  .replace(/\s*if \('serviceWorker' in navigator\) \{[\s\S]*?\.catch\(\(\) => \{\}\);\s*\}/,
           '\n  // (single-file build: service worker omitted)');

// 라이트가 기본(:root), 다크는 prefers-color-scheme 로 정의되어 있다.
// Artifact 뷰어의 명시적 data-theme 토글도 존중하도록 토큰을 미러링한다.
const darkTokens = `
  --bg:#0f141b; --surface:#182028; --surface-2:#1f2937; --text:#e7edf5;
  --text-muted:#93a1b5; --border:#2b3644; --primary:#3b82f6; --right:#22c55e;
  --wrong:#ef4444; --seed:#a78bfa; --accent:#22d3ee;
  --shadow:0 1px 3px rgba(0,0,0,.4);`;
const lightTokens = `
  --bg:#f4f6f9; --surface:#ffffff; --surface-2:#eef1f6; --text:#1a2230;
  --text-muted:#5c6a7e; --border:#d9dfe8; --primary:#2563eb; --right:#16a34a;
  --wrong:#dc2626; --seed:#7c3aed; --accent:#0891b2;
  --shadow:0 1px 3px rgba(20,30,50,.08),0 1px 2px rgba(20,30,50,.06);`;
const themeShim = `
/* Explicit theme-stamp support (light = base :root; dark mirrored) */
:root[data-theme="dark"]{${darkTokens}}
@media (prefers-color-scheme: dark){ :root[data-theme="light"]{${lightTokens}} }`;

const out = `<title>무역자격 드릴</title>
<style>
${css}
${themeShim}
</style>
<div id="app">
  <noscript>이 앱은 JavaScript 가 필요합니다.</noscript>
  <div class="container"><p class="hint">불러오는 중…</p></div>
</div>
<script>
${js}
</script>
`;

fs.mkdirSync(path.join(R, 'dist'), { recursive: true });
fs.writeFileSync(path.join(R, 'dist/index.html'), out);
console.log('wrote dist/index.html', out.length, 'bytes');
