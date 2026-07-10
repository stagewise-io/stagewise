<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/stagewise-io/stagewise/refs/heads/main/logo-combo-dark.svg">
  <img src="https://raw.githubusercontent.com/stagewise-io/stagewise/refs/heads/main/logo-combo.svg" alt="stagewise" height="60" />
</picture>

### オープンソースモデル向けの Agentic IDE

[English](./README.md) | [简体中文](./README.zh-CN.md) | [Deutsch](./README.de.md) | 日本語 | [Español](./README.es.md) | [한국어](./README.ko.md) | [Português](./README.pt.md) | [Français](./README.fr.md) | [Italiano](./README.it.md) | [हिन्दी](./README.hi.md) | [Русский](./README.ru.md) | [Українська](./README.uk.md)

 ![NPM License](https://img.shields.io/npm/l/stagewise) [![GitHub Repo stars](https://img.shields.io/github/stars/stagewise-io/stagewise)](https://github.com/stagewise-io/stagewise)

[![Discordに参加](https://img.shields.io/discord/1229378372141056010?label=Discord&logo=discord&logoColor=white)](https://discord.gg/gkdGsDYaKA) [![X (旧Twitter) フォロー](https://img.shields.io/twitter/follow/stagewise_io)](https://x.com/stagewise_io)

![stagewise デモ](https://raw.githubusercontent.com/stagewise-io/stagewise/main/apps/website/src/app/(home)/_components/feature-images/full-demo-dark.png)

## プロジェクトについて

**stagewise** は、コーディングエージェントを内蔵した、開発者向けのオープンソース Agentic IDE です。

- **同じツールで閲覧と開発** — コンテキストの切り替え不要
- **コーディングエージェントと作業** — タブの**コンソールとデバッガーへの完全なアクセス**を持つ
- **一時的なテスト変更**や**コードベースへの接続**による永続的な編集
- 任意のウェブサイトのコンポーネント、スタイルシステム、カラーパレットを**リバースエンジニアリング**
- **IDE連携** — お気に入りのエディタでコード変更を確認・適用
- **APIキーを持ち込む（BYOK）** — 全AIプロバイダーに完全対応

## はじめに

[stagewise.io](https://stagewise.io) から stagewise をダウンロードし、短いオンボーディングガイドに従ってアカウントを設定してください。

## コーディングサブスクリプションを活用する

人気のモデルプロバイダーすべてに自分のAPIキーを持ち込めます（BYOK）。さらに、カスタムプロバイダー（ローカル推論も含む！）やカスタムモデルの登録も可能です。

### かんたんインポート — 既存のサブスクリプションをそのまま使う

以下のいずれかのサブスクリプションをAPIキー1つで接続するだけで、そのプロバイダーが提供する全モデルを stagewise 内で利用できます。

| **サブスクリプション** | **プロバイダー** | **注目モデル** | **ダッシュボード** |
| --------------------- | --------------- | -------------- | ----------------- |
| Kimi | [Moonshot AI](https://platform.moonshot.ai) | Kimi K2.7 Code, Kimi K2.6, Kimi K2.5 | [APIキーを取得](https://platform.moonshot.ai/console/api-keys) |
| Qwen Coding Plan | [Alibaba DashScope](https://dashscope.console.aliyun.com) | Qwen 3-Coder 30B-A3B, Qwen 3-32B | [APIキーを取得](https://dashscope.console.aliyun.com/apiKey) |
| MiniMax | [MiniMax](https://platform.minimax.io) | MiniMax M3, MiniMax M2.7 | [APIキーを取得](https://platform.minimax.io/user-center/basic-information/interface-key) |
| Xiaomi MiMo | [Xiaomi MiMo](https://platform.xiaomimimo.com) | MiMo-V2.5-Pro、MiMo-V2.5 | [APIキーを取得](https://platform.xiaomimimo.com/#/console/plan-manage) |
| Mistral | [Mistral](https://console.mistral.ai) | Mistral Medium 3.5、Mistral Large 3、Mistral Small 4、Codestral | [APIキーを取得](https://console.mistral.ai/api-keys) |

### stagewise アカウント

手軽に始めて豊富なモデルライブラリにすぐアクセスしたい場合は、stagewise アカウントを作成するだけでOKです。

| **プラン** | **料金**       | **制限**                          |
| ---------- | -------------- | --------------------------------- |
| Free       | $0 / 月        | 3つの標準モデルへの限定アクセス (Default, Quick, Smart) |
| Pro        | $20 / 月       | 全モデルへのアクセス (Frontier、Open-Weights を含む) |
| Ultra      | $200 / 月      | 全モデルへのアクセス、Pro の15倍の上限 |

利用可能なモデル:

#### オープンウェイトモデル

- **Moonshot AI**: Kimi K2.7 Code, Kimi K2.6, Kimi K2.5
- **Alibaba**: Qwen 3-32B, Qwen 3-Coder 30B-A3B
- **DeepSeek**: DeepSeek V4 Pro, DeepSeek V4 Flash
- **Z.ai**: GLM 5.2, GLM 5.1, GLM 5V-Turbo
- **MiniMax**: MiniMax M3, MiniMax M2.7, MiniMax M2
- **Xiaomi MiMo**: MiMo-V2.5-Pro、MiMo-V2.5
- **Mistral**: Mistral Medium 3.5、Mistral Large 3、Mistral Small 4、Codestral

#### プロプライエタリモデル

- **Anthropic**: Fable 5, Opus 4.8, Opus 4.7, Opus 4.6, Sonnet 5, Sonnet 4.6, Haiku 4.5
- **OpenAI**: GPT-5.6 Sol, GPT-5.6 Sol Pro, GPT-5.6 Terra, GPT-5.6 Terra Pro, GPT-5.6 Luna, GPT-5.6 Luna Pro, GPT-5.5, GPT-5.4, GPT-5.3 Codex, GPT-5.3 Instant, GPT-5.4 mini, GPT-5.4 nano
- **Google**: Gemini 3.5 Flash, Gemini 3.1 Pro (Preview), Gemini 3 Flash, Gemini 3.1 Flash Lite

## ライセンス

stagewise は stagewise GmbH が開発し、AGPLv3 ライセンスのもとで提供されています。

ライセンスモデルの詳細については、[GNU ライセンスに関するFAQ](https://www.gnu.org/licenses/gpl-faq.html) をご覧ください。

AGPLv3 ライセンスの範囲外での使用については、[お問い合わせ](mailto:sales@stagewise.io)ください。

## 問題報告

バグを発見したり、新しいアイデアがあれば、[Issueを開いて](https://github.com/stagewise-io/stagewise/issues/new)ください。

## コミュニティ & サポート

- [Discordに参加する](https://discord.gg/gkdGsDYaKA)
- 開発サポートは [GitHub の Issue](https://github.com/stagewise-io/stagewise/issues/new) からどうぞ。
