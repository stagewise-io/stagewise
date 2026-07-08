import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconSparkleOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconSparkleOutline18: React.FC<IconSparkleOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M6.65802 4.02597L5.39502 3.60495L4.97402 2.34195C4.83702 1.93395 4.16202 1.93395 4.02502 2.34195L3.60402 3.60495L2.34102 4.02597C2.13702 4.09397 1.99902 4.28497 1.99902 4.49997C1.99902 4.71497 2.13702 4.90597 2.34102 4.97397L3.60402 5.39499L4.02502 6.65799C4.09302 6.86199 4.28502 6.99997 4.50002 6.99997C4.71502 6.99997 4.90602 6.86199 4.97502 6.65799L5.39602 5.39499L6.65902 4.97397C6.86302 4.90597 7.00102 4.71497 7.00102 4.49997C7.00102 4.28497 6.86202 4.09397 6.65802 4.02597Z"
        fill="currentColor"
        data-color="color-2"
        data-stroke="none"
      />
      <path
        d="M15.658 13.026L14.395 12.605L13.974 11.3419C13.837 10.9339 13.162 10.9339 13.025 11.3419L12.604 12.605L11.341 13.026C11.137 13.094 10.999 13.285 10.999 13.5C10.999 13.715 11.137 13.906 11.341 13.974L12.604 14.395L13.025 15.658C13.093 15.862 13.285 16 13.5 16C13.715 16 13.906 15.862 13.975 15.658L14.396 14.395L15.659 13.974C15.863 13.906 16.001 13.715 16.001 13.5C16.001 13.285 15.862 13.094 15.658 13.026Z"
        fill="currentColor"
        data-color="color-2"
        data-stroke="none"
      />
      <path
        d="M6 8.75L6.671 11.329L9.25 12L6.671 12.671L6 15.25L5.329 12.671L2.75 12L5.329 11.329L6 8.75Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 2.75L12.671 5.32898L15.25 6L12.671 6.67102L12 9.25L11.329 6.67102L8.75 6L11.329 5.32898L12 2.75Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
};
