import type { SVGProps } from 'react';
import {
  AlibabaLogo,
  AnthropicLogo,
  DeepSeekLogo,
  GoogleLogo,
  MinimaxLogo,
  MistralLogo,
  MoonshotAiLogo,
  OpenAiLogo,
  OpenRouterLogo,
  ZAiLogo,
} from './index';
import type { ProviderLogoComponent } from './index';

/**
 * Vendor logo components for OpenRouter model sub-grouping.
 *
 * Sourced from @lobehub/icons-static-svg (MIT, v1.91.0). Each SVG uses
 * `currentColor` so it inherits the nearest `text-*` class.
 *
 * Vendors with overly complex SVGs (NousResearch, AionLabs) and niche vendors
 * without a lobehub icon use `VendorMonogramLogo` — a styled div showing the
 * first letter of the vendor display name.
 */

export function NvidiaLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="NVIDIA"
      {...props}
    >
      <path d="M10.212 8.976V7.62c.127-.01.256-.017.388-.021 3.596-.117 5.957 3.184 5.957 3.184s-2.548 3.647-5.282 3.647a3.227 3.227 0 01-1.063-.175v-4.109c1.4.174 1.681.812 2.523 2.258l1.873-1.627a4.905 4.905 0 00-3.67-1.846 6.594 6.594 0 00-.729.044m0-4.476v2.025c.13-.01.259-.019.388-.024 5.002-.174 8.261 4.226 8.261 4.226s-3.743 4.69-7.643 4.69c-.338 0-.675-.031-1.007-.092v1.25c.278.038.558.057.838.057 3.629 0 6.253-1.91 8.794-4.169.421.347 2.146 1.193 2.501 1.564-2.416 2.083-8.048 3.763-11.24 3.763-.308 0-.603-.02-.894-.048V19.5H24v-15H10.21zm0 9.756v1.068c-3.356-.616-4.287-4.21-4.287-4.21a7.173 7.173 0 014.287-2.138v1.172h-.005a3.182 3.182 0 00-2.502 1.178s.615 2.276 2.507 2.931m-5.961-3.3c1.436-1.935 3.604-3.148 5.961-3.336V6.523C5.81 6.887 2 10.723 2 10.723s2.158 6.427 8.21 7.015v-1.166C5.77 16 4.25 10.958 4.25 10.958h-.002z" />
    </svg>
  );
}

export function MetaLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Meta"
      {...props}
    >
      <path d="M6.897 4c1.915 0 3.516.932 5.43 3.376l.282-.373c.19-.246.383-.484.58-.71l.313-.35C14.588 4.788 15.792 4 17.225 4c1.273 0 2.469.557 3.491 1.516l.218.213c1.73 1.765 2.917 4.71 3.053 8.026l.011.392.002.25c0 1.501-.28 2.759-.818 3.7l-.14.23-.108.153c-.301.42-.664.758-1.086 1.009l-.265.142-.087.04a3.493 3.493 0 01-.302.118 4.117 4.117 0 01-1.33.208c-.524 0-.996-.067-1.438-.215-.614-.204-1.163-.56-1.726-1.116l-.227-.235c-.753-.812-1.534-1.976-2.493-3.586l-1.43-2.41-.544-.895-1.766 3.13-.343.592C7.597 19.156 6.227 20 4.356 20c-1.21 0-2.205-.42-2.936-1.182l-.168-.184c-.484-.573-.837-1.311-1.043-2.189l-.067-.32a8.69 8.69 0 01-.136-1.288L0 14.468c.002-.745.06-1.49.174-2.23l.1-.573c.298-1.53.828-2.958 1.536-4.157l.209-.34c1.177-1.83 2.789-3.053 4.615-3.16L6.897 4zm-.033 2.615l-.201.01c-.83.083-1.606.673-2.252 1.577l-.138.199-.01.018c-.67 1.017-1.185 2.378-1.456 3.845l-.004.022a12.591 12.591 0 00-.207 2.254l.002.188c.004.18.017.36.04.54l.043.291c.092.503.257.908.486 1.208l.117.137c.303.323.698.492 1.17.492 1.1 0 1.796-.676 3.696-3.641l2.175-3.4.454-.701-.139-.198C9.11 7.3 8.084 6.616 6.864 6.616zm10.196-.552l-.176.007c-.635.048-1.223.359-1.82.933l-.196.198c-.439.462-.887 1.064-1.367 1.807l.266.398c.18.274.362.56.55.858l.293.475 1.396 2.335.695 1.114c.583.926 1.03 1.6 1.408 2.082l.213.262c.282.326.529.54.777.673l.102.05c.227.1.457.138.718.138.176.002.35-.023.518-.073.338-.104.61-.32.813-.637l.095-.163.077-.162c.194-.459.29-1.06.29-1.785l-.006-.449c-.08-2.871-.938-5.372-2.2-6.798l-.176-.189c-.67-.683-1.444-1.074-2.27-1.074z" />
    </svg>
  );
}

