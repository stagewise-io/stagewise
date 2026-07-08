import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconUndoOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconUndoOutline18: React.FC<IconUndoOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="m16.25,11.2499c-.9467-2.9025-3.625-4.9999-6.75-4.9999-3.0059,0-5.4544,1.9155-6.5077,4.6187"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <polyline
        points="2.25 6.75 2.25 11.25 6.75 11.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
