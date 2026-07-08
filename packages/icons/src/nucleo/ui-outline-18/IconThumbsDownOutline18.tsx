import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconThumbsDownOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconThumbsDownOutline18: React.FC<
  IconThumbsDownOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M5.25,10.506c0,.48,.173,.944,.486,1.307l4.264,4.937h0c.854-.427,1.25-1.428,.92-2.324l-1.17-3.176h4.402c1.313,0,2.269-1.243,1.933-2.512l-1.191-4.5c-.232-.877-1.026-1.488-1.933-1.488H7.25c-1.105,0-2,.895-2,2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <rect
        x="1.75"
        y="2.75"
        width="3.5"
        height="8.5"
        rx="1"
        ry="1"
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
