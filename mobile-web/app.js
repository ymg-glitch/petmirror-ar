const API_BASE = window.PETMIRROR_API_BASE || "http://127.0.0.1:8791";

const fallbackPets = [
  { id: "demo_cat_a", name: "示例猫 A", species: "cat", breed: "示例", age: "未设置", sex: "未设置", weight: "未设置", avatar: "A", memorial: false, profile: { personality: [], preferences: [], taboos: [], behaviorPatterns: [] } },
  { id: "demo_dog_b", name: "示例犬 B", species: "dog", breed: "示例", age: "未设置", sex: "未设置", weight: "未设置", avatar: "B", memorial: false, profile: { personality: [], preferences: [], taboos: [], behaviorPatterns: [] } },
  { id: "demo_memorial_c", name: "纪念档案示例 C", species: "cat", breed: "示例", age: "未设置", sex: "未设置", weight: "未设置", avatar: "C", memorial: true, profile: { personality: [], preferences: [], taboos: [], behaviorPatterns: [] } }
];

const fallbackCareRecords = [];
const defaultSettings = {
  rayneoBound: false,
  cloudApi: false,
  dataSync: "Wi-Fi",
  localStorage: true,
  cloudStorage: "structured_summary",
  videoSaved: false,
  audioSaved: false,
  privacyConsent: false
};

const state = {
  view: "home",
  petId: "demo_cat_a",
  pets: fallbackPets,
  careRecords: fallbackCareRecords,
  dailyCareRecords: [],
  candidates: [],
  settings: defaultSettings,
  backendOnline: false,
  loading: true,
  toastTimer: null
};

const content = document.querySelector("#content");
const toast = document.querySelector("#toast");
const backendStatus = document.querySelector("#backend-status");
const rayneoStatus = document.querySelector("#rayneo-status");
const storageStatus = document.querySelector("#storage-status");

const params = new URLSearchParams(window.location.search);
const initialView = params.get("view");
const initialPet = params.get("pet");
if (["home", "profile", "logs", "settings"].includes(initialView)) state.view = initialView;
if (initialPet) state.petId = initialPet;

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

bootstrap();

async function bootstrap() {
  renderLoading();
  try {
    const data = await apiGet("/api/mobile/bootstrap");
    state.pets = Array.isArray(data.pets) && data.pets.length ? data.pets : fallbackPets;
    state.careRecords = Array.isArray(data.careRecords) ? data.careRecords : fallbackCareRecords;
    state.dailyCareRecords = Array.isArray(data.dailyCareRecords) ? data.dailyCareRecords : [];
    state.candidates = Array.isArray(data.candidates) ? data.candidates : [];
    state.settings = { ...defaultSettings, ...(data.settings || {}) };
    state.backendOnline = true;
  } catch {
    state.backendOnline = false;
    showToast("后端未连接，当前使用本地演示数据");
  } finally {
    state.loading = false;
    if (!state.pets.some((pet) => pet.id === state.petId)) {
      state.petId = state.pets[0]?.id || "demo_cat_a";
    }
    updateHeaderStatus();
    render();
  }
}

function renderLoading() {
  content.innerHTML = `
    <section class="view">
      <article class="card">
        <h2>正在连接统一后端</h2>
        <p class="hint">正在读取宠物档案、照护记录和系统设置。</p>
      </article>
    </section>
  `;
}

function render() {
  const pet = currentPet();
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
  updateHeaderStatus();

  const views = {
    home: renderHome,
    profile: renderProfile,
    logs: renderLogs,
    settings: renderSettings
  };
  content.innerHTML = views[state.view](pet);
  bindViewEvents();
}

function renderHome(pet) {
  const latest = currentRecords()[0];
  const memory = Boolean(pet.memorial);
  return `
    <section class="view">
      ${petSwitcher()}
      <article class="card summary-card ${memory ? "memory" : ""}">
        <div class="summary-top">
          <div>
            <h2>${memory ? `${escapeHtml(pet.name)}的纪念档案` : escapeHtml(pet.name)}</h2>
            <p class="meta">${escapeHtml(speciesText(pet.species))} / ${escapeHtml(pet.age)} / ${escapeHtml(pet.breed)}</p>
          </div>
          <div class="avatar">${escapeHtml(pet.avatar || pet.name?.slice(0, 1) || "宠")}</div>
        </div>
        ${memory ? "" : tagMarkup(profileTags(pet).slice(0, 3), false)}
        <p class="hint">${memory ? `这里保存${escapeHtml(pet.name)}的陪伴记忆。` : "这里是宠物长期记忆的手机端可视化窗口。"}</p>
      </article>

      <section class="reminder-grid">
        ${summaryCards(pet, latest)
          .map(
            (item) => `
              <article class="reminder-card">
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.body)}</p>
              </article>
            `
          )
          .join("")}
      </section>

      ${latest ? latestRecordCard(latest, memory) : emptyCard(memory ? "暂无陪伴记录" : "暂无照护记录")}
    </section>
  `;
}

