import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconCameraOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconCameraOutline18: React.FC<IconCameraOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M14.25,3.75h-2.25l-.507-1.351c-.146-.39-.519-.649-.936-.649h-3.114c-.417,0-.79,.259-.936,.649l-.507,1.351H3.75c-1.105,0-2,.895-2,2v6.5c0,1.105,.895,2,2,2H14.25c1.105,0,2-.895,2-2V5.75c0-1.105-.895-2-2-2Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <circle
        cx="9"
        cy="9"
        r="2.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <circle
        cx="4.25"
        cy="6.25"
        r=".75"
        fill="currentColor"
        data-color="color-2"
        data-stroke="none"
      />
    </Icon>
  );
};
