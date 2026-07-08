import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconPinTackSlashOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconPinTackSlashOutline18: React.FC<
  IconPinTackSlashOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M9 16.25V12.25"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M9 12.25H14.25C14.161 11.551 13.932 10.49 13.281 9.375C13.2295 9.2865 13.1771 9.20099 13.1241 9.11819"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12.25 5.75V3.75C12.25 2.645 11.355 1.75 10.25 1.75H7.75C6.645 1.75 5.75 2.645 5.75 3.75V8C5.421 8.347 5.053 8.801 4.719 9.375C4.069 10.49 3.839 11.551 3.75 12.25H5.75"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M2 16L16 2"
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
