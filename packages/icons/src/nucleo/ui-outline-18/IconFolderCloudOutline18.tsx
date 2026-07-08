import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconFolderCloudOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconFolderCloudOutline18: React.FC<
  IconFolderCloudOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M2.25 8.75V4.75C2.25 3.645 3.145 2.75 4.25 2.75H6.20099C6.80799 2.75 7.38099 3.025 7.76099 3.498L8.36401 4.25H13.75C14.855 4.25 15.75 5.145 15.75 6.25V8.88739"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M15.75 8.75C15.75 7.646 14.855 6.75 13.75 6.75H4.25C3.145 6.75 2.25 7.646 2.25 8.75V13.25C2.25 14.354 3.145 15.25 4.25 15.25H6.75"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M14.5 11.75C13.2297 11.75 12.1711 12.616 11.8553 13.7864C11.7405 13.7627 11.6217 13.75 11.5 13.75C10.5335 13.75 9.75 14.5335 9.75 15.5C9.75 16.4665 10.5335 17.25 11.5 17.25H14.5C16.0188 17.25 17.25 16.0187 17.25 14.5C17.25 12.9813 16.0188 11.75 14.5 11.75Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
    </Icon>
  );
};
