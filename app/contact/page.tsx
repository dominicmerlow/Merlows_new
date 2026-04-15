"use client";

import { useState } from "react";
import Link from "next/link";

const contactChannels = [
  {
    icon: "✉",
    title: "Email Support",
    description: "For account issues, billing questions, or general inquiries.",
    value: "support@merlows.ai",
    action: "mailto:support@merlows.ai",
    label: "Send email",
    color: "from-purple-600 to-indigo-600",
  },
  {
    icon: "💬",
    title: "Live Chat",
    description: "Talk with our team directly. Available Monday–Friday, 9am–6pm UTC.",
    value: "Available now",
    action: "/ask-ai",
    label: "Open chat",
    color: "from-indigo-600 to-cyan-600",
  },
  {
    icon: "📚",
    title: "Help Center",
    description: "Browse our full documentation, tutorials, and troubleshooting guides.",
    value: "docs.merlows.ai",
    action: "#",
    label: "Browse docs",
    color: "from-cyan-600 to-teal-600",
  },
];

const offices = [
  {
    city: "San Francisco",
    address: "548 Market St, Suite 12400\nSan Francisco, CA 94104",
    flag: "🇺🇸",
  },
  {
    city: "London",
    address: "1 Canada Square\nCanary Wharf, London E14 5AB",
    flag: "🇬🇧",
  },
  {
    city: "Singapore",
    address: "1 Raffles Place\n#26-01 Tower One, Singapore 048616",
    flag: "🇸🇬",
  },
];

type FormState = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

