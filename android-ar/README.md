# AR Android 显示原型

本目录保留项目的 Android 显示端源码：双目提示界面、镜腿交互和后端最新提示读取。赛期曾在 Android 模拟器中运行基础界面；真实 RayNeo 设备的画面采集、声音采集、佩戴可读性与端到端延迟尚未验收。

## 厂商 SDK

MercurySDK AAR 由设备方提供，**不包含在本开源仓库中，也不受本仓库 MIT 许可证授权**。如具备合法获取和使用资格，可自行将兼容的 `MercuryAndroidSDK-v0.2.6.aar` 放到 `app/libs/`，再在 Android Studio 中同步工程。

公开包也未附带 Gradle Wrapper 二进制；请使用自己可用的 Gradle/Android Studio 环境。此目录用于审阅显示端源码，不能直接作为克隆即编译的工程使用。

## 后端连接

远端配置见 `app/src/main/java/com/petmirror/ar/RemoteApiConfig.kt`。本地 Android 模拟器访问电脑上的后端时通常使用 `http://10.0.2.2:8791`，显示接口是 `/api/ar/display/latest`。

后端地址为空或请求失败时，界面会使用模拟数据。这个回退只用于显示演示，不代表真实模型输出。不要把本目录源码或静态展示页当作真机实测证据。
