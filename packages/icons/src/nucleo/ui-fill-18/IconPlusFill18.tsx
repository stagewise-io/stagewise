import React from 'react';
import { Icon, type IconProps } from './Icon';
export const IconPlusFill18: React.FC<IconProps> = ({ ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M14.75,9.75H3.25c-.414,0-.75-.336-.75-.75s.336-.75,.75-.75H14.75c.414,0,.75,.336,.75,.75s-.336,.75-.75,.75Z"
        fill="currentColor"
        data-color="color-2"
      />
      <path
        d="M9,15.5c-.414,0-.75-.336-.75-.75V3.25c0-.414,.336-.75,.75-.75s.75,.336,.75,.75V14.75c0,.414-.336,.75-.75,.75Z"
        fill="currentColor"
      />
    </Icon>
  );
};
