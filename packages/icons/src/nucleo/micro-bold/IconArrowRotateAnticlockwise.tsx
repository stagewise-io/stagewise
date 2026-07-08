import React from 'react';
import { Icon, type IconProps } from './Icon';
export const IconArrowRotateAnticlockwise: React.FC<IconProps> = ({
  ...props
}) => {
  return (
    <Icon size="20px" {...props}>
      <path
        d="m5,5.101c1.271-1.297,3.041-2.101,5-2.101,3.866,0,7,3.134,7,7s-3.134,7-7,7c-2.792,0-5.203-1.635-6.326-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        data-color="color-2"
      />
      <polygon
        points="4.367 3.044 3.771 6.798 7.516 6.145 4.367 3.044"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        fill="currentColor"
      />
    </Icon>
  );
};
