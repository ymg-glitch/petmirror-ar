import { readJson, writeJson } from "./storage.mjs";

const DEFAULT_SETTINGS = {
  rayneoBound: true,
  cloudApi: true,
  dataSync: "Wi-Fi",
  localStorage: true,
  cloudStorage: "structured_summary",
  videoSaved: false,
  audioSaved: false,
  privacyConsent: true
};

export async function getSettings() {
  return readJson("settings.json", DEFAULT_SETTINGS);
}

export async function updateSettings(patch) {
  const current = await getSettings();
  const next = {
    ...current,
    ...sanitizeSettings(patch)
  };
  await writeJson("settings.json", next);
  return next;
}

function sanitizeSettings(patch = {}) {
  const next = {};
  for (const key of ["rayneoBound", "cloudApi", "localStorage", "videoSaved", "audioSaved", "privacyConsent"]) {
    if (patch[key] !== undefined) next[key] = Boolean(patch[key]);
  }
  for (const key of ["dataSync", "cloudStorage"]) {
    if (patch[key] !== undefined) next[key] = String(patch[key]);
  }
  return next;
}
