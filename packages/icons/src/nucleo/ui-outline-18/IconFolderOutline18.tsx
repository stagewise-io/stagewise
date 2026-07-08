import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconFolderOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconFolderOutline18: React.FC<IconFolderOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M2.25,8.75V4.75c0-1.105,.895-2,2-2h1.951c.607,0,1.18,.275,1.56,.748l.603,.752h5.386c1.105,0,2,.895,2,2v2.844"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <path
        d="M4.25,6.75H13.75c1.105,0,2,.895,2,2v4.5c0,1.105-.895,2-2,2H4.25c-1.105,0-2-.895-2-2v-4.5c0-1.105,.895-2,2-2Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
