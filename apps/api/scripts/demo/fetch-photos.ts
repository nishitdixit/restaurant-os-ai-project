// Downloads the demo restaurant's Unsplash photos (photos.ts) into ./assets as <key>.jpg and writes assets/CREDITS.md.
// The photos are committed, so seeding never needs network access to Unsplash; run this only after changing photos.ts.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PHOTO_IDS, photoWidth } from "./photos.ts";

const assets = join(dirname(fileURLToPath(import.meta.url)), "assets");

async function main() {
  for (const [key, id] of Object.entries(PHOTO_IDS)) {
    // Unsplash's public download endpoint (also counts the download for the photographer, as their guidelines ask).
    const res = await fetch(`https://unsplash.com/photos/${id}/download?w=${photoWidth(key)}&fm=jpg&q=80`);
    if (!res.ok) throw new Error(`${key} (${id}): HTTP ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    if (body[0] !== 0xff || body[1] !== 0xd8) throw new Error(`${key} (${id}): not a JPEG`);
    writeFileSync(join(assets, `${key}.jpg`), body);
    console.log(`${key.padEnd(22)} ${id.padEnd(12)} ${Math.round(body.length / 1024)} KB`);
  }
  const rows = Object.entries(PHOTO_IDS).map(([key, id]) => `| ${key} | https://unsplash.com/photos/${id} |`).join("\n");
  writeFileSync(join(assets, "CREDITS.md"), `# Photo credits

The food photos of the demo restaurant (Saffron Street Kitchen) are from [Unsplash](https://unsplash.com) and used under
the [Unsplash License](https://unsplash.com/license). The logo is drawn by \`tests/recording/demo-assets.ts\`.

| File | Photo |
| --- | --- |
${rows}
`);
}

main().catch((error) => {
  console.error(`demo:photos failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