export function XAiLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="xAI"
      {...props}
    >
      <path d="M6.469 8.776L16.512 23h-4.464L2.005 8.776H6.47zm-.004 7.9l2.233 3.164L6.467 23H2l4.465-6.324zM22 2.582V23h-3.659V7.764L22 2.582zM22 1l-9.952 14.095-2.233-3.163L17.533 1H22z" />
    </svg>
  );
}

export function CohereLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Cohere"
      {...props}
    >
      <path
        d="M8.128 14.099c.592 0 1.77-.033 3.398-.703 1.897-.781 5.672-2.2 8.395-3.656 1.905-1.018 2.74-2.366 2.74-4.18A4.56 4.56 0 0018.1 1H7.549A6.55 6.55 0 001 7.55c0 3.617 2.745 6.549 7.128 6.549z"
        clipRule="evenodd"
      />
      <path
        d="M9.912 18.61a4.387 4.387 0 012.705-4.052l3.323-1.38c3.361-1.394 7.06 1.076 7.06 4.715a5.104 5.104 0 01-5.105 5.104l-3.597-.001a4.386 4.386 0 01-4.386-4.387z"
        clipRule="evenodd"
      />
      <path d="M4.776 14.962A3.775 3.775 0 001 18.738v.489a3.776 3.776 0 007.551 0v-.49a3.775 3.775 0 00-3.775-3.775z" />
    </svg>
  );
}

export function PerplexityLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Perplexity"
      {...props}
    >
      <path d="M19.785 0v7.272H22.5V17.62h-2.935V24l-7.037-6.194v6.145h-1.091v-6.152L4.392 24v-6.465H1.5V7.188h2.884V0l7.053 6.494V.19h1.09v6.49L19.786 0zm-7.257 9.044v7.319l5.946 5.234V14.44l-5.946-5.397zm-1.099-.08l-5.946 5.398v7.235l5.946-5.234V8.965zm8.136 7.58h1.844V8.349H13.46l6.105 5.54v2.655zm-8.982-8.28H2.59v8.195h1.8v-2.576l6.192-5.62zM5.475 2.476v4.71h5.115l-5.115-4.71zm13.219 0l-5.115 4.71h5.115v-4.71z" />
    </svg>
  );
}

export function TencentLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Tencent"
      {...props}
    >
      <path d="M9.976 1L24 9.8l-10.587.015L10.723 23H5.489L8.18 9.8H3.244L1 5.4h8.077L9.976 1z" />
    </svg>
  );
}

export function ByteDanceLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="ByteDance"
      {...props}
    >
      <path d="M14.944 18.587l-1.704-.445V10.01l1.824-.462c1-.254 1.84-.461 1.88-.453.032 0 .056 2.235.056 4.972v4.973l-.176-.008c-.104 0-.952-.207-1.88-.446z" />
      <path d="M7 16.542c0-2.736.024-4.98.064-4.98.032-.008.872.2 1.88.454l1.816.461-.016 4.05-.024 4.049-1.632.422c-.896.23-1.736.445-1.856.469L7 21.523v-4.98z" />
      <path d="M19.24 12.477c0-9.03.008-9.515.144-9.475.072.024.784.207 1.576.406.792.207 1.576.405 1.744.445l.296.08-.016 8.56-.024 8.568-1.624.414c-.888.23-1.728.437-1.856.47l-.24.055v-9.523z" />
      <path d="M1 12.509c0-4.678.024-8.505.064-8.505.032 0 .872.207 1.872.454l1.824.461v7.582c0 4.16-.016 7.574-.032 7.574-.024 0-.872.215-1.88.47L1 21.013v-8.505z" />
    </svg>
  );
}

