package com.petmirror.ar

data class PetStatus(
    val petType: String,
    val emotion: String,
    val need: String,
    val confidence: Int,
    val riskLevel: RiskLevel,
    val advice: String,
    val reason: String
)

enum class RiskLevel(val label: String) {
    Low("低风险"),
    Medium("需关注"),
    High("高风险")
}
