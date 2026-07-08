import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconBluetoothOutline24Props extends IconProps {
  strokeWidth?: number;
  corners?: 'round' | 'square';
}
export const IconBluetoothOutline24: React.FC<IconBluetoothOutline24Props> = ({
  strokeWidth = 2,
  corners,
  ...props
}) => {
  return (
    <Icon size="24px" {...props}>
      <polyline
        points="5 17 18 6 11 2 11 22 18 17 5 6"
        fill="none"
        stroke="currentColor"
        strokeMiterlimit="10"
        strokeWidth={strokeWidth}
        strokeLinejoin={corners === 'round' ? 'round' : 'miter'}
        strokeLinecap={corners === 'round' ? 'round' : 'square'}
      />
    </Icon>
  );
};