export function StepFunLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="StepFun"
      {...props}
    >
      <path d="M22.012 0h1.032v.927H24v.968h-.956V3.78h-1.032V1.896h-1.878v-.97h1.878V0zM2.6 12.371V1.87h.969v10.502h-.97zm10.423.66h10.95v.918h-6.208v9.579h-4.742V13.03zM5.629 3.333v12.356H0v4.51h10.386V8L20.859 8l-.003-4.668-15.227.001z" />
    </svg>
  );
}

export function IbmLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="IBM"
      {...props}
    >
      <path
        d="M24 16.333V17h-3.158v-.667H24zm-7.579 0V17h-3.158v-.667h3.158zm2.464 0L18.63 17l-.25-.667h.504zm-7.075 0a2.528 2.528 0 01-1.717.667h-5.04v-.667h6.757zm-7.389 0V17H0v-.667h4.421zm12-1.333v.667h-3.158V15h3.158zm2.958 0l-.246.667h-1L17.885 15h1.494zm-6.937 0c-.057.237-.148.46-.265.667H5.053V15h7.39zm-8.02 0v.667H0V15h4.421zM24 15v.667h-3.158V15H24zm-1.263-1.333v.666h-1.895v-.666h1.895zm-6.316 0v.666h-1.895v-.666h1.895zm3.453 0l-.248.666h-1.989l-.25-.666h2.487zm-7.52 0c.056.212.088.435.088.666h-2.337v-.666h2.249zm-4.143 0v.666H6.316v-.666H8.21zm-5.053 0v.666H1.263v-.666h1.895zm19.579-1.334V13h-1.895v-.667h1.895zm-6.316 0V13h-1.895v-.667h1.895zm3.948 0l-.247.667h-2.987l-.245-.667h3.48zm-8.792 0c.218.188.405.414.55.667H6.315v-.667h5.26zm-8.42 0V13H1.264v-.667h1.895zM18.456 11l.177.539.176-.539h3.929v.667h-1.895v-.613l-.215.613H16.63l-.209-.613v.613h-1.895V11h3.929zM3.158 11v.667H1.263V11h1.895zm8.968 0a2.555 2.555 0 01-.55.667h-5.26V11h5.81zm10.61-1.333v.666h-3.709l.224-.666h3.486zm-4.722 0l.224.666h-3.712v-.666h3.488zm-5.572 0c0 .23-.032.454-.088.666h-2.249v-.666h2.337zm-4.231 0v.666H6.316v-.666H8.21zm-5.053 0v.666H1.263v-.666h1.895zm14.419-1.334l.22.667h-4.534v-.667h4.314zm6.423 0V9h-4.536l.229-.667H24zm-11.823 0c.117.206.208.43.265.667h-7.39v-.667h7.125zm-7.756 0V9H0v-.667h4.421zM17.133 7l.224.667h-4.094V7h3.87zM24 7v.667h-4.089L20.13 7H24zM10.093 7c.662 0 1.264.253 1.717.667H5.053V7h5.04zM4.42 7v.667H0V7h4.421z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function LiquidLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="LiquidAI"
      {...props}
    >
      <path d="M12.028 8.546l-.008.005 3.03 5.25a3.94 3.94 0 01.643 2.162c0 .754-.212 1.46-.58 2.062l6.173-1.991L11.63 0 9.304 3.872l2.724 4.674zM6.837 24l4.85-4.053h-.013c-2.219 0-4.017-1.784-4.017-3.984 0-.794.235-1.534.64-2.156l2.865-4.976-2.381-4.087L2 16.034 6.83 24h.007zM13.737 19.382h-.001L8.222 24h8.182l4.148-6.769-6.815 2.151z" />
    </svg>
  );
}

