import { petArDisplayCompressor } from "./arDisplayCompressorSkill.mjs";
import { petVisualMemoryReasoning } from "./emotionMemoryReasoningSkill.mjs";
import { petIdentityRouting } from "./petIdentityRoutingSkill.mjs";
import { petMemoryRetrieval } from "./memoryRetrievalSkill.mjs";
import { petMemoryWriteback } from "./memoryWritebackSkill.mjs";
import { isLlmProviderEnabled } from "./llmProviderService.mjs";
import { readJson, writeJson } from "./storage.mjs";

export async function runArPipeline(arData) {
  const identity = await petIdentityRouting(arData);
  const memory = await petMemoryRetrieval(identity, arData);
  const analysis = await petVisualMemoryReasoning(arData, identity, memory);
  const display = await petArDisplayCompressor(analysis);
  const writeback = await petMemoryWriteback(identity, analysis, arData, memory);

  await saveRuntime(arData, identity, memory, analysis, display, writeback);

  return {
    ok: true,
    pipeline: [
      identity.skill,
      memory.skill,
      analysis.skill,
      display.skill,
      writeback.skill
    ],
    cloudEnabled: isLlmProviderEnabled(),
    identity,
    memory,
    analysis,
    display,
    writeback
  };
}

async function saveRuntime(arData, identity, memory, analysis, display, writeback) {
  const runtime = await readJson("ar_runtime.json");
  runtime.latestObservation = {
    ...arData,
    petId: identity.petId,
    receivedAt: new Date().toISOString()
  };
  runtime.latestIdentity = identity;
  runtime.latestMemorySummary = memory.memorySummary;
  delete runtime.latestEmotionRecognition;
  delete runtime.latestLowLevelRecognition;
  runtime.latestAnalysis = analysis;
  runtime.latestDisplay = display;
  runtime.latestWriteback = writeback;
  await writeJson("ar_runtime.json", runtime);
}
