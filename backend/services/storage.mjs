import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = join(ROOT, "data");

export function dataPath(fileName) {
  return join(DATA_DIR, fileName);
}

export async function readJson(fileName, fallback) {
  try {
    const text = await readFile(dataPath(fileName), "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (fallback !== undefined) return structuredClone(fallback);
    throw error;
  }
}

export async function writeJson(fileName, value) {
  await writeFile(dataPath(fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function updateJson(fileName, fallback, updater) {
  const current = await readJson(fileName, fallback);
  const next = await updater(current);
  await writeJson(fileName, next);
  return next;
}
