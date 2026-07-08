import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconMagicWandOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconMagicWandOutline18: React.FC<IconMagicWandOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M2.5 15.5L9.75449 8.24542"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
      <path
        d="M8.8428 2L11.6329 3.82147L14.7153 2.55713L13.8445 5.77307L16 8.31268L12.6731 8.47852L10.9231 11.314L9.7374 8.20062L6.5 7.41333L9.09451 5.32208L8.8428 2Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Icon>
  );
};