function renderProfile(pet) {
  const memory = Boolean(pet.memorial);
  return `
    <section class="view">
      <div class="section-title">
        <div>
          <h2>宠物档案 ${memory ? `<span class="pill">纪念档案</span>` : ""}</h2>
          <p>${memory ? "保留重要信息与陪伴记忆" : "查看和编辑会进入长期记忆的宠物标签"}</p>
        </div>
        ${memory ? "" : `<button class="ghost-button" type="button" data-edit-profile>编辑档案</button>`}
      </div>

      <article class="card profile-card">
        <div class="profile-row">
          <span>姓名</span><strong>${escapeHtml(pet.name)}</strong>
        </div>
        <div class="profile-row">
          <span>类型</span><strong>${escapeHtml(speciesText(pet.species))}</strong>
        </div>
        <div class="profile-row">
          <span>品种</span><strong>${escapeHtml(pet.breed)}</strong>
        </div>
        <div class="profile-row">
          <span>年龄</span><strong>${escapeHtml(pet.age)}</strong>
        </div>
        <div class="profile-row">
          <span>体重</span><strong>${escapeHtml(pet.weight || "未记录")}</strong>
        </div>
      </article>

      ${profileSection("性格标签", pet.profile?.personality || [], memory)}
      ${profileSection("偏好与禁忌", [...(pet.profile?.preferences || []), ...(pet.profile?.taboos || []).map((item) => `避免：${item}`)], memory)}
      ${profileSection(memory ? "陪伴记忆" : "行为模式", pet.profile?.behaviorPatterns || [], memory)}
    </section>
  `;
}

function renderLogs(pet) {
  const memory = Boolean(pet.memorial);
  const records = currentRecords();
  const candidates = currentCandidates();
  return `
    <section class="view">
      <div class="section-title">
        <div>
          <h2>${memory ? "陪伴记录" : "喂养与照护记录"}</h2>
          <p>${memory ? `${escapeHtml(pet.name)}的陪伴记忆` : `当前记录：${escapeHtml(pet.name)}`}</p>
        </div>
        ${memory ? "" : `<button class="primary-button" type="button" data-add-log>新增记录</button>`}
      </div>
      ${dailySection(memory)}
      ${memory ? "" : candidateSection(candidates)}
      <div class="timeline">
        ${records.length ? records.map((record) => logItem(record, memory)).join("") : emptyCard(memory ? "暂无陪伴记录" : "暂无照护记录")}
      </div>
    </section>
  `;
}

function renderSettings(pet) {
  const memory = Boolean(pet.memorial);
  return `
    <section class="view">
      <div class="section-title">
        <div>
          <h2>系统设置与隐私</h2>
          <p>管理眼镜绑定、云端能力、存储与隐私授权。</p>
        </div>
      </div>
      <article class="card settings-list">
        ${settingToggle("rayneoBound", "绑定 RayNeo 眼镜", state.settings.rayneoBound)}
        ${settingToggle("cloudApi", "云端 API 开关", state.settings.cloudApi)}
        ${settingToggle("localStorage", "本地结构化存储", state.settings.localStorage)}
        ${settingToggle("privacyConsent", "隐私授权", state.settings.privacyConsent)}
      </article>
      <article class="card settings-list">
        <div class="setting-row">
          <div>
            <strong>数据同步</strong>
            <span>${escapeHtml(state.settings.dataSync || "Wi-Fi")}</span>
          </div>
          <button class="ghost-button" type="button" data-setting-note>配置</button>
        </div>
        <div class="setting-row">
          <div>
            <strong>${memory ? "纪念档案导出" : "导出长期记忆"}</strong>
            <span>宠物档案与照护记录</span>
          </div>
          <button class="ghost-button" type="button" data-export-memory>导出</button>
        </div>
        <button class="danger-button" type="button" data-delete>${memory ? "删除该宠物数据" : "删除数据"}</button>
      </article>
    </section>
  `;
}

