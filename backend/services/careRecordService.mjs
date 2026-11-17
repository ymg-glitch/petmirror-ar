import { readJson, updateJson } from "./storage.mjs";

export async function listCareRecords(petId) {
  const store = await readJson("care_records.json", { records: [] });
  return (store.records || [])
    .filter((record) => !petId || record.petId === petId)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

export async function appendCareRecord(record) {
  const now = new Date().toISOString();
  const safeRecord = {
    id: record.id || `care_${record.petId}_${Date.now()}`,
    petId: record.petId,
    date: record.date || now.slice(0, 10),
    type: record.type || "ai_observation",
    title: record.title || "AI 观察记录",
    summary: record.summary || "",
    source: record.source || "ai_candidate_promoted",
    importance: record.importance || "medium",
    tags: Array.isArray(record.tags) ? record.tags : [],
    createdAt: now
  };

  await updateJson("care_records.json", { records: [] }, (store) => {
    store.records = [safeRecord, ...(store.records || [])];
    return store;
  });

  return safeRecord;
}

export async function updateCareRecord(recordId, patch) {
  let updated = null;
  await updateJson("care_records.json", { records: [] }, (store) => {
    store.records = (store.records || []).map((record) => {
      if (record.id !== recordId) return record;
      updated = {
        ...record,
        ...sanitizeCarePatch(patch),
        updatedAt: new Date().toISOString()
      };
      return updated;
    });
    if (!updated) throw new Error(`Unknown careRecordId: ${recordId}`);
    return store;
  });
  return updated;
}

export async function deleteCareRecord(recordId) {
  let removed = null;
  await updateJson("care_records.json", { records: [] }, (store) => {
    const before = store.records || [];
    removed = before.find((record) => record.id === recordId) || null;
    store.records = before.filter((record) => record.id !== recordId);
    if (!removed) throw new Error(`Unknown careRecordId: ${recordId}`);
    return store;
  });
  return removed;
}

function sanitizeCarePatch(patch = {}) {
  const allowed = {};
  for (const key of ["date", "type", "title", "summary", "source", "importance"]) {
    if (patch[key] !== undefined) allowed[key] = String(patch[key]).trim();
  }
  if (Array.isArray(patch.tags)) {
    allowed.tags = patch.tags.map(String).map((item) => item.trim()).filter(Boolean);
  }
  return allowed;
}
