import React from 'react';
import { Icon, type IconProps } from './Icon';
export const IconMagicWandSparkle: React.FC<IconProps> = ({ ...props }) => {
  return (
    <Icon size="20px" {...props}>
      <path
        d="m3,17l9-9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="m11,3l2.339,1.527,2.584-1.06-.73,2.696,1.807,2.129-2.789.139-1.467,2.377-.994-2.61-2.714-.66,2.175-1.753-.211-2.785Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        fill="currentColor"
      />
      <circle
        cx="6"
        cy="3"
        r="1"
        fill="currentColor"
        strokeWidth="0"
        data-color="color-2"
      />
      <path
        d="m5.7158,7.6029l-.9587-.3596-.3599-.9587c-.1248-.3343-.6763-.3343-.8011,0l-.3599.9587-.9587.3596c-.1666.0627-.2774.2223-.2774.4005s.1109.3379.2774.4005l.9587.3596.3599.9587c.0624.1671.2223.2777.4005.2777s.3382-.1106.4005-.2777l.3599-.9587.9587-.3596c.1666-.0627.2774-.2223.2774-.4005s-.1109-.3379-.2774-.4005Z"
        fill="currentColor"
        strokeWidth="0"
        data-color="color-2"
      />
      <path
        d="m17.5822,14.3629l-1.4438-.5415-.542-1.4438c-.1879-.5034-1.0185-.5034-1.2064,0l-.542,1.4438-1.4438.5415c-.2508.0944-.4178.3347-.4178.6032s.167.5088.4178.6032l1.4438.5415.542,1.4438c.094.2517.3347.4182.6032.4182s.5092-.1665.6032-.4182l.542-1.4438,1.4438-.5415c.2508-.0944.4178-.3347.4178-.6032s-.167-.5088-.4178-.6032Z"
        fill="currentColor"
        strokeWidth="0"
        data-color="color-2"
      />
    </Icon>
  );
};
