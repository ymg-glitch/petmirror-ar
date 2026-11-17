package com.petmirror.ar

import android.os.Bundle
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.ffalcon.mercury.android.sdk.api.MobileState
import com.ffalcon.mercury.android.sdk.touch.TempleAction
import com.ffalcon.mercury.android.sdk.ui.activity.BaseMirrorActivity
import com.ffalcon.mercury.android.sdk.ui.toast.FToast
import com.petmirror.ar.databinding.ActivityMainBinding
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : BaseMirrorActivity<ActivityMainBinding>() {
    private val statuses = FakePetStatusRepository.samples
    private val remoteDataSource = PetStatusRemoteDataSource()
    private var currentIndex = 0
    private var currentStatus = statuses[currentIndex]
    private var autoRotateJob: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        renderStatus(currentStatus)
        observeTempleActions()
        observeMobileConnection()
    }

    override fun onResume() {
        super.onResume()
        startAutoRotate()
    }

    override fun onPause() {
        autoRotateJob?.cancel()
        super.onPause()
    }

    private fun renderStatus(status: PetStatus) {
        mBindingPair.updateView {
            tvPetType.text = status.petType
            tvEmotion.text = status.emotion
            tvNeed.text = status.need
            tvConfidence.text = "${status.confidence}%"
            tvRisk.text = status.riskLevel.label
            tvAdvice.text = status.advice
            tvReason.text = status.reason
            tvPage.text = if (RemoteApiConfig.enabled) "LIVE" else "${currentIndex + 1}/${statuses.size}"
        }

        mBindingPair.enable3DEffect(
            mBindingPair.left.cardStatus,
            mBindingPair.left.cardAdvice,
            mBindingPair.left.tvEmotion,
            enable = true,
            parallax = 6f
        )
    }

    private fun observeTempleActions() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.RESUMED) {
                templeActionViewModel.state.collect { action ->
                    when (action) {
                        is TempleAction.Click -> showCurrentAdvice()
                        is TempleAction.DoubleClick -> finish()
                        is TempleAction.SlideForward -> showNextStatus()
                        is TempleAction.SlideBackward -> showPreviousStatus()
                        else -> Unit
                    }
                }
            }
        }
    }

    private fun observeMobileConnection() {
        if (RemoteApiConfig.enabled) {
            mBindingPair.updateView {
                tvConnection.text = "统一后端连接中"
            }
            return
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                try {
                    MobileState.isMobileConnected().collect { connected ->
                        mBindingPair.updateView {
                            tvConnection.text = if (connected) "手机已连接" else "离线演示"
                        }
                    }
                } catch (_: Throwable) {
                    mBindingPair.updateView {
                        tvConnection.text = "离线演示"
                    }
                }
            }
        }
    }

    private fun startAutoRotate() {
        autoRotateJob?.cancel()
        autoRotateJob = lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.RESUMED) {
                if (RemoteApiConfig.enabled) {
                    analyzeRemoteStatus()
                }
                while (true) {
                    delay(5_000)
                    if (RemoteApiConfig.enabled) {
                        fetchRemoteStatus()
                    } else {
                        showNextStatus()
                    }
                }
            }
        }
    }

    private fun showNextStatus() {
        currentIndex = (currentIndex + 1) % statuses.size
        currentStatus = statuses[currentIndex]
        renderStatus(currentStatus)
    }

    private fun showPreviousStatus() {
        currentIndex = if (currentIndex == 0) statuses.lastIndex else currentIndex - 1
        currentStatus = statuses[currentIndex]
        renderStatus(currentStatus)
    }

    private fun showCurrentAdvice() {
        FToast.show("${currentStatus.emotion}｜${currentStatus.advice}", short = false)
    }

    private suspend fun analyzeRemoteStatus() {
        try {
            currentStatus = remoteDataSource.analyzeCurrentObservation()
            renderStatus(currentStatus)
            mBindingPair.updateView {
                tvConnection.text = "AI 分析完成"
            }
        } catch (_: Throwable) {
            fetchRemoteStatus()
        }
    }

    private suspend fun fetchRemoteStatus() {
        try {
            currentStatus = remoteDataSource.fetchLatest()
            renderStatus(currentStatus)
            mBindingPair.updateView {
                tvConnection.text = "云端已连接"
            }
        } catch (_: Throwable) {
            showNextStatus()
            mBindingPair.updateView {
                tvConnection.text = "云端离线"
            }
        }
    }
}