function petSwitcher() {
  return `
    <div class="pet-switcher" aria-label="宠物切换">
      ${state.pets
        .map(
          (pet) => `
            <button class="pet-button ${pet.id === state.petId ? "active" : ""}" type="button" data-pet="${pet.id}">
              <strong>${escapeHtml(pet.name)}</strong>
              <span>${escapeHtml(petShortText(pet))}</span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function summaryCards(pet, latest) {
  if (pet.memorial) {
    return [
      {
        title: "最常被记录的偏好",
        body: (pet.profile?.preferences || []).join("、") || "暂无偏好记录。"
      }
    ];
  }
  return [
    {
      title: "当前照护重点",
      body: latest ? `${latest.title}：${latest.summary}` : "暂无近期照护记录。"
    },
    {
      title: "长期记忆来源",
      body: "由宠物档案、每日照护记录和长期照护记录共同组成。"
    }
  ];
}

function latestRecordCard(record, memory) {
  return `
    <button class="preview-card" type="button" data-go-logs>
      <span class="time">${escapeHtml(formatDate(record.date))}</span>
      <strong>${memory ? "最近陪伴记录" : "最近照护记录"}</strong>
      <p>${escapeHtml(record.title)}：${escapeHtml(record.summary)}</p>
      <span class="source ${sourceClass(record.source)}">${escapeHtml(sourceText(record.source))}</span>
    </button>
  `;
}

function dailySection(memory) {
  if (memory) return "";
  const days = currentDailyRecords();
  const todayDay = days[0];
  if (!todayDay || !todayDay.entries?.length) {
    return `
      <article class="card soft">
        <h3>今日照护记录</h3>
        <p class="hint">今日还没有筛选后的照护记录。</p>
      </article>
    `;
  }
  return `
    <article class="card soft">
      <div class="section-title">
        <div>
          <h2>今日照护记录</h2>
          <p>${escapeHtml(todayDay.date)} · ${escapeHtml(todayDay.status === "finalized" ? "已固化" : "实时刷新中")}</p>
        </div>
        ${
          todayDay.status === "finalized"
            ? ""
            : `<button class="ghost-button" type="button" data-finalize-daily="${escapeHtml(todayDay.date)}">固化今日记录</button>`
        }
      </div>
      <div class="timeline" style="padding-left:0;">
        ${todayDay.entries
          .map(
            (entry) => `
              <div class="log-card ai">
                <div class="log-head">
                  <span class="log-time">${escapeHtml(formatTime(entry.time))}</span>
                  <span class="source ai">${escapeHtml(sourceText(entry.source))}</span>
                </div>
                <h3>${escapeHtml(entry.title)}</h3>
                <p>${escapeHtml(entry.summary)}</p>
              </div>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function candidateSection(candidates) {
  if (!candidates.length) return "";
  return `
    <article class="card">
      <div class="section-title compact">
        <div>
          <h2>候选记忆</h2>
          <p>AI 观察会先进入候选池，再筛选进每日照护记录。</p>
        </div>
      </div>
      <div class="candidate-list">
        ${candidates
          .map(
            (candidate) => `
              <div class="candidate-item">
                <div>
                  <strong>${escapeHtml(candidate.behavior || candidate.scene || "候选观察")}</strong>
                  <span>${escapeHtml(candidate.suggestedCareRecord || candidate.aiGuess || "等待筛选")}</span>
                </div>
                <small>${escapeHtml(candidate.status === "screened" ? "已进入今日记录" : "待筛选")}</small>
              </div>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function profileSection(title, items, memory) {
  return `
    <article class="card">
      <div class="section-title compact">
        <h2>${escapeHtml(title)}</h2>
      </div>
      ${items?.length ? tagMarkup(items.map((label) => ({ label, source: memory ? "陪伴记忆" : "长期记忆" })), false) : `<p class="hint">暂无记录。</p>`}
    </article>
  `;
}

function logItem(record, memory) {
  return `
    <article class="log-card ${sourceClass(record.source)}">
      <div class="log-head">
        <span class="log-time">${escapeHtml(formatDate(record.date))}</span>
        <span class="source ${sourceClass(record.source)}">${escapeHtml(sourceText(record.source))}</span>
      </div>
      <h3>${escapeHtml(record.title)}</h3>
      <p>${escapeHtml(record.summary)}</p>
      ${tagMarkup((record.tags || []).map((label) => ({ label, source: memory ? "陪伴记忆" : "照护记录" })), false)}
    </article>
  `;
}

function settingToggle(key, title, value) {
  return `
    <div class="setting-row">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${value ? "已开启" : "已关闭"}</span>
      </div>
      <button class="switch ${value ? "on" : ""}" type="button" data-switch="${escapeHtml(key)}" aria-label="${escapeHtml(title)}"></button>
    </div>
  `;
}

function tagMarkup(tags, showSource = true) {
  if (!tags?.length) return "";
  return `
    <div class="tag-row">
      ${tags
        .map((tag) => {
          const item = typeof tag === "string" ? { label: tag } : tag;
          return `
            <span class="tag">
              ${escapeHtml(item.label || item.value || "")}
              ${showSource && item.source ? `<em>${escapeHtml(item.source)}</em>` : ""}
            </span>
          `;
        })
        .join("")}
    </div>
  `;
}

function profileTags(pet) {
  const profile = pet.profile || {};
  return [
    ...(profile.personality || []).map((label) => ({ label, source: "性格" })),
    ...(profile.preferences || []).map((label) => ({ label, source: "偏好" })),
    ...(profile.behaviorPatterns || []).map((label) => ({ label, source: "模式" }))
  ];
}

function bindViewEvents() {
  content.querySelectorAll("[data-pet]").forEach((button) => {
    button.addEventListener("click", () => setPet(button.dataset.pet));
  });
  content.querySelectorAll("[data-go-logs]").forEach((button) => {
    button.addEventListener("click", () => setView("logs"));
  });
  content.querySelectorAll("[data-edit-profile]").forEach((button) => {
    button.addEventListener("click", openProfileEditor);
  });
  content.querySelectorAll("[data-add-log]").forEach((button) => {
    button.addEventListener("click", addDemoLog);
  });
  content.querySelectorAll("[data-finalize-daily]").forEach((button) => {
    button.addEventListener("click", () => finalizeDailyRecord(button.dataset.finalizeDaily));
  });
  content.querySelectorAll("[data-switch]").forEach((button) => {
    button.addEventListener("click", () => toggleSetting(button.dataset.switch));
  });
  content.querySelectorAll("[data-setting-note]").forEach((button) => {
    button.addEventListener("click", () => showToast("Demo 中保留为设置入口"));
  });
  content.querySelectorAll("[data-export-memory]").forEach((button) => {
    button.addEventListener("click", exportCurrentMemory);
  });
  content.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      if (window.confirm("确认删除数据？Demo 中不会真实删除。")) {
        showToast("已收到确认，Demo 中不真实删除");
      }
    });
  });
}

