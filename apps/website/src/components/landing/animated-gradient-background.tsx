export const AnimatedGradientBackground = ({
  className,
}: {
  className: string;
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 800 800"
      preserveAspectRatio="xMidYMid slice"
      className={className}
    >
      {/* The <defs> element is used to store graphical objects that can be used later.
          Here, we define our blur filter.
        */}
      <defs>
        {/* This filter creates the "mesh" effect. 
            - `id="blur"` gives it a name we can reference.
            - `x, y, width, height` are set to expand the filter area to avoid clipping the blur effect at the edges.
            - `feGaussianBlur` is the SVG primitive that performs the blur.
            - `stdDeviation="80"` controls the amount of blur. A higher number creates a softer, more blended look.
          */}
        <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="80" />
        </filter>
      </defs>

      {/* This rectangle acts as the solid base color for the entire SVG canvas.
          It's set to the dark blue you requested and is NOT blurred.
        */}
      <rect width="800" height="800" fill="#000f68" />

      {/* This group element <g> wraps all our shapes. 
          The `filter` attribute applies our blur effect to every element inside the group.
        */}
      <g filter="url(#blur)">
        {/* These are the colored "blobs" that move around.
            They are circles with large radii. When blurred, they create the soft gradient effect.
            Each circle has two <animate> tags to control its horizontal (cx) and vertical (cy) movement.
            The `begin` attribute is set to a small positive delay to stagger the start and prevent initial freezing.
          */}

        {/* Blob 1: Color #1e90ff (Brighter Blue, Larger Radius) */}
        <circle cx="100" cy="400" r="260" fill="#1e90ff">
          {/* Animate the horizontal position (cx) over 15 seconds */}
          <animate
            attributeName="cx"
            dur="15s"
            begin="0s"
            values="100; 700; 100"
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0; 0.5; 1"
            keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
          />
          {/* Animate the vertical position (cy) over 20 seconds */}
          <animate
            attributeName="cy"
            dur="20s"
            begin="0.1s"
            values="400; 100; 400"
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0; 0.5; 1"
            keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
          />
        </circle>

        {/* Blob 2: Color #c300ff (Brighter Purple) */}
        <circle cx="700" cy="100" r="220" fill="#c300ff">
          {/* Animate the horizontal position (cx) over 12 seconds */}
          <animate
            attributeName="cx"
            dur="12s"
            begin="0.2s"
            values="700; 100; 700"
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0; 0.5; 1"
            keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
          />
          {/* Animate the vertical position (cy) over 10 seconds */}
          <animate
            attributeName="cy"
            dur="10s"
            begin="0.3s"
            values="100; 700; 100"
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0; 0.5; 1"
            keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
          />
        </circle>

        {/* Blob 3: Color #0055ff (Brighter Blue, Larger Radius) */}
        <circle cx="400" cy="700" r="240" fill="#0055ff">
          {/* Animate the horizontal position (cx) over 18 seconds with multiple points for more complex movement */}
          <animate
            attributeName="cx"
            dur="18s"
            begin="0.4s"
            values="400; 500; 200; 400"
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0; 0.33; 0.67; 1"
            keySplines="0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1"
          />
          {/* Animate the vertical position (cy) over 22 seconds */}
          <animate
            attributeName="cy"
            dur="22s"
            begin="0.5s"
            values="700; 400; 700"
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0; 0.5; 1"
            keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
          />
        </circle>
      </g>
    </svg>
  );
};
