import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconMoonOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconMoonOutline18: React.FC<IconMoonOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M13,11.75c-3.452,0-6.25-2.798-6.25-6.25,0-1.352,.433-2.599,1.162-3.622-3.364,.628-5.912,3.575-5.912,7.122,0,4.004,3.246,7.25,7.25,7.25,3.372,0,6.198-2.306,7.009-5.424-.95,.583-2.063,.924-3.259,.924Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
