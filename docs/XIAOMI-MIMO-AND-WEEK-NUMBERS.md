# 小米语音识别与日历周数

此分支基于 dongdongbh/Mindwtr，保留原项目 AGPL-3.0 许可证。

## 配置小米 MiMo

需要安装从本分支构建的新版本。上游原版安装包不包含本次功能。

1. 设置 → AI → 语音。桌面端在服务商中选择“小米 MiMo · 语音识别”；手机端点击同名预设按钮。
2. 在语音 API Key 栏填入自己的小米 MiMo 密钥。
3. 预设自动填写：模型 `mimo-v2.5-asr`；地址 `https://api.xiaomimimo.com/v1`；自动识别语言；仅转写模式。也可将语言设为 `zh` 或 `en`。
4. 录制一条新语音记录。

直接请求小米 `/chat/completions` 的 `input_audio` JSON 接口，无需本机中转服务，手机无需连接电脑。小米 ASR 只负责转写；即使旧设置保留“智能解析”，也不会使用小米密钥调用 OpenAI 的 GPT 解析接口。日期、项目等字段可以在记录生成后编辑。

当前沿用上游 OpenAI 兼容配置及密钥槽。语音和 OpenAI 助手共用这个密钥槽，填写小米密钥会影响已有 OpenAI 助手配置。本仓库不包含用户密钥。

桌面录音使用 WAV；手机使用已有原生 PCM 模块录制 16 kHz、单声道、16-bit WAV。已有 M4A/AAC 附件不能只改扩展名，暂不自动转码，需重新录音。手机必须使用完整应用构建，不能使用 Expo Go；FOSS 构建保持上游的离线语音限制。实验性的 `apps/android-native` 端未接入本次设置入口。

已为现有 PCM 依赖添加 Bun 补丁：Android 停止录音等待线程退出、只编码实际读取的数据；iOS 停止接口在释放录音队列后完成 Promise。依赖安装必须沿用项目的 Bun 工作流，以应用此补丁。

官方接口文档：https://mimo.mi.com/docs/zh-CN/api/audio/Speech-Recognition

## 日历“第几周”

采用 ISO 8601：周一开始，包含 1 月 4 日的一周为第 1 周。跨年时显示周所属年份，例如 2021-01-01 属于 2020 年第 53 周。

- 月视图：周一显示“第 N 周”；手机月初不足一周的部分也会显示。
- 周视图：显示当前日期范围覆盖的 ISO 周数；跨两周时同时列出。
- 日视图：显示当天的 ISO 周数。
- 中文为“2026年第42周”；其他语言为“2026 W42”。

为新增标签适当增加了手机月历单元格高度。React Native 的界面快照使用本分支独立样本，保留上游实验性 native-host 的原有样本，避免混淆两个界面的行为。

## 验证与构建

本次验证：核心相关测试 146 项、电脑端相关测试 91 项、手机端相关测试 72 项，共 309 项通过。核心、电脑端和手机端 TypeScript 检查通过；修改文件的 ESLint 检查及桌面 Vite 生产构建通过。未携带用户密钥调用小米接口，也未进行真实麦克风、Android/iOS 真机验证。本分支源码不等于已经生成 Windows 安装程序或 Android APK。

```sh
bun install --frozen-lockfile
bun run typecheck:core
bun run typecheck:desktop
bun run typecheck:mobile
cd packages/core
bun run test -- src/mimo-speech.test.ts src/calendar-week-number.test.ts src/speech-to-task.test.ts
```

安装包构建沿用原项目文档与 GitHub Actions 工作流。
