import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconVideoOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconVideoOutline18: React.FC<IconVideoOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M12.25,8l4.259-2.342c.333-.183,.741,.058,.741,.438v5.809c0,.38-.408,.621-.741,.438l-4.259-2.342"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <rect
        x="1.75"
        y="3.75"
        width="10.5"
        height="10.5"
        rx="2"
        ry="2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <circle
        cx="4.75"
        cy="6.75"
        r=".75"
        fill="currentColor"
        data-color="color-2"
        data-stroke="none"
      />
    </Icon>
  );
};
