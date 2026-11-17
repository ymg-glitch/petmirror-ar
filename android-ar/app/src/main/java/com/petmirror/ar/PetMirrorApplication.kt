package com.petmirror.ar

import android.app.Application
import com.ffalcon.mercury.android.sdk.MercurySDK

class PetMirrorApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        MercurySDK.init(this)
    }
}
