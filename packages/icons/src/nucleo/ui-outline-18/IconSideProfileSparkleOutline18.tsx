import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconSideProfileSparkleOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconSideProfileSparkleOutline18: React.FC<
  IconSideProfileSparkleOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="m11.25,16.25v-2.5h1.639c1.049,0,1.919-.81,1.995-1.856l.112-1.543,1.504-.601-1.5-2c0-3.736-3.415-6.675-7.293-5.865-2.266.473-4.097,2.305-4.571,4.57-.595,2.846.84,5.418,3.114,6.6v3.195"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path
        d="m11.589,6.9055l-1.515-.5096-.505-1.5258c-.164-.4935-.975-.4935-1.139,0l-.505,1.5258-1.515.5096c-.245.0816-.41.3132-.41.5731s.165.4915.41.5731l1.515.5096.505,1.5258c.082.2467.312.4129.57.4129s.487-.1662.57-.4129l.505-1.5258,1.515-.5096c.245-.0816.41-.3132.41-.5731s-.166-.4905-.411-.5731Z"
        fill="currentColor"
        strokeWidth="0"
        data-color="color-2"
      />
    </Icon>
  );
};
