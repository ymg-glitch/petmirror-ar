import { appendCareRecord } from "./careRecordService.mjs";
import { getPetProfile } from "./petMemoryService.mjs";
import { readJson, updateJson } from "./storage.mjs";

const FALLBACK_STORE = { days: [] };

export async function listDailyCareRecords(options = {}) {
  const store = await readJson("daily_care_records.json", FALLBACK_STORE);
  return (store.days || [])
    .filter((day) => !options.petId || day.petId === options.petId)
    .filter((day) => !options.date || day.date === options.date)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

export async function listTodayDailyCareRecords(petId) {
  return listDailyCareRecords({ petId, date: localDateString() });
}

export function shouldScreenCandidateToDailyRecord(candidate) {
  if (!candidate) return false;
  if (candidate.status === "screened") return Boolean(candidate.dailyRecordEntryId);
  if (candidate.riskLevel === "high" && candidate.confidence >= 0.6) return true;
  if (candidate.confidence >= 0.75) return true;
  return candidate.evidenceCount >= 2 && candidate.confidence >= 0.65;
}

export async function screenCandidateToDailyRecord(candidate, options = {}) {
  const now = new Date().toISOString();
  const date = options.date || localDateString();
  const entry = {
    id: options.entryId || `daily_entry_${Date.now()}`,
    candidateId: candidate.id,
    time: now,
    type: candidate.riskLevel === "high" ? "risk_observation" : "ai_observation",
    title: options.title || titleFromCandidate(candidate),
    summary: candidate.suggestedCareRecord || summarizeCandidate(candidate),
    source: options.source || "ai_candidate_screened",
    confidence: candidate.confidence,
    riskLevel: candidate.riskLevel,
    evidenceCount: candidate.evidenceCount || 1,
    tags: unique([candidate.behavior, candidate.aiGuess, candidate.scene].filter(Boolean))
  };

  let updatedDay = null;
  await updateJson("daily_care_records.json", FALLBACK_STORE, (store) => {
    store.days = store.days || [];
    let day = store.days.find((item) => item.petId === candidate.petId && item.date === date);
    if (!day) {
      day = {
        id: `daily_${candidate.petId}_${date}`,
        petId: candidate.petId,
        date,
        status: "open",
        entries: [],
        createdAt: now,
        updatedAt: now
      };
      store.days.unshift(day);
    }

    const existingIndex = day.entries.findIndex((item) => item.candidateId === candidate.id);
    if (existingIndex >= 0) {
      day.entries[existingIndex] = {
        ...day.entries[existingIndex],
        ...entry,
        id: day.entries[existingIndex].id,
        firstSeenAt: day.entries[existingIndex].firstSeenAt || day.entries[existingIndex].time,
        lastSeenAt: now
      };
    } else {
      day.entries.unshift({
        ...entry,
        firstSeenAt: now,
        lastSeenAt: now
      });
    }
    day.status = "open";
    day.updatedAt = now;
    updatedDay = day;
    return store;
  });

  return {
    screened: true,
    dailyRecord: updatedDay,
    entry: updatedDay.entries.find((item) => item.candidateId === candidate.id)
  };
}

export async function appendManualDailyEntry(petId, entry) {
  const now = new Date().toISOString();
  const date = entry.date || localDateString();
  const safeEntry = {
    id: entry.id || `daily_entry_${Date.now()}`,
    time: entry.time || now,
    type: entry.type || "manual",
    title: entry.title || "手动照护记录",
    summary: entry.summary || "",
    source: entry.source || "manual",
    confidence: entry.confidence ?? null,
    riskLevel: entry.riskLevel || "low",
    evidenceCount: entry.evidenceCount || 1,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    firstSeenAt: now,
    lastSeenAt: now
  };

  let updatedDay = null;
  await updateJson("daily_care_records.json", FALLBACK_STORE, (store) => {
    store.days = store.days || [];
    let day = store.days.find((item) => item.petId === petId && item.date === date);
    if (!day) {
      day = {
        id: `daily_${petId}_${date}`,
        petId,
        date,
        status: "open",
        entries: [],
        createdAt: now,
        updatedAt: now
      };
      store.days.unshift(day);
    }
    day.entries.unshift(safeEntry);
    day.updatedAt = now;
    updatedDay = day;
    return store;
  });

  return { dailyRecord: updatedDay, entry: safeEntry };
}

export async function finalizeDailyCareRecord(petId, date = localDateString()) {
  const pet = await getPetProfile(petId);
  let targetDay = null;

  await updateJson("daily_care_records.json", FALLBACK_STORE, (store) => {
    targetDay = (store.days || []).find((day) => day.petId === petId && day.date === date) || null;
    if (!targetDay) throw new Error(`No daily care record for ${petId} on ${date}`);
    if (!targetDay.entries?.length) throw new Error(`Daily care record has no entries for ${petId} on ${date}`);
    return store;
  });

  if (targetDay.status === "finalized" && targetDay.finalizedCareRecordId) {
    return { alreadyFinalized: true, dailyRecord: targetDay, careRecordId: targetDay.finalizedCareRecordId };
  }

  const careRecord = await appendCareRecord({
    id: `care_${petId}_${date}_daily`,
    petId,
    date,
    type: "daily_summary",
    title: `${pet.name} ${date} 每日照护摘要`,
    summary: summarizeEntries(targetDay.entries),
    source: "daily_finalized",
    importance: importanceFromEntries(targetDay.entries),
    tags: unique(targetDay.entries.flatMap((entry) => entry.tags || []))
  });

  let finalizedDay = null;
  await updateJson("daily_care_records.json", FALLBACK_STORE, (store) => {
    store.days = (store.days || []).map((day) => {
      if (day.petId !== petId || day.date !== date) return day;
      finalizedDay = {
        ...day,
        status: "finalized",
        finalizedAt: new Date().toISOString(),
        finalizedCareRecordId: careRecord.id
      };
      return finalizedDay;
    });
    return store;
  });

  return {
    alreadyFinalized: false,
    dailyRecord: finalizedDay,
    careRecord
  };
}

export async function finalizeDueDailyCareRecords(options = {}) {
  const today = options.today || localDateString();
  const store = await readJson("daily_care_records.json", FALLBACK_STORE);
  const dueDays = (store.days || []).filter((day) => {
    if (day.status === "finalized") return false;
    if (!day.entries?.length) return false;
    return String(day.date || "") < today;
  });

  const results = [];
  for (const day of dueDays) {
    try {
      results.push(await finalizeDailyCareRecord(day.petId, day.date));
    } catch (error) {
      results.push({
        petId: day.petId,
        date: day.date,
        error: String(error.message || error)
      });
    }
  }
  return {
    checkedAt: new Date().toISOString(),
    today,
    finalizedCount: results.filter((item) => item.careRecord || item.alreadyFinalized).length,
    results
  };
}

export function startDailyCareAutoFinalize(options = {}) {
  const intervalMs = Number(options.intervalMs || process.env.DAILY_FINALIZE_CHECK_MS || 60 * 60 * 1000);

  finalizeDueDailyCareRecords().catch((error) => {
    console.warn(`Daily care auto-finalize failed: ${error.message || error}`);
  });

  const timer = setInterval(() => {
    finalizeDueDailyCareRecords().catch((error) => {
      console.warn(`Daily care auto-finalize failed: ${error.message || error}`);
    });
  }, intervalMs);

  if (typeof timer.unref === "function") timer.unref();
  return timer;
}

function titleFromCandidate(candidate) {
  if (candidate.riskLevel === "high") return "AI 发现高风险观察";
  return `AI 观察：${candidate.behavior || "宠物状态变化"}`;
}

function summarizeEntries(entries) {
  return unique(
    entries
    .slice()
    .reverse()
      .map((entry) => `${entry.title}：${entry.summary}`)
  )
    .join("；");
}

function summarizeCandidate(candidate) {
  const behavior = candidate.behavior || "宠物状态变化";
  const guess = candidate.aiGuess ? `，AI 判断：${candidate.aiGuess}` : "";
  return `${behavior}${guess}`;
}

function importanceFromEntries(entries) {
  if (entries.some((entry) => entry.riskLevel === "high")) return "high";
  if (entries.some((entry) => entry.riskLevel === "medium")) return "medium";
  return "low";
}

function unique(values) {
  return Array.from(new Set(values.map(String).map((item) => item.trim()).filter(Boolean)));
}

function localDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(date);
}
