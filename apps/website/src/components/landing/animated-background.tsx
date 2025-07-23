'use client';

import { useEffect, useRef } from 'react';

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isDarkMode = window.matchMedia?.(
      '(prefers-color-scheme: dark)',
    ).matches;

    const updateColorScheme = () => {
      isDarkMode = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      // Re-initialize particles if needed, or update existing ones
      // This might require a more complex solution if particles need to change color dynamically
      // For simplicity, we'll re-init here, but this could be optimized
      particlesArray.length = 0; // Clear existing particles
      init(); // Re-initialize with new color scheme
    };

    const mediaQueryListener = window.matchMedia?.(
      '(prefers-color-scheme: dark)',
    );
    mediaQueryListener?.addEventListener('change', updateColorScheme);

    // Set canvas dimensions
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Create particles
    const particlesArray: Particle[] = [];
    const numberOfParticles = 70;

    class Particle {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      color: string;

      constructor() {
        this.x = Math.random() * (canvas?.width ?? 0);
        this.y = Math.random() * (canvas?.height ?? 0);
        this.size = Math.random() * 3 + 1;
        this.speedX = (Math.random() - 0.5) * 0.5;
        this.speedY = (Math.random() - 0.5) * 0.5;
        if (isDarkMode) {
          // Use grayscale colors for dark mode
          const gray = Math.floor(Math.random() * 100 + 150);
          this.color = `rgba(${gray}, ${gray}, ${gray}, ${Math.random() * 0.3 + 0.2})`;
        } else {
          // Use grayscale colors for light mode
          const gray = Math.floor(Math.random() * 50 + 150);
          this.color = `rgba(${gray}, ${gray}, ${gray}, ${Math.random() * 0.1 + 0.05})`;
        }
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;

        if (this.x > (canvas?.width ?? 0)) this.x = 0;
        if (this.x < 0) this.x = canvas?.width ?? 0;
        if (this.y > (canvas?.height ?? 0)) this.y = 0;
        if (this.y < 0) this.y = canvas?.height ?? 0;
      }

      draw() {
        if (!ctx) return;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function init() {
      for (let i = 0; i < numberOfParticles; i++) {
        particlesArray.push(new Particle());
      }
    }

    function connectParticles() {
      for (let a = 0; a < particlesArray.length; a++) {
        for (let b = a; b < particlesArray.length; b++) {
          const dx = particlesArray[a].x - particlesArray[b].x;
          const dy = particlesArray[a].y - particlesArray[b].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 200) {
            const opacity = 0.1 - distance / 2000;
            if (!ctx) return;
            ctx.strokeStyle = isDarkMode
              ? `rgba(150, 150, 150, ${opacity})`
              : `rgba(100, 100, 100, ${opacity * 2})`; // Grayscale for both modes
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(particlesArray[a].x, particlesArray[a].y);
            ctx.lineTo(particlesArray[b].x, particlesArray[b].y);
            ctx.stroke();
          }
        }
      }
    }

    function animate() {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas?.width ?? 0, canvas?.height ?? 0);

      for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].update();
        particlesArray[i].draw();
      }

      connectParticles();
      requestAnimationFrame(animate);
    }

    init();
    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      mediaQueryListener?.removeEventListener('change', updateColorScheme);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="-z-10 fixed top-0 left-0 h-full w-full opacity-30 dark:opacity-30"
    />
  );
}
