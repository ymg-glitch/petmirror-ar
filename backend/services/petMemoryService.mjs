import { readJson, updateJson } from "./storage.mjs";

export async function getActivePetId() {
  const store = await readJson("pets.json");
  return store.activePetId || store.pets?.[0]?.id || "demo_cat_a";
}

export async function listPets() {
  const store = await readJson("pets.json");
  return store.pets || [];
}

export async function getPetProfile(petId) {
  const store = await readJson("pets.json");
  const id = petId || store.activePetId;
  const pet = store.pets.find((item) => item.id === id);
  if (!pet) {
    throw new Error(`Unknown petId: ${id}`);
  }
  return pet;
}

export async function setActivePet(petId) {
  await getPetProfile(petId);
  return updateJson("pets.json", { activePetId: petId, pets: [] }, (store) => ({
    ...store,
    activePetId: petId
  }));
}

export async function updatePetProfile(petId, patch) {
  const allowedRootFields = new Set(["name", "species", "breed", "age", "sex", "weight", "avatar", "memorial"]);
  let updatedPet = null;

  await updateJson("pets.json", { activePetId: petId, pets: [] }, (store) => {
    store.pets = (store.pets || []).map((pet) => {
      if (pet.id !== petId) return pet;
      const next = { ...pet, profile: { ...(pet.profile || {}) } };
      for (const [key, value] of Object.entries(patch || {})) {
        if (key === "profile" && value && typeof value === "object") {
          const sanitized = sanitizeProfile(value);
          const shouldReplaceConfirmedTags = Object.prototype.hasOwnProperty.call(value, "confirmedTags");
          next.profile = {
            ...next.profile,
            ...sanitized
          };
          if (shouldReplaceConfirmedTags) {
            next.profile.confirmedTags = sanitized.confirmedTags || [];
          }
        } else if (allowedRootFields.has(key)) {
          next[key] = value;
        }
      }
      updatedPet = next;
      return next;
    });
    if (!updatedPet) throw new Error(`Unknown petId: ${petId}`);
    return store;
  });

  return updatedPet;
}

export async function getRelevantCareRecords(petId, observation, limit = 5) {
  const store = await readJson("care_records.json", { records: [] });
  const records = store.records.filter((record) => record.petId === petId);
  const queryText = stringifyObservation(observation);

  const scored = records.map((record) => ({
    record,
    score: scoreRecord(record, queryText)
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(b.record.date || "").localeCompare(String(a.record.date || ""));
  });

  return scored.slice(0, limit).map((item) => item.record);
}

export async function getMemoryContext(petId, observation) {
  const pet = await getPetProfile(petId);
  const careRecords = await getRelevantCareRecords(pet.id, observation);
  return { pet, careRecords };
}

function stringifyObservation(observation) {
  return JSON.stringify(observation || {}, null, 0).toLowerCase();
}

function scoreRecord(record, queryText) {
  let score = 0;
  const text = `${record.title || ""} ${record.summary || ""} ${(record.tags || []).join(" ")}`.toLowerCase();
  for (const tag of record.tags || []) {
    if (queryText.includes(String(tag).toLowerCase())) score += 4;
  }
  for (const keyword of ["猫粮", "食盆", "拒食", "扒拉", "掩埋", "海鱼", "鸡肉", "雨声", "焦虑"]) {
    if (queryText.includes(keyword) && text.includes(keyword)) score += 2;
  }
  if (record.importance === "high") score += 1;
  return score;
}

function sanitizeProfile(profile) {
  const next = {};
  for (const key of ["personality", "preferences", "taboos", "behaviorPatterns"]) {
    if (Array.isArray(profile[key])) {
      next[key] = profile[key].map(String).map((item) => item.trim()).filter(Boolean);
    }
  }
  if (Array.isArray(profile.confirmedTags)) {
    next.confirmedTags = uniqueConfirmedTags(
      profile.confirmedTags
        .map((item) => ({
          field: String(item?.field || "").trim(),
          value: String(item?.value || item?.label || "").trim(),
          confirmedAt: String(item?.confirmedAt || new Date().toISOString())
        }))
        .filter((item) => item.field && item.value)
    );
  }
  return next;
}

function uniqueConfirmedTags(tags) {
  const seen = new Set();
  return tags.filter((tag) => {
    const key = `${tag.field}:${tag.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
