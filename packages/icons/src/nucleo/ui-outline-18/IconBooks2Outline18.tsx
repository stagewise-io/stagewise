import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconBooks2Outline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconBooks2Outline18: React.FC<IconBooks2Outline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <rect
        x="5.75"
        y="2.75"
        width="4"
        height="12.5"
        rx="1"
        ry="1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <rect
        x="2.75"
        y="4.75"
        width="3"
        height="10.5"
        rx="1"
        ry="1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <rect
        x="11.235"
        y="4.719"
        width="3.5"
        height="10.5"
        rx="1"
        ry="1"
        transform="translate(-2.382 4.324) rotate(-17.344)"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <line
        x1="10.934"
        y1="9.272"
        x2="14.275"
        y2="8.228"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <line
        x1="5.75"
        y1="7.25"
        x2="9.75"
        y2="7.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <line
        x1="2.75"
        y1="8.75"
        x2="5.75"
        y2="8.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <line
        x1="1"
        y1="15.25"
        x2="17"
        y2="15.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
    </Icon>
  );
};
