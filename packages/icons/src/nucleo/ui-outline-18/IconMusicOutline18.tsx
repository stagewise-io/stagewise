import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconMusicOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconMusicOutline18: React.FC<IconMusicOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <line
        x1="5.75"
        y1="7.25"
        x2="5.75"
        y2="13.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <line
        x1="14.75"
        y1="5.75"
        x2="14.75"
        y2="12.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <path
        d="M6.586,3.361l7-1.167c.61-.102,1.164,.368,1.164,.986v2.57l-9,1.5v-2.903c0-.489,.353-.906,.836-.986Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <circle
        cx="3.75"
        cy="13.75"
        r="2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <circle
        cx="12.75"
        cy="12.25"
        r="2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
