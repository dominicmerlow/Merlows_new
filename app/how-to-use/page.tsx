import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How to Use – Merlows",
  description:
    "Get started with Merlows in minutes. A step-by-step guide to using AI for writing, research, analysis, and more.",
};

const steps = [
  {
    step: 1,
    title: "Create your free account",
    description:
      "Sign up with your email or Google account. No credit card required. You get unlimited access to core features immediately.",
    tip: "Your conversation history syncs across all devices automatically.",
  },
  {
    step: 2,
    title: "Choose your use case",
    description:
      "Tell Merlows what you&apos;re working on — writing, research, brainstorming, code review, or just exploring ideas. Providing context leads to much better results.",
    tip: "The more specific you are about your goal, the better Merlows can help.",
  },
  {
    step: 3,
    title: "Start the conversation",
    description:
      "Type your question or prompt naturally. You don&apos;t need special commands or syntax. Merlows understands plain language and context across the whole conversation.",
    tip: "You can paste documents, code, or data directly into the chat.",
  },
  {
    step: 4,
    title: "Refine and iterate",
    description:
      "Follow up, ask for changes, request different formats, or push back if something isn&apos;t right. Merlows remembers the full conversation and adapts continuously.",
    tip: "Use phrases like \"make it shorter\", \"give me a different angle\", or \"explain that more simply\".",
  },
];

const useCases = [
  {
    category: "Writing & Editing",
    icon: "✍",
    examples: [
      "Draft blog posts, reports, and emails",
      "Edit for tone, clarity, and grammar",
      "Rewrite content for different audiences",
      "Generate headlines and summaries",
    ],
    color: "from-purple-600 to-indigo-600",
  },
  {
    category: "Research & Analysis",
    icon: "🔍",
    examples: [
      "Summarize long documents quickly",
      "Compare options and trade-offs",
      "Identify patterns in data",
      "Ask follow-up questions on any topic",
    ],
    color: "from-indigo-600 to-cyan-600",
  },
  {
    category: "Code & Technical",
    icon: "⌨",
    examples: [
      "Debug and explain code",
      "Generate boilerplate and snippets",
      "Review pull requests",
      "Translate between programming languages",
    ],
    color: "from-cyan-600 to-teal-600",
  },
  {
    category: "Brainstorming",
    icon: "💡",
    examples: [
      "Explore ideas without judgment",
      "Generate options and alternatives",
      "Challenge assumptions and find gaps",
      "Build on half-formed thoughts",
    ],
    color: "from-violet-600 to-purple-600",
  },
];

const tips = [
  {
    icon: "◈",
    title: "Be specific about format",
    body: "Tell Merlows how you want the response structured: \"as bullet points\", \"in a table\", \"in under 100 words\", \"with code examples\".",
  },
  {
    icon: "◇",
    title: "Give context upfront",
    body: "Briefly explain who you are and what you're working on. \"I'm a high school teacher writing a quiz about photosynthesis\" gets better results than just asking the question.",
  },
  {
    icon: "✦",
    title: "Iterate openly",
    body: "Don't settle for the first response. Say \"that's close but too formal\" or \"add more data-driven examples\". Refinement is part of the process.",
  },
  {
    icon: "⬡",
    title: "Use it as a thinking partner",
    body: "Merlows excels at helping you think, not just giving answers. Ask it to steelman your argument, find weaknesses in your plan, or play devil's advocate.",
  },
];