export function RelaceLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Relace"
      {...props}
    >
      <path d="M23 23H1V1h22v22zM2.962 15.232c1.969.3 5.028.42 7.78-.171.904-.195 1.743-.46 2.49-.803-1.395-3.4-1.675-5.766-1.264-7.378.466-1.823 1.799-2.59 2.998-2.602h.01c.688 0 2.117.177 3.081 1.35 1.003 1.22 1.216 3.152.26 5.991-.504 1.493-1.437 2.616-2.594 3.456 1.323 2.993 2.11 4.498 2.588 5.284.223.367.372.564.467.679h2.26V2.962H2.962v12.27zm11.05.827c-.912.413-1.887.711-2.857.92-2.91.626-6.059.527-8.193.234v3.825h13.471c-.527-.92-1.287-2.424-2.421-4.98zm.97-9.82c-.323.005-.87.181-1.112 1.127-.25.975-.161 2.776 1.055 5.84.705-.598 1.233-1.329 1.531-2.213.868-2.576.455-3.67.086-4.119-.406-.494-1.09-.633-1.56-.634z" />
    </svg>
  );
}

export function ArceeLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Arcee AI"
      {...props}
    >
      <path d="M13.236 2.377L2.751 20.493H0L11.863 0l1.373 2.377zm3.554 6.156l-9.606 11.96H4.13L15.511 6.32l1.279 2.212zm6.908 11.96H14.05l8.406-2.151 1.242 2.15zm-3.42-5.922l-7.843 5.92H8.482l10.597-7.997 1.2 2.077z" />
    </svg>
  );
}

export function MorphLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Morph"
      {...props}
    >
      <path d="M7.941 2c.23 0 .452.073.638.21.186.136.325.328.397.55l.593 1.814c.073.221.212.413.397.55.186.136.409.21.638.21h2.791c.23 0 .452-.074.638-.21a1.11 1.11 0 00.397-.55l.594-1.815a1.11 1.11 0 01.397-.55c.185-.136.408-.209.637-.209h1.7c.23 0 .453.073.639.21.185.136.324.328.397.55l.652 1.994c.118.361.41.635.77.728l2.957.752c.236.06.446.199.596.394.15.195.23.436.231.684v9.376c0 .248-.081.488-.231.684a1.09 1.09 0 01-.595.394l-2.957.752a1.086 1.086 0 00-.477.263 1.114 1.114 0 00-.293.465l-.653 1.994a1.11 1.11 0 01-.396.55c-.186.136-.41.21-.638.21h-1.702c-.229 0-.452-.073-.637-.21a1.11 1.11 0 01-.397-.55l-.364-1.11a1.131 1.131 0 01.15-1.002 1.074 1.074 0 01.885-.462h2.85c.29 0 .567-.116.772-.325.204-.208.32-.49.32-.785V6.444c0-.294-.116-.577-.32-.785a1.08 1.08 0 00-.771-.326h-3.273c-.29 0-.567.117-.772.326-.204.208-.32.49-.32.785v7.778c0 .295-.114.578-.319.786a1.08 1.08 0 01-.771.325h-2.182a1.08 1.08 0 01-.771-.325 1.122 1.122 0 01-.32-.786V6.444c0-.294-.115-.577-.32-.785a1.081 1.081 0 00-.77-.326H5.454c-.29 0-.567.117-.772.326-.204.208-.32.49-.32.785v11.112c0 .294.116.577.32.785.205.209.482.326.772.326h2.85a1.075 1.075 0 01.885.461 1.122 1.122 0 01.15 1.001l-.364 1.112a1.11 1.11 0 01-.397.55c-.185.136-.408.209-.637.209H6.24c-.229 0-.452-.073-.638-.21a1.11 1.11 0 01-.397-.55l-.652-1.994a1.114 1.114 0 00-.294-.465 1.086 1.086 0 00-.477-.263l-2.956-.752a1.09 1.09 0 01-.595-.394A1.124 1.124 0 010 16.688V7.312c0-.248.081-.489.231-.684.15-.195.36-.334.595-.394l2.957-.753c.178-.045.342-.136.477-.263.134-.127.235-.287.293-.464l.653-1.995a1.11 1.11 0 01.397-.55C5.788 2.075 6.01 2 6.24 2h1.701z" />
    </svg>
  );
}

export function MicrosoftLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Microsoft"
      {...props}
    >
      <path d="M11.49 2H2v9.492h9.492V2h-.002z" />
      <path d="M22 2h-9.492v9.492H22V2z" />
      <path d="M11.49 12.508H2V22h9.492v-9.492h-.002z" />
      <path d="M22 12.508h-9.492V22H22v-9.492z" />
    </svg>
  );
}

