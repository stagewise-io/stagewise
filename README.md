<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-combo-dark.svg">
  <img src=".github/assets/logo-combo.svg" alt="stagewise" height="60" />
</picture>

<h3>The Agentic IDE for Open-Source Models</h3>

<p>
  <a href="./locales/README.zh-CN.md">简体中文</a> ·
  <a href="./locales/README.de.md">Deutsch</a> ·
  <a href="./locales/README.ja.md">日本語</a> ·
  <a href="./locales/README.es.md">Español</a> ·
  <a href="./locales/README.ko.md">한국어</a> ·
  <a href="./locales/README.pt.md">Português</a> ·
  <a href="./locales/README.fr.md">Français</a> ·
  <a href="./locales/README.it.md">Italiano</a> ·
  <a href="./locales/README.hi.md">हिन्दी</a> ·
  <a href="./locales/README.ru.md">Русский</a> ·
  <a href="./locales/README.uk.md">Українська</a>
</p>

<p>
  <a href="https://github.com/stagewise-io/stagewise/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/npm/l/stagewise" /></a>
  <a href="https://github.com/stagewise-io/stagewise/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/stagewise-io/stagewise" /></a>
  <a href="https://discord.gg/gkdGsDYaKA"><img alt="Discord" src="https://img.shields.io/discord/1229378372141056010?label=Discord&logo=discord&logoColor=white" /></a>
  <a href="https://x.com/stagewise_io"><img alt="X Follow" src="https://img.shields.io/twitter/follow/stagewise_io" /></a>
</p>

</div>

![stagewise demo](apps/website/src/app/%28home%29/_components/feature-images/full-demo-dark.webp)

<br />

---

## About the project

**stagewise** is an open source agentic IDE for developers with a coding agent built right in.

- **Browse and build** in the same tool — no context switching
- **Work with a coding agent** that has **full access to your tab's console and debugger**
- **Make temporary test changes** or **connect a codebase** for permanent edits
- **Reverse-engineer** any website's components, style systems, and color palettes
- **IDE integration** to view and apply code changes in your favorite editor
- **Bring your own API key** — fully supported for all AI providers

## Getting Started

Download stagewise from [stagewise.io](https://stagewise.io) and follow the short onboarding guide to set up your account.

## Use your coding subscription

Bring Your Own Key for all popular model providers — you can also register completely custom providers (including local inference!) and define custom models.

### Easy Import — use your existing subscription

Connect any of the following subscriptions with a single API key to unlock all models the provider offers directly inside stagewise.

| Subscription | Provider | Featured Models | Dashboard |
| ---------------- | ------------ | ------------------- | ------------- |
| Kimi             | [Moonshot AI](https://platform.moonshot.ai) | Kimi K3, Kimi K2.7 Code, Kimi K2.6, Kimi K2.5 | [Get API key](https://platform.moonshot.ai/console/api-keys) |
| Qwen Coding Plan | [Alibaba DashScope](https://dashscope.console.aliyun.com) | Qwen 3-Coder 30B-A3B, Qwen 3-32B | [Get API key](https://dashscope.console.aliyun.com/apiKey) |
| MiniMax          | [MiniMax](https://platform.minimax.io) | MiniMax M3, MiniMax M2.7 | [Get API key](https://platform.minimax.io/user-center/basic-information/interface-key) |
| Xiaomi MiMo      | [Xiaomi MiMo](https://platform.xiaomimimo.com) | MiMo-V2.5-Pro, MiMo-V2.5               | [Get API key](https://platform.xiaomimimo.com/#/console/plan-manage) |
| OpenCode Go      | [OpenCode](https://opencode.ai/go) | GLM 5.2, Kimi K3, DeepSeek V4 Pro, Qwen 3.7 Plus, MiniMax M3 | [Get API key](https://opencode.ai/auth) |
| Mistral          | [Mistral](https://console.mistral.ai) | Mistral Medium 3.5, Mistral Large 3, Mistral Small 4, Codestral | [Get API key](https://console.mistral.ai/api-keys) |

### Bring Your Own API Key

Connect directly to any of the following API providers with your own key. For maximum flexibility, [OpenRouter](https://openrouter.ai) gives you access to 345+ models from all major vendors through a single API key.

| Provider | Featured Models | Dashboard |
| ------------- | ------------------- | ------------- |
| OpenRouter    | Claude Opus 4.8, GPT-5.6 Sol, Gemini 3.1 Pro, DeepSeek V4 Pro | [Get API key](https://openrouter.ai/keys) |

### stagewise Account

For ease of use and immediate access to a large library of models, you can simply create a stagewise Account.

| Plan | Price | Limits |
| -------- | ------------- | ------------------------------- |
| Free     | $0 / month    | Limited access to 3 standard models (Default, Quick, Smart) |
| Pro      | $20 / month   | Access to all models, including Frontier and Open-Weights |
| Ultra    | $200 / month  | Access to all models, 15x higher limits than Pro |

Included models:

#### Open-Weight Models

- **Moonshot AI**: Kimi K3, Kimi K2.7 Code, Kimi K2.6, Kimi K2.5
- **Alibaba**: Qwen 3-32B, Qwen 3-Coder 30B-A3B
- **DeepSeek**: DeepSeek V4 Pro, DeepSeek V4 Flash
- **Z.ai**: GLM 5.2, GLM 5.1, GLM 5V-Turbo
- **MiniMax**: MiniMax M3, MiniMax M2.7, MiniMax M2
- **Xiaomi MiMo**: MiMo-V2.5-Pro, MiMo-V2.5
- **Mistral**: Mistral Medium 3.5, Mistral Large 3, Mistral Small 4, Codestral

#### Proprietary Models

- **Anthropic**: Fable 5, Opus 4.8, Opus 4.7, Opus 4.6, Sonnet 5, Sonnet 4.6, Haiku 4.5
- **OpenAI**: GPT-5.6 Sol, GPT-5.6 Terra, GPT-5.6 Luna, GPT-5.5, GPT-5.4, GPT-5.3 Codex, GPT-5.3 Instant, GPT-5.4 mini, GPT-5.4 nano
- **Google**: Gemini 3.5 Flash, Gemini 3.1 Pro (Preview), Gemini 3 Flash, Gemini 3.1 Flash Lite
- **xAI**: Grok 4.5

## License

stagewise is developed by stagewise GmbH and offered under the AGPLv3 license.

For more information on the license model, visit the [FAQ about the GNU Licenses](https://www.gnu.org/licenses/gpl-faq.html).

For use cases that fall outside the scope permitted by the AGPLv3 license, feel free to [contact us](mailto:sales@stagewise.io).

## Issues

Feel free to [open an issue](https://github.com/stagewise-io/stagewise/issues/new) if you found a bug or have a fresh idea.

## Community & Support

- [Join our Discord](https://discord.gg/gkdGsDYaKA)
- Open an [issue on GitHub](https://github.com/stagewise-io/stagewise/issues/new) for dev support.
