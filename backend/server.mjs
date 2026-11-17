import http from "node:http";

import { toLegacyPetStatus } from "./services/arDisplayService.mjs";
import { getPetFaceAdapterStatus } from "./adapters/petFaceAdapter.mjs";
import { discardCandidateById, listCandidates, promoteCandidateById } from "./services/candidatePoolService.mjs";
import { appendCareRecord, deleteCareRecord, listCareRecords, updateCareRecord } from "./services/careRecordService.mjs";
import {
  appendManualDailyEntry,
  finalizeDailyCareRecord,
  finalizeDueDailyCareRecords,
  listDailyCareRecords,
  startDailyCareAutoFinalize
} from "./services/dailyCareRecordService.mjs";
import { runArPipeline } from "./services/arPipelineService.mjs";
import { applyProfileSuggestions, suggestProfileUpdates } from "./services/profileExtractionService.mjs";
import { getPlaceholderIdentityStatus } from "./services/placeholderPetIdentitySkill.mjs";
import { getMemoryContext, listPets, setActivePet, updatePetProfile } from "./services/petMemoryService.mjs";
import { getLlmProviderStatus } from "./services/llmProviderService.mjs";
import { getSettings, updateSettings } from "./services/settingsService.mjs";
import { readJson } from "./services/storage.mjs";

const PORT = Number(process.env.PORT || 8791);

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "")));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

async function handleArAnalyze(req, res) {
  const arData = await readBody(req);
  sendJson(res, 200, await runArPipeline(arData));
}

async function handleLatestLegacyStatus(req, res) {
  const runtime = await readJson("ar_runtime.json");
  if (runtime.latestAnalysis) {
    sendJson(res, 200, toLegacyPetStatus(runtime.latestAnalysis));
    return;
  }
  sendJson(res, 200, {
    petType: "宠物",
    emotion: "观察中",
    confidence: 0,
    riskLevel: "low",
    advice: "后端已启动，等待 AR 数据上传。",
    reason: "当前还没有分析结果。"
  });
}

async function handleMemory(req, res, petId) {
  const memoryContext = await getMemoryContext(petId, {});
  sendJson(res, 200, memoryContext);
}

