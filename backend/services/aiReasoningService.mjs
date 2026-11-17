import { callLlmChat, isLlmProviderEnabled } from "./llmProviderService.mjs";

const REQUIRED_JSON_FIELDS = [
  "petType",
  "behavior",
  "stateSummary",
  "need",
  "confidence",
  "riskLevel",
  "advice",
  "reason",
  "sceneEvidence",
  "riskBoundary",
  "careAction",
  "reasoningNote",
  "arPayload",
  "shouldEnterCandidatePool",
  "candidateSuggestion"
];

export async function runAiReasoning(observation, memoryContext) {
  const analysis = isLlmProviderEnabled()
    ? await callCloudReasoning(observation, memoryContext)
    : buildMockAnalysis(observation, memoryContext);

  return normalizeAnalysis(analysis, observation, memoryContext);
}

async function callCloudReasoning(observation, memoryContext) {
  const { content } = await callLlmChat({
    temperature: 0.2,
    maxTokens: 1000,
    messages: [
      {
        role: "system",
        content: [
          "你是猫犬照护场景的视觉融合推理助手。",
          "正式主链路已经移除固定情绪分类模型，不再输出 angry/happy/relaxed/sad 这类标签。",
          "你需要直接根据 AR 原始观察、图片路径或视觉描述、宠物身份、宠物档案、长期照护记录、今日照护记录和近期候选记忆，分析宠物当前状态。",
          "不要声称系统已经由底层行为识别模型识别出具体动作。",
          "推理顺序必须是：先列 sceneEvidence，再形成 stateSummary，再判断 riskBoundary，最后给 careAction。",
          "观察与推断要分开：sceneEvidence 只写看得到/听得到/输入中明确给出的线索；stateSummary、need、riskBoundary 才写推断。",
          "必须适当使用记忆，但不要硬套无关的年龄、性格、偏好、历史记录。",
          "高风险边界优先于普通解释：狗饭后腹胀、干呕或吐不出、明显不安或喘气，要建议尽快联系兽医或急诊排查风险；猫频繁进出猫砂盆、反复蹲却无尿团、疑似排尿困难、痛叫或血尿，要建议尽快联系兽医排查风险。",
          "不要给出确定医学诊断；使用“需要尽快联系兽医/急诊排查风险”这类表达。",
          "AR 显示必须短。arPayload.statusLineCandidate 是第一行，4-10 个汉字，只写状态短语，例如：张口靠近、有点紧张、躲着观察、安静休息、玩得投入、门后观望。",
          "arPayload.statusLineCandidate 禁止写成动作建议，禁止以“先、别、不要、让、给、保持、观察、联系、陪、留”开头。",
          "arPayload.actionLineCandidate 是第二行，8-16 个汉字，亲切自然，只写主人现在怎么做，例如：给它一点空间、别伸手摸它、让它安静睡会儿、陪它玩一小会儿。",
          "arPayload 不要写模型术语、置信度、括号、省略号、多分句或报告腔。",
          "只输出一个 JSON 对象，不输出 Markdown。",
          `JSON 字段必须包含：${REQUIRED_JSON_FIELDS.join(", ")}。`,
          "riskLevel 只能是 low、medium、high；confidence 是 0 到 1 的数字。",
          "riskBoundary 必须是对象：{ level, reason, escalationCondition }。",
          "careAction 必须是对象：{ primaryAction, avoidAction, observeNext }。",
          "arPayload 必须是对象：{ statusLineCandidate, actionLineCandidate }。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            task: "根据当前 AR 观察、宠物身份和记忆，完成视觉状态分析、融合推理、AR 短提示候选和候选记忆建议。",
            observation,
            petProfile: memoryContext.pet,
            longTermCareRecords: memoryContext.careRecords,
            dailyCareRecords: memoryContext.dailyCareRecords,
            recentCandidates: memoryContext.recentCandidates,
            memorySummary: memoryContext.memorySummary
          },
          null,
          2
        )
      }
    ]
  });
  return extractJson(content);
}

