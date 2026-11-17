import { addCandidateFromAnalysis } from "./candidatePoolService.mjs";

export async function petMemoryWriteback(identity, analysis, arData, memory) {
  const candidate = await addCandidateFromAnalysis(analysis, {
    ...arData,
    petId: identity.petId,
    identityConfidence: identity.confidence,
    memorySummary: memory.memorySummary
  });

  return {
    skill: "pet-memory-writeback",
    ...candidate
  };
}
