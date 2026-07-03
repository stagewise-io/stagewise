<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/stagewise-io/stagewise/refs/heads/main/logo-combo-dark.svg">
  <img src="https://raw.githubusercontent.com/stagewise-io/stagewise/refs/heads/main/logo-combo.svg" alt="stagewise" height="60" />
</picture>

### 面向开源模型的 Agentic IDE

[English](./README.md) | 简体中文 | [Deutsch](./README.de.md) | [日本語](./README.ja.md) | [Español](./README.es.md) | [한국어](./README.ko.md) | [Português](./README.pt.md) | [Français](./README.fr.md) | [Italiano](./README.it.md) | [हिन्दी](./README.hi.md) | [Русский](./README.ru.md) | [Українська](./README.uk.md)

 ![NPM License](https://img.shields.io/npm/l/stagewise) [![GitHub Repo stars](https://img.shields.io/github/stars/stagewise-io/stagewise)](https://github.com/stagewise-io/stagewise)

[![加入 Discord](https://img.shields.io/discord/1229378372141056010?label=Discord&logo=discord&logoColor=white)](https://discord.gg/gkdGsDYaKA) [![X (前 Twitter) 关注](https://img.shields.io/twitter/follow/stagewise_io)](https://x.com/stagewise_io)

![stagewise 演示](https://raw.githubusercontent.com/stagewise-io/stagewise/main/apps/website/src/app/(home)/_components/feature-images/full-demo-dark.png)

## 关于项目

**stagewise** 是一款面向开发者的开源 Agentic IDE，内置编程智能体。

- **在同一工具中浏览与构建** — 无需切换上下文
- **使用编程智能体**，该智能体可**完整访问你标签页的控制台与调试器**
- **进行临时测试修改**，或**连接代码库**以实现永久编辑
- **逆向工程**任意网站的组件、样式系统和调色板
- **IDE 集成**，在您喜爱的编辑器中查看并应用代码更改
- **自带 API 密钥（BYOK）** — 全面支持所有 AI 服务商

## 快速开始

从 [stagewise.io](https://stagewise.io) 下载 stagewise，并按照简短的新手引导完成账号设置。

## 使用你的编程订阅

支持为所有主流模型服务商自带 API 密钥（BYOK）——还可以注册完全自定义的服务商（包括本地推理！）与自定义模型。

### 一键导入 —— 直接使用现有订阅

通过一个 API 密钥接入以下任意订阅，即可在 stagewise 中解锁该服务商提供的所有模型。

| **订阅** | **服务商** | **主推模型** | **控制台** |
| -------- | ---------- | ------------ | ---------- |
| Kimi | [Moonshot AI](https://platform.moonshot.ai) | Kimi K2.7 Code、Kimi K2.6、Kimi K2.5 | [获取 API 密钥](https://platform.moonshot.ai/console/api-keys) |
| Qwen 编程计划 | [阿里云 DashScope](https://dashscope.console.aliyun.com) | Qwen 3-Coder 30B-A3B、Qwen 3-32B | [获取 API 密钥](https://dashscope.console.aliyun.com/apiKey) |
| MiniMax | [MiniMax](https://platform.minimax.io) | MiniMax M3, MiniMax M2.7 | [获取 API 密钥](https://platform.minimax.io/user-center/basic-information/interface-key) |
| Xiaomi MiMo | [Xiaomi MiMo](https://platform.xiaomimimo.com) | MiMo-V2.5-Pro、MiMo-V2.5 | [获取 API 密钥](https://platform.xiaomimimo.com/#/console/plan-manage) |
| Mistral | [Mistral](https://console.mistral.ai) | Mistral Medium 3.5、Mistral Large 3、Mistral Small 4、Codestral | [获取 API 密钥](https://console.mistral.ai/api-keys) |

### stagewise 账户

如果想要开箱即用并访问更广泛的模型库，只需创建一个 stagewise 账户即可。

| **套餐** | **价格**      | **限额**                    |
| -------- | ------------- | --------------------------- |
| 免费     | $0 / 月       | 3 个标准模型的有限访问 (Default, Quick, Smart) |
| Pro      | $20 / 月      | 访问所有模型，包括 Frontier 和 Open-Weights |
| Ultra    | $200 / 月     | 访问所有模型，比 Pro 高 15 倍限额 |

包含模型：

#### 开放权重模型

- **Moonshot AI**：Kimi K2.7 Code、Kimi K2.6、Kimi K2.5
- **Alibaba**：Qwen 3-32B、Qwen 3-Coder 30B-A3B
- **DeepSeek**：DeepSeek V4 Pro、DeepSeek V4 Flash
- **Z.ai**：GLM 5.2、GLM 5.1、GLM 5V-Turbo
- **MiniMax**：MiniMax M3、MiniMax M2.7、MiniMax M2
- **Xiaomi MiMo**：MiMo-V2.5-Pro、MiMo-V2.5
- **Mistral**：Mistral Medium 3.5、Mistral Large 3、Mistral Small 4、Codestral

#### 专有模型

- **Anthropic**：Fable 5、Opus 4.8、Opus 4.7、Opus 4.6、Sonnet 5、Sonnet 4.6、Haiku 4.5
- **OpenAI**：GPT-5.5、GPT-5.4、GPT-5.3 Codex、GPT-5.3 Instant、GPT-5.4 mini、GPT-5.4 nano
- **Google**：Gemini 3.5 Flash、Gemini 3.1 Pro（预览）、Gemini 3 Flash、Gemini 3.1 Flash Lite

## 许可证

stagewise 由 stagewise GmbH 开发，基于 AGPLv3 许可证发布。

有关许可证模式的更多信息，请访问 [GNU 许可证常见问题解答](https://www.gnu.org/licenses/gpl-faq.html)。

对于超出 AGPLv3 许可范围的使用场景，欢迎[联系我们](mailto:sales@stagewise.io)。

## 问题反馈

如发现 Bug 或有新想法，欢迎[提交 Issue](https://github.com/stagewise-io/stagewise/issues/new)。

## 社区与支持

- [加入我们的 Discord](https://discord.gg/gkdGsDYaKA)
- 在 [GitHub 上提交 Issue](https://github.com/stagewise-io/stagewise/issues/new) 获取开发支持。
