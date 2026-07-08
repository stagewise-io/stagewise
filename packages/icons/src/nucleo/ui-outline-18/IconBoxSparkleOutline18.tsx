import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconBoxSparkleOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconBoxSparkleOutline18: React.FC<
  IconBoxSparkleOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="m3.25,10v3.0944c0,.3981.2362.7583.6013.9171l4.75,2.0652c.2543.1106.5431.1106.7975,0l4.75-2.0652c.3651-.1587.6013-.5189.6013-.9171v-3.0944"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <line
        x1="9"
        y1="16.1585"
        x2="9"
        y2="8.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <polyline
        points="12.5158 4.7786 14.75 5.75 9 8.25 3.25 5.75 5.4842 4.7786"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <polyline
        points="9 8.25 6.5 11.25 .75 8.75 3.25 5.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <polyline
        points="9 8.25 11.5 11.25 17.25 8.75 14.75 5.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path
        d="m11.157,2.0042l-1.262-.424-.421-1.272c-.137-.411-.812-.411-.949,0l-.421,1.272-1.262.424c-.204.068-.342.261-.342.477s.138.4091.342.4771l1.262.424.421,1.272c.068.205.26.344.475.344s.406-.139.475-.344l.421-1.272,1.262-.424c.204-.068.342-.261.342-.4771s-.139-.409-.343-.477Z"
        fill="currentColor"
        strokeWidth="0"
        data-color="color-2"
      />
      <path
        d="m4.25,2.5c.414,0,.75-.336.75-.75s-.336-.75-.75-.75-.75.336-.75.75.336.75.75.75Z"
        fill="currentColor"
        strokeWidth="0"
        data-color="color-2"
      />
      <path
        d="m13.75,2.5c-.414,0-.75-.336-.75-.75,0-.414.336-.75.75-.75s.75.336.75.75c0,.414-.336.75-.75.75Z"
        fill="currentColor"
        strokeWidth="0"
        data-color="color-2"
      />
    </Icon>
  );
};
