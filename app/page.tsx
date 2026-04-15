import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Merlows – AI-Powered Intelligence Platform",
  description:
    "Merlows empowers you with cutting-edge AI tools to think smarter, work faster, and build better.",
};

const features = [
  {
    icon: "✦",
    title: "Natural conversation",
    description:
      "Talk to Merlows like you would a brilliant colleague. No commands, no syntax — just clear language.",
  },
  {
    icon: "◈",
    title: "Deep research",
    description:
      "Instantly synthesize information from complex topics, documents, and data into clear, actionable insights.",
  },
  {
    icon: "⬡",
    title: "Creative partnership",
    description:
      "Write, brainstorm, and create with an AI that understands nuance, tone, and your unique voice.",
  },
  {
    icon: "◇",
    title: "Code intelligence",
    description:
      "Debug, review, and generate code in any language with context-aware assistance that actually understands your project.",
  },
  {
    icon: "⬥",
    title: "Memory & continuity",
    description:
      "Merlows remembers your projects, preferences, and past conversations so you never have to repeat yourself.",
  },
  {
    icon: "○",
    title: "Privacy first",
    description:
      "Your data is encrypted, never sold, and never used to train models without your explicit consent.",
  },
];

const navCards = [
  {
    href: "/about",
    title: "About Us",
    description: "Our story, team, and the values behind every decision we make.",
    color: "from-purple-600 to-indigo-600",
    icon: "✦",
  },
  {
    href: "/mission",
    title: "Our Mission",
    description: "Why we built Merlows and where we're taking it next.",
    color: "from-indigo-600 to-cyan-600",
    icon: "◈",
  },
  {
    href: "/how-to-use",
    title: "How to Use",
    description: "Get up and running in minutes with our step-by-step guide.",
    color: "from-cyan-600 to-teal-600",
    icon: "⬡",
  },
  {
    href: "/ask-ai",
    title: "Ask AI",
    description: "Open the AI chat and start a conversation right now.",
    color: "from-violet-600 to-purple-600",
    icon: "◇",
  },
  {
    href: "/contact",
    title: "Contact Us",
    description: "Reach our team for support, partnerships, or feedback.",
    color: "from-purple-600 to-pink-600",
    icon: "⬥",
  },
];

export default function HomePage() {
  return (
    <div className="pt-16">
      {/* Hero */}
      <section className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center text-center px-4 hero-bg relative overflow-hidden">
        {/* Background orbs */}
        <div className="absolute top-20 left-1/4 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-indigo-600/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-purple-700/40 bg-purple-900/20 text-purple-300 text-xs font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            Now in public beta — free to try
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white leading-[1.08] tracking-tight mb-6">
            Your intelligence,{" "}
            <span className="gradient-text">amplified</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 leading-relaxed max-w-2xl mx-auto mb-10">
            Merlows is the AI platform built for people who want to think deeper, create faster,
            and understand more — without the complexity.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/ask-ai"
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold text-lg hover:from-purple-500 hover:to-indigo-500 transition-all duration-200 shadow-xl shadow-purple-900/30 hover:shadow-purple-700/40"
            >
              Start for free →
            </Link>
            <Link
              href="/how-to-use"
              className="px-8 py-4 rounded-xl border border-[#1e1e2e] text-slate-300 font-semibold text-lg hover:border-purple-700/40 hover:text-white transition-all duration-200"
            >
              See how it works
            </Link>
          </div>

          {/* Social proof */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-slate-500 text-sm">
            <span>⭐ 4.9 / 5 rating</span>
            <span className="hidden sm:inline">·</span>
            <span>2M+ active users</span>
            <span className="hidden sm:inline">·</span>
            <span>50+ countries</span>
            <span className="hidden sm:inline">·</span>
            <span>No credit card required</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section-padding bg-[#0d0d16]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Everything you need to{" "}
              <span className="gradient-text">think better</span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Merlows combines powerful language understanding with a design that stays out of
              your way.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="glass-card p-6 hover:border-purple-700/30 transition-all duration-300 group"
              >
                <div className="text-2xl text-purple-400 mb-3 group-hover:scale-110 transition-transform duration-300">
                  {feature.icon}
                </div>
                <h3 className="text-white font-semibold mb-2">{feature.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Navigation cards */}
      <section className="section-padding max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-white mb-4">
            Explore <span className="gradient-text">Merlows</span>
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            Everything you need to get started, understand our mission, and get help.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {navCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="gradient-border p-6 hover:shadow-xl hover:shadow-purple-900/20 transition-all duration-300 group flex flex-col"
            >
              <div
                className={`w-11 h-11 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center text-lg mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg`}
              >
                <span className="text-white">{card.icon}</span>
              </div>
              <h3 className="text-white font-bold mb-2">{card.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed flex-1">{card.description}</p>
              <div className="text-purple-400 text-sm font-medium mt-4 group-hover:text-purple-300 transition-colors">
                Explore →
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="section-padding bg-[#0d0d16]">
        <div className="max-w-3xl mx-auto text-center">
          <div className="gradient-border p-10 md:p-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
              Start thinking smarter{" "}
              <span className="gradient-text">today</span>
            </h2>
            <p className="text-slate-400 mb-8 max-w-lg mx-auto">
              Join millions of curious people using Merlows to unlock their full potential. Free
              forever — upgrade when you&apos;re ready.
            </p>
            <Link
              href="/ask-ai"
              className="inline-flex items-center gap-2 px-10 py-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-lg hover:from-purple-500 hover:to-indigo-500 transition-all duration-200 shadow-xl shadow-purple-900/30"
            >
              Try Merlows AI free
              <span>→</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
