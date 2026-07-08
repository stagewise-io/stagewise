import type React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconNewTerminalProps extends IconProps {
  strokeWidth?: number;
}

export const IconNewTerminal: React.FC<IconNewTerminalProps> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      {/* Terminal window */}
      <rect
        x="1.75"
        y="5.25"
        width="10.5"
        height="10"
        rx="2"
        ry="2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      {/* Terminal prompt chevron */}
      <polyline
        points="4.25 11.75 6.75 9.25 4.25 6.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      {/* Terminal underline */}
      <line
        x1="7.75"
        y1="11.75"
        x2="9.75"
        y2="11.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      {/* Plus badge — vertical */}
      <line
        x1="14"
        y1="2"
        x2="14"
        y2="5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      {/* Plus badge — horizontal */}
      <line
        x1="12.5"
        y1="3.5"
        x2="15.5"
        y2="3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
