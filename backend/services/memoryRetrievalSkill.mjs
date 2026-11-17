import { getMemoryContext } from "./petMemoryService.mjs";
import { listCandidatesForPet } from "./candidatePoolService.mjs";
import { listTodayDailyCareRecords } from "./dailyCareRecordService.mjs";

export async function petMemoryRetrieval(identity, arData) {
  const memoryContext = await getMemoryContext(identity.petId, arData);
  const recentCandidates = await listCandidatesForPet(identity.petId, 8);
  const dailyCareRecords = await listTodayDailyCareRecords(identity.petId);

  return {
    skill: "pet-memory-retrieval",
    petProfile: memoryContext.pet,
    longTermCareRecords: memoryContext.careRecords,
    dailyCareRecords,
    recentCandidateRecords: recentCandidates,
    memorySummary: buildMemorySummary(memoryContext.pet, memoryContext.careRecords, dailyCareRecords, recentCandidates)
  };
}

function buildMemorySummary(pet, careRecords, dailyCareRecords, candidates) {
  const preferences = pet.profile?.preferences?.join("、") || "暂无明确偏好";
  const taboos = pet.profile?.taboos?.join("、") || "暂无明确禁忌";
  const care = careRecords.slice(0, 3).map((record) => record.summary).join("；");
  const daily = dailyCareRecords
    .flatMap((day) => day.entries || [])
    .slice(0, 4)
    .map((entry) => entry.summary)
    .join("；");
  const recent = candidates.slice(0, 3).map((candidate) => candidate.suggestedCareRecord).join("；");
  return [
    `${pet.name}的偏好：${preferences}。`,
    `${pet.name}的禁忌：${taboos}。`,
    care ? `相关长期照护记录：${care}。` : "",
    daily ? `今天已记录的照护观察：${daily}。` : "",
    recent ? `近期候选记录：${recent}。` : ""
  ]
    .filter(Boolean)
    .join("");
}
