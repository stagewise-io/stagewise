import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconServerOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconServerOutline18: React.FC<IconServerOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <circle
        cx="4.25"
        cy="5.25"
        r=".75"
        fill="currentColor"
        data-color="color-2"
        data-stroke="none"
      />
      <circle
        cx="6.75"
        cy="5.25"
        r=".75"
        fill="currentColor"
        data-color="color-2"
        data-stroke="none"
      />
      <circle
        cx="4.25"
        cy="12.75"
        r=".75"
        fill="currentColor"
        data-color="color-2"
        data-stroke="none"
      />
      <circle
        cx="6.75"
        cy="12.75"
        r=".75"
        fill="currentColor"
        data-color="color-2"
        data-stroke="none"
      />
      <rect
        x="1.75"
        y="2.75"
        width="14.5"
        height="5"
        rx="1.5"
        ry="1.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <rect
        x="1.75"
        y="10.25"
        width="14.5"
        height="5"
        rx="1.5"
        ry="1.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
