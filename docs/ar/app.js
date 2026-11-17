// Browser replay of the AR display shape. These are scripted examples, not live model output.
const cases = [
  { name: "食盆旁犹豫", pet: "示例猫 A", kind: "猫", symbol: "🐈", status: "食盆旁犹豫", action: "少打扰，再观察", detail: "观察到靠近食盆但进食不积极；单次画面只适合给保守提醒。" },
  { name: "躲着观察", pet: "示例猫 A", kind: "猫", symbol: "🐈", status: "躲着观察", action: "降低噪声，留出空间", detail: "缩在角落、身体姿态较低；先减少环境刺激，观察是否持续。" },
  { name: "户外警觉", pet: "示例犬 B", kind: "狗", symbol: "🐕", status: "有些警觉", action: "保持距离，别急着靠近", detail: "牵引时露齿且身体紧绷；先按防御信号谨慎处理。" }
];

let current = 0;
let timer = null;

function render() {
  const item = cases[current];
  document.getElementById("case-name").textContent = item.name;
  document.getElementById("case-count").textContent = `${current + 1} / ${cases.length}`;
  document.getElementById("case-detail").textContent = item.detail;
  document.querySelectorAll(".eye").forEach((eye) => {
    eye.querySelector(".pet-symbol").textContent = item.symbol;
    eye.querySelector(".prompt-caption").textContent = `${item.pet} · 离线演示`;
    eye.querySelector(".status").textContent = item.status;
    eye.querySelector(".action").textContent = item.action;
  });
  document.querySelectorAll("[data-case]").forEach((button) => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.case) === current));
  });
}

function setCase(index) {
  current = (index + cases.length) % cases.length;
  render();
}

document.getElementById("prev").addEventListener("click", () => setCase(current - 1));
document.getElementById("next").addEventListener("click", () => setCase(current + 1));
document.querySelectorAll("[data-case]").forEach((button) => {
  button.addEventListener("click", () => setCase(Number(button.dataset.case)));
});
document.getElementById("auto").addEventListener("click", (event) => {
  const button = event.currentTarget;
  if (timer) {
    window.clearInterval(timer);
    timer = null;
  } else {
    timer = window.setInterval(() => setCase(current + 1), 5000);
  }
  button.textContent = timer ? "自动轮播：开" : "自动轮播：关";
  button.setAttribute("aria-pressed", String(Boolean(timer)));
});

