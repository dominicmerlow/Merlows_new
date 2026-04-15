import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Our Mission – Merlows",
  description:
    "Merlows exists to make advanced AI accessible, ethical, and genuinely useful for every person on the planet.",
};

const pillars = [
  {
    number: "01",
    title: "Democratize Intelligence",
    description:
      "World-class AI should not be reserved for well-funded organizations. We price and design Merlows so that a student in Lagos has the same access as an executive in New York.",
    icon: "🌍",
  },
  {
    number: "02",
    title: "Elevate Human Potential",
    description:
      "We don't want to replace human thought — we want to amplify it. Merlows is a thinking partner, not a thinking replacement. The goal is augmentation, not automation.",
    icon: "⬆",
  },
  {
    number: "03",
    title: "Build Responsibly",
    description:
      "Every model we train, every feature we ship, every policy we set is evaluated through an ethical lens. We move fast, but never recklessly.",
    icon: "⚖",
  },
  {
    number: "04",
    title: "Foster Curiosity",
    description:
      "We believe the most important thing AI can do is make people more curious about the world — not less. Merlows encourages questions, not just answers.",
    icon: "✦",
  },
];

const goals = [
  { year: "2024", milestone: "Reach 5M active users across 100+ countries" },
  { year: "2025", milestone: "Launch Merlows for Education in 500 schools globally" },
  { year: "2026", milestone: "Deploy multilingual support for 50 languages" },
  { year: "2027", milestone: "Open-source core reasoning modules for research community" },
];

const impactAreas = [
  {
    title: "Education",
    description:
      "Helping students understand complex subjects with personalized explanations, practice problems, and instant feedback.",
    stat: "1.2M students",
    color: "from-purple-600 to-indigo-600",
  },
  {
    title: "Healthcare",
    description:
      "Supporting medical professionals with research summaries, clinical documentation, and evidence-based insights.",
    stat: "40K practitioners",
    color: "from-indigo-600 to-cyan-600",
  },
  {
    title: "Small Business",
    description:
      "Empowering entrepreneurs with AI-powered writing, market research, and operational guidance.",
    stat: "320K businesses",
    color: "from-cyan-600 to-teal-600",
  },
  {
    title: "Creative Work",
    description:
      "Partnering with writers, designers, and artists to amplify creative output without replacing the human voice.",
    stat: "600K creators",
    color: "from-violet-600 to-purple-600",
  },
];

export default function MissionPage() {
  return (
    <div className="pt-16">
      {/* Hero */}
      <section className="hero-bg section-padding text-center">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-purple-700/40 bg-purple-900/20 text-purple-300 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            Our Mission
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
            Intelligence for{" "}
            <span className="gradient-text">every human</span>,<br />
            not just a few
          </h1>
          <p className="text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto">
            We exist to close the gap between the people who have access to powerful AI tools and
            the rest of the world. Our mission is to make advanced intelligence a universal right,
            not a premium privilege.
          </p>
        </div>
      </section>

      {/* Vision statement */}
      <section className="section-padding bg-[#0d0d16]">
        <div className="max-w-4xl mx-auto">
          <div className="gradient-border p-8 md:p-12 text-center">
            <div className="text-purple-400 text-4xl mb-6">❝</div>
            <blockquote className="text-2xl md:text-3xl font-light text-slate-100 leading-relaxed mb-6">
              A world where every person — regardless of background, wealth, or technical
              expertise — has access to an intelligent partner that helps them think, learn, and
              create.
            </blockquote>
            <cite className="text-slate-500 text-sm not-italic">
              — The Merlows Vision Statement
            </cite>
          </div>
        </div>
      </section>

      {/* Four pillars */}
      <section className="section-padding max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-white mb-4">
            Four pillars of our{" "}
            <span className="gradient-text">mission</span>
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            These aren&apos;t aspirational bullet points. They are the framework for every decision
            we make at Merlows.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {pillars.map((pillar) => (
            <div
              key={pillar.number}
              className="glass-card p-8 flex gap-5 hover:border-purple-700/30 transition-all duration-300 group"
            >
              <div className="shrink-0">
                <div className="text-3xl mb-2 group-hover:scale-110 transition-transform duration-300">
                  {pillar.icon}
                </div>
                <div className="text-purple-700 font-black text-xs">{pillar.number}</div>
              </div>
              <div>
                <h3 className="text-white font-bold text-lg mb-2">{pillar.title}</h3>
                <p className="text-slate-400 leading-relaxed">{pillar.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Impact areas */}
      <section className="section-padding bg-[#0d0d16]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-white mb-4">
              Where we&apos;re making an{" "}
              <span className="gradient-text">impact</span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Merlows is active across industries where intelligent assistance creates the most
              meaningful change.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {impactAreas.map((area) => (
              <div
                key={area.title}
                className="gradient-border p-6 text-center hover:shadow-lg hover:shadow-purple-900/20 transition-all duration-300 group"
              >
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${area.color} mx-auto mb-4 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg`}
                >
                  <span className="text-white font-bold text-lg">
                    {area.title.charAt(0)}
                  </span>
                </div>
                <h3 className="text-white font-semibold mb-2">{area.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">{area.description}</p>
                <div className="text-purple-300 font-semibold text-sm">{area.stat}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roadmap */}
      <section className="section-padding max-w-4xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-white mb-4">
            Our <span className="gradient-text">roadmap</span>
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            We&apos;re transparent about where we&apos;re going. Here are the milestones we&apos;re
            working toward.
          </p>
        </div>

        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-purple-600 via-indigo-600 to-transparent hidden sm:block" />

          <div className="space-y-6">
            {goals.map((goal, i) => (
              <div key={goal.year} className="flex gap-6 items-start">
                <div className="shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-purple-900/40 z-10">
                  {goal.year.slice(2)}
                </div>
                <div className={`glass-card p-5 flex-1 ${i === 0 ? "border-purple-700/40" : ""}`}>
                  <div className="text-purple-300 font-semibold text-xs mb-1">{goal.year}</div>
                  <p className="text-slate-200">{goal.milestone}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-[#0d0d16]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Join our mission</h2>
          <p className="text-slate-400 mb-8">
            Every time you use Merlows, you&apos;re part of a movement to make intelligence
            universally accessible.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/ask-ai"
              className="px-8 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold hover:from-purple-500 hover:to-indigo-500 transition-all duration-200 shadow-lg shadow-purple-900/30"
            >
              Start Using Merlows
            </Link>
            <Link
              href="/about"
              className="px-8 py-3 rounded-xl border border-[#1e1e2e] text-slate-300 font-semibold hover:border-purple-700/40 hover:text-white transition-all duration-200"
            >
              Learn About Us
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
