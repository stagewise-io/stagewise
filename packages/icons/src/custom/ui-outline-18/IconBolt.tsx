import type React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconBoltProps extends IconProps {
  strokeWidth?: number;
}

export const IconBolt: React.FC<IconBoltProps> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M9.75 1.5L2.25 10.5H9L8.25 16.5L15.75 7.5H9L9.75 1.5Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
