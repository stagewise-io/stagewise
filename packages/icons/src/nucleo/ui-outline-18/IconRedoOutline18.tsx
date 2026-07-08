import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconRedoOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconRedoOutline18: React.FC<IconRedoOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="m1.75,11.2499c.9467-2.9025,3.625-4.9999,6.75-4.9999,3.0059,0,5.4544,1.9155,6.5077,4.6187"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <polyline
        points="15.75 6.75 15.75 11.25 11.25 11.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
