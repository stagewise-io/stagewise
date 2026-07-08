import React from 'react';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  title?: string;
}
export const Icon: React.FC<IconProps> = ({
  children,
  size = 20,
  width,
  height,
  title,
  ...props
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width || size}
      height={height || size}
      viewBox="0 0 20 20"
      {...props}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
};