async function openProfileEditor() {
  const pet = currentPet();
  const profile = pet.profile || {};
  const form = document.createElement("form");
  form.className = "modal-card";
  form.innerHTML = `
    <div class="modal-head">
      <div>
        <h2>编辑${escapeHtml(pet.name)}的档案</h2>
        <p>每行一个标签，保存后会写回长期记忆里的宠物档案。</p>
      </div>
      <button class="icon-button" type="button" data-close-modal aria-label="关闭">×</button>
    </div>
    <div class="edit-grid">
      ${textInput("名字", "name", pet.name)}
      ${textInput("年龄", "age", pet.age)}
      ${textInput("品种", "breed", pet.breed)}
      ${textInput("体重", "weight", pet.weight)}
      ${textInput("头像字", "avatar", pet.avatar)}
      ${selectInput("类型", "species", pet.species, [
        ["cat", "猫"],
        ["dog", "狗"]
      ])}
    </div>
    ${textareaInput("性格标签", "personality", profile.personality)}
    ${textareaInput("偏好", "preferences", profile.preferences)}
    ${textareaInput("禁忌", "taboos", profile.taboos)}
    ${textareaInput("行为模式", "behaviorPatterns", profile.behaviorPatterns)}
    <div class="modal-actions">
      <button class="ghost-button" type="button" data-close-modal>取消</button>
      <button class="primary-button" type="submit">保存</button>
    </div>
  `;
  openModal(form);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      name: formData.get("name"),
      age: formData.get("age"),
      breed: formData.get("breed"),
      weight: formData.get("weight"),
      avatar: formData.get("avatar"),
      species: formData.get("species"),
      profile: {
        personality: splitLines(formData.get("personality")),
        preferences: splitLines(formData.get("preferences")),
        taboos: splitLines(formData.get("taboos")),
        behaviorPatterns: splitLines(formData.get("behaviorPatterns"))
      }
    };
    try {
      if (state.backendOnline) {
        const updated = await apiPatch(`/api/pets/${encodeURIComponent(pet.id)}/profile`, payload);
        updateLocalPet(updated.pet || { ...pet, ...payload });
      } else {
        updateLocalPet({ ...pet, ...payload });
      }
      closeModal();
      render();
      showToast("档案已保存");
    } catch (error) {
      showToast(`保存失败：${error.message || "请稍后重试"}`);
    }
  });
}

