import { createRequire } from "node:module";
import { mkdirSync, copyFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const folder = new URL("../public/signatures/", import.meta.url);
mkdirSync(folder, { recursive: true });
copyFileSync(
  require.resolve("pdfjs-dist/build/pdf.worker.min.mjs"),
  new URL("pdf.worker.min.mjs", folder),
);