function buildMockAnalysis(observation, memoryContext) {
  const pet = memoryContext.pet || {};
  const text = buildSearchText(observation, memoryContext);
  const highRisk = detectHighRiskOverride(observation, memoryContext);
  if (highRisk) return highRisk;

  if (isFoodContext(text)) {
    const memoryMentionsFood = /换粮|口味|鸡肉|海鱼|拒食|食物|猫粮|狗粮/.test(text);
    return {
      petType: pet.species || observation.petType || "unknown",
      behavior: "食盆旁停留或进食不积极",
      stateSummary: "食盆旁犹豫",
      need: "可能不太接受当前食物或喂食方式",
      confidence: memoryMentionsFood ? 0.72 : 0.62,
      riskLevel: "low",
      advice: "先减少打扰，观察是否会自己靠近；若刚换粮，可少量混旧粮过渡。",
      reason: memoryMentionsFood
        ? "当前观察与长期记录都指向进食偏好变化，适合按食物适应问题保守处理。"
        : "当前观察包含食盆、未进食或扒拉线索，但只有单次观察，结论保持保守。",
      sceneEvidence: evidenceFromObservation(observation, [
        "食盆或食物相关场景",
        "进食不积极或在食盆旁停留"
      ]),
      riskBoundary: {
        level: "low",
        reason: "未见呕吐、明显疼痛、精神急剧变差等高风险线索。",
        escalationCondition: "如果持续拒食、呕吐、精神变差或超过一天明显不进食，应联系兽医。"
      },
      careAction: {
        primaryAction: "先减少打扰，给它一点自主靠近食物的时间。",
        avoidAction: "不要追着喂、强行按住或频繁更换刺激性食物。",
        observeNext: "观察是否回到食盆、是否喝水、是否有呕吐或精神变差。"
      },
      reasoningNote: "这是单帧或短片段观察，不能直接判断疾病，只能结合食盆行为和记忆做保守建议。",
      arPayload: {
        statusLineCandidate: "食盆旁犹豫",
        actionLineCandidate: "少打扰再观察"
      },
      shouldEnterCandidatePool: true,
      candidateSuggestion: `${pet.name || "该宠物"}在食盆旁进食不积极，可作为饮食偏好变化候选记录。`
    };
  }

  if (isAvoidanceContext(text)) {
    return {
      petType: pet.species || observation.petType || "unknown",
      behavior: "低姿态停留或回避刺激",
      stateSummary: "躲着观察",
      need: "需要安静空间和低刺激陪伴",
      confidence: 0.64,
      riskLevel: "medium",
      advice: "降低噪声和靠近频率，留出退路，观察它是否愿意自己出来。",
      reason: "当前观察包含躲藏、低姿态、噪声或角落停留等线索，更像环境压力或谨慎观望。",
      sceneEvidence: evidenceFromObservation(observation, [
        "低姿态、角落、门后或躲藏相关线索",
        "可能存在噪声、陌生环境或靠近压力"
      ]),
      riskBoundary: {
        level: "medium",
        reason: "回避本身不一定危险，但持续躲藏、发抖、喘气或拒绝移动需要关注。",
        escalationCondition: "如果持续躲藏不出、呼吸异常、疼痛、呕吐、无法站立或精神明显变差，应联系兽医。"
      },
      careAction: {
        primaryAction: "保持距离，给它一条能自己离开的路线。",
        avoidAction: "不要堵住退路、强抱出来或反复靠近拍摄。",
        observeNext: "看耳位、呼吸、是否发抖、是否愿意自己移动。"
      },
      reasoningNote: "回避和紧张需要结合持续时间判断；单次观察先按低刺激处理。",
      arPayload: {
        statusLineCandidate: "躲着观察",
        actionLineCandidate: "给它一点空间"
      },
      shouldEnterCandidatePool: true,
      candidateSuggestion: `${pet.name || "该宠物"}在刺激或陌生环境下出现回避，可作为环境压力候选记录。`
    };
  }

  if (isPlayContext(text)) {
    return {
      petType: pet.species || observation.petType || "unknown",
      behavior: "互动或玩耍意愿较高",
      stateSummary: "玩得投入",
      need: "可以进行短时间互动",
      confidence: 0.66,
      riskLevel: "low",
      advice: "可以陪它玩一小会儿，注意别让刺激过强。",
      reason: "当前观察包含玩耍、靠近、跳跃或互动线索，暂未见明显风险。",
      sceneEvidence: evidenceFromObservation(observation, ["玩耍、靠近或互动相关线索"]),
      riskBoundary: {
        level: "low",
        reason: "未见明显受伤、攻击升级或持续喘气等风险。",
        escalationCondition: "如果出现急促喘气、跛行、突然攻击或明显疲惫，应停止互动。"
      },
      careAction: {
        primaryAction: "短时间陪玩，保持节奏轻一点。",
        avoidAction: "不要持续追逐或突然大声刺激。",
        observeNext: "观察是否越玩越急、是否喘得厉害或突然躲开。"
      },
      reasoningNote: "积极互动场景仍要控制强度，避免过度兴奋。",
      arPayload: {
        statusLineCandidate: "玩得投入",
        actionLineCandidate: "陪它玩一小会儿"
      },
      shouldEnterCandidatePool: false,
      candidateSuggestion: ""
    };
  }

  return {
    petType: pet.species || observation.petType || "unknown",
    behavior: "常规活动或信息不足",
    stateSummary: "安静观察",
    need: "继续观察",
    confidence: 0.45,
    riskLevel: "low",
    advice: "先保持观察，不需要立刻干预。",
    reason: "当前输入线索有限，未形成明确照护事件。",
    sceneEvidence: evidenceFromObservation(observation, ["当前只有有限观察线索"]),
    riskBoundary: {
      level: "low",
      reason: "暂未见明确高风险信号。",
      escalationCondition: "如果异常状态持续或反复出现，再提高关注等级。"
    },
    careAction: {
      primaryAction: "保持观察，暂时不打扰。",
      avoidAction: "不要因为单次画面就过度干预。",
      observeNext: "观察活动、进食、饮水、排泄和精神状态是否变化。"
    },
    reasoningNote: "单帧或短片段存在不确定性，默认采用保守观察。",
    arPayload: {
      statusLineCandidate: "安静观察",
      actionLineCandidate: "先安静观察"
    },
    shouldEnterCandidatePool: false,
    candidateSuggestion: ""
  };
}