export function InflectionLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Inflection"
      {...props}
    >
      <path d="M8.341 24c-.53 0-.841-.308-.841-.824v-.271c0-.514.248-.755.708-.926l1.025-.343c.708-.271.954-.583.954-1.303V3.667c0-.72-.246-1.029-.954-1.303L8.2 2.02c-.46-.171-.701-.408-.701-.926V.824C7.5.309 7.818 0 8.348 0h6.968c.531 0 .85.309.85.824v.271c0 .514-.249.755-.709.926l-1.031.34c-.743.272-.992.583-.992 1.303v16.664c0 .72.249 1.028.992 1.303l1.024.342c.46.172.708.408.708.926v.272c0 .515-.318.824-.85.824L8.342 24z" />
    </svg>
  );
}

export function KwaipilotLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Kwaipilot"
      {...props}
    >
      <path
        d="M11.765.03C5.327.03.108 5.25.108 11.686c0 3.514 1.556 6.665 4.015 8.804L9.89 8.665h6.451L9.31 23.083c.807.173 1.63.26 2.455.26 6.438 0 11.657-5.22 11.657-11.658S18.202.028 11.765.028V.03z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function InceptionLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Inception"
      {...props}
    >
      <path d="M14.767 1H7.884L1 7.883v6.884h6.884V7.883h6.883V1zM9.234 23h6.882L23 16.116V9.233h-6.884v6.883H9.234V23z" />
    </svg>
  );
}

export function UpstageLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Upstage"
      {...props}
    >
      <path d="M19.763 0l-.373 1.297h2.594L22.354 0h-2.591z" />
      <path d="M16.192 2.27l-.376 1.298h5.52l.37-1.298h-5.514z" />
      <path d="M12.897 4.54l-.377 1.298h8.167l.37-1.297h-8.16z" />
      <path d="M2.85 6.81l-.377 1.298h17.565l.37-1.297H2.85z" />
      <path d="M3.884 9.081l-.376 1.297H19.39l.37-1.297H3.883z" />
      <path d="M4.088 24l.376-1.297H1.866L1.5 24h2.588z" />
      <path d="M7.662 21.73l.376-1.298H2.515L2.15 21.73h5.513z" />
      <path d="M10.957 19.46l.377-1.298h-8.17l-.367 1.297h8.16z" />
      <path d="M21.005 17.19l.376-1.298H3.812l-.366 1.297h17.559z" />
      <path d="M19.967 14.919l.376-1.297H4.461l-.366 1.297h15.872z" />
      <path d="M18.787 12.649l.376-1.298H4.26l-.366 1.298h14.893z" />
    </svg>
  );
}

export function Ai21Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="AI21"
      {...props}
    >
      <path d="M6.47 17l-.367-1.189H2.718L2.35 17H0l3.398-9.789h2.026L8.864 17H6.47zm-2.052-6.993l-1.17 4.028H5.56l-1.142-4.028zm4.707-2.796h2.23V17h-2.23V7.211zM11.955 15c.1-.483.277-.946.524-1.37.214-.359.482-.68.795-.951.32-.273.658-.52 1.013-.741.28-.168.54-.33.781-.483.222-.14.433-.296.632-.468.172-.148.317-.325.428-.525.107-.199.16-.423.157-.65 0-.392-.104-.674-.313-.846a1.176 1.176 0 00-.775-.259 1.207 1.207 0 00-.863.329c-.231.219-.347.585-.347 1.098H11.8a3.387 3.387 0 01.224-1.245c.146-.377.371-.716.66-.993.306-.29.667-.514 1.06-.657A4.04 4.04 0 0115.183 7c.42-.002.84.057 1.244.175.376.107.73.287 1.04.531.305.246.55.562.714.923.185.419.275.875.265 1.335.005.39-.084.774-.259 1.12-.167.328-.38.63-.632.894-.246.259-.517.49-.808.693-.29.2-.554.37-.789.51-.326.224-.596.417-.809.58a3.872 3.872 0 00-.51.455 1.229 1.229 0 00-.265.434 1.633 1.633 0 00-.074.517h4.078V17h-6.606a9.24 9.24 0 01.183-2zM18.8 8.93a5.05 5.05 0 001.135-.105c.25-.049.484-.156.686-.314.163-.139.28-.324.34-.532.068-.25.1-.51.095-.77H23V17h-2.243v-6.475H18.8V8.93z" />
    </svg>
  );
}

