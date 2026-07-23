import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconReuseOutline18Props extends IconProps {
  strokeWidth?: number;
}

export const IconReuseOutline18: React.FC<IconReuseOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M7 13.25 5 15.25 7 17.25"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
      <path
        d="M11 4.75 13 2.75 11 .75"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M5.25 15.25h8c1.105 0 2-.9 2-2v-8.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
      <path
        d="M12.75 2.75h-8c-1.105 0-2 .9-2 2v8.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Icon>
  );
};
