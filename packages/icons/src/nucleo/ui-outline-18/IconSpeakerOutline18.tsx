import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconSpeakerOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconSpeakerOutline18: React.FC<IconSpeakerOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <rect
        x="3.75"
        y="1.75"
        width="10.5"
        height="14.5"
        rx="2"
        ry="2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <circle
        cx="9"
        cy="11"
        r="2.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <circle
        cx="9"
        cy="5.5"
        r="1"
        fill="currentColor"
        data-color="color-2"
        data-stroke="none"
      />
    </Icon>
  );
};