function normalizeAnalysis(input, observation, memoryContext) {
  const pet = memoryContext.pet || {};
  const riskBoundary = normalizeRiskBoundary(input.riskBoundary, input);
  const careAction = normalizeCareAction(input.careAction, input);
  const arPayload = normalizeArPayload(input.arPayload, input, riskBoundary);

  const normalized = {
    analysisId: `analysis_${Date.now()}`,
    petId: observation.petId || pet.id,
    petType: normalizePetType(input.petType || pet.species || observation.petType),
    behavior: asText(input.behavior, asText(input.stateSummary, "未明确行为")),
    emotion: asText(input.stateSummary || input.emotion, "观察中"),
    stateSummary: asText(input.stateSummary, asText(input.behavior, "观察中")),
    need: asText(input.need, "继续观察"),
    confidence: asConfidence(input.confidence),
    riskLevel: asRiskLevel(input.riskLevel || riskBoundary.level),
    advice: asText(input.advice, careAction.primaryAction || "继续观察宠物状态。"),
    reason: asText(input.reason, asText(input.reasoningNote, "当前数据不足，等待更多观察片段。")),
    evidence: compactEvidence([
      ...normalizeTextArray(input.evidence),
      ...normalizeTextArray(input.sceneEvidence)
    ]),
    sceneEvidence: compactEvidence(normalizeTextArray(input.sceneEvidence)),
    riskBoundary,
    careAction,
    reasoningNote: asText(input.reasoningNote, asText(input.reason, "")),
    arPayload,
    sourceModelsUsed: buildSourceModelsUsed(observation),
    shouldEnterCandidatePool: Boolean(input.shouldEnterCandidatePool),
    candidateSuggestion: asText(input.candidateSuggestion, ""),
    createdAt: new Date().toISOString()
  };

  return applyHighRiskOverride(normalized, observation, memoryContext);
}

