import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconSplitViewOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconSplitViewOutline18: React.FC<IconSplitViewOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="m9,3.25v11.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <path
        d="m13.75,3.25H4.25c-1.105,0-2,.9-2,2v7.5c0,1.1.895,2,2,2h9.5c1.105,0,2-.9,2-2v-7.5c0-1.1-.895-2-2-2Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