export function BaiduLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Baidu"
      {...props}
    >
      <path d="M8.859 11.735c1.017-1.71 4.059-3.083 6.202.286 1.579 2.284 4.284 4.397 4.284 4.397s2.027 1.601.73 4.684c-1.24 2.956-5.64 1.607-6.005 1.49l-.024-.009s-1.746-.568-3.776-.112c-2.026.458-3.773.286-3.773.286l-.045-.001c-.328-.01-2.38-.187-3.001-2.968-.675-3.028 2.365-4.687 2.592-4.968.226-.288 1.802-1.37 2.816-3.085zm.986 1.738v2.032h-1.64s-1.64.138-2.213 2.014c-.2 1.252.177 1.99.242 2.148.067.157.596 1.073 1.927 1.342h3.078v-7.514l-1.394-.022zm3.588 2.191l-1.44.024v3.956s.064.985 1.44 1.344h3.541v-5.3h-1.528v3.979h-1.46s-.466-.068-.553-.447v-3.556zM9.82 16.715v3.06H8.58s-.863-.045-1.126-1.049c-.136-.445.02-.959.088-1.16.063-.203.353-.671.951-.85H9.82zm9.525-9.036c2.086 0 2.646 2.06 2.646 2.742 0 .688.284 3.597-2.309 3.655-2.595.057-2.704-1.77-2.704-3.08 0-1.374.277-3.317 2.367-3.317zM4.24 6.08c1.523-.135 2.645 1.55 2.762 2.513.07.625.393 3.486-1.975 4-2.364.515-3.244-2.249-2.984-3.544 0 0 .28-2.797 2.197-2.969zm8.847-1.483c.14-1.31 1.69-3.316 2.931-3.028 1.236.285 2.367 1.944 2.137 3.37-.224 1.428-1.345 3.313-3.095 3.082-1.748-.226-2.143-1.823-1.973-3.424zM9.425 1c1.307 0 2.364 1.519 2.364 3.398 0 1.879-1.057 3.4-2.364 3.4s-2.367-1.521-2.367-3.4C7.058 2.518 8.118 1 9.425 1z" />
    </svg>
  );
}

export function DeepCogitoLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Deep Cogito"
      {...props}
    >
      <path d="M19.74 21.618l4.213-10.534a.412.412 0 00.027-.1l.003-.03a.404.404 0 00-.02-.167l-.007-.026a.44.44 0 00-.045-.085l-.003-.005L16.528.13c-.002-.003 0-.006-.003-.01h.004v.173h-.01c-.102-.254-.277-.285-.445-.248l-.001-.003c-.001.001-.003-.003-.003-.003h-.006s0-.038-.002-.038L4.466 3.143c-.006.002-.012-.005-.018-.003-.022.007-.044.01-.064.021a.42.42 0 00-.039.022c-.013.008-.026.015-.037.025a.464.464 0 00-.118.154l-.01.017L0 13.919c-.004.013.023.026.023.04v.148c0 .019 0 .038.003.057l-.003.001v.006c0 .049-.011.096.016.139H.03c0 .002-.008.002-.008.002l-.01.001c.007.012.008.023.016.034l7.377 9.486v.005a.063.063 0 00.006.005c.006.008.013.013.02.02a.258.258 0 00.02.02c.008.008.015.017.023.023l.02.014a.564.564 0 00.104.053c.011.003.021.008.032.01.005.002.01.005.016.006a.445.445 0 00.172.004l11.597-2.108a.362.362 0 00.041-.01l.011.001h.001c.005 0 .01-.007.015-.009.01-.003.02-.008.03-.013a.248.248 0 00.025-.012l.01-.007a.448.448 0 00.096-.072c.004-.004.006-.01.01-.013a.419.419 0 00.069-.1l.005-.008.003-.006.001-.003.006-.015zm-.77-.894l-7.315-4.573 8.229-6.4-.915 10.973zm-7.82-5.27l-2.782-10.2 11.127 3.71-8.345 6.49zm9.611-5.883l2.267 1.512-3.022 7.554.755-9.066zm1.133-.278l-1.168-.778-1.556-3.113 2.724 3.891zm-2.35-1.22L8.862 4.514l7.122-3.56 3.56 7.12zM7.71 4.129L6.063 3.58 12.1 1.932 7.71 4.128zm-2.881-.053l2.201.734-5.137 6.605 2.936-7.34zm2.725 1.46l2.754 10.096-9.179-1.835 6.425-8.26zM10.3 16.508L7.633 22.73l-6.223-8 8.89 1.777zm.803.313l7.065 4.417-9.716 1.767 2.65-6.184z" />
    </svg>
  );
}