function detectHighRiskOverride(observation, memoryContext) {
  const pet = memoryContext.pet || {};
  const petType = normalizePetType(observation.lowLevelVision?.petType || observation.petType || pet.species);
  const text = buildSearchText(observation, memoryContext);

  if (isDogBloatEmergencyPattern(text, petType)) {
    return {
      petType: "dog",
      behavior: "饭后腹部鼓胀并伴随干呕和不安",
      stateSummary: "饭后不舒服",
      need: "需要尽快联系兽医或宠物急诊排查风险",
      confidence: 0.86,
      riskLevel: "high",
      advice: "停止继续喂食和剧烈活动，不要按压腹部，尽快联系兽医排查风险。",
      reason: "饭后腹部鼓胀、想吐但吐不出、不安或急促喘气同时出现，属于高风险组合。",
      sceneEvidence: evidenceFromObservation(observation, [
        "饭后或进食后场景",
        "腹部鼓胀、干呕或吐不出",
        "不安、来回走动或喘气"
      ]),
      riskBoundary: {
        level: "high",
        reason: "该组合需要优先排查急症风险，不能按普通挑食处理。",
        escalationCondition: "立即联系兽医或宠物急诊排查风险。"
      },
      careAction: {
        primaryAction: "停止喂食和剧烈活动，尽快联系兽医。",
        avoidAction: "不要按压腹部、强迫饮水或继续运动。",
        observeNext: "记录腹胀、干呕、喘气和精神状态变化。"
      },
      reasoningNote: "这是本地高风险规则命中后的保守升级，不做确定诊断。",
      arPayload: {
        statusLineCandidate: "饭后不舒服",
        actionLineCandidate: "尽快联系兽医"
      },
      shouldEnterCandidatePool: true,
      candidateSuggestion: `${pet.name || "该犬"}饭后出现腹部鼓胀、干呕或不安喘气，建议作为高风险观察记录。`
    };
  }

  if (isCatUrinaryEmergencyPattern(text, petType)) {
    return {
      petType: "cat",
      behavior: "频繁进出猫砂盆并疑似排尿困难",
      stateSummary: "排尿不顺",
      need: "需要确认是否排尿，并尽快联系兽医排查风险",
      confidence: 0.84,
      riskLevel: "high",
      advice: "先确认是否有尿团；若频繁进出仍无尿团、痛叫或精神变差，尽快联系兽医。",
      reason: "频繁进出猫砂盆、反复蹲却没有明显尿团，属于猫排尿风险边界。",
      sceneEvidence: evidenceFromObservation(observation, [
        "猫砂盆相关场景",
        "频繁进出或反复蹲下",
        "没有明显尿团或疑似排尿困难"
      ]),
      riskBoundary: {
        level: "high",
        reason: "该组合需要优先排查排尿风险，不能只解释成不喜欢猫砂。",
        escalationCondition: "若无法确认排尿、痛叫、血尿或精神变差，应尽快联系兽医。"
      },
      careAction: {
        primaryAction: "确认是否有尿团，必要时尽快联系兽医。",
        avoidAction: "不要只更换猫砂或等待很久再处理。",
        observeNext: "观察进出次数、尿团、叫声、精神和饮水。"
      },
      reasoningNote: "这是本地高风险规则命中后的保守升级，不做确定诊断。",
      arPayload: {
        statusLineCandidate: "排尿不顺",
        actionLineCandidate: "先确认尿团"
      },
      shouldEnterCandidatePool: true,
      candidateSuggestion: `${pet.name || "该猫"}频繁进出猫砂盆且没有明显尿团，建议作为高风险排尿观察记录。`
    };
  }

  return null;
}

