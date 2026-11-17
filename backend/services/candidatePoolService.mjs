import { screenCandidateToDailyRecord, shouldScreenCandidateToDailyRecord } from "./dailyCareRecordService.mjs";
import { readJson, writeJson } from "./storage.mjs";

const DEFAULT_TTL_DAYS = Number(process.env.CANDIDATE_TTL_DAYS || 7);

export async function listCandidates() {
  const store = await cleanupExpiredCandidates();
  return store.candidates || [];
}

export async function listCandidatesForPet(petId, limit = 8) {
  const candidates = await listCandidates();
  return candidates
    .filter((candidate) => candidate.petId === petId)
    .sort((a, b) => String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")))
    .slice(0, limit);
}

export async function addCandidateFromAnalysis(analysis, observation) {
  if (!shouldCreateCandidate(analysis)) {
    return { added: false, reason: "analysis_not_marked_for_candidate_pool" };
  }

  const now = new Date();
  const store = await cleanupExpiredCandidates();
  const key = makeCandidateKey(analysis, observation);
  const existing = (store.candidates || []).find((item) => item.key === key);

  if (existing) {
    existing.evidenceCount += 1;
    existing.lastSeenAt = now.toISOString();
    existing.confidence = round2(Math.max(existing.confidence, analysis.confidence));
    existing.riskLevel = highestRisk(existing.riskLevel, analysis.riskLevel);
    existing.evidence = unique([...(existing.evidence || []), ...(analysis.evidence || [])]).slice(0, 8);
    existing.suggestedCareRecord = analysis.candidateSuggestion || existing.suggestedCareRecord;
  } else {
    store.candidates = [
      {
        id: `cand_${Date.now()}`,
        key,
        petId: analysis.petId,
        scene: String(observation.scene || observation.context || "unknown"),
        behavior: analysis.behavior,
        aiGuess: analysis.need,
        confidence: round2(analysis.confidence),
        riskLevel: analysis.riskLevel,
        evidenceCount: 1,
        evidence: analysis.evidence || [],
        suggestedCareRecord: analysis.candidateSuggestion,
        status: "pending",
        firstSeenAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
        expiresAt: addDays(now, DEFAULT_TTL_DAYS).toISOString()
      },
      ...(store.candidates || [])
    ];
  }

  const candidate = (store.candidates || []).find((item) => item.key === key);
  const screening = shouldScreenCandidateToDailyRecord(candidate)
    ? await screenCandidateObject(candidate)
    : null;

  if (screening) {
    candidate.status = "screened";
    candidate.screenedToDaily = true;
    candidate.dailyRecordId = screening.dailyRecord.id;
    candidate.dailyRecordEntryId = screening.entry.id;
    candidate.screenedAt = new Date().toISOString();
  }

  await writeJson("candidate_pool.json", store);

  return {
    added: true,
    candidate,
    screened: screening
  };
}

export async function promoteCandidateById(candidateId) {
  const store = await cleanupExpiredCandidates();
  const candidate = (store.candidates || []).find((item) => item.id === candidateId);
  if (!candidate) {
    throw new Error(`Unknown candidateId: ${candidateId}`);
  }

  const screening = await screenCandidateObject(candidate, { force: true });
  candidate.status = "screened";
  candidate.screenedToDaily = true;
  candidate.dailyRecordId = screening.dailyRecord.id;
  candidate.dailyRecordEntryId = screening.entry.id;
  candidate.screenedAt = new Date().toISOString();

  await writeJson("candidate_pool.json", store);
  return {
    candidateId: candidate.id,
    candidate,
    dailyRecord: screening.dailyRecord,
    entry: screening.entry
  };
}

export async function discardCandidateById(candidateId) {
  let removed = null;
  const store = await cleanupExpiredCandidates();
  store.candidates = (store.candidates || []).filter((item) => {
    if (item.id === candidateId) {
      removed = item;
      return false;
    }
    return true;
  });
  if (!removed) {
    throw new Error(`Unknown candidateId: ${candidateId}`);
  }
  await writeJson("candidate_pool.json", store);
  return removed;
}

async function cleanupExpiredCandidates() {
  const now = Date.now();
  const store = await readJson("candidate_pool.json", { candidates: [] });
  store.candidates = (store.candidates || []).filter((item) => {
    const expiresAt = Date.parse(item.expiresAt || "");
    return Number.isFinite(expiresAt) ? expiresAt > now : true;
  });
  await writeJson("candidate_pool.json", store);
  return store;
}

async function screenCandidateObject(candidate) {
  return screenCandidateToDailyRecord(candidate);
}

function makeCandidateKey(analysis, observation) {
  return [
    analysis.petId,
    normalizeKey(analysis.behavior),
    normalizeKey(observation.scene || observation.context || "unknown"),
    normalizeKey(analysis.need)
  ].join("|");
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase().slice(0, 80);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function highestRisk(a, b) {
  const rank = { low: 1, medium: 2, high: 3 };
  return (rank[b] || 1) > (rank[a] || 1) ? b : a;
}

function shouldCreateCandidate(analysis) {
  if (analysis.shouldEnterCandidatePool) return true;
  if (analysis.riskLevel === "high" || analysis.riskLevel === "medium") return true;
  if (Number(analysis.confidence || 0) >= 0.78) return true;
  return Boolean(analysis.candidateSuggestion && Number(analysis.confidence || 0) >= 0.65);
}
