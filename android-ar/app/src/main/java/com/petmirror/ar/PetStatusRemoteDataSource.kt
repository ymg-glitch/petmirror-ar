package com.petmirror.ar

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class PetStatusRemoteDataSource {
    suspend fun analyzeCurrentObservation(): PetStatus = withContext(Dispatchers.IO) {
        val response = requestJson(
            url = RemoteApiConfig.ANALYZE_URL,
            method = "POST",
            body = buildDemoObservation().toString()
        )
        parsePipelineResponse(response)
    }

    suspend fun fetchLatest(): PetStatus = withContext(Dispatchers.IO) {
        val response = requestJson(
            url = RemoteApiConfig.DISPLAY_URL,
            method = "GET",
            body = null
        )
        parseDisplay(response)
    }

    private fun requestJson(url: String, method: String, body: String?): JSONObject {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 5_000
            readTimeout = 8_000
            setRequestProperty("Accept", "application/json")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
            if (RemoteApiConfig.BEARER_TOKEN.isNotBlank()) {
                setRequestProperty("Authorization", "Bearer ${RemoteApiConfig.BEARER_TOKEN}")
            }
        }

        try {
            if (body != null) {
                connection.outputStream.use { stream ->
                    stream.write(body.toByteArray(Charsets.UTF_8))
                }
            }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val text = stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            if (code !in 200..299) {
                error("API request failed: HTTP $code $text")
            }
            return JSONObject(text)
        } finally {
            connection.disconnect()
        }
    }

    private fun parsePipelineResponse(json: JSONObject): PetStatus {
        val display = json.optJSONObject("display")
        if (display != null) {
            return parseDisplay(display)
        }
        val analysis = json.optJSONObject("analysis")
        return if (analysis != null) parseStatus(analysis) else parseDisplay(json)
    }

    private fun parseDisplay(json: JSONObject): PetStatus {
        val visibleLines = json.optJSONArray("visibleLines")
        val statusLine = json.optString(
            "statusLine",
            visibleLines?.optString(0).orEmpty().ifBlank { json.optString("title", "观察中") }
        )
        val actionLine = json.optString(
            "actionLine",
            visibleLines?.optString(1).orEmpty().ifBlank { json.optString("line1", "先安静观察") }
        )
        return PetStatus(
            petType = "宠物",
            emotion = statusLine,
            need = "AR 短提示",
            confidence = json.optConfidencePercent(),
            riskLevel = json.optString("riskLevel", json.optString("riskText", "low")).toRiskLevel(),
            advice = actionLine,
            reason = "眼镜端仅显示状态和建议两行。"
        )
    }

    private fun parseStatus(json: JSONObject): PetStatus {
        return PetStatus(
            petType = json.optString("petType", "宠物").toDisplayPetType(),
            emotion = json.optString("emotion", "观察中"),
            need = json.optString("need", "等待判断"),
            confidence = json.optConfidencePercent(),
            riskLevel = json.optString("riskLevel", "low").toRiskLevel(),
            advice = json.optString("advice", "请继续观察宠物状态。"),
            reason = json.optString("reason", "云端暂未返回详细原因。")
        )
    }

    private fun buildDemoObservation(): JSONObject {
        return JSONObject()
            .put("scene", "food_bowl")
            .put("deviceId", "rayneo-ar-demo")
            .put(
                "rawData",
                JSONObject()
                    .put("frameCount", 1)
                    .put("uploadMode", "async")
                    .put("source", "android_ar_demo")
            )
            .put(
                "lowLevelVision",
                JSONObject()
                    .put("petType", "cat")
                    .put("objects", JSONArray(listOf("food_bowl", "cat_food")))
                    .put("posture", "front_paw_scratching_near_bowl")
                    .put("eatingDetected", false)
            )
            .put("note", "虚构示例：猫靠近食盆后未立即进食。")
    }

    private fun JSONObject.optConfidencePercent(): Int {
        val textPercent = optString("confidenceText", "")
            .replace("%", "")
            .trim()
            .toDoubleOrNull()
        if (textPercent != null) return textPercent.toInt().coerceIn(0, 100)

        val raw = optDouble("confidence", 0.0)
        val percent = if (raw <= 1.0) raw * 100 else raw
        return percent.toInt().coerceIn(0, 100)
    }

    private fun String.toRiskLevel(): RiskLevel {
        return when (lowercase()) {
            "high", "高风险", "danger" -> RiskLevel.High
            "medium", "中风险", "需关注", "warning" -> RiskLevel.Medium
            "low", "低风险" -> RiskLevel.Low
            else -> RiskLevel.Low
        }
    }

    private fun String.toDisplayPetType(): String {
        return when (lowercase()) {
            "cat" -> "猫"
            "dog" -> "狗"
            else -> this
        }
    }
}