export function Ai2Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="AllenAI"
      {...props}
    >
      <path d="M9.553 9.378H4.777V4.835H8.62c.513 0 .932-.42.932-.932V.058h4.544v4.777a4.542 4.542 0 01-4.544 4.543zm-4.776.467H0v4.543h3.845c.512 0 .932.42.932.932v3.845H9.32v-4.777a4.542 4.542 0 00-4.543-4.543zM20.05 9.61a.935.935 0 01-.932-.932V4.835h-4.543V9.61a4.542 4.542 0 004.543 4.544h4.777V9.612H20.05zM9.787 19.166v4.777h4.544v-3.845c0-.513.42-.932.932-.932h3.845V14.62H14.33a4.542 4.542 0 00-4.544 4.544z" />
    </svg>
  );
}

export function VeniceLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Venice"
      {...props}
    >
      <path
        d="M8.295 16.074a4.239 4.239 0 00-1.37-.685 4.255 4.255 0 00-1.636-.138 4.27 4.27 0 00-1.566.499c-.472.26-.875.602-1.19.973-.315.37-.59.824-.773 1.336a4.432 4.432 0 00-.257 1.644c.02.564.155 1.125.375 1.621s.528.93.87 1.275c.34.346.766.657 1.256.881.49.224 1.041.36 1.598.381a4.258 4.258 0 001.62-.26 4.25 4.25 0 001.318-.786c.365-.319.703-.728.959-1.206.256-.479.43-1.027.492-1.589a4.436 4.436 0 00-.137-1.659 4.346 4.346 0 00-.675-1.39l.95-.964.691.702h.393l.475-.481v-.399l-.692-.702L12 14.11l1.004 1.018-.691.702v.399l.474.48h.393l.691-.701.95.964a4.346 4.346 0 00-.675 1.39 4.435 4.435 0 00-.137 1.66c.062.56.236 1.11.492 1.588s.594.887.96 1.206c.364.32.812.599 1.316.785a4.258 4.258 0 001.621.261 4.262 4.262 0 001.598-.38c.49-.225.916-.536 1.257-.882.341-.346.648-.779.869-1.275.22-.496.355-1.057.375-1.62a4.433 4.433 0 00-.257-1.645 4.338 4.338 0 00-.774-1.336 4.272 4.272 0 00-1.189-.973 4.27 4.27 0 00-1.566-.5 4.255 4.255 0 00-1.635.14 4.239 4.239 0 00-1.37.684l-.933-.947.69-.702v-.398l-.49-.498h-.393l-.692.701-1.004-1.018L18.15 7.87l2.132 2.163v-2.25H22.5L20.368 5.62 22.5 3.457V3.06l-.491-.498h-.393L12 12.316 2.384 2.56H1.99l-.491.498v.398L3.632 5.62 1.5 7.782h2.218v2.25L5.85 7.87l5.266 5.342-1.004 1.018-.692-.701h-.393l-.49.498v.399l.69.7-.932.948zm8.546 4.95a1.59 1.59 0 00.107 1.49c.256.43.799.73 1.294.716.494.014 1.037-.287 1.293-.716a1.59 1.59 0 00.108-1.49l.054-.06a1.53 1.53 0 001.471-.107c.424-.26.72-.81.707-1.313.014-.502-.283-1.053-.707-1.313a1.53 1.53 0 00-1.471-.107l-.054-.059a1.59 1.59 0 00-.108-1.49c-.256-.43-.799-.73-1.293-.717-.495-.013-1.038.287-1.294.716a1.59 1.59 0 00-.107 1.491l-.054.059a1.53 1.53 0 00-1.472.107c-.424.26-.72.81-.707 1.313-.013.502.283 1.053.707 1.313a1.53 1.53 0 001.472.107l.054.06zm-9.79 1.49a1.59 1.59 0 00.108-1.49l.054-.06a1.53 1.53 0 001.471-.107c.424-.26.72-.81.707-1.313.014-.502-.283-1.053-.707-1.313a1.53 1.53 0 00-1.47-.107l-.055-.059a1.59 1.59 0 00-.107-1.49c-.257-.43-.8-.73-1.294-.717-.495-.013-1.037.287-1.294.716a1.59 1.59 0 00-.107 1.491l-.054.059a1.53 1.53 0 00-1.471.107c-.424.26-.72.81-.707 1.313-.014.502.283 1.053.707 1.313a1.53 1.53 0 001.471.107l.054.06a1.59 1.59 0 00.107 1.49c.257.43.8.73 1.294.716.495.014 1.037-.287 1.294-.716z"
        clipRule="evenodd"
      />
      <path
        d="M12.274 2.56L14.8 0l1.25 1.268v4.274l-3.462 3.512h-.625L8.5 5.542V1.268L9.75 0l2.524 2.56zM9.75.898l2.212 2.243v4.12L9.75 5.018V.897zm2.837 2.243L14.799.897v4.12l-2.212 2.244V3.14z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * Fallback logo for vendors without a dedicated SVG.
 * Renders a rounded square with the first letter extracted from the
 * `aria-label` prop (which callers should set to the vendor display name).
 */
