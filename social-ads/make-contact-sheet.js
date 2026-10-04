const fs = require('fs');
const d = 'assets';
const files = fs.readdirSync(d).filter((f) => /\.(avif|webp|jpe?g|png)$/i.test(f));
const cells = files.map((f) => `<figure><img src="${d}/${encodeURIComponent(f)}"><figcaption>${f}</figcaption></figure>`).join('');
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;box-sizing:border-box}body{background:#111;color:#fff;font:16px Arial;padding:20px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}figure{background:#1e1e1e;border-radius:10px;overflow:hidden}img{width:100%;height:260px;object-fit:cover;display:block}figcaption{padding:8px 10px;font-size:14px;color:#8fd;word-break:break-all}</style></head><body><div class="grid">${cells}</div></body></html>`;
fs.writeFileSync('contact-sheet.html', html);
console.log('cells', files.length);
