import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconUsbOutline24Props extends IconProps {
  strokeWidth?: number;
  corners?: 'round' | 'square';
}
export const IconUsbOutline24: React.FC<IconUsbOutline24Props> = ({
  strokeWidth = 2,
  corners,
  ...props
}) => {
  return (
    <Icon size="24px" {...props}>
      <path
        d="M5 16C5 19.866 8.13401 23 12 23V23C15.866 23 19 19.866 19 16V12L5 12L5 16Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeMiterlimit="10"
        data-color="color-2"
        fill="none"
        strokeLinejoin={corners === 'round' ? 'round' : 'miter'}
        strokeLinecap={corners === 'round' ? 'round' : 'square'}
      />
      <path
        d="M6 8L6 2L18 2V8"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeMiterlimit="10"
        fill="none"
        strokeLinejoin={corners === 'round' ? 'round' : 'miter'}
        strokeLinecap={corners === 'round' ? 'round' : 'square'}
      />
      <path
        d="M10 8V7"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeMiterlimit="10"
        fill="none"
        strokeLinejoin={corners === 'round' ? 'round' : 'miter'}
        strokeLinecap={corners === 'round' ? 'round' : 'square'}
      />
      <path
        d="M14 8V7"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeMiterlimit="10"
        fill="none"
        strokeLinejoin={corners === 'round' ? 'round' : 'miter'}
        strokeLinecap={corners === 'round' ? 'round' : 'square'}
      />
      <path
        d="M11 16L13 16"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeMiterlimit="10"
        data-color="color-2"
        fill="none"
        strokeLinejoin={corners === 'round' ? 'round' : 'miter'}
        strokeLinecap={corners === 'round' ? 'round' : 'square'}
      />
    </Icon>
  );
};
