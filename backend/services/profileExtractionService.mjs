import { listCareRecords } from "./careRecordService.mjs";
import { getPetProfile, updatePetProfile } from "./petMemoryService.mjs";

export async function suggestProfileUpdates(petId) {
  const pet = await getPetProfile(petId);
  const records = await listCareRecords(petId);
  const text = records.map((record) => `${record.title} ${record.summary} ${(record.tags || []).join(" ")}`).join("\n");
  const suggestions = [];

  if (/海鱼|拒食|扒拉/.test(text) && !hasItem(pet.profile?.taboos, "海鱼味猫粮")) {
    suggestions.push({
      field: "taboos",
      value: "海鱼味猫粮",
      reason: "长期照护记录中多次出现海鱼味、拒食或扒拉相关记录。"
    });
  }

  if (/鸡肉/.test(text) && !hasItem(pet.profile?.preferences, "鸡肉味猫粮")) {
    suggestions.push({
      field: "preferences",
      value: "鸡肉味猫粮",
      reason: "长期照护记录中出现鸡肉味进食正常或偏好相关记录。"
    });
  }

  if (/雨声|雷雨|焦虑|躲/.test(text) && !hasItem(pet.profile?.personality, "雨天焦虑")) {
    suggestions.push({
      field: "personality",
      value: "雨天焦虑",
      reason: "长期照护记录中出现雨声后焦虑或躲避行为。"
    });
  }

  if (/扒拉|掩埋|拒食/.test(text) && !hasItem(pet.profile?.behaviorPatterns, "拒食时可能在食盆旁出现扒拉或掩埋动作")) {
    suggestions.push({
      field: "behaviorPatterns",
      value: "拒食时可能在食盆旁出现扒拉或掩埋动作",
      reason: "长期照护记录中出现食盆旁扒拉、掩埋或拒食行为。"
    });
  }

  return {
    petId,
    petName: pet.name,
    suggestions
  };
}

export async function applyProfileSuggestions(petId, suggestions) {
  const pet = await getPetProfile(petId);
  const nextProfile = {
    personality: [...(pet.profile?.personality || [])],
    preferences: [...(pet.profile?.preferences || [])],
    taboos: [...(pet.profile?.taboos || [])],
    behaviorPatterns: [...(pet.profile?.behaviorPatterns || [])]
  };

  for (const suggestion of suggestions || []) {
    const field = suggestion.field;
    const value = String(suggestion.value || "").trim();
    if (!value || !Array.isArray(nextProfile[field])) continue;
    if (!hasItem(nextProfile[field], value)) nextProfile[field].push(value);
  }

  return updatePetProfile(petId, { profile: nextProfile });
}

function hasItem(items = [], value) {
  return items.includes(value);
}
