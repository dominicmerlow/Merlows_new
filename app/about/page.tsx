import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Us – Merlows",
  description:
    "Learn about Merlows, our story, our team, and the values that drive everything we build.",
};

const values = [
  {
    icon: "✦",
    title: "Transparency First",
    description:
      "We believe AI should be explainable. Every answer Merlows gives can be traced, understood, and verified.",
  },
  {
    icon: "⬡",
    title: "Human-Centered Design",
    description:
      "Our tools are built for real people with real needs — not for hypothetical power users with unlimited time.",
  },
  {
    icon: "◈",
    title: "Continuous Learning",
    description:
      "We iterate relentlessly, informed by user feedback, emerging research, and our own curiosity.",
  },
  {
    icon: "◇",
    title: "Radical Accessibility",
    description:
      "Intelligence shouldn't be a luxury. We're committed to making AI affordable and usable for everyone.",
  },
];

const team = [
  {
    name: "Aria Chen",
    role: "Co-Founder & CEO",
    bio: "Former ML researcher at Stanford. Passionate about democratizing AI for everyday use.",
    initials: "AC",
    color: "from-purple-600 to-indigo-600",
  },
  {
    name: "Marcus Reid",
    role: "Co-Founder & CTO",
    bio: "10+ years building large-scale AI infrastructure. Previously led engineering at two unicorns.",
    initials: "MR",
    color: "from-indigo-600 to-cyan-600",
  },
  {
    name: "Leila Novak",
    role: "Head of Product",
    bio: "Obsessed with user experience. Believes great AI should feel like a conversation, not a command.",
    initials: "LN",
    color: "from-cyan-600 to-teal-600",
  },
  {
    name: "James Okafor",
    role: "Lead AI Engineer",
    bio: "PhD in NLP from MIT. Specializes in making models smaller, faster, and more capable.",
    initials: "JO",
    color: "from-violet-600 to-purple-600",
  },
];

export default function AboutPage() {
  return (
    <div className="pt-16">
      {/* Hero */}
      <section className="hero-bg section-padding text-center">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-purple-700/40 bg-purple-900/20 text-purple-300 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            Our Story
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
            We built Merlows because{" "}
            <span className="gradient-text">AI deserved better</span>
          </h1>
          <p className="text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto">
            Merlows started with a simple frustration: existing AI tools were either too complex,
            too expensive, or too generic. We set out to build something different — an intelligent
            assistant that actually understands context, respects nuance, and grows with you.
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="section-padding max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold text-white mb-5">
              From a late-night idea to a{" "}
              <span className="gradient-text">global platform</span>
            </h2>
            <div className="space-y-4 text-slate-400 leading-relaxed">
              <p>
                In 2022, our founders met at an AI research symposium in San Francisco. Over coffee
                and increasingly animated conversation, they realized they shared the same
                conviction: the next wave of AI shouldn&apos;t just be powerful — it should be
                genuinely useful for ordinary people.
              </p>
              <p>
                They quit their jobs, assembled a small team of brilliant engineers and designers,
                and spent six months in a tiny office testing ideas, throwing out bad ones, and
                obsessing over the ones that felt right.
              </p>
              <p>
                Merlows launched in early 2023, and within three months we had over 50,000 active
                users. Today, millions of people rely on Merlows daily for writing, research,
                analysis, creative work, and just thinking out loud.
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { value: "2M+", label: "Active Users" },
              { value: "50+", label: "Countries Reached" },
              { value: "99.9%", label: "Uptime" },
              { value: "4.9★", label: "Average Rating" },
            ].map((stat) => (
              <div key={stat.label} className="glass-card p-6 text-center">
                <div className="text-3xl font-extrabold gradient-text mb-1">{stat.value}</div>
                <div className="text-sm text-slate-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="section-padding bg-[#0d0d16]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-white mb-4">
              What we <span className="gradient-text">believe in</span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Our values aren&apos;t a marketing document — they&apos;re the principles we use to
              make decisions every single day.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((v) => (
              <div key={v.title} className="gradient-border p-6 hover:shadow-lg hover:shadow-purple-900/20 transition-all duration-300 group">
                <div className="text-2xl mb-4 text-purple-400 group-hover:scale-110 transition-transform duration-300">
                  {v.icon}
                </div>
                <h3 className="text-white font-semibold mb-2">{v.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{v.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="section-padding max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-white mb-4">
            Meet the <span className="gradient-text">team</span>
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            A small group of people with enormous ambition — united by the belief that AI can be
            both powerful and humane.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {team.map((member) => (
            <div
              key={member.name}
              className="glass-card p-6 text-center hover:border-purple-700/30 transition-all duration-300 group"
            >
              <div
                className={`w-16 h-16 rounded-full bg-gradient-to-br ${member.color} flex items-center justify-center mx-auto mb-4 text-white font-bold text-lg group-hover:scale-105 transition-transform duration-300 shadow-lg`}
              >
                {member.initials}
              </div>
              <h3 className="text-white font-semibold">{member.name}</h3>
              <p className="text-purple-400 text-xs font-medium mt-0.5 mb-3">{member.role}</p>
              <p className="text-slate-400 text-sm leading-relaxed">{member.bio}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-[#0d0d16]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to experience Merlows?
          </h2>
          <p className="text-slate-400 mb-8">
            Join millions of people who use Merlows every day to think clearer and work smarter.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/ask-ai"
              className="px-8 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold hover:from-purple-500 hover:to-indigo-500 transition-all duration-200 shadow-lg shadow-purple-900/30"
            >
              Try Ask AI
            </Link>
            <Link
              href="/contact"
              className="px-8 py-3 rounded-xl border border-[#1e1e2e] text-slate-300 font-semibold hover:border-purple-700/40 hover:text-white transition-all duration-200"
            >
              Get in Touch
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
