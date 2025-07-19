import { AngularIcon, NextIcon, NuxtIcon, ReactIcon, SvelteIcon, VueIcon } from "@/components/icons";
import { Feather, Layers, Link2, MessageSquare, Settings, Zap } from "lucide-react";

export const FRAMEWORK_EXAMPLES = [
    {
      name: 'React',
      logo: ReactIcon,
      href: 'https://github.com/stagewise-io/stagewise/tree/main/examples/react-example',
    },
    {
      name: 'Vue',
      logo: VueIcon,
      href: 'https://github.com/stagewise-io/stagewise/tree/main/examples/vue-example',
    },
    {
      name: 'Angular',
      logo: AngularIcon,
      href: 'https://github.com/stagewise-io/stagewise/tree/main/examples/angular-example',
    },
    {
      name: 'Svelte',
      logo: SvelteIcon,
      href: 'https://github.com/stagewise-io/stagewise/tree/main/examples/svelte-kit-example',
    },
    {
      name: 'Next.js',
      logo: NextIcon,
      href: 'https://github.com/stagewise-io/stagewise/tree/main/examples/next-example',
    },
    {
      name: 'Nuxt',
      logo: NuxtIcon,
      href: 'https://github.com/stagewise-io/stagewise/tree/main/examples/nuxt-example',
    },
  ]

export const PLUGIN_EXAMPLES = [
  {
    id: 1,
    icon: ReactIcon,
    title: 'React',
    description: 'Improve prompts with context on your React app.',
    delay: 100,
  },
  {
    id: 2,
    icon: VueIcon,
    title: 'Vue',
    description: 'Get more accurate prompts with info on selected Vue components.',
    delay: 300,
  },
  {
    id: 3,
    icon: AngularIcon,
    title: 'Angular',
    description: 'First-class support for Angular apps.',
    delay: 500,
  },
]

export const TESTIMONIALS = [
    {
      quote:
        "This Cursor Extension is awesome. Accurate tweaking of UI was always a struggle, but @stagewise_io allows you to bring full context to Cursor, just point and command.",
      name: "Jason Zhou",
      role: "Product engineer @ TaskMaster AI",
      avatar:
        "https://pbs.twimg.com/profile_images/1613651966663749632/AuQiWkVc_400x400.jpg",
    },
    {
      quote:
        "How did I even use Cursor before this?! Amazing extension.",
      name: "Dennis Cutraro",
      role: "Founder @ unfuture",
      avatar: null,
    },
    {
      quote:
        "This is an amazing extension. The setup is quite simple, and it impresses from the very beginning. I was surprised how well it worked right away, even in a poorly designed brownfield project. This is only the beginning, I'm excited to see how it develops.",
      name: "Egor Koldasov",
      avatar: null,
    },
    {
      quote:
        "Just tried Stagewise plugin for Cursor - point and tell what to change. Way easier than describing UI elements in prompts.",
      name: "Renat Abbiazov",
      avatar:
        "https://pbs.twimg.com/profile_images/1641815076477837313/1IfZhFZM_400x400.jpg",
    },
    {
      quote:
        "Our team's productivity has skyrocketed since we adopted Stagewise. Collaboration between designers and developers has never been smoother.",
      name: "David Garcia",
      role: "Engineering Manager @ FutureWorks",
      avatar: null,
    },
    {
      quote:
        "stagewise in cursor is different gravy. UI changes for code you didn't write has never been easier",
      name: "Kareem",
      avatar:
        "https://pbs.twimg.com/profile_images/1923032215954305024/6Y7NyOBy_400x400.jpg",
    },
    {
      quote:
        "stagewise is what a good interface for AI should look like",
      name: "chocologist",
      avatar:
        "https://pbs.twimg.com/profile_images/1866724361857798154/Ujx2G3m0_400x400.jpg",
    },
    {
      quote:
        "🚨 VIBE CODERS: If you are using @cursor and working on a frontend, install stagewise immediately. Go in to debt if you have to. ps - it's free :)",
      name: "John Schoenith",
      avatar:
        "https://pbs.twimg.com/profile_images/1905304449016627200/2GQ72XW5_400x400.jpg",
    },
    {
      quote:
        "A must-have tool for any modern development workflow. It simplifies complex tasks and makes coding enjoyable again.",
      name: "Kevin Harris",
      role: "Staff Engineer @ DevHouse",
      avatar: null,
    },
  ]

export const FEATURES = [
  {
    id: 1,
    icon: Zap,
    title: "Works out of the box",
    description: "Simple setup with minimal configuration required",
    delay: 100,
  },
  {
    id: 2,
    icon: Settings,
    title: "Customizable",
    description: "Use your own configuration file to tailor the experience",
    delay: 200,
  },
  {
    id: 3,
    icon: Link2,
    title: "Connect to MCP",
    description: "Connect to your own MCP server for enhanced capabilities",
    delay: 300,
  },
  {
    id: 4,
    icon: Feather,
    title: "Zero impact",
    description: "Does not impact bundle size of your production app",
    delay: 400,
  },
  {
    id: 5,
    icon: Layers,
    title: "Rich context",
    description: "Sends DOM elements, screenshots & metadata to your AI agent",
    delay: 500,
  },
  {
    id: 6,
    icon: MessageSquare,
    title: "Live comments",
    description: "Comment directly on live elements in the browser",
    delay: 600,
  },
]

export const DELAY_INCREMENT = 100;