import { existsSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getActivePetId, getPetProfile } from "../services/petMemoryService.mjs";

const DEFAULT_TIMEOUT_MS = Number(process.env.PETFACE_TIMEOUT_MS || 12000);
const ADAPTER_DIR = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = resolve(ADAPTER_DIR, "..");
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "..");
const DEFAULT_REPO_PATH = join(WORKSPACE_ROOT, "models", "PetFace", "repo", "PetFace");
const DEFAULT_MODEL_PATH = join(DEFAULT_REPO_PATH, "pretrained", "arcface", "cat.pt");
const DEFAULT_REFERENCE_DIR = join(WORKSPACE_ROOT, "models", "PetFace", "references");
const DEFAULT_PETFACE_PYTHON = join(WORKSPACE_ROOT, "models", "PetFace", ".venv", "Scripts", "python.exe");

export function getPetFaceAdapterStatus() {
  const { python, repoPath, modelPath, referenceDir } = getPetFacePaths();
  const bridgePath = fileURLToPath(new URL("../scripts/petface_identify.py", import.meta.url));
  const configured = isPetFaceConfigured();

  return {
    adapter: "petface-adapter",
    mode: configured ? "petface" : "fallback",
    python,
    repoPath,
    modelPath,
    referenceDir,
    repoExists: Boolean(repoPath && existsSync(repoPath)),
    modelExists: Boolean(modelPath && existsSync(modelPath)),
    referenceDirExists: Boolean(referenceDir && existsSync(referenceDir)),
    referenceImageCount: countReferenceImages(referenceDir),
    bridgePath,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    note: configured
      ? "PetFace bridge is configured. Identity routing will try the local model first."
      : "PetFace is not fully configured. Put the official cat.pt at the default model path and add pet reference photos."
  };
}

export async function identifyWithPetFace(arData, knownPets = []) {
  const explicitPetId = arData.petId || arData.fallbackPetId;

  if (isPetFaceConfigured() && hasImageInput(arData)) {
    try {
      const result = await runPetFaceBridge(arData, knownPets);
      if (result?.petId) {
        return normalizeBridgeResult(result, knownPets.length);
      }
    } catch (error) {
      const fallback = await fallbackIdentity(arData, knownPets.length, explicitPetId);
      return {
        ...fallback,
        method: "petface_error_fallback",
        adapterStatus: "error",
        error: String(error.message || error)
      };
    }
  }

  return fallbackIdentity(arData, knownPets.length, explicitPetId);
}

function isPetFaceConfigured() {
  const { repoPath, modelPath, referenceDir } = getPetFacePaths();
  return Boolean(
    repoPath &&
      modelPath &&
      referenceDir &&
      existsSync(repoPath) &&
      existsSync(modelPath) &&
      existsSync(referenceDir) &&
      countReferenceImages(referenceDir) > 0
  );
}

function hasImageInput(arData) {
  return Boolean(arData.imagePath || arData.imageBase64 || arData.framePath || arData.frames?.[0]?.imagePath);
}

async function fallbackIdentity(arData, knownPetCount, explicitPetId) {
  const fallbackPetId = explicitPetId || (await getActivePetId());
  const fallbackPet = await getPetProfile(fallbackPetId);

  return {
    petId: fallbackPet.id,
    petName: fallbackPet.name,
    confidence: explicitPetId ? 0.68 : 0.45,
    method: explicitPetId ? "provided_pet_id" : "fallback_active_pet",
    fallbackUsed: true,
    adapter: "petface-adapter",
    adapterStatus: "fallback",
    note: "PetFace model is not configured or AR input has no image. Using petId/active pet fallback.",
    knownPetCount
  };
}

async function runPetFaceBridge(arData, knownPets) {
  const { python, repoPath, modelPath, referenceDir } = getPetFacePaths();
  const bridgePath = fileURLToPath(new URL("../scripts/petface_identify.py", import.meta.url));
  const args = [
    bridgePath,
    "--repo",
    repoPath,
    "--model",
    modelPath,
    "--references",
    referenceDir,
    "--input-json",
    "-"
  ];

  const payload = JSON.stringify({
    arData,
    knownPets,
    threshold: Number(process.env.PETFACE_THRESHOLD || 0.62)
  });

  return new Promise((resolve, reject) => {
    const child = spawn(python, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`PetFace bridge timed out after ${DEFAULT_TIMEOUT_MS}ms`));
    }, DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `PetFace bridge exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`PetFace bridge returned invalid JSON: ${stdout.slice(0, 200)}`));
      }
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}

function getPetFacePaths() {
  return {
    python: process.env.PETFACE_PYTHON || (existsSync(DEFAULT_PETFACE_PYTHON) ? DEFAULT_PETFACE_PYTHON : "python"),
    repoPath: process.env.PETFACE_REPO_PATH || DEFAULT_REPO_PATH,
    modelPath: process.env.PETFACE_MODEL_PATH || DEFAULT_MODEL_PATH,
    referenceDir: process.env.PETFACE_REFERENCE_DIR || DEFAULT_REFERENCE_DIR
  };
}

function countReferenceImages(referenceDir) {
  if (!referenceDir || !existsSync(referenceDir)) return 0;
  let count = 0;
  const stack = [referenceDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
      } else if (/\.(jpg|jpeg|png|bmp|webp)$/i.test(entry.name)) {
        count += 1;
      }
    }
  }
  return count;
}

function normalizeBridgeResult(result, knownPetCount) {
  return {
    petId: result.petId,
    petName: result.petName || result.petId,
    confidence: Number(result.confidence || 0),
    method: result.method || "petface_embedding_match",
    fallbackUsed: false,
    adapter: "petface-adapter",
    adapterStatus: "ready",
    knownPetCount,
    matchedReference: result.matchedReference || null,
    score: result.score,
    note: "PetFace local bridge matched the AR image against household pet reference photos."
  };
}
