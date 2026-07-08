import type React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconBrowserTabProps extends IconProps {
  strokeWidth?: number;
}

export const IconBrowserTab: React.FC<IconBrowserTabProps> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      {/* Browser window body */}
      <rect
        x="2.25"
        y="5.75"
        width="13.5"
        height="9.5"
        rx="2"
        ry="2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      {/* Active tab shape on top */}
      <path
        d="M5.25,5.75 L5.25,3.5 Q5.25,2.75 6,2.75 L12,2.75 Q12.75,2.75 12.75,3.5 L12.75,5.75"
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
