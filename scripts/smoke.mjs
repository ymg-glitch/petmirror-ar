import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = 18791;
const child = spawn(process.execPath, ["server.mjs"], {
  cwd: resolve(root, "backend"),
  env: { ...process.env, PORT: String(port), LLM_API_KEY: "", BAYESDL_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

let stderr = "";
child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
let mobile;

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Backend exited early: ${stderr}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(800) });
      if (response.ok) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Backend did not respond: ${stderr}`);
}

try {
  await waitForServer();
  for (const path of ["/health", "/api/mobile/bootstrap", "/api/ar/display/latest", "/api/identity/status", "/api/llm/status"]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    await response.json();
    process.stdout.write(`PASS ${path}\n`);
  }
  mobile = spawn(process.execPath, ["serve.mjs"], {
    cwd: resolve(root, "mobile-web"),
    env: { ...process.env, PORT: "18792" },
    stdio: "ignore",
    windowsHide: true
  });
  let html;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:18792/", { signal: AbortSignal.timeout(800) });
      if (response.ok) { html = await response.text(); break; }
    } catch {}
    await new Promise((done) => setTimeout(done, 100));
  }
  if (!html?.includes("PetMirror")) throw new Error("Mobile H5 did not serve its main page");
  process.stdout.write("PASS mobile H5 /\n");
} finally {
  mobile?.kill();
  child.kill();
}
