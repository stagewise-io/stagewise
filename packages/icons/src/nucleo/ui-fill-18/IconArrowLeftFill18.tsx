import React from 'react';
import { Icon, type IconProps } from './Icon';
export const IconArrowLeftFill18: React.FC<IconProps> = ({ ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M15.25,9.75H3c-.414,0-.75-.336-.75-.75s.336-.75,.75-.75H15.25c.414,0,.75,.336,.75,.75s-.336,.75-.75,.75Z"
        fill="currentColor"
        data-color="color-2"
      />
      <path
        d="M7,14c-.192,0-.384-.073-.53-.22L2.22,9.53c-.293-.293-.293-.768,0-1.061L6.47,4.22c.293-.293,.768-.293,1.061,0s.293,.768,0,1.061l-3.72,3.72,3.72,3.72c.293,.293,.293,.768,0,1.061-.146,.146-.338,.22-.53,.22Z"
        fill="currentColor"
      />
    </Icon>
  );
};
