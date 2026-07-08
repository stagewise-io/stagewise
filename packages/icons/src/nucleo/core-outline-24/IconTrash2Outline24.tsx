import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconTrash2Outline24Props extends IconProps {
  strokeWidth?: number;
  corners?: 'round' | 'square';
}
export const IconTrash2Outline24: React.FC<IconTrash2Outline24Props> = ({
  strokeWidth = 2,
  corners,
  ...props
}) => {
  return (
    <Icon size="24px" {...props}>
      <path
        d="m18.73,10h.02s-.42,10.083-.42,10.083c-.045,1.071-.926,1.917-1.998,1.917H7.668c-1.072,0-1.954-.845-1.998-1.917l-.42-10.083h.02"
        fill="none"
        stroke="currentColor"
        strokeMiterlimit="10"
        strokeWidth={strokeWidth}
        strokeLinejoin={corners === 'round' ? 'round' : 'miter'}
        strokeLinecap={corners === 'round' ? 'round' : 'square'}
      />
      <line
        x1="3"
        y1="6"
        x2="21"
        y2="6"
        fill="none"
        stroke="currentColor"
        strokeMiterlimit="10"
        strokeWidth={strokeWidth}
        data-color="color-2"
        strokeLinejoin={corners === 'round' ? 'round' : 'miter'}
        strokeLinecap={corners === 'round' ? 'round' : 'square'}
      />
      <path
        d="m9,6V2h6v4"
        fill="none"
        stroke="currentColor"
        strokeMiterlimit="10"
        strokeWidth={strokeWidth}
        data-color="color-2"
        data-cap="butt"
        strokeLinejoin={corners === 'round' ? 'round' : 'miter'}
        strokeLinecap={corners === 'round' ? 'round' : 'butt'}
      />
      <line
        x1="10"
        y1="17"
        x2="10"
        y2="12"
        fill="none"
        stroke="currentColor"
        strokeMiterlimit="10"
        strokeWidth={strokeWidth}
        data-color="color-2"
        strokeLinejoin={corners === 'round' ? 'round' : 'miter'}
        strokeLinecap={corners === 'round' ? 'round' : 'square'}
      />
      <line
        x1="14"
        y1="17"
        x2="14"
        y2="12"
        fill="none"
        stroke="currentColor"
        strokeMiterlimit="10"
        strokeWidth={strokeWidth}
        data-color="color-2"
        strokeLinejoin={corners === 'round' ? 'round' : 'miter'}
        strokeLinecap={corners === 'round' ? 'round' : 'square'}
      />
    </Icon>
  );
};
