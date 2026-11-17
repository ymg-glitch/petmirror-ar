import { runAiReasoning } from "./aiReasoningService.mjs";

export async function petVisualMemoryReasoning(arData, identity, memory) {
  const observation = {
    ...arData,
    petId: identity.petId,
    identity
  };

  const memoryContext = {
    pet: memory.petProfile,
    careRecords: memory.longTermCareRecords,
    dailyCareRecords: memory.dailyCareRecords,
    recentCandidates: memory.recentCandidateRecords,
    memorySummary: memory.memorySummary
  };

  const analysis = await runAiReasoning(observation, memoryContext);

  return {
    skill: "pet-visual-memory-reasoning",
    ...analysis
  };
}

// Backward-compatible export for older scripts. The official pipeline uses
// petVisualMemoryReasoning and no longer runs fixed emotion classification.
export const petEmotionMemoryReasoning = petVisualMemoryReasoning;
