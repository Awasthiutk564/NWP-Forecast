// Copies the saved LightGBM models and the presentation figures into public/,
// so the website can offer them for download. Runs before `npm run dev` and `npm run build`.
// The originals in ../models and ../slides/figures are only read, never changed.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(site, "..");
const jobs = [
  [join(repo, "models"), join(site, "public", "models"), (f) => f.endsWith(".txt")],
  [join(repo, "slides", "figures"), join(site, "public", "figures"), (f) => f.endsWith(".png")],
];
for (const [from, to, keep] of jobs) {
  if (!existsSync(from)) { console.warn(`sync-assets: ${from} not found, skipped`); continue; }
  mkdirSync(to, { recursive: true });
  const files = readdirSync(from).filter(keep);
  for (const f of files) cpSync(join(from, f), join(to, f));
  console.log(`sync-assets: ${files.length} files -> ${to.replace(site, "website")}`);
}
