export function createArDisplay(analysis) {
  const statusLine = compactStatusLine(toDisplayTitle(analysis), analysis);
  const actionLine = compactLine(pickActionLine(analysis), 16, fallbackAction(analysis));
  const visibleLines = [statusLine, actionLine].filter(Boolean).slice(0, 2);

  return {
    petId: analysis.petId,
    title: statusLine,
    line1: actionLine,
    line2: "",
    statusLine,
    actionLine,
    visibleLines,
    confidenceText: `${Math.round((analysis.confidence || 0) * 100)}%`,
    riskText: riskText(analysis.riskLevel),
    displayMode: "compact-ar",
    maxLines: visibleLines.length,
    updatedAt: new Date().toISOString()
  };
}

export function toLegacyPetStatus(analysis) {
  return {
    petType: normalizePetType(analysis.petType),
    emotion: analysis.stateSummary || analysis.emotion || "观察中",
    need: analysis.need || analysis.behavior || "继续观察",
    confidence: clampConfidence(analysis.confidence),
    riskLevel: normalizeRiskLevel(analysis.riskLevel),
    advice: analysis.advice || analysis.careAction?.primaryAction || "请继续观察宠物状态。",
    reason: analysis.reason || analysis.reasoningNote || "当前还没有详细原因。"
  };
}

function toDisplayTitle(analysis) {
  if (analysis.arPayload?.statusLineCandidate) return analysis.arPayload.statusLineCandidate;
  if (analysis.stateSummary) return analysis.stateSummary;
  if (analysis.behavior) return analysis.behavior;
  if (analysis.need) return analysis.need;
  return "观察中";
}

function fallbackAction(analysis) {
  const level = normalizeRiskLevel(analysis.riskLevel);
  if (level === "high") return "尽快联系兽医";
  if (level === "medium") return "给它一点空间";
  return "先安静观察";
}

function pickActionLine(analysis) {
  if (analysis.arPayload?.actionLineCandidate) return analysis.arPayload.actionLineCandidate;
  if (analysis.careAction?.primaryAction) return analysis.careAction.primaryAction;

  const level = normalizeRiskLevel(analysis.riskLevel);
  const text = [analysis.advice, analysis.need, analysis.behavior, analysis.stateSummary].filter(Boolean).join("。");

  if (level === "high") {
    return firstMatch(text, [
      /尽快联系兽医[^。；;]*/,
      /联系兽医[^。；;]*/,
      /急诊[^。；;]*/,
      /停止[^。；;]*/
    ]) || "尽快联系兽医";
  }

  if (level === "medium") {
    return firstMatch(text, [
      /降低[^。；;]*/,
      /保持[^。；;]*/,
      /留出[^。；;]*/,
      /给它[^。；;]*/,
      /避免[^。；;]*/
    ]) || "给它一点空间";
  }

  return firstMatch(text, [
    /继续观察[^。；;]*/,
    /可以[^。；;]*/,
    /陪它[^。；;]*/,
    /先[^。；;]*/,
    /避免[^。；;]*/
  ]) || "先安静观察";
}

function firstMatch(text, patterns) {
  const source = normalizeSentenceText(text);
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[0]) return match[0];
  }
  return firstSentence(source);
}

function firstSentence(text) {
  return normalizeSentenceText(text).split(/[。；;.!?\n]/).find(Boolean) || "";
}

function compactLine(value, maxChars, fallback = "") {
  const cleaned = normalizeSentenceText(value || fallback);
  const line = firstSentence(cleaned) || fallback;
  if (charLen(line) <= maxChars) return line;
  const softened = shortenLine(line);
  if (charLen(softened) <= maxChars) return softened;
  const fallbackLine = firstSentence(normalizeSentenceText(fallback));
  if (fallbackLine && charLen(fallbackLine) <= maxChars) return fallbackLine;
  return Array.from(softened || line).slice(0, maxChars).join("");
}

function compactStatusLine(value, analysis) {
  const fallback = deriveStatusFallback(analysis);
  const cleaned = normalizeSentenceText(value || fallback);
  const line = firstSentence(cleaned) || fallback;
  if (!looksLikeAction(line) && charLen(line) <= 10) return line;

  const softened = shortenLine(line);
  if (!looksLikeAction(softened) && charLen(softened) >= 2 && charLen(softened) <= 10) return softened;

  return fallback;
}

function deriveStatusFallback(analysis) {
  const level = normalizeRiskLevel(analysis.riskLevel);
  const text = [
    analysis.arPayload?.statusLineCandidate,
    analysis.stateSummary,
    analysis.behavior,
    analysis.reason,
    analysis.advice,
    analysis.careAction?.primaryAction,
    analysis.careAction?.observeNext
  ].filter(Boolean).join("。");

  if (/门后|门缝|门口/.test(text)) return "门后观望";
  if (/躲|遮挡|低伏|趴低|回避/.test(text)) return "躲着观察";
  if (/睡|打盹|休息|闭眼/.test(text)) return "安静休息";
  if (/玩|扑|追|互动|玩具/.test(text)) return "玩得投入";
  if (/张口|露齿|哈气|龇牙/.test(text) && /近|靠近|贴近|凑近/.test(text)) return "张口靠近";
  if (/张口|露齿|哈气|龇牙/.test(text)) return "张口警觉";
  if (/食盆|饭盆|猫粮|狗粮|不吃|进食/.test(text)) return "食盆旁犹豫";
  if (/排尿|猫砂|尿团/.test(text)) return "排尿不顺";
  if (/紧张|警觉|高唤醒|不安/.test(text)) return "有点紧张";
  if (level === "high") return "需要留意";
  if (level === "medium") return "有点紧张";
  return "安静观察";
}

function looksLikeAction(value) {
  return /^(先|别|不要|请|让|给|保持|拉开|远离|观察|联系|陪|留|看|摸|抱|凑|伸手|打扰|等待|靠近)/.test(
    normalizeSentenceText(value)
  );
}

function shortenLine(value) {
  return normalizeSentenceText(value)
    .replace(/^(当前|可能|建议|需要|请|先按|有点|比较)/, "")
    .replace(/(状态|情况|表现|倾向|风险|提醒|观察中|候选|识别|模型|置信度)/g, "")
    .replace(/(一个|一点|先|再)+$/g, "")
    .replace(/[，,].*$/, "")
    .trim();
}

function normalizeSentenceText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[,，]\s*/g, "，")
    .replace(/^[\s,，。；;]+|[\s,，。；;]+$/g, "")
    .trim();
}

function charLen(value) {
  return Array.from(String(value || "")).length;
}

function clampConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const normalized = numeric > 1 ? numeric : numeric * 100;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function normalizeRiskLevel(value) {
  const text = String(value || "").toLowerCase();
  if (["high", "danger", "高风险"].includes(text)) return "high";
  if (["medium", "warning", "需要关注", "中风险"].includes(text)) return "medium";
  return "low";
}

function riskText(value) {
  const level = normalizeRiskLevel(value);
  if (level === "high") return "高风险";
  if (level === "medium") return "需关注";
  return "低风险";
}

function normalizePetType(value) {
  if (value === "cat") return "猫";
  if (value === "dog") return "狗";
  return value || "宠物";
}
