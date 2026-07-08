import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconFolderOpenOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconFolderOpenOutline18: React.FC<
  IconFolderOpenOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M2.25,7.75v-3c0-1.105,.895-2,2-2h1.951c.607,0,1.18,.275,1.56,.748l.603,.752h5.386c1.105,0,2,.895,2,2v1.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <path
        d="M2.702,7.75H15.298c.986,0,1.703,.934,1.449,1.886l-1.101,4.129c-.233,.876-1.026,1.485-1.932,1.485H4.287c-.906,0-1.699-.609-1.932-1.485l-1.101-4.129c-.254-.952,.464-1.886,1.449-1.886Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
