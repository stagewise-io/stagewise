import React from 'react';
import { Icon, type IconProps } from './Icon';
export const IconTriangleWarning: React.FC<IconProps> = ({ ...props }) => {
  return (
    <Icon size="20px" {...props}>
      <path
        d="m9,8c0-.552.447-1,1-1s1,.448,1,1v4.5c0,.552-.447,1-1,1s-1-.448-1-1v-4.5Z"
        fill="currentColor"
        strokeWidth="0"
        data-color="color-2"
      />
      <circle
        cx="10"
        cy="15.75"
        r="1.25"
        fill="currentColor"
        strokeWidth="0"
        data-color="color-2"
      />
      <path
        d="m13.725,16h1.471c1.54,0,2.502-1.667,1.732-3l-5.196-9c-.77-1.333-2.694-1.333-3.464,0L3.072,13c-.77,1.333.192,3,1.732,3h1.471"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </Icon>
  );
};
