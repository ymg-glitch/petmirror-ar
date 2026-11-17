// This page replays curated illustrative text. It does not invoke a model or access a camera.
const REPOSITORY_URL = "https://github.com/ymg-glitch/petmirror-ar";

const scenarios = {
  food: {
    pet: "demo_cat_a",
    petLabel: "示例猫 A · 猫",
    status: "食盆旁犹豫",
    action: "少打扰，再观察",
    evidence: "靠近食盆，却没有立即进食。",
    risk: "单次观察，暂不下结论",
    memory: "先记为待确认线索",
    timeline: "今日 · 食盆旁犹豫，待继续观察"
  },
  hide: {
    pet: "demo_cat_a",
    petLabel: "示例猫 A · 猫",
    status: "躲着观察",
    action: "降低噪声，留出空间",
    evidence: "缩在角落，身体姿态较低。",
    risk: "减少刺激，观察是否持续",
    memory: "重复出现再进入今日记录",
    timeline: "今日 · 躲藏线索，待确认环境变化"
  },
  alert: {
    pet: "demo_dog_b",
    petLabel: "示例犬 B · 狗",
    status: "有些警觉",
    action: "保持距离，别急着靠近",
    evidence: "户外牵引时露齿、身体紧绷。",
    risk: "先按防御信号谨慎处理",
    memory: "仅记录观察，不写成性格标签",
    timeline: "今日 · 外出时警觉，记录触发场景"
  }
};

const pets = {
  demo_cat_a: {
    type: "猫 · 2 岁",
    name: "示例猫 A",
    description: "谨慎、亲人；换粮时值得多观察。",
    timeline: "今日 · 食盆旁犹豫，待继续观察",
    past: "长期记录 · 换粮适应较慢"
  },
  demo_dog_b: {
    type: "狗 · 4 岁",
    name: "示例犬 B",
    description: "活泼、亲人；户外刺激下容易警觉。",
    timeline: "今日 · 外出时警觉，记录触发场景",
    past: "长期记录 · 雨天时需要更多安抚"
  },
  demo_memorial_c: {
    type: "纪念档案",
    name: "纪念示例 C",
    description: "保留陪伴记忆与过去的照护记录。",
    timeline: "陪伴记录 · 第一次到家",
    past: "历史记录 · 喜欢晒太阳"
  }
};

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function selectPet(key, timelineOverride) {
  const pet = pets[key];
  if (!pet) return;
  setText("pet-type", pet.type);
  setText("pet-name", pet.name);
  setText("pet-description", pet.description);
  setText("timeline-item", timelineOverride || pet.timeline);
  setText("timeline-past", pet.past);
  document.querySelectorAll(".pet-tab").forEach((button) => {
    const active = button.dataset.pet === key;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function selectScenario(key) {
  const scenario = scenarios[key];
  if (!scenario) return;
  setText("stage-pet", scenario.petLabel);
  setText("ar-status", scenario.status);
  setText("ar-action", scenario.action);
  setText("scene-evidence", scenario.evidence);
  setText("risk-boundary", scenario.risk);
  setText("memory-writeback", scenario.memory);
  selectPet(scenario.pet, scenario.timeline);
  document.querySelectorAll(".scenario").forEach((button) => {
    const active = button.dataset.scenario === key;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

document.querySelectorAll(".scenario").forEach((button) => {
  button.addEventListener("click", () => selectScenario(button.dataset.scenario));
});

document.querySelectorAll(".pet-tab").forEach((button) => {
  button.addEventListener("click", () => selectPet(button.dataset.pet));
});

for (const id of ["repo-link-top", "repo-link-bottom"]) {
  const link = document.getElementById(id);
  if (!link) continue;
  if (REPOSITORY_URL.startsWith("https://github.com/")) {
    link.href = REPOSITORY_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  } else {
    link.href = "#source";
    link.setAttribute("aria-label", "仓库链接待发布后启用");
  }
}