function applyHighRiskOverride(analysis, observation, memoryContext) {
  const override = detectHighRiskOverride(observation, memoryContext);
  if (!override) return analysis;
  return normalizeAnalysisWithoutOverride({
    ...analysis,
    ...override,
    confidence: Math.max(analysis.confidence || 0, override.confidence || 0)
  }, observation, memoryContext);
}

function normalizeAnalysisWithoutOverride(input, observation, memoryContext) {
  const pet = memoryContext.pet || {};
  const riskBoundary = normalizeRiskBoundary(input.riskBoundary, input);
  const careAction = normalizeCareAction(input.careAction, input);
  return {
    ...input,
    analysisId: input.analysisId || `analysis_${Date.now()}`,
    petId: observation.petId || pet.id,
    petType: normalizePetType(input.petType || pet.species || observation.petType),
    confidence: asConfidence(input.confidence),
    riskLevel: asRiskLevel(input.riskLevel || riskBoundary.level),
    riskBoundary,
    careAction,
    arPayload: normalizeArPayload(input.arPayload, input, riskBoundary),
    sourceModelsUsed: buildSourceModelsUsed(observation),
    createdAt: input.createdAt || new Date().toISOString()
  };
}

function buildSearchText(observation, memoryContext = {}) {
  return JSON.stringify(
    {
      observation,
      petProfile: memoryContext.pet,
      careRecords: memoryContext.careRecords,
      dailyCareRecords: memoryContext.dailyCareRecords,
      recentCandidates: memoryContext.recentCandidates,
      memorySummary: memoryContext.memorySummary
    },
    null,
    0
  ).toLowerCase();
}

function evidenceFromObservation(observation, extras = []) {
  const items = [];
  if (observation.scene) items.push(`场景：${observation.scene}`);
  if (observation.note) items.push(`观察：${String(observation.note).slice(0, 120)}`);
  if (observation.lowLevelVision) {
    items.push(`视觉输入：${JSON.stringify(observation.lowLevelVision).slice(0, 160)}`);
  }
  if (observation.rawData) {
    items.push(`采集信息：${JSON.stringify(observation.rawData).slice(0, 120)}`);
  }
  return compactEvidence([...items, ...extras]);
}

function isFoodContext(text) {
  return /food|bowl|meal|treat|食盆|饭盆|食物|猫粮|狗粮|零食|换粮|喂食/.test(text)
    && /not eat|refus|sniff|scratch|scrape|bury|不吃|未进食|没有进食|拒食|闻了|扒拉|掩埋/.test(text);
}

function isAvoidanceContext(text) {
  return /rain|thunder|noise|sofa|corner|hide|avoid|crouch|low_head|tail_tucked|doorway|blanket|雨声|雷声|噪声|沙发|角落|躲|回避|低头|低姿态|门后|门缝|毯子/.test(text);
}

function isPlayContext(text) {
  return /tail_wag|wagging|jump|play|approach|toy|cloth|running|摇尾|扑跳|玩|靠近|玩具|追逐|互动/.test(text);
}

function isDogBloatEmergencyPattern(text, petType) {
  const dogContext = petType === "dog" || /dog|犬|狗|corgi/.test(text);
  const mealOrFood = /after.*meal|meal|dinner|food|饭后|晚饭|早饭|吃完|进食后/.test(text);
  const bloated = /bloat|bloated|distend|swollen abdomen|belly.*large|腹胀|腹部.*鼓|肚子.*鼓|鼓胀/.test(text);
  const retching = /retch|dry heave|unproductive vomit|trying to vomit|vomit.*nothing|干呕|想吐|吐不出|没有吐出/.test(text);
  const restlessOrPanting = /restless|pace|anxious|pant|rapid breathing|不安|焦躁|来回|喘气|急促喘气|呼吸急促|呜咽/.test(text);
  return dogContext && mealOrFood && bloated && retching && restlessOrPanting;
}

