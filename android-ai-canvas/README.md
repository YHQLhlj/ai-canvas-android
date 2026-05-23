# AI Canvas Android Source

This is a standalone Android/Capacitor source tree prepared from the current APK-side app.

## App identity

- App name: `AI画布`
- Package name: `com.aicanvas.app`
- Existing project app directory `../android` is kept unchanged.

## Build

Use Android SDK environment variables instead of writing `local.properties`:

```powershell
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
.\gradlew.bat assembleDebug
```

The Gradle config enables ABI split APKs for:

- `arm64-v8a`
- `armeabi-v7a`
- `x86`
- `x86_64`
- `universal`

The prepared APK output copy is in `../android-ai-canvas-apks`.

## Sanitization

Preset service URLs and bundled secrets were cleared from this standalone source. User-entered URL/key/cookie fields remain as empty runtime inputs. Android/XML/SVG namespace URIs are intentionally kept because removing them breaks manifests, resources, or SVG rendering.