async function addDemoLog() {
  const pet = currentPet();
  const form = document.createElement("form");
  form.className = "modal-card";
  form.innerHTML = `
    <div class="modal-head">
      <div>
        <h2>新增${escapeHtml(pet.name)}的照护记录</h2>
        <p>这条记录会进入今日照护记录，可手动固化为长期照护记录。</p>
      </div>
      <button class="icon-button" type="button" data-close-modal aria-label="关闭">×</button>
    </div>
    <div class="edit-grid">
      ${textInput("标题", "title", "手动照护记录")}
      ${textInput("日期", "date", new Date().toISOString().slice(0, 10))}
      ${selectInput("重要性", "importance", "medium", [
        ["low", "低"],
        ["medium", "中"],
        ["high", "高"]
      ])}
      ${selectInput("类型", "type", "manual", [
        ["manual", "手动"],
        ["feeding", "喂养"],
        ["health", "健康"],
        ["emotion", "状态"]
      ])}
    </div>
    ${textareaInput("记录内容", "summary", [`${pet.name}今天状态平稳。`])}
    ${textareaInput("标签", "tags", ["手动记录"])}
    <div class="modal-actions">
      <button class="ghost-button" type="button" data-close-modal>取消</button>
      <button class="primary-button" type="submit">保存</button>
    </div>
  `;
  openModal(form);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const record = {
      date: formData.get("date") || new Date().toISOString().slice(0, 10),
      type: formData.get("type") || "manual",
      title: formData.get("title") || "手动照护记录",
      summary: formData.get("summary") || "",
      importance: formData.get("importance") || "medium",
      tags: splitLines(formData.get("tags"))
    };
    await saveManualLog(record);
  });
}

async function saveManualLog(record) {
  const pet = currentPet();
  try {
    if (state.backendOnline) {
      await apiPost(`/api/pets/${encodeURIComponent(pet.id)}/daily-care-records`, {
        ...record,
        riskLevel: record.importance === "high" ? "medium" : "low",
        source: "manual"
      });
      await refreshBootstrap();
    } else {
      state.careRecords.unshift({ ...record, id: `local_${Date.now()}`, petId: pet.id, source: "manual" });
      render();
    }
    closeModal();
    showToast("已新增一条照护记录");
  } catch (error) {
    showToast(`新增失败：${error.message || "请稍后重试"}`);
  }
}

async function finalizeDailyRecord(date) {
  const pet = currentPet();
  if (!state.backendOnline) {
    showToast("后端未连接，无法固化今日记录");
    return;
  }
  try {
    await apiPost(`/api/pets/${encodeURIComponent(pet.id)}/daily-care-records/finalize`, { date });
    await refreshBootstrap();
    showToast("今日记录已固化为长期照护记录");
  } catch (error) {
    showToast(`固化失败：${error.message || "请稍后重试"}`);
  }
}

async function refreshBootstrap(shouldRender = true) {
  const data = await apiGet("/api/mobile/bootstrap");
  state.pets = Array.isArray(data.pets) && data.pets.length ? data.pets : state.pets;
  state.careRecords = Array.isArray(data.careRecords) ? data.careRecords : state.careRecords;
  state.dailyCareRecords = Array.isArray(data.dailyCareRecords) ? data.dailyCareRecords : state.dailyCareRecords;
  state.candidates = Array.isArray(data.candidates) ? data.candidates : state.candidates;
  state.settings = { ...state.settings, ...(data.settings || {}) };
  state.backendOnline = true;
  if (shouldRender) render();
}

