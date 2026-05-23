# AI画布 Android 独立包

本仓库包含从当前项目整理出的 Android 独立源码和已构建 APK。

## 目录

- `android-ai-canvas/`: 独立 Android/Capacitor 源码
- `android-ai-canvas-apks/`: 已构建的 debug APK

## APK

- `AI-canvas-debug-arm64-v8a.apk`
- `AI-canvas-debug-armeabi-v7a.apk`
- `AI-canvas-debug-x86.apk`
- `AI-canvas-debug-x86_64.apk`
- `AI-canvas-debug-universal.apk`

## 说明

- 应用名：`AI画布`
- 包名：`com.aicanvas.app`
- 原项目的 `android/` app 未包含在此独立包中
- 已清理预置服务 URL、密钥、cookie、keystore、本地 SDK 路径等敏感信息
- Android/XML/SVG 必需命名空间 URI 被保留，否则资源或 SVG 渲染会损坏