export function VendorMonogramLogo(props: SVGProps<SVGSVGElement>) {
  const label = (props['aria-label'] as string | undefined) ?? '?';
  const letter = label.charAt(0).toUpperCase();
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      {...props}
    >
      <rect width="24" height="24" rx="6" fill="currentColor" opacity="0.15" />
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fontSize="15"
        fontWeight="700"
        fill="currentColor"
      >
        {letter}
      </text>
    </svg>
  );
}

/**
 * Maps an OpenRouter vendor prefix (extracted from the model ID) to the
 * appropriate logo component.
 *
 * Prefixes with an existing brand logo in `PROVIDER_LOGOS` reuse those.
 * Prefixes covered by new lobehub icons use the dedicated component below.
 * Everything else falls back to `VendorMonogramLogo`.
 */
const VENDOR_LOGO_MAP: Record<string, ProviderLogoComponent> = {
  // Existing logos (shared with built-in providers)
  anthropic: AnthropicLogo,
  openai: OpenAiLogo,
  google: GoogleLogo,
  moonshotai: MoonshotAiLogo,
  qwen: AlibabaLogo,
  deepseek: DeepSeekLogo,
  'z-ai': ZAiLogo,
  minimax: MinimaxLogo,
  mistralai: MistralLogo,
  openrouter: OpenRouterLogo,

  // New vendor logos
  'meta-llama': MetaLogo,
  'x-ai': XAiLogo,
  nvidia: NvidiaLogo,
  cohere: CohereLogo,
  perplexity: PerplexityLogo,
  tencent: TencentLogo,
  'bytedance-seed': ByteDanceLogo,
  bytedance: ByteDanceLogo,
  stepfun: StepFunLogo,
  'ibm-granite': IbmLogo,
  liquid: LiquidLogo,
  relace: RelaceLogo,
  'arcee-ai': ArceeLogo,
  morph: MorphLogo,
  microsoft: MicrosoftLogo,
  inflection: InflectionLogo,
  kwaipilot: KwaipilotLogo,
  inception: InceptionLogo,
  upstage: UpstageLogo,
  ai21: Ai21Logo,
  baidu: BaiduLogo,
  deepcogito: DeepCogitoLogo,
  allenai: Ai2Logo,
  cognitivecomputations: VeniceLogo,
};

/**
 * Returns the logo component for an OpenRouter vendor prefix.
 *
 * Falls back to `VendorMonogramLogo` for prefixes without a dedicated icon.
 * Callers should pass the vendor display name via `aria-label` so the monogram
 * fallback can render the correct initial.
 */
export function getOpenRouterVendorLogo(prefix: string): ProviderLogoComponent {
  return VENDOR_LOGO_MAP[prefix] ?? VendorMonogramLogo;
}
