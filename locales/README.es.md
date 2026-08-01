<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/stagewise-io/stagewise/main/logo-combo-dark.svg">
  <img src="https://raw.githubusercontent.com/stagewise-io/stagewise/main/logo-combo.svg" alt="stagewise" height="60" />
</picture>

<h3>El IDE Agéntico para Modelos de Código Abierto</h3>

<p>
  <a href="../README.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./README.de.md">Deutsch</a> ·
  <a href="./README.ja.md">日本語</a> ·
  Español ·
  <a href="./README.ko.md">한국어</a> ·
  <a href="./README.pt.md">Português</a> ·
  <a href="./README.fr.md">Français</a> ·
  <a href="./README.it.md">Italiano</a> ·
  <a href="./README.hi.md">हिन्दी</a> ·
  <a href="./README.ru.md">Русский</a> ·
  <a href="./README.uk.md">Українська</a>
</p>

<p>
  <a href="https://github.com/stagewise-io/stagewise/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/npm/l/stagewise" /></a>
  <a href="https://github.com/stagewise-io/stagewise/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/stagewise-io/stagewise" /></a>
  <a href="https://discord.gg/gkdGsDYaKA"><img alt="Únete a Discord" src="https://img.shields.io/discord/1229378372141056010?label=Discord&logo=discord&logoColor=white" /></a>
  <a href="https://x.com/stagewise_io"><img alt="Seguir en X (antes Twitter)" src="https://img.shields.io/twitter/follow/stagewise_io" /></a>
</p>

</div>

![stagewise demo](https://raw.githubusercontent.com/stagewise-io/stagewise/main/apps/website/src/app/%28home%29/_components/feature-images/full-demo-dark.webp)

## Sobre el proyecto

**stagewise** es un IDE agéntico de código abierto para desarrolladores con un agente de programación integrado.

- **Navega y desarrolla** en la misma herramienta — sin cambios de contexto
- **Trabaja con un agente de programación** que tiene **acceso completo a la consola y el depurador de tu pestaña**
- **Haz cambios de prueba temporales** o **conecta una base de código** para ediciones permanentes
- **Haz ingeniería inversa** de componentes, sistemas de estilos y paletas de colores de cualquier sitio web
- **Integración con tu IDE** para ver y aplicar cambios de código en tu editor favorito
- **Trae tu propia clave de API (BYOK)** — compatible con todos los proveedores de IA

## Primeros pasos

Descarga stagewise desde [stagewise.io](https://stagewise.io) y sigue la breve guía de incorporación para configurar tu cuenta.

## Usa tu suscripción de programación

Trae tu propia clave de API para todos los proveedores de modelos populares — también puedes registrar proveedores completamente personalizados (¡incluida la inferencia local!) y definir modelos propios.

### Importación fácil — usa tu suscripción existente

Conecta cualquiera de las siguientes suscripciones con una sola clave de API para desbloquear todos los modelos que ofrece el proveedor directamente en stagewise:

| **Suscripción** | **Proveedor** | **Modelos destacados** | **Panel** |
| --------------- | ------------- | ---------------------- | --------- |
| Kimi | [Moonshot AI](https://platform.moonshot.ai) | Kimi K3, Kimi K2.7 Code, Kimi K2.6, Kimi K2.5 | [Obtener clave de API](https://platform.moonshot.ai/console/api-keys) |
| Qwen Coding Plan | [Alibaba DashScope](https://dashscope.console.aliyun.com) | Qwen 3-Coder 30B-A3B, Qwen 3-32B | [Obtener clave de API](https://dashscope.console.aliyun.com/apiKey) |
| MiniMax | [MiniMax](https://platform.minimax.io) | MiniMax M3, MiniMax M2.7 | [Obtener clave de API](https://platform.minimax.io/user-center/basic-information/interface-key) |
| Xiaomi MiMo | [Xiaomi MiMo](https://platform.xiaomimimo.com) | MiMo-V2.5-Pro, MiMo-V2.5 | [Obtener clave de API](https://platform.xiaomimimo.com/#/console/plan-manage) |
| Mistral | [Mistral](https://console.mistral.ai) | Mistral Medium 3.5, Mistral Large 3, Mistral Small 4, Codestral | [Obtener clave de API](https://console.mistral.ai/api-keys) |

### Cuenta stagewise

Para mayor comodidad y acceso inmediato a una amplia biblioteca de modelos, simplemente crea una cuenta stagewise.

| **Plan** | **Precio**     | **Límites**                           |
| -------- | -------------- | ------------------------------------- |
| Free     | $0 / mes       | Acceso limitado a 3 modelos estándar (Default, Quick, Smart) |
| Pro      | $20 / mes      | Acceso a todos los modelos, incluidos Frontier y Open-Weights |
| Ultra    | $200 / mes     | Acceso a todos los modelos, límites 15x más altos que Pro |

Modelos incluidos:

#### Modelos de pesos abiertos

- **Moonshot AI**: Kimi K3, Kimi K2.7 Code, Kimi K2.6, Kimi K2.5
- **Alibaba**: Qwen 3-32B, Qwen 3-Coder 30B-A3B
- **DeepSeek**: DeepSeek V4 Pro, DeepSeek V4 Flash
- **Z.ai**: GLM 5.2, GLM 5.1, GLM 5V-Turbo
- **MiniMax**: MiniMax M3, MiniMax M2.7, MiniMax M2
- **Xiaomi MiMo**: MiMo-V2.5-Pro, MiMo-V2.5
- **Mistral**: Mistral Medium 3.5, Mistral Large 3, Mistral Small 4, Codestral

#### Modelos propietarios

- **Anthropic**: Fable 5, Opus 4.8, Opus 4.7, Opus 4.6, Sonnet 5, Sonnet 4.6, Haiku 4.5
- **OpenAI**: GPT-5.6 Sol, GPT-5.6 Terra, GPT-5.6 Luna, GPT-5.5, GPT-5.4, GPT-5.3 Codex, GPT-5.3 Instant, GPT-5.4 mini, GPT-5.4 nano
- **Google**: Gemini 3.5 Flash, Gemini 3.1 Pro (Preview), Gemini 3 Flash, Gemini 3.1 Flash Lite

## Licencia

stagewise es desarrollado por stagewise GmbH y se ofrece bajo la licencia AGPLv3.

Para más información sobre el modelo de licencia, visita las [Preguntas frecuentes sobre las licencias de GNU](https://www.gnu.org/licenses/gpl-faq.html).

Para casos de uso fuera del alcance permitido por la licencia AGPLv3, no dudes en [contactarnos](mailto:sales@stagewise.io).

## Problemas

Si encontraste un error o tienes una idea nueva, [abre un issue](https://github.com/stagewise-io/stagewise/issues/new).

## Comunidad y soporte

- [Únete a nuestro Discord](https://discord.gg/gkdGsDYaKA)
- Abre un [issue en GitHub](https://github.com/stagewise-io/stagewise/issues/new) para soporte de desarrollo.
