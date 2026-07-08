import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconBellDotOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconBellDotOutline18: React.FC<IconBellDotOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="m10.5,15.3843c-.2995.5175-.8591.8657-1.5.8657s-1.2005-.3482-1.5-.8657"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <path
        d="m9,1.75c-2.623,0-4.75,2.127-4.75,4.75v4.25c0,1.105-.895,2-2,2h13.5c-1.105,0-2-.895-2-2v-3.6421"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <circle
        cx="12.75"
        cy="3.25"
        r="1"
        fill="currentColor"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
    </Icon>
  );
};