export default function ContactPage() {
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!form.name.trim()) newErrors.name = "Name is required";
    if (!form.email.trim()) newErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      newErrors.email = "Enter a valid email address";
    if (!form.subject.trim()) newErrors.subject = "Subject is required";
    if (!form.message.trim()) newErrors.message = "Message is required";
    else if (form.message.trim().length < 20)
      newErrors.message = "Message must be at least 20 characters";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 1500));
    setSubmitting(false);
    setSubmitted(true);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormState]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  return (
    <div className="pt-16">
      {/* Hero */}
      <section className="hero-bg section-padding text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-purple-700/40 bg-purple-900/20 text-purple-300 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            Contact Us
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight mb-6">
            We&apos;d love to{" "}
            <span className="gradient-text">hear from you</span>
          </h1>
          <p className="text-lg text-slate-400 leading-relaxed">
            Whether you have a question, a problem, feedback, or just want to say hello — we
            respond to every message, usually within one business day.
          </p>
        </div>
      </section>

      {/* Contact channels */}
      <section className="section-padding bg-[#0d0d16]">
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-3 gap-6">
            {contactChannels.map((channel) => (
              <div
                key={channel.title}
                className="gradient-border p-6 text-center hover:shadow-lg hover:shadow-purple-900/20 transition-all duration-300 group"
              >
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${channel.color} flex items-center justify-center text-xl mx-auto mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg`}
                >
                  {channel.icon}
                </div>
                <h3 className="text-white font-semibold mb-1">{channel.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                  {channel.description}
                </p>
                <div className="text-purple-300 text-xs font-medium mb-3">{channel.value}</div>
                <Link
                  href={channel.action}
                  className="inline-block text-sm text-slate-300 hover:text-white border border-[#1e1e2e] hover:border-purple-700/40 px-4 py-2 rounded-lg transition-all duration-200"
                >
                  {channel.label} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact form + offices */}
      <section className="section-padding max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-5 gap-12">
          {/* Form */}
          <div className="lg:col-span-3">
            <h2 className="text-2xl font-bold text-white mb-2">Send us a message</h2>
            <p className="text-slate-400 text-sm mb-8">
              Fill out the form and we&apos;ll get back to you within 24 hours.
            </p>

            {submitted ? (
              <div className="glass-card p-10 text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center mx-auto mb-5 text-2xl shadow-lg shadow-emerald-900/40">
                  ✓
                </div>
                <h3 className="text-white font-bold text-xl mb-2">Message sent!</h3>
                <p className="text-slate-400 mb-6">
                  Thanks for reaching out, {form.name.split(" ")[0]}. We&apos;ll reply to{" "}
                  <span className="text-purple-300">{form.email}</span> within one business day.
                </p>
                <button
                  onClick={() => {
                    setSubmitted(false);
                    setForm({ name: "", email: "", subject: "", message: "" });
                  }}
                  className="text-sm text-purple-400 hover:text-purple-300 underline underline-offset-2 transition-colors"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <div className="grid sm:grid-cols-2 gap-5">
                  {/* Name */}
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-1.5">
                      Full name <span className="text-purple-400">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Jane Smith"
                      className={`w-full bg-[#12121a] border ${
                        errors.name ? "border-red-500/60" : "border-[#1e1e2e]"
                      } rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 text-sm transition-all duration-200`}
                    />
                    {errors.name && (
                      <p className="text-red-400 text-xs mt-1">{errors.name}</p>
                    )}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-1.5">
                      Email address <span className="text-purple-400">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="jane@example.com"
                      className={`w-full bg-[#12121a] border ${
                        errors.email ? "border-red-500/60" : "border-[#1e1e2e]"
                      } rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 text-sm transition-all duration-200`}
                    />
                    {errors.email && (
                      <p className="text-red-400 text-xs mt-1">{errors.email}</p>
                    )}
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">
                    Subject <span className="text-purple-400">*</span>
                  </label>
                  <select
                    name="subject"
                    value={form.subject}
                    onChange={handleChange}
                    className={`w-full bg-[#12121a] border ${
                      errors.subject ? "border-red-500/60" : "border-[#1e1e2e]"
                    } rounded-xl px-4 py-3 text-sm transition-all duration-200 ${
                      form.subject ? "text-slate-200" : "text-slate-600"
                    }`}
                  >
                    <option value="" disabled>
                      Select a topic
                    </option>
                    <option value="general">General Inquiry</option>
                    <option value="support">Technical Support</option>
                    <option value="billing">Billing & Pricing</option>
                    <option value="partnership">Partnership & Press</option>
                    <option value="feedback">Product Feedback</option>
                    <option value="other">Other</option>
                  </select>
                  {errors.subject && (
                    <p className="text-red-400 text-xs mt-1">{errors.subject}</p>
                  )}
                </div>

                {/* Message */}
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">
                    Message <span className="text-purple-400">*</span>
                  </label>
                  <textarea
                    name="message"
                    value={form.message}
                    onChange={handleChange}
                    placeholder="Tell us what's on your mind…"
                    rows={6}
                    className={`w-full bg-[#12121a] border ${
                      errors.message ? "border-red-500/60" : "border-[#1e1e2e]"
                    } rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 text-sm resize-none transition-all duration-200`}
                  />
                  <div className="flex justify-between items-center mt-1">
                    {errors.message ? (
                      <p className="text-red-400 text-xs">{errors.message}</p>
                    ) : (
                      <span />
                    )}
                    <span className="text-slate-600 text-xs">
                      {form.message.length} characters
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold hover:from-purple-500 hover:to-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-purple-900/30 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8H4z"
                        />
                      </svg>
                      Sending…
                    </>
                  ) : (
                    "Send Message"
                  )}
                </button>

                <p className="text-slate-600 text-xs text-center">
                  By submitting this form you agree to our privacy policy. We never share your
                  details with third parties.
                </p>
              </form>
            )}
          </div>

          {/* Offices + extra info */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Our offices</h2>
              <p className="text-slate-400 text-sm mb-6">
                We&apos;re a remote-first company with hubs in three cities.
              </p>
              <div className="space-y-4">
                {offices.map((office) => (
                  <div
                    key={office.city}
                    className="glass-card p-5 flex gap-4 items-start hover:border-purple-700/30 transition-all duration-300"
                  >
                    <div className="text-2xl">{office.flag}</div>
                    <div>
                      <div className="text-white font-semibold text-sm mb-0.5">
                        {office.city}
                      </div>
                      <div className="text-slate-400 text-xs whitespace-pre-line leading-relaxed">
                        {office.address}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Response time */}
            <div className="gradient-border p-5">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                <span className="text-emerald-400">●</span> Response times
              </h3>
              <div className="space-y-2 text-sm">
                {[
                  { type: "General inquiries", time: "Within 24 hours" },
                  { type: "Technical support", time: "Within 4 hours" },
                  { type: "Billing issues", time: "Within 2 hours" },
                  { type: "Partnerships", time: "Within 48 hours" },
                ].map((item) => (
                  <div key={item.type} className="flex justify-between items-center">
                    <span className="text-slate-400">{item.type}</span>
                    <span className="text-purple-300 font-medium text-xs">{item.time}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick help */}
            <div className="glass-card p-5">
              <h3 className="text-white font-semibold mb-3">Quick help</h3>
              <p className="text-slate-400 text-sm mb-4">
                For instant answers, try asking Merlows AI directly.
              </p>
              <Link
                href="/ask-ai"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-medium hover:from-purple-500 hover:to-indigo-500 transition-all duration-200 w-full justify-center shadow-lg shadow-purple-900/30"
              >
                Open Ask AI →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