function isCatUrinaryEmergencyPattern(text, petType) {
  const catContext = petType === "cat" || /cat|猫/.test(text);
  const litterBox = /litter_box|litter box|猫砂盆|砂盆/.test(text);
  const repeated = /repeated|frequent|three times|多次|频繁|反复|三次|进出/.test(text);
  const urinary = /urinate|urination|pee|urine|排尿|尿团|无尿|没尿|没有明显尿团|血尿/.test(text);
  const strainingOrNoUrine = /squat|strain|pain|blood|cry|meow|蹲|疼|痛|血尿|短叫|没有明显尿团|无尿团|没有尿团|没尿团|无尿|没尿/.test(text);
  return catContext && litterBox && repeated && urinary && strainingOrNoUrine;
}

function normalizeRiskBoundary(value, input) {
  const objectValue = asObject(value);
  const level = asRiskLevel(objectValue.level || input.riskLevel);
  return {
    level,
    reason: asText(objectValue.reason, asText(input.reason, "")),
    escalationCondition: asText(objectValue.escalationCondition, defaultEscalationCondition(level))
  };
}

function normalizeCareAction(value, input) {
  const objectValue = asObject(value);
  return {
    primaryAction: asText(objectValue.primaryAction, asText(input.advice, "继续观察宠物状态。")),
    avoidAction: asText(objectValue.avoidAction, ""),
    observeNext: asText(objectValue.observeNext, "")
  };
}

function normalizeArPayload(value, input, riskBoundary) {
  const objectValue = asObject(value);
  const status = asText(
    objectValue.statusLineCandidate || objectValue.statusLine || objectValue.status,
    deriveStatusFallback(input, riskBoundary)
  );
  const action = asText(
    objectValue.actionLineCandidate || objectValue.actionLine || objectValue.action,
    deriveActionFallback(input, riskBoundary)
  );
  return {
    statusLineCandidate: status,
    actionLineCandidate: action
  };
}

function deriveStatusFallback(input, riskBoundary) {
  if (input.stateSummary) return input.stateSummary;
  if (input.behavior) return input.behavior;
  if (riskBoundary.level === "high") return "需要留意";
  if (riskBoundary.level === "medium") return "有点紧张";
  return "安静观察";
}

function deriveActionFallback(input, riskBoundary) {
  if (input.careAction?.primaryAction) return input.careAction.primaryAction;
  if (input.advice) return input.advice;
  if (riskBoundary.level === "high") return "尽快联系兽医";
  if (riskBoundary.level === "medium") return "给它一点空间";
  return "先安静观察";
}

function buildSourceModelsUsed(observation) {
  const sources = [];
  if (observation.identity?.adapter || observation.identity?.method) {
    sources.push({
      name: "pet-identity-routing",
      method: observation.identity.method,
      modelBacked: observation.identity.adapterStatus === "ready"
    });
  }
  sources.push({
    name: "cloud-vision-memory-reasoning",
    method: isLlmProviderEnabled() ? "llm-vision-fusion" : "mock-rules",
    modelBacked: isLlmProviderEnabled()
  });
  return sources;
}

function extractJson(text) {
  const cleaned = String(text || "").replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Cloud AI did not return a JSON object.");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeTextArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function compactEvidence(items) {
  return Array.from(new Set(items.filter(Boolean).map(String))).slice(0, 8);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.3;
  return Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric));
}

function asRiskLevel(value) {
  const text = String(value || "").toLowerCase();
  if (["high", "danger", "高风险"].includes(text)) return "high";
  if (["medium", "warning", "需要关注", "中风险"].includes(text)) return "medium";
  return "low";
}

function defaultEscalationCondition(level) {
  if (level === "high") return "尽快联系兽医或宠物急诊排查风险。";
  if (level === "medium") return "如果持续加重、伴随疼痛、呕吐、排泄异常或精神变差，请联系兽医。";
  return "如果状态持续异常或反复出现，再提高关注等级。";
}

function normalizePetType(value) {
  if (value === "猫") return "cat";
  if (value === "狗" || value === "犬") return "dog";
  return value || "unknown";
}