async function toggleSetting(key) {
  const next = { ...state.settings, [key]: !state.settings[key] };
  state.settings = next;
  render();
  if (!state.backendOnline) return;
  try {
    state.settings = await apiPatch("/api/settings", { [key]: next[key] });
    render();
  } catch {
    showToast("设置未能同步到后端");
  }
}

function setPet(petId) {
  state.petId = petId;
  if (state.backendOnline) {
    apiPost(`/api/pets/${encodeURIComponent(petId)}/activate`, {}).catch(() => {});
  }
  render();
}

function setView(view) {
  state.view = view;
  render();
}

function currentPet() {
  return state.pets.find((pet) => pet.id === state.petId) || state.pets[0];
}

function currentRecords() {
  const pet = currentPet();
  return state.careRecords
    .filter((record) => record.petId === pet.id)
    .sort((left, right) => String(right.date).localeCompare(String(left.date)));
}

function currentDailyRecords() {
  const pet = currentPet();
  return state.dailyCareRecords
    .filter((day) => day.petId === pet.id)
    .sort((left, right) => String(right.date).localeCompare(String(left.date)));
}

function currentCandidates() {
  const pet = currentPet();
  return state.candidates
    .filter((candidate) => candidate.petId === pet.id)
    .sort((left, right) => String(right.lastSeenAt || "").localeCompare(String(left.lastSeenAt || "")))
    .slice(0, 3);
}

function updateHeaderStatus() {
  backendStatus.textContent = state.backendOnline ? "统一后端已连接" : "本地演示数据";
  rayneoStatus.textContent = state.settings.rayneoBound ? "RayNeo 已绑定" : "RayNeo 未绑定";
  storageStatus.textContent = state.settings.videoSaved ? "视频保存开启" : "视频不保存";
}

function exportCurrentMemory() {
  const pet = currentPet();
  const payload = {
    exportedAt: new Date().toISOString(),
    pet,
    careRecords: currentRecords(),
    dailyCareRecords: currentDailyRecords(),
    candidates: currentCandidates()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `petmirror-memory-${pet.id}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("已导出当前宠物长期记忆 JSON");
}

function petShortText(pet) {
  if (pet.memorial) return "纪念档案";
  return `${speciesText(pet.species)} · ${pet.age}`;
}

function speciesText(value) {
  if (value === "cat") return "猫";
  if (value === "dog") return "狗";
  return "宠物";
}

function sourceText(value) {
  if (value === "manual") return "手动记录";
  if (value === "ai" || value === "ai_candidate_promoted" || value === "ai_candidate_screened") return "AI 整理";
  if (value === "daily_finalized") return "长期记忆";
  return "记录";
}

function sourceClass(value) {
  if (value === "ai" || value === "ai_candidate_promoted" || value === "ai_candidate_screened" || value === "daily_finalized") {
    return "ai";
  }
  return "";
}

function formatDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10).replaceAll("-", "年").replace(/年(\d{2})年/, "年$1月") + "日";
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(11, 16);
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function emptyCard(text) {
  return `<article class="card"><p class="hint">${escapeHtml(text)}</p></article>`;
}

function textInput(label, name, value) {
  return `
    <label>
      <span>${escapeHtml(label)}</span>
      <input name="${escapeHtml(name)}" value="${escapeHtml(value || "")}" />
    </label>
  `;
}

function selectInput(label, name, value, options) {
  return `
    <label>
      <span>${escapeHtml(label)}</span>
      <select name="${escapeHtml(name)}">
        ${options.map(([optionValue, text]) => `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}
      </select>
    </label>
  `;
}

function textareaInput(label, name, values = []) {
  return `
    <label class="wide">
      <span>${escapeHtml(label)}</span>
      <textarea name="${escapeHtml(name)}">${escapeHtml((values || []).join("\n"))}</textarea>
    </label>
  `;
}

function openModal(node) {
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.appendChild(node);
  document.body.appendChild(overlay);
  overlay.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", closeModal);
  });
}

function closeModal() {
  document.querySelector(".modal-backdrop")?.remove();
}

function updateLocalPet(updatedPet) {
  state.pets = state.pets.map((pet) => (pet.id === updatedPet.id ? { ...pet, ...updatedPet } : pet));
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  state.toastTimer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

async function apiGet(path) {
  return request(path, { method: "GET" });
}

async function apiPost(path, body) {
  return request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function apiPatch(path, body) {
  return request(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function request(path, options) {
  const response = await fetch(`${API_BASE}${path}`, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
