import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconHotDrinkOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconHotDrinkOutline18: React.FC<IconHotDrinkOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M8.75,.75c-.022,.631-.166,1.383-.672,2-.347,.424-.636,.504-.969,.922-.122,.153-.239,.338-.338,.564"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <path
        d="M11.5,2.75c-.015,.379-.111,.83-.448,1.2-.127,.14-.242,.217-.357,.3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <path
        d="M3.75,6.75H14.25v3.5c0,2.76-2.24,5-5,5h-.5c-2.76,0-5-2.24-5-5v-3.5h0Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <line
        x1="15.25"
        y1="15.25"
        x2="2.75"
        y2="15.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path
        d="M14.25,6.75h1c1.105,0,2,.891,2,2s-.895,2-2,2h-1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
