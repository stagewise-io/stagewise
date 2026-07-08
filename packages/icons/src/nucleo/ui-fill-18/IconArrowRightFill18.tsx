import React from 'react';
import { Icon, type IconProps } from './Icon';
export const IconArrowRightFill18: React.FC<IconProps> = ({ ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M15,9.75H2.75c-.414,0-.75-.336-.75-.75s.336-.75,.75-.75H15c.414,0,.75,.336,.75,.75s-.336,.75-.75,.75Z"
        fill="currentColor"
        data-color="color-2"
      />
      <path
        d="M11,14c-.192,0-.384-.073-.53-.22-.293-.293-.293-.768,0-1.061l3.72-3.72-3.72-3.72c-.293-.293-.293-.768,0-1.061s.768-.293,1.061,0l4.25,4.25c.293,.293,.293,.768,0,1.061l-4.25,4.25c-.146,.146-.338,.22-.53,.22Z"
        fill="currentColor"
      />
    </Icon>
  );
};
