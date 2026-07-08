import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconCopyIdOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconCopyIdOutline18: React.FC<IconCopyIdOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="m5.25,12.75h-1c-1.1046,0-2-.8954-2-2v-6.5c0-1.1046.8954-2,2-2h6.5c1.1046,0,2,.8954,2,2v1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path
        d="m13.75,5.25h-6.5c-1.1046,0-2,.8954-2,2v6.5c0,1.1046.8954,2,2,2h6.5c1.1046,0,2-.8954,2-2v-6.5c0-1.1046-.8954-2-2-2Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path
        d="m10.7513,8.75h1.0549c.7966,0,1.4434.6468,1.4434,1.4434v1.1132c0,.7966-.6468,1.4434-1.4434,1.4434h-1.0549v-4h0Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <line
        x1="8.25"
        y1="8.75"
        x2="8.25"
        y2="12.75"
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
