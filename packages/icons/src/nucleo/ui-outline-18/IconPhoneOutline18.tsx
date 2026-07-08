import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconPhoneOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconPhoneOutline18: React.FC<IconPhoneOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M6.08424 11.9158C8.23984 14.0713 11.0787 15.5432 14.2579 15.9883C14.75 16.0572 15.2109 15.726 15.3356 15.245L15.9651 12.8182C16.0879 12.3447 15.8502 11.8518 15.4031 11.6532L12.5339 10.3789C12.1126 10.1918 11.618 10.3169 11.3364 10.6818L10.4574 11.8206C9.57384 11.3015 8.76404 10.6737 8.04524 9.95481C7.32624 9.23601 6.69846 8.42621 6.17946 7.54261L7.31825 6.6636C7.68315 6.3819 7.80824 5.88741 7.62114 5.46611L6.34685 2.597C6.14825 2.1499 5.65534 1.9121 5.18184 2.0349L2.75505 2.6644C2.27415 2.7892 1.94285 3.25001 2.01175 3.74211C2.45685 6.92121 3.92864 9.76021 6.08424 11.9158Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Icon>
  );
};