export default function HowToUsePage() {
  return (
    <div className="pt-16">
      {/* Hero */}
      <section className="hero-bg section-padding text-center">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-purple-700/40 bg-purple-900/20 text-purple-300 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            Getting Started
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
            Up and running in{" "}
            <span className="gradient-text">under 2 minutes</span>
          </h1>
          <p className="text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto">
            Merlows is designed to feel natural from your very first message. No tutorials required
            — but here&apos;s everything you need to know to get the most out of it.
          </p>
          <div className="mt-8">
            <Link
              href="/ask-ai"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold hover:from-purple-500 hover:to-indigo-500 transition-all duration-200 shadow-lg shadow-purple-900/30"
            >
              Open Ask AI
              <span>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Step-by-step */}
      <section className="section-padding max-w-4xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-white mb-4">
            Four steps to get{" "}
            <span className="gradient-text">started</span>
          </h2>
        </div>

        <div className="space-y-8">
          {steps.map((step, index) => (
            <div key={step.step} className="flex gap-6 items-start group">
              {/* Step number */}
              <div className="shrink-0 flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-purple-900/40 group-hover:shadow-purple-700/40 transition-all duration-300">
                  {step.step}
                </div>
                {index < steps.length - 1 && (
                  <div className="w-px flex-1 bg-gradient-to-b from-purple-700/40 to-transparent mt-2 min-h-8" />
                )}
              </div>

              {/* Content */}
              <div className="glass-card p-6 flex-1 group-hover:border-purple-700/30 transition-all duration-300 mb-2">
                <h3 className="text-white font-bold text-lg mb-2">{step.title}</h3>
                <p
                  className="text-slate-400 leading-relaxed mb-4"
                  dangerouslySetInnerHTML={{ __html: step.description }}
                />
                <div className="flex items-start gap-2 bg-purple-900/20 border border-purple-800/30 rounded-lg px-4 py-3">
                  <span className="text-purple-400 text-sm shrink-0">💡</span>
                  <p className="text-purple-200 text-sm">{step.tip}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Use cases */}
      <section className="section-padding bg-[#0d0d16]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-white mb-4">
              What can you use Merlows{" "}
              <span className="gradient-text">for?</span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              From creative writing to technical deep-dives, Merlows adapts to virtually any task.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {useCases.map((uc) => (
              <div
                key={uc.category}
                className="gradient-border p-6 hover:shadow-lg hover:shadow-purple-900/20 transition-all duration-300 group"
              >
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${uc.color} flex items-center justify-center text-xl mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg`}
                >
                  {uc.icon}
                </div>
                <h3 className="text-white font-semibold mb-3">{uc.category}</h3>
                <ul className="space-y-1.5">
                  {uc.examples.map((ex) => (
                    <li key={ex} className="flex items-start gap-2 text-sm text-slate-400">
                      <span className="text-purple-500 mt-0.5 shrink-0">›</span>
                      {ex}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pro tips */}
      <section className="section-padding max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-white mb-4">
            Pro tips for{" "}
            <span className="gradient-text">better results</span>
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            These simple habits will dramatically improve your experience with Merlows.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {tips.map((tip) => (
            <div
              key={tip.title}
              className="glass-card p-6 flex gap-4 hover:border-purple-700/30 transition-all duration-300 group"
            >
              <div className="text-2xl text-purple-400 shrink-0 group-hover:scale-110 transition-transform duration-300">
                {tip.icon}
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">{tip.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{tip.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ quick hits */}
      <section className="section-padding bg-[#0d0d16]">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-white mb-4">
              Common <span className="gradient-text">questions</span>
            </h2>
          </div>

          <div className="space-y-4">
            {[
              {
                q: "Is there a limit to how much I can use Merlows?",
                a: "The free plan includes generous daily usage. Pro plans offer unlimited access with priority speed and access to advanced features.",
              },
              {
                q: "Can Merlows remember things between sessions?",
                a: "Yes — with memory enabled, Merlows can recall your preferences, projects, and context across conversations.",
              },
              {
                q: "How accurate are the responses?",
                a: "Merlows is highly capable but not infallible. Always verify critical information, especially for medical, legal, or financial decisions.",
              },
              {
                q: "Is my data private?",
                a: "We never sell your data. Your conversations are encrypted and are not used to train models without explicit opt-in.",
              },
            ].map((faq) => (
              <div key={faq.q} className="glass-card p-5 hover:border-purple-700/30 transition-all duration-300">
                <h3 className="text-white font-semibold mb-2">{faq.q}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to try it yourself?
          </h2>
          <p className="text-slate-400 mb-8">
            The best way to learn Merlows is to use it. Open Ask AI and start with
            whatever&apos;s on your mind right now.
          </p>
          <Link
            href="/ask-ai"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold hover:from-purple-500 hover:to-indigo-500 transition-all duration-200 shadow-lg shadow-purple-900/30"
          >
            Open Ask AI
            <span>→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
