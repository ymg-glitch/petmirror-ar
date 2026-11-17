import { getActivePetId } from "./petMemoryService.mjs";
import { readJson } from "./storage.mjs";

const METHOD = "placeholder_pet_identity_skill";

export async function identifyWithPlaceholderSkill(arData, knownPets = []) {
  const pets = knownPets.length ? knownPets : await listKnownPets();
  const activePetId = await getActivePetId();
  const evidenceText = buildEvidenceText(arData);
  const scored = pets.map((pet) => scorePet(pet, evidenceText, arData, activePetId));
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0] || { pet: pets[0], score: 0, reasons: [] };
  const pet = best.pet || { petId: activePetId, name: activePetId };
  const confidence = scoreToConfidence(best.score, best.reasons);

  return {
    petId: pet.petId,
    petName: pet.name || pet.petId,
    confidence,
    method: METHOD,
    fallbackUsed: best.score <= 0,
    adapter: "placeholder-pet-identity",
    adapterStatus: "ready",
    knownPetCount: pets.length,
    evidence: best.reasons,
    candidates: scored.slice(0, 3).map((item) => ({
      petId: item.pet.petId,
      petName: item.pet.name,
      score: item.score,
      reasons: item.reasons
    })),
    note: "Temporary identity skill for demo. It uses AR metadata, text cues, species, profile tags and long-term care records, and can be replaced by PetFace later."
  };
}

export async function getPlaceholderIdentityStatus() {
  const pets = await listKnownPets();
  return {
    adapter: "placeholder-pet-identity",
    mode: "placeholder",
    ready: pets.length > 0,
    knownPetCount: pets.length,
    method: METHOD,
    note: "可运行的占位宠物身份识别 skill：用于先跑通 AR -> 记忆 -> AI 推理 -> 显示链路。"
  };
}

async function listKnownPets() {
  const store = await readJson("pets.json", { pets: [] });
  const careStore = await readJson("care_records.json", { records: [] });
  return (store.pets || []).map((pet) => ({
    petId: pet.id,
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    profile: pet.profile || {},
    careRecords: (careStore.records || []).filter((record) => record.petId === pet.id)
  }));
}

function scorePet(pet, evidenceText, arData, activePetId) {
  let score = 0;
  const reasons = [];
  const add = (points, reason) => {
    score += points;
    reasons.push(reason);
  };

  const explicitPetId = arData.petId || arData.fallbackPetId;
  if (explicitPetId && explicitPetId === pet.petId) add(120, "AR 数据显式给出了宠物 ID");

  if (contains(evidenceText, pet.petId)) add(100, `观察文本出现 ID：${pet.petId}`);
  if (pet.name && contains(evidenceText, pet.name)) add(100, `观察文本出现名字：${pet.name}`);
  if (pet.breed && contains(evidenceText, pet.breed)) add(24, `观察文本出现品种：${pet.breed}`);

  const species = normalizeSpecies(arData.lowLevelVision?.petType || arData.petType || arData.species);
  if (species && species === pet.species) add(32, `视觉线索匹配物种：${speciesText(species)}`);

  for (const label of profileLabels(pet.profile)) {
    if (label && contains(evidenceText, label)) add(10, `匹配档案标签：${label}`);
  }

  for (const record of pet.careRecords || []) {
    const recordText = `${record.title || ""} ${record.summary || ""} ${(record.tags || []).join(" ")}`;
    const overlap = keywordOverlap(evidenceText, recordText);
    if (overlap.score > 0) add(Math.min(18, overlap.score), `匹配长期照护记录：${record.title || overlap.words.join("、")}`);
  }

  if (pet.petId === activePetId) add(5, "当前激活宠物加权");

  return { pet, score, reasons };
}

function buildEvidenceText(arData) {
  return JSON.stringify(arData || {}, null, 0).toLowerCase();
}

function profileLabels(profile = {}) {
  return [
    ...(profile.personality || []),
    ...(profile.preferences || []),
    ...(profile.taboos || []),
    ...(profile.behaviorPatterns || [])
  ];
}

function keywordOverlap(left, right) {
  const words = Array.from(new Set(extractKeywords(right))).filter((word) => contains(left, word));
  return {
    words,
    score: words.length * 3
  };
}

function extractKeywords(text) {
  return String(text || "")
    .replace(/[^\p{Script=Han}a-zA-Z0-9_]+/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length >= 2);
}

function contains(text, value) {
  return String(text || "").includes(String(value || "").toLowerCase());
}

function normalizeSpecies(value) {
  const text = String(value || "").toLowerCase();
  if (!text) return "";
  if (text.includes("cat") || text.includes("猫")) return "cat";
  if (text.includes("dog") || text.includes("狗")) return "dog";
  return text;
}

function speciesText(species) {
  if (species === "cat") return "猫";
  if (species === "dog") return "狗";
  return species;
}

function scoreToConfidence(score, reasons) {
  if (!reasons.length) return 0.42;
  if (score >= 100) return 0.9;
  if (score >= 60) return 0.82;
  if (score >= 32) return 0.7;
  if (score >= 12) return 0.58;
  return 0.48;
}
