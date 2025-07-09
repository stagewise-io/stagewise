'use client';

import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { AnimatedBackground } from '@/components/landing/animated-background';
import Image from 'next/image';
import { User } from 'lucide-react';
import julianJpeg from "@/app/about/_components/founders/julian.png"
import glennJpeg from "@/app/about/_components/founders/glenn.jpg"

const teamMembers = [
  {
    name: 'Julian Goetze',
    role: 'Founder',
    image: julianJpeg, 
  },
  {
    name: 'Glenn Töws',
    role: 'Co-founder and CEO',
    image: glennJpeg, 
  },
];

export default function AboutPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white text-slate-900 dark:bg-black dark:text-white">
      <AnimatedBackground />

      {/* Hero Section */}
      <section className="container relative z-10 mx-auto px-4 pt-28 pb-24 sm:pt-32 md:pb-32">
        <ScrollReveal>
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="mb-6 font-bold text-4xl tracking-tight md:text-6xl">
              About <span className="bg-gradient-to-tr from-blue-700 via-violet-500 to-indigo-800 bg-clip-text text-transparent dark:from-cyan-400 dark:via-violet-500 dark:to-indigo-400">stagewise</span>
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
              We're building the first frontend coding agent that lives inside your browser, making UI development more intuitive and efficient.
            </p>
          </div>
        </ScrollReveal>
      </section>

      {/* Mission Section */}
      <section className="container relative z-10 mx-auto border-zinc-200 border-t px-4 py-24 md:py-32 dark:border-zinc-800">
        <ScrollReveal>
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-6 font-bold text-3xl md:text-4xl text-center">Our Mission</h2>
            <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-8">
              We are two German engineers who met while working at a B2B SaaS startup. With backgrounds in both enterprise engineering (Rheinmetall, dSPACE) and building web apps used by thousands, we have the unique blend of discipline and product sense needed to build this.
            </p>
            <p className="text-lg text-zinc-600 dark:text-zinc-400">
              Our agent enables you to show and tell what you want to change - all while using your app on localhost and without having to switch to external tools. Making changes is as easy as selecting elements, giving a simple prompt like "make it green and put it in the top right corner", and immediately seeing the result.
            </p>
          </div>
        </ScrollReveal>
      </section>

      {/* Team Section */}
      <section className="container relative z-10 mx-auto border-zinc-200 border-t px-4 py-24 md:py-32 dark:border-zinc-800">
        <ScrollReveal>
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-6 font-bold text-3xl md:text-4xl text-center">Our Team</h2>
            <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-12 text-center">
              Meet the founders behind stagewise
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {teamMembers.map((member) => (
                <div key={member.name} className="flex flex-col items-center">
                  {member.image ? (
                    <Image
                      src={member.image}
                      alt={member.name}
                      width={200}
                      height={200}
                      className="rounded-full mb-4"
                    />
                  ) : (
                    <div className="w-48 h-48 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                      <User className="w-24 h-24 text-zinc-400" />
                    </div>
                  )}
                  <h3 className="text-xl font-semibold mb-2">{member.name}</h3>
                  <p className="text-zinc-600 dark:text-zinc-400">{member.role}</p>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Company Info Section */}
      <section className="container relative z-10 mx-auto border-zinc-200 border-t px-4 py-24 md:py-32 dark:border-zinc-800">
        <ScrollReveal>
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-6 font-bold text-3xl md:text-4xl text-center">Company</h2>
            <div className="prose prose-zinc mx-auto dark:prose-invert">
              <p>
                stagewise is the first frontend coding agent for existing production-grade web apps. It lives right inside your browser, makes changes in your local codebase and is compatible with all kinds of frameworks and setups - allowing it to be retrofitted into any existing project.
              </p>
              <p>
                After making our initial launch with the open-sourced toolbar that puts your favorite coding agent right inside your browser and going viral with it, we're now launching a high-speed coding agent dedicated to frontend development - taking our product and the experience of our users to the next level.
              </p>
              <p>
                Our vision is to empower anyone to create well-designed applications, regardless of their technical skill. We start with developers who lack design experience, but our ultimate goal is to change how products are built. stagewise will enable non-technical stakeholders - product managers, designers, and marketers - to directly iterate on the UI themselves, creating a new, collaborative workflow and making us the essential tool for building on the web.
              </p>
            </div>
          </div>
        </ScrollReveal>
      </section>
    </div>
  );
} 