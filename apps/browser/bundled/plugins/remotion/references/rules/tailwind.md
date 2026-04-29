Use TailwindCSS in Remotion if: Project already has Tailwind, Users reference design uses Tailwind, User explicitly requests Tailwind.

Do NOT use `transition-*` or `animate-*` classes. ALWAYS animate with `useCurrentFrame()`.

Tailwind must be installed and enabled first in Remotion project (`./tailwind-setup.md`).
