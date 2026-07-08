import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconHelpChatOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconHelpChatOutline18: React.FC<IconHelpChatOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="m13.4879,7.8697c1.7309.4399,3.0116,2.0089,3.0116,3.8766,0,.7279-.1973,1.4078-.5368,1.9962-.2373.4444.0293,1.4958.5368,2.0042-.6897.0373-1.598-.2747-2.0042-.5368-.2693.1555-.6977.3617-1.2576.4684-.2391.0453-.4862.0693-.7386.0693-1.3714,0-2.5813-.69-3.3018-1.7416"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <path
        d="m5.6679,6.3094c.341-.9314,1.1371-1.3094,1.9157-1.3094.7865,0,1.6976.5585,1.5976,1.5819-.1391,1.4241-1.5141,1.2586-1.8202,2.3726"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <path
        d="m7.375,12.25c-.4821,0-.875-.3937-.875-.875s.3929-.875.875-.875.875.3938.875.875-.3929.875-.875.875Z"
        fill="currentColor"
        strokeWidth="0"
        data-color="color-2"
      />
      <path
        d="m7.5,2.25c-3.3137,0-6,2.6863-6,6,0,1.0947.2979,2.1177.8099,3.001.3376.675-.0568,2.2227-.8098,2.9746,1.0242.0552,2.3711-.4038,2.9822-.7957.8873.5181,1.9161.8201,3.0177.8201,3.3137,0,6-2.6863,6-6s-2.6863-6-6-6Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
