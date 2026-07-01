<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/stagewise-io/stagewise/refs/heads/main/logo-combo-dark.svg">
  <img src="https://raw.githubusercontent.com/stagewise-io/stagewise/refs/heads/main/logo-combo.svg" alt="stagewise" height="60" />
</picture>

### Агентная IDE для open-source моделей

[English](./README.md) | [简体中文](./README.zh-CN.md) | [Deutsch](./README.de.md) | [日本語](./README.ja.md) | [Español](./README.es.md) | [한국어](./README.ko.md) | [Português](./README.pt.md) | [Français](./README.fr.md) | [Italiano](./README.it.md) | [हिन्दी](./README.hi.md) | Русский | [Українська](./README.uk.md)

 ![NPM License](https://img.shields.io/npm/l/stagewise) [![GitHub Repo stars](https://img.shields.io/github/stars/stagewise-io/stagewise)](https://github.com/stagewise-io/stagewise)

[![Присоединиться в Discord](https://img.shields.io/discord/1229378372141056010?label=Discord&logo=discord&logoColor=white)](https://discord.gg/gkdGsDYaKA) [![Подписаться в X (бывш. Twitter)](https://img.shields.io/twitter/follow/stagewise_io)](https://x.com/stagewise_io)

![stagewise демо](https://raw.githubusercontent.com/stagewise-io/stagewise/main/apps/website/src/app/(home)/_components/feature-images/full-demo-dark.png)

## О проекте

**stagewise** — это агентная IDE с открытым исходным кодом для разработчиков со встроенным агентом-программистом.

- **Просматривайте и разрабатывайте** в одном инструменте — без переключения контекста
- **Работайте с агентом-программистом**, который имеет **полный доступ к консоли и отладчику вашей вкладки**
- **Вносите временные тестовые изменения** или **подключайте кодовую базу** для постоянного редактирования
- **Реверс-инжиниринг** компонентов, систем стилей и цветовых палитр любого веб-сайта
- **Интеграция с IDE** для просмотра и применения изменений кода в вашем любимом редакторе
- **Используйте свой API-ключ (BYOK)** — полная поддержка всех провайдеров ИИ

## Начало работы

Скачайте stagewise с [stagewise.io](https://stagewise.io) и следуйте краткому руководству для настройки аккаунта.

## Используйте свою подписку для программирования

Используйте свой ключ для всех популярных провайдеров моделей — вы также можете регистрировать полностью кастомные провайдеры (включая локальный инференс!) и задавать собственные модели.

### Быстрый импорт — используйте существующую подписку

Подключите любую из следующих подписок с помощью одного API-ключа, чтобы разблокировать все модели, предлагаемые провайдером, напрямую в stagewise.

| **Подписка** | **Провайдер** | **Рекомендуемые модели** | **Панель управления** |
| ------------ | ------------- | ----------------------- | -------------------- |
| Kimi | [Moonshot AI](https://platform.moonshot.ai) | Kimi K2.7 Code, Kimi K2.6, Kimi K2.5 | [Получить API-ключ](https://platform.moonshot.ai/console/api-keys) |
| Qwen Coding Plan | [Alibaba DashScope](https://dashscope.console.aliyun.com) | Qwen 3-Coder 30B-A3B, Qwen 3-32B | [Получить API-ключ](https://dashscope.console.aliyun.com/apiKey) |
| MiniMax | [MiniMax](https://platform.minimax.io) | MiniMax M3, MiniMax M2.7 | [Получить API-ключ](https://platform.minimax.io/user-center/basic-information/interface-key) |
| Xiaomi MiMo | [Xiaomi MiMo](https://platform.xiaomimimo.com) | MiMo-V2.5-Pro, MiMo-V2.5 | [Получить API-ключ](https://platform.xiaomimimo.com/#/console/plan-manage) |

### Аккаунт stagewise

Для удобства использования и немедленного доступа к большой библиотеке моделей просто создайте аккаунт stagewise.

| **План** | **Цена**      | **Лимиты**                              |
| -------- | ------------ | --------------------------------------- |
| Free     | $0 / месяц    | Ограниченный доступ к 3 стандартным моделям (Default, Quick, Smart) |
| Pro      | $20 / месяц   | Доступ ко всем моделям, включая Frontier и Open-Weights |
| Ultra    | $200 / месяц  | Доступ ко всем моделям, лимиты в 15x выше чем в Pro |

Включённые модели:

#### Модели с открытыми весами

- **Moonshot AI**: Kimi K2.7 Code, Kimi K2.6, Kimi K2.5
- **Alibaba**: Qwen 3-32B, Qwen 3-Coder 30B-A3B
- **DeepSeek**: DeepSeek V4 Pro, DeepSeek V4 Flash
- **Z.ai**: GLM 5.2, GLM 5.1, GLM 5V-Turbo
- **MiniMax**: MiniMax M3, MiniMax M2.7, MiniMax M2
- **Xiaomi MiMo**: MiMo-V2.5-Pro, MiMo-V2.5

#### Проприетарные модели

- **Anthropic**: Fable 5, Opus 4.8, Opus 4.7, Opus 4.6, Sonnet 5, Sonnet 4.6, Haiku 4.5
- **OpenAI**: GPT-5.5, GPT-5.4, GPT-5.3 Codex, GPT-5.3 Instant, GPT-5.4 mini, GPT-5.4 nano
- **Google**: Gemini 3.5 Flash, Gemini 3.1 Pro (Preview), Gemini 3 Flash, Gemini 3.1 Flash Lite

## Лицензия

stagewise разрабатывается stagewise GmbH и предлагается под лицензией AGPLv3.

Дополнительную информацию о модели лицензирования можно найти в [FAQ по лицензиям GNU](https://www.gnu.org/licenses/gpl-faq.html).

Для сценариев использования, выходящих за рамки того, что разрешено лицензией AGPLv3, свяжитесь с нами по [электронной почте](mailto:sales@stagewise.io).

## Проблемы

Не стесняйтесь [открыть issue](https://github.com/stagewise-io/stagewise/issues/new), если вы нашли баг или у вас есть свежая идея.

## Сообщество и поддержка

- [Присоединяйтесь к нашему Discord](https://discord.gg/gkdGsDYaKA)
- Откройте [issue на GitHub](https://github.com/stagewise-io/stagewise/issues/new) для технической поддержки.
