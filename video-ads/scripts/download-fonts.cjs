const fs = require("fs");
const path = require("path");
const FONT_DIR = path.join(__dirname, "..", "src", "fonts");
const CSS_URL = "https://fonts.googleapis.com/css2?family=Sora:wght@400;600;800&display=swap";
async function main() {
  const res = await fetch(CSS_URL, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" } });
  const css = await res.text();
  const blocks = css.split("@font-face").slice(1);
  const seen = {};
  const rules = [];
  for (const block of blocks) {
    const weight = (block.match(/font-weight:\s*(\d+)/) || [])[1];
    const range = (block.match(/unicode-range:\s*([^;]+);/) || [])[1];
    const url = (block.match(/url\((https:\/\/[^)]+\.woff2)\)/) || [])[1];
    if (!weight || !url) continue;
    const n = seen[weight] = (seen[weight] || 0) + 1;
    const file = `sora-${weight}-${n}.woff2`;
    const data = await (await fetch(url)).arrayBuffer();
    fs.writeFileSync(path.join(FONT_DIR, file), Buffer.from(data));
    rules.push(`@font-face { font-family: "Sora"; font-style: normal; font-weight: ${weight}; font-display: swap; src: url("./fonts/${file}") format("woff2"); unicode-range: ${range}; }`);
    console.log("saved", file);
  }
  fs.writeFileSync(path.join(__dirname, "..", "src", "fonts.css"), rules.join("\n") + "\n");
  console.log("fonts.css faces:", rules.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
