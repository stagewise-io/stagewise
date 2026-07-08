import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconArrowUpOutline24Props extends IconProps {
  strokeWidth?: number;
  corners?: 'round' | 'square';
}
export const IconArrowUpOutline24: React.FC<IconArrowUpOutline24Props> = ({
  strokeWidth = 2,
  corners,
  ...props
}) => {
  return (
    <Icon size="24px" {...props}>
      <path
        d="M12 21V3V3.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeMiterlimit="10"
        data-color="color-2"
        fill="none"
        strokeLinejoin={corners === 'round' ? 'round' : 'miter'}
        strokeLinecap={corners === 'round' ? 'round' : 'square'}
      />
      <path
        d="M19 10L12 3L5 10"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeMiterlimit="10"
        fill="none"
        strokeLinejoin={corners === 'round' ? 'round' : 'miter'}
        strokeLinecap={corners === 'round' ? 'round' : 'square'}
      />
    </Icon>
  );
};
