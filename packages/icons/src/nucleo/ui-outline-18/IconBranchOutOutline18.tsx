import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconBranchOutOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconBranchOutOutline18: React.FC<IconBranchOutOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <polyline
        points="9 3 11.75 5.75 9 8.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <path
        d="M11.75,5.75h-3.922c-.53,0-1.039,.211-1.414,.586l-2.414,2.414"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <line
        x1="16.25"
        y1="11.25"
        x2=".75"
        y2="11.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <polyline
        points="13.5 8.5 16.25 11.25 13.5 14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
