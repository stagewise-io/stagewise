<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/stagewise-io/stagewise/refs/heads/main/logo-combo-dark.svg">
  <img src="https://raw.githubusercontent.com/stagewise-io/stagewise/refs/heads/main/logo-combo.svg" alt="stagewise" height="60" />
</picture>

### ओपन-सोर्स मॉडल के लिए एजेंटिक IDE

[English](./README.md) | [简体中文](./README.zh-CN.md) | [Deutsch](./README.de.md) | [日本語](./README.ja.md) | [Español](./README.es.md) | [한국어](./README.ko.md) | [Português](./README.pt.md) | [Français](./README.fr.md) | [Italiano](./README.it.md) | हिन्दी | [Русский](./README.ru.md) | [Українська](./README.uk.md)

 ![NPM License](https://img.shields.io/npm/l/stagewise) [![GitHub Repo stars](https://img.shields.io/github/stars/stagewise-io/stagewise)](https://github.com/stagewise-io/stagewise)

[![Discord में शामिल हों](https://img.shields.io/discord/1229378372141056010?label=Discord&logo=discord&logoColor=white)](https://discord.gg/gkdGsDYaKA) [![X (पूर्व Twitter) पर फ़ॉलो करें](https://img.shields.io/twitter/follow/stagewise_io)](https://x.com/stagewise_io)

![stagewise डेमो](https://raw.githubusercontent.com/stagewise-io/stagewise/main/apps/website/src/app/(home)/_components/feature-images/full-demo-dark.png)

## परियोजना के बारे में

**stagewise** डेवलपर्स के लिए एक ओपन-सोर्स एजेंटिक IDE है जिसमें कोडिंग एजेंट अंतर्निहित है।

- **एक ही टूल में ब्राउज़ और बिल्ड करें** — संदर्भ बदलने की आवश्यकता नहीं
- **कोडिंग एजेंट के साथ काम करें** जिसे आपके टैब के **कंसोल और डीबगर तक पूर्ण पहुंच** है
- **अस्थायी परीक्षण परिवर्तन करें** या स्थायी संपादन के लिए **कोडबेस कनेक्ट करें**
- किसी भी वेबसाइट के घटकों, स्टाइल सिस्टम और कलर पैलेट का **रिवर्स इंजीनियरिंग** करें
- अपने पसंदीदा एडिटर में कोड परिवर्तन देखने और लागू करने के लिए **IDE एकीकरण**
- **अपनी खुद की API कुंजी लाएं (BYOK)** — सभी AI प्रदाताओं के लिए पूरी तरह समर्थित

## शुरुआत करें

[stagewise.io](https://stagewise.io) से stagewise डाउनलोड करें और अपना खाता सेट करने के लिए संक्षिप्त ऑनबोर्डिंग गाइड का पालन करें।

## अपनी कोडिंग सदस्यता का उपयोग करें

सभी लोकप्रिय मॉडल प्रदाताओं के लिए अपनी खुद की कुंजी लाएं — आप पूरी तरह से कस्टम प्रदाताओं (लोकल इन्फ़रेंस सहित!) को भी पंजीकृत कर सकते हैं और कस्टम मॉडल परिभाषित कर सकते हैं।

### आसान आयात — अपनी मौजूदा सदस्यता का उपयोग करें

निम्नलिखित सदस्यताओं में से किसी एक को एक ही API कुंजी के साथ कनेक्ट करें और stagewise के भीतर सीधे प्रदाता द्वारा प्रस्तुत सभी मॉडल अनलॉक करें।

| **सदस्यता** | **प्रदाता** | **प्रमुख मॉडल** | **डैशबोर्ड** |
| ----------- | ---------- | --------------- | ------------ |
| Kimi | [Moonshot AI](https://platform.moonshot.ai) | Kimi K3, Kimi K2.7 Code, Kimi K2.6, Kimi K2.5 | [API कुंजी प्राप्त करें](https://platform.moonshot.ai/console/api-keys) |
| Qwen Coding Plan | [Alibaba DashScope](https://dashscope.console.aliyun.com) | Qwen 3-Coder 30B-A3B, Qwen 3-32B | [API कुंजी प्राप्त करें](https://dashscope.console.aliyun.com/apiKey) |
| MiniMax | [MiniMax](https://platform.minimax.io) | MiniMax M3, MiniMax M2.7 | [API कुंजी प्राप्त करें](https://platform.minimax.io/user-center/basic-information/interface-key) |
| Xiaomi MiMo | [Xiaomi MiMo](https://platform.xiaomimimo.com) | MiMo-V2.5-Pro, MiMo-V2.5 | [API कुंजी प्राप्त करें](https://platform.xiaomimimo.com/#/console/plan-manage) |

### stagewise खाता

आसान उपयोग और मॉडलों की एक बड़ी लाइब्रेरी तक तत्काल पहुंच के लिए, बस एक stagewise खाता बनाएं।

| **योजना** | **मूल्य**     | **सीमाएं**                          |
| -------- | ------------ | ---------------------------------- |
| Free     | $0 / माह      | 3 मानक मॉडलों तक सीमित पहुंच (Default, Quick, Smart) |
| Pro      | $20 / माह     | सभी मॉडलों तक पहुंच, Frontier और Open-Weights सहित |
| Ultra    | $200 / माह    | सभी मॉडलों तक पहुंच, Pro से 15x उच्च सीमाएं |

शामिल मॉडल:

#### ओपन-वेट मॉडल्स

- **Moonshot AI**: Kimi K3, Kimi K2.7 Code, Kimi K2.6, Kimi K2.5
- **Alibaba**: Qwen 3-32B, Qwen 3-Coder 30B-A3B
- **DeepSeek**: DeepSeek V4 Pro, DeepSeek V4 Flash
- **Z.ai**: GLM 5.2, GLM 5.1, GLM 5V-Turbo
- **MiniMax**: MiniMax M3, MiniMax M2.7, MiniMax M2
- **Xiaomi MiMo**: MiMo-V2.5-Pro, MiMo-V2.5

#### स्वामित्व वाले मॉडल

- **Anthropic**: Fable 5, Opus 4.8, Opus 4.7, Opus 4.6, Sonnet 5, Sonnet 4.6, Haiku 4.5
- **OpenAI**: GPT-5.6 Sol, GPT-5.6 Terra, GPT-5.6 Luna, GPT-5.5, GPT-5.4, GPT-5.3 Codex, GPT-5.3 Instant, GPT-5.4 mini, GPT-5.4 nano
- **Google**: Gemini 3.5 Flash, Gemini 3.1 Pro (Preview), Gemini 3 Flash, Gemini 3.1 Flash Lite

## लाइसेंस

stagewise को stagewise GmbH द्वारा विकसित किया गया है और AGPLv3 लाइसेंस के तहत प्रस्तुत किया जाता है।

लाइसेंस मॉडल के बारे में अधिक जानकारी के लिए, [GNU लाइसेंस पर FAQ](https://www.gnu.org/licenses/gpl-faq.html) पर जाएं।

AGPLv3 लाइसेंस द्वारा अनुमत दायरे से बाहर के उपयोग के मामलों के लिए, बेझिझक [हमसे संपर्क करें](mailto:sales@stagewise.io)।

## समस्याएं

यदि आपको कोई बग मिला है या आपके पास एक नया विचार है, तो बेझिझक [एक इश्यू खोलें](https://github.com/stagewise-io/stagewise/issues/new)।

## समुदाय और सहायता

- [हमारे Discord में शामिल हों](https://discord.gg/gkdGsDYaKA)
- विकास सहायता के लिए [GitHub पर एक इश्यू खोलें](https://github.com/stagewise-io/stagewise/issues/new)।
