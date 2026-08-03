import { cn } from '@ui/utils';
import { Mesh, Program, Renderer, Triangle } from 'ogl';
import { useEffect, useRef } from 'react';

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform float uSpeed;
uniform float uScale;
uniform float uRingCount;
uniform float uRingSpeed;
uniform float uSpokeCount;
uniform float uRingThickness;
uniform float uSpokeThickness;
uniform float uSweepSpeed;
uniform float uSweepWidth;
uniform float uSweepLobes;
uniform vec3 uColor;
uniform vec3 uBgColor;
uniform float uFalloff;
uniform float uBrightness;
uniform vec2 uMouse;
uniform float uMouseInfluence;
uniform bool uEnableMouse;

#define TAU 6.28318530718

void main() {
  vec2 st = gl_FragCoord.xy / uResolution.xy;
  st = st * 2.0 - 1.0;
  st.x *= uResolution.x / uResolution.y;

  if (uEnableMouse) {
    vec2 mouseShift = uMouse * 2.0 - 1.0;
    mouseShift.x *= uResolution.x / uResolution.y;
    st -= mouseShift * uMouseInfluence;
  }

  st *= uScale;

  float distanceFromCenter = length(st);
  float angle = atan(st.y, st.x);
  float time = uTime * uSpeed;

  float ringPhase = distanceFromCenter * uRingCount - time * uRingSpeed;
  float ringDistance = abs(fract(ringPhase) - 0.5);
  float ringGlow = 1.0 - smoothstep(0.0, uRingThickness, ringDistance);

  float spokeAngle = abs(
    fract(angle * uSpokeCount / TAU + 0.5) - 0.5
  ) * TAU / uSpokeCount;
  float arcDistance = spokeAngle * distanceFromCenter;
  float spokeGlow = (
    1.0 - smoothstep(0.0, uSpokeThickness, arcDistance)
  ) * smoothstep(0.0, 0.1, distanceFromCenter);

  float sweepPhase = time * uSweepSpeed;
  float sweepBeam = pow(
    max(0.5 * sin(uSweepLobes * angle + sweepPhase) + 0.5, 0.0),
    uSweepWidth
  );

  float fade = smoothstep(1.05, 0.85, distanceFromCenter)
    * pow(max(1.0 - distanceFromCenter, 0.0), uFalloff);

  float intensity = max(
    (ringGlow + spokeGlow + sweepBeam) * fade * uBrightness,
    0.0
  );
  vec3 color = uColor * intensity + uBgColor;
  float alpha = clamp(length(color), 0.0, 1.0);

  gl_FragColor = vec4(color, alpha);
}
`;

function cssColorToRgb(
  color: string,
  container: HTMLElement,
): [number, number, number] {
  const probe = document.createElement('span');
  probe.style.color = color;
  container.appendChild(probe);
  const resolvedColor = getComputedStyle(probe).color;
  probe.remove();

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d');
  if (!context) return [1, 1, 1];
  context.fillStyle = resolvedColor;
  context.fillRect(0, 0, 1, 1);
  const data = context.getImageData(0, 0, 1, 1).data;
  return [(data[0] ?? 0) / 255, (data[1] ?? 0) / 255, (data[2] ?? 0) / 255];
}

export function Radar({
  active = true,
  backgroundColor = '#000000',
  brightness = 1,
  className,
  color = '#9f29ff',
  enableMouseInteraction = true,
  falloff = 2,
  mouseInfluence = 0.1,
  ringCount = 10,
  ringSpeed = 1,
  ringThickness = 0.05,
  scale = 0.5,
  speed = 1,
  spokeCount = 10,
  spokeThickness = 0.01,
  sweepLobes = 1,
  sweepSpeed = 1,
  sweepWidth = 2,
}: {
  active?: boolean;
  backgroundColor?: string;
  brightness?: number;
  className?: string;
  color?: string;
  enableMouseInteraction?: boolean;
  falloff?: number;
  mouseInfluence?: number;
  ringCount?: number;
  ringSpeed?: number;
  ringThickness?: number;
  scale?: number;
  speed?: number;
  spokeCount?: number;
  spokeThickness?: number;
  sweepLobes?: number;
  sweepSpeed?: number;
  sweepWidth?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new Renderer({
      alpha: true,
      dpr: Math.min(window.devicePixelRatio, 2),
      premultipliedAlpha: false,
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.canvas.style.width = '100%';
    gl.canvas.style.height = '100%';

    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new Float32Array([1, 1, 1]) },
        uSpeed: { value: speed },
        uScale: { value: scale },
        uRingCount: { value: ringCount },
        uRingSpeed: { value: ringSpeed },
        uSpokeCount: { value: spokeCount },
        uRingThickness: { value: ringThickness },
        uSpokeThickness: { value: spokeThickness },
        uSweepSpeed: { value: sweepSpeed },
        uSweepWidth: { value: sweepWidth },
        uSweepLobes: { value: sweepLobes },
        uColor: { value: cssColorToRgb(color, container) },
        uBgColor: { value: cssColorToRgb(backgroundColor, container) },
        uFalloff: { value: falloff },
        uBrightness: { value: brightness },
        uMouse: { value: new Float32Array([0.5, 0.5]) },
        uMouseInfluence: { value: mouseInfluence },
        uEnableMouse: { value: enableMouseInteraction },
      },
    });
    const mesh = new Mesh(gl, {
      geometry: new Triangle(gl),
      program,
    });

    const resize = () => {
      renderer.setSize(
        Math.max(container.offsetWidth, 1),
        Math.max(container.offsetHeight, 1),
      );
      program.uniforms.uResolution.value[0] = gl.canvas.width;
      program.uniforms.uResolution.value[1] = gl.canvas.height;
      program.uniforms.uResolution.value[2] =
        gl.canvas.width / gl.canvas.height;
      renderer.render({ scene: mesh });
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    container.appendChild(gl.canvas);
    resize();

    const updateColors = () => {
      program.uniforms.uColor.value = cssColorToRgb(color, container);
      program.uniforms.uBgColor.value = cssColorToRgb(
        backgroundColor,
        container,
      );
      renderer.render({ scene: mesh });
    };
    const themeObserver = new MutationObserver(updateColors);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    const currentMouse: [number, number] = [0.5, 0.5];
    let targetMouse: [number, number] = [0.5, 0.5];
    const handleMouseMove = (event: MouseEvent) => {
      const rect = gl.canvas.getBoundingClientRect();
      targetMouse = [
        (event.clientX - rect.left) / rect.width,
        1 - (event.clientY - rect.top) / rect.height,
      ];
    };
    const handleMouseLeave = () => {
      targetMouse = [0.5, 0.5];
    };

    if (enableMouseInteraction) {
      gl.canvas.addEventListener('mousemove', handleMouseMove);
      gl.canvas.addEventListener('mouseleave', handleMouseLeave);
    }

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    let animationFrameId: number | undefined;

    if (active && !reduceMotion) {
      const render = (time: number) => {
        program.uniforms.uTime.value = time * 0.001;
        if (enableMouseInteraction) {
          currentMouse[0] += 0.05 * (targetMouse[0] - currentMouse[0]);
          currentMouse[1] += 0.05 * (targetMouse[1] - currentMouse[1]);
          program.uniforms.uMouse.value[0] = currentMouse[0];
          program.uniforms.uMouse.value[1] = currentMouse[1];
        }
        renderer.render({ scene: mesh });
        animationFrameId = requestAnimationFrame(render);
      };
      animationFrameId = requestAnimationFrame(render);
    }

    return () => {
      if (animationFrameId !== undefined)
        cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      if (enableMouseInteraction) {
        gl.canvas.removeEventListener('mousemove', handleMouseMove);
        gl.canvas.removeEventListener('mouseleave', handleMouseLeave);
      }
      gl.canvas.remove();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [
    active,
    backgroundColor,
    brightness,
    color,
    enableMouseInteraction,
    falloff,
    mouseInfluence,
    ringCount,
    ringSpeed,
    ringThickness,
    scale,
    speed,
    spokeCount,
    spokeThickness,
    sweepLobes,
    sweepSpeed,
    sweepWidth,
  ]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className={cn('size-full', className)}
    />
  );
}
