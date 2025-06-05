'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';

export function Logo3D() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { left, top, width, height } = container.getBoundingClientRect();
      const x = (e.clientX - left) / width - 0.5;
      const y = (e.clientY - top) / height - 0.5;

      container.style.transform = `
        perspective(1000px)
        rotateY(${x * 10}deg)
        rotateX(${-y * 10}deg)
        translateZ(10px)
      `;
    };

    const handleMouseLeave = () => {
      container.style.transform = `
        perspective(1000px)
        rotateY(0deg)
        rotateX(0deg)
        translateZ(0px)
      `;
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative transition-transform duration-200 ease-out"
      style={{ transformStyle: 'preserve-3d' }}
    >
      <div
        className="relative h-12 w-12 overflow-hidden rounded-full shadow-lg"
        style={{ transform: 'translateZ(20px)' }}
      >
        <Image
          src="/logo.png"
          alt="stagewise Logo"
          width={48}
          height={48}
          className="rounded-full"
        />
      </div>
      <div
        className="absolute inset-0 rounded-full bg-indigo-500/10 blur-md dark:bg-indigo-500/20"
        style={{ transform: 'translateZ(10px)' }}
      />
    </div>
  );
}
