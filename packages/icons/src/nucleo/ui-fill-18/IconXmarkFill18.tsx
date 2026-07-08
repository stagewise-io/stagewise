import React from 'react';
import { Icon, type IconProps } from './Icon';
export const IconXmarkFill18: React.FC<IconProps> = ({ ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M4,14.75c-.192,0-.384-.073-.53-.22-.293-.293-.293-.768,0-1.061L13.47,3.47c.293-.293,.768-.293,1.061,0s.293,.768,0,1.061L4.53,14.53c-.146,.146-.338,.22-.53,.22Z"
        fill="currentColor"
        data-color="color-2"
      />
      <path
        d="M14,14.75c-.192,0-.384-.073-.53-.22L3.47,4.53c-.293-.293-.293-.768,0-1.061s.768-.293,1.061,0L14.53,13.47c.293,.293,.293,.768,0,1.061-.146,.146-.338,.22-.53,.22Z"
        fill="currentColor"
      />
    </Icon>
  );
};
