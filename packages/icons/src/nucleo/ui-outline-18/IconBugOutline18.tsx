import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconBugOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconBugOutline18: React.FC<IconBugOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <line
        x1="9"
        y1="15.25"
        x2="9"
        y2="10.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <path
        d="m6.75,5.75v-1.25c0-1.243,1.007-2.25,2.25-2.25h0c1.243,0,2.25,1.007,2.25,2.25v1.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <line
        x1="4.75"
        y1="9.75"
        x2="1.75"
        y2="9.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path
        d="m4.75,7.25c-1.519,0-2.75-1.231-2.75-2.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path
        d="m4.75,12.25c-1.519,0-2.75,1.231-2.75,2.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <line
        x1="13.25"
        y1="9.75"
        x2="16.25"
        y2="9.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path
        d="m13.25,7.25c1.519,0,2.75-1.231,2.75-2.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path
        d="m13.25,12.25c1.519,0,2.75,1.231,2.75,2.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path
        d="m6.75,5.75h4.5c1.104,0,2,.896,2,2v3.25c0,2.346-1.904,4.25-4.25,4.25h0c-2.346,0-4.25-1.904-4.25-4.25v-3.25c0-1.104.896-2,2-2Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
