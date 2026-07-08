import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconPaperclip2Outline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconPaperclip2Outline18: React.FC<
  IconPaperclip2Outline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M10.985,5.422l-4.773,4.773c-.586,.586-.586,1.536,0,2.121h0c.586,.586,1.536,.586,2.121,0l4.95-4.95c1.172-1.172,1.172-3.071,0-4.243h0c-1.172-1.172-3.071-1.172-4.243,0l-4.95,4.95c-1.757,1.757-1.757,4.607,0,6.364h0c1.757,1.757,4.607,1.757,6.364,0l4.773-4.773"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
