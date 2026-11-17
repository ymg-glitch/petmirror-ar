package com.petmirror.ar

object RemoteApiConfig {
    // Android emulator uses 10.0.2.2 to access the host computer.
    // Make sure PetMirrorUnifiedBackend is running on http://127.0.0.1:8791.
    const val BASE_URL = "http://10.0.2.2:8791"
    const val ANALYZE_URL = "$BASE_URL/api/ar/analyze"
    const val DISPLAY_URL = "$BASE_URL/api/ar/display/latest"

    // Optional. Leave empty if your API does not need a bearer token.
    const val BEARER_TOKEN = ""

    val enabled: Boolean
        get() = BASE_URL.startsWith("http")
}