async function handleMobileBootstrap(req, res) {
  const runtime = await readJson("ar_runtime.json", {});
  sendJson(res, 200, {
    pets: await listPets(),
    careRecords: await listCareRecords(),
    dailyCareRecords: await listDailyCareRecords(),
    settings: await getSettings(),
    candidates: await listCandidates(),
    ar: {
      latestObservation: runtime.latestObservation || null,
      latestAnalysis: runtime.latestAnalysis || null,
      latestDisplay: runtime.latestDisplay || null,
      latestWriteback: runtime.latestWriteback || null
    }
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const parts = url.pathname.split("/").filter(Boolean);

    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "petmirror-unified-backend",
        port: PORT,
        cloudEnabled: getLlmProviderStatus().enabled,
        llm: getLlmProviderStatus(),
        petFace: getPetFaceAdapterStatus()
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/petface/status") {
      sendJson(res, 200, getPetFaceAdapterStatus());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/identity/status") {
      sendJson(res, 200, {
        provider: process.env.PET_IDENTITY_PROVIDER || "placeholder",
        placeholder: await getPlaceholderIdentityStatus(),
        petFace: getPetFaceAdapterStatus()
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/llm/status") {
      sendJson(res, 200, getLlmProviderStatus());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/mobile/bootstrap") {
      await handleMobileBootstrap(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/pets") {
      sendJson(res, 200, { pets: await listPets() });
      return;
    }

    if (req.method === "PATCH" && parts[0] === "api" && parts[1] === "pets" && parts[2] && parts[3] === "profile") {
      const body = await readBody(req);
      sendJson(res, 200, await updatePetProfile(parts[2], body));
      return;
    }

    if (req.method === "POST" && parts[0] === "api" && parts[1] === "pets" && parts[2] && parts[3] === "activate") {
      sendJson(res, 200, await setActivePet(parts[2]));
      return;
    }

    if (req.method === "GET" && parts[0] === "api" && parts[1] === "pets" && parts[2] && parts[3] === "care-records") {
      sendJson(res, 200, { records: await listCareRecords(parts[2]) });
      return;
    }

    if (req.method === "POST" && parts[0] === "api" && parts[1] === "pets" && parts[2] && parts[3] === "care-records") {
      const body = await readBody(req);
      sendJson(res, 201, await appendCareRecord({ ...body, petId: parts[2], source: body.source || "manual" }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/daily-care-records") {
      sendJson(res, 200, {
        days: await listDailyCareRecords({
          petId: url.searchParams.get("petId") || undefined,
          date: url.searchParams.get("date") || undefined
        })
      });
      return;
    }

    if (req.method === "GET" && parts[0] === "api" && parts[1] === "pets" && parts[2] && parts[3] === "daily-care-records") {
      sendJson(res, 200, { days: await listDailyCareRecords({ petId: parts[2] }) });
      return;
    }

    if (req.method === "POST" && parts[0] === "api" && parts[1] === "pets" && parts[2] && parts[3] === "daily-care-records" && parts[4] === "finalize") {
      const body = await readBody(req);
      sendJson(res, 200, await finalizeDailyCareRecord(parts[2], body.date));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/daily-care-records/finalize-due") {
      sendJson(res, 200, await finalizeDueDailyCareRecords());
      return;
    }

    if (req.method === "POST" && parts[0] === "api" && parts[1] === "pets" && parts[2] && parts[3] === "daily-care-records" && !parts[4]) {
      const body = await readBody(req);
      sendJson(res, 201, await appendManualDailyEntry(parts[2], body));
      return;
    }

    if (req.method === "PATCH" && parts[0] === "api" && parts[1] === "care-records" && parts[2]) {
      const body = await readBody(req);
      sendJson(res, 200, await updateCareRecord(parts[2], body));
      return;
    }

    if (req.method === "DELETE" && parts[0] === "api" && parts[1] === "care-records" && parts[2]) {
      sendJson(res, 200, await deleteCareRecord(parts[2]));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/settings") {
      sendJson(res, 200, await getSettings());
      return;
    }

    if (req.method === "PATCH" && url.pathname === "/api/settings") {
      const body = await readBody(req);
      sendJson(res, 200, await updateSettings(body));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/ar/analyze") {
      await handleArAnalyze(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/ar/display/latest") {
      const runtime = await readJson("ar_runtime.json");
      sendJson(res, 200, runtime.latestDisplay || {
        petId: null,
        title: "等待观察",
        line1: "先保持观察",
        line2: "",
        statusLine: "等待观察",
        actionLine: "先保持观察",
        visibleLines: ["等待观察", "先保持观察"],
        confidenceText: "0%",
        riskText: "低风险",
        displayMode: "compact-ar",
        maxLines: 2,
        updatedAt: new Date().toISOString()
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/pet/status/latest") {
      await handleLatestLegacyStatus(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/candidates") {
      sendJson(res, 200, { candidates: await listCandidates() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/candidates/promote") {
      const body = await readBody(req);
      const promoted = await promoteCandidateById(body.candidateId);
      sendJson(res, 200, promoted);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/candidates/discard") {
      const body = await readBody(req);
      sendJson(res, 200, await discardCandidateById(body.candidateId));
      return;
    }

    if (req.method === "GET" && parts[0] === "api" && parts[1] === "profile-suggestions" && parts[2]) {
      sendJson(res, 200, await suggestProfileUpdates(parts[2]));
      return;
    }

    if (req.method === "POST" && parts[0] === "api" && parts[1] === "profile-suggestions" && parts[2] && parts[3] === "apply") {
      const body = await readBody(req);
      sendJson(res, 200, await applyProfileSuggestions(parts[2], body.suggestions || []));
      return;
    }

    if (req.method === "GET" && parts[0] === "api" && parts[1] === "memory" && parts[2]) {
      await handleMemory(req, res, parts[2]);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/runtime") {
      sendJson(res, 200, await readJson("ar_runtime.json"));
      return;
    }

    sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    sendJson(res, 500, { error: "server_error", message: String(error.message || error) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`PetMirror Unified Backend listening on http://127.0.0.1:${PORT}`);
  const llmStatus = getLlmProviderStatus();
  console.log(`LLM provider: ${llmStatus.enabled ? `${llmStatus.model} at ${llmStatus.baseUrl}` : "disabled, using mock reasoning"}`);
  startDailyCareAutoFinalize();
  console.log("Daily care auto-finalize: enabled");
});
