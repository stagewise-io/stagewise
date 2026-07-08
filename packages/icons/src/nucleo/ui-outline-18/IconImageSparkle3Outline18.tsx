import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconImageSparkle3Outline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconImageSparkle3Outline18: React.FC<
  IconImageSparkle3Outline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M4 14.75L9.836 8.914C10.617 8.133 11.883 8.133 12.664 8.914L16.25 12.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M16.25 8.98712V12.75C16.25 13.855 15.355 14.75 14.25 14.75H3.75C2.645 14.75 1.75 13.855 1.75 12.75V5.25C1.75 4.145 2.645 3.25 3.75 3.25H8.29199"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M5.75 8.5C6.44 8.5 7 7.94 7 7.25C7 6.56 6.44 6 5.75 6C5.06 6 4.5 6.56 4.5 7.25C4.5 7.94 5.06 8.5 5.75 8.5Z"
        fill="currentColor"
        data-stroke="none"
      />
      <path
        d="M17.4873 3.03809L15.5928 2.40723L14.9615 0.512695C14.8594 0.206995 14.5728 0 14.2501 0C13.9274 0 13.6407 0.206995 13.5387 0.512695L12.9074 2.40723L11.0129 3.03809C10.7067 3.14059 10.5002 3.4268 10.5002 3.75C10.5002 4.0732 10.7067 4.35941 11.0129 4.46191L12.9074 5.09277L13.5387 6.9873C13.6408 7.293 13.9274 7.5 14.2501 7.5C14.5728 7.5 14.8595 7.293 14.9615 6.9873L15.5928 5.09277L17.4873 4.46191C17.7935 4.35941 18 4.0732 18 3.75C18 3.4268 17.7935 3.14059 17.4873 3.03809Z"
        fill="currentColor"
        data-color="color-2"
        data-stroke="none"
      />
    </Icon>
  );
};
