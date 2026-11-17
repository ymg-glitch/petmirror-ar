package com.petmirror.ar

object FakePetStatusRepository {
    val samples = listOf(
        PetStatus(
            petType = "猫",
            emotion = "紧张",
            need = "需要安抚",
            confidence = 82,
            riskLevel = RiskLevel.Medium,
            advice = "降低声音，保持距离，等待它主动靠近。",
            reason = "耳朵后压、尾巴贴近身体，可能处于防御状态。"
        ),
        PetStatus(
            petType = "狗",
            emotion = "兴奋",
            need = "需要互动",
            confidence = 88,
            riskLevel = RiskLevel.Low,
            advice = "给出清晰口令，进行短时玩具互动。",
            reason = "尾巴快速摆动、身体前倾，互动意愿较强。"
        ),
        PetStatus(
            petType = "猫",
            emotion = "不适",
            need = "观察健康",
            confidence = 76,
            riskLevel = RiskLevel.High,
            advice = "暂停喂食，记录症状，必要时联系兽医。",
            reason = "活动减少且姿态蜷缩，可能存在身体不适。"
        )
    )
}
