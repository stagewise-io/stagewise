import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconFilePenOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconFilePenOutline18: React.FC<IconFilePenOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M5.75 6.75H7.75"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M5.75 9.75H10.25"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M15.16 6.25H11.75C11.198 6.25 10.75 5.802 10.75 5.25V1.85201"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M15.25 8.0405V6.664C15.25 6.3989 15.145 6.144 14.957 5.957L11.043 2.04289C10.855 1.85489 10.601 1.74989 10.336 1.74989H4.75C3.645 1.74989 2.75 2.64589 2.75 3.74989V14.2499C2.75 15.3539 3.645 16.2499 4.75 16.2499H8.1656"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M13.7959 16.4542L16.9571 13.293C17.3476 12.9025 17.3476 12.2693 16.9571 11.8788L16.3713 11.293C15.9808 10.9025 15.3476 10.9025 14.9571 11.293L11.7959 14.4542L11.0001 17.2501L13.7959 16.4542Z"
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
