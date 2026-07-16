<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/stagewise-io/stagewise/refs/heads/main/logo-combo-dark.svg">
  <img src="https://raw.githubusercontent.com/stagewise-io/stagewise/refs/heads/main/logo-combo.svg" alt="stagewise" height="60" />
</picture>

### Die Agentic IDE für Open-Source-Modelle

[English](./README.md) | [简体中文](./README.zh-CN.md) | Deutsch | [日本語](./README.ja.md) | [Español](./README.es.md) | [한국어](./README.ko.md) | [Português](./README.pt.md) | [Français](./README.fr.md) | [Italiano](./README.it.md) | [हिन्दी](./README.hi.md) | [Русский](./README.ru.md) | [Українська](./README.uk.md)

 ![NPM License](https://img.shields.io/npm/l/stagewise) [![GitHub Repo stars](https://img.shields.io/github/stars/stagewise-io/stagewise)](https://github.com/stagewise-io/stagewise)

[![Discord beitreten](https://img.shields.io/discord/1229378372141056010?label=Discord&logo=discord&logoColor=white)](https://discord.gg/gkdGsDYaKA) [![X (ehemals Twitter) folgen](https://img.shields.io/twitter/follow/stagewise_io)](https://x.com/stagewise_io)

![stagewise Demo](https://raw.githubusercontent.com/stagewise-io/stagewise/main/apps/website/src/app/(home)/_components/feature-images/full-demo-dark.png)

## Über das Projekt

**stagewise** ist eine Open-Source-Agentic-IDE für Entwickler:innen mit integriertem Coding-Agenten.

- **Surfen und entwickeln** im selben Tool — kein Kontextwechsel
- **Mit einem Coding-Agenten arbeiten**, der **vollen Zugriff auf die Konsole und den Debugger deines Tabs** hat
- **Temporäre Teständerungen vornehmen** oder **eine Codebasis verbinden** für dauerhafte Bearbeitungen
- **Reverse-Engineering** von Komponenten, Stilsystemen und Farbpaletten beliebiger Websites
- **IDE-Integration** zum Ansehen und Übernehmen von Codeänderungen in deinem bevorzugten Editor
- **Eigenen API-Schlüssel mitbringen (BYOK)** — vollständig unterstützt für alle KI-Anbieter

## Erste Schritte

Lade stagewise von [stagewise.io](https://stagewise.io) herunter und folge der kurzen Einführung zur Einrichtung deines Kontos.

## Nutze dein Coding-Abo

Bring deinen eigenen API-Schlüssel für alle gängigen Modellanbieter mit — du kannst außerdem vollständig eigene Anbieter (inkl. lokaler Inferenz!) und eigene Modelle registrieren.

### Easy Import — bestehendes Abo verwenden

Verbinde eines der folgenden Abos mit einem einzigen API-Schlüssel und erhalte Zugriff auf alle Modelle des jeweiligen Anbieters direkt in stagewise:

| **Abo** | **Anbieter** | **Empfohlene Modelle** | **Dashboard** |
| ------- | ------------ | ------------------- | ------------- |
| Kimi | [Moonshot AI](https://platform.moonshot.ai) | Kimi K3, Kimi K2.7 Code, Kimi K2.6, Kimi K2.5 | [API-Schlüssel holen](https://platform.moonshot.ai/console/api-keys) |
| Qwen Coding Plan | [Alibaba DashScope](https://dashscope.console.aliyun.com) | Qwen 3-Coder 30B-A3B, Qwen 3-32B | [API-Schlüssel holen](https://dashscope.console.aliyun.com/apiKey) |
| MiniMax | [MiniMax](https://platform.minimax.io) | MiniMax M3, MiniMax M2.7 | [API-Schlüssel holen](https://platform.minimax.io/user-center/basic-information/interface-key) |
| Xiaomi MiMo | [Xiaomi MiMo](https://platform.xiaomimimo.com) | MiMo-V2.5-Pro, MiMo-V2.5 | [API-Schlüssel holen](https://platform.xiaomimimo.com/#/console/plan-manage) |
| Mistral | [Mistral](https://console.mistral.ai) | Mistral Medium 3.5, Mistral Large 3, Mistral Small 4, Codestral | [API-Schlüssel holen](https://console.mistral.ai/api-keys) |

### stagewise Account

Für maximale Einfachheit und sofortigen Zugriff auf eine große Modellbibliothek kannst du einfach einen stagewise Account erstellen.

| **Plan** | **Preis**      | **Limits**                           |
| -------- | -------------- | ------------------------------------ |
| Free     | $0 / Monat     | Eingeschränkter Zugriff auf 3 Standardmodelle (Default, Quick, Smart) |
| Pro      | $20 / Monat    | Zugriff auf alle Modelle, einschließlich Frontier und Open-Weights |
| Ultra    | $200 / Monat   | Zugriff auf alle Modelle, 15-fach höhere Limits als Pro |

Enthaltene Modelle:

#### Open-Weight-Modelle

- **Moonshot AI**: Kimi K3, Kimi K2.7 Code, Kimi K2.6, Kimi K2.5
- **Alibaba**: Qwen 3-32B, Qwen 3-Coder 30B-A3B
- **DeepSeek**: DeepSeek V4 Pro, DeepSeek V4 Flash
- **Z.ai**: GLM 5.2, GLM 5.1, GLM 5V-Turbo
- **MiniMax**: MiniMax M3, MiniMax M2.7, MiniMax M2
- **Xiaomi MiMo**: MiMo-V2.5-Pro, MiMo-V2.5
- **Mistral**: Mistral Medium 3.5, Mistral Large 3, Mistral Small 4, Codestral

#### Proprietäre Modelle

- **Anthropic**: Fable 5, Opus 4.8, Opus 4.7, Opus 4.6, Sonnet 5, Sonnet 4.6, Haiku 4.5
- **OpenAI**: GPT-5.6 Sol, GPT-5.6 Sol Pro, GPT-5.6 Terra, GPT-5.6 Terra Pro, GPT-5.6 Luna, GPT-5.6 Luna Pro, GPT-5.5, GPT-5.4, GPT-5.3 Codex, GPT-5.3 Instant, GPT-5.4 mini, GPT-5.4 nano
- **Google**: Gemini 3.5 Flash, Gemini 3.1 Pro (Preview), Gemini 3 Flash, Gemini 3.1 Flash Lite

## Lizenz

stagewise wird von der stagewise GmbH entwickelt und unter der AGPLv3-Lizenz angeboten.

Weitere Informationen zum Lizenzmodell findest du in den [FAQ zu den GNU-Lizenzen](https://www.gnu.org/licenses/gpl-faq.html).

Für Anwendungsfälle, die außerhalb des von der AGPLv3-Lizenz erlaubten Rahmens liegen, kannst du uns gerne [kontaktieren](mailto:sales@stagewise.io).

## Probleme melden

Eröffne gerne ein [Issue](https://github.com/stagewise-io/stagewise/issues/new), wenn du einen Fehler gefunden hast oder eine neue Idee hast.

## Community & Support

- [Unserem Discord beitreten](https://discord.gg/gkdGsDYaKA)
- Ein [Issue auf GitHub eröffnen](https://github.com/stagewise-io/stagewise/issues/new) für Entwickler:innensupport.
