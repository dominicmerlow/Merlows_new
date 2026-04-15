import Link from "next/link";

const footerLinks = {
  Platform: [
    { href: "/about", label: "About Us" },
    { href: "/mission", label: "Our Mission" },
    { href: "/how-to-use", label: "How to Use" },
  ],
  Product: [
    { href: "/ask-ai", label: "Ask AI" },
    { href: "/contact", label: "Contact Us" },
  ],
};

export default function Footer() {
  return (
    <footer className="border-t border-[#1e1e2e] bg-[#0a0a0f] mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4 group w-fit">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm">M</span>
              </div>
              <span className="text-xl font-bold gradient-text">Merlows</span>
            </Link>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
              Empowering people with advanced AI tools to think smarter, create faster, and build the future.
            </p>
            <div className="flex gap-3 mt-5">
              {[
                { label: "Twitter", icon: "𝕏" },
                { label: "GitHub", icon: "⌥" },
                { label: "LinkedIn", icon: "in" },
              ].map((s) => (
                <button
                  key={s.label}
                  aria-label={s.label}
                  className="w-9 h-9 rounded-lg bg-white/5 border border-[#1e1e2e] text-slate-400 hover:text-slate-100 hover:border-purple-700/40 text-xs font-bold transition-all duration-200 flex items-center justify-center"
                >
                  {s.icon}
                </button>
              ))}
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([section, links]) => (
            <div key={section}>
              <h4 className="text-slate-100 font-semibold text-sm mb-4">{section}</h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-slate-400 text-sm hover:text-purple-300 transition-colors duration-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-[#1e1e2e] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-slate-500 text-xs">
            © {new Date().getFullYear()} Merlows. All rights reserved.
          </p>
          <p className="text-slate-600 text-xs">
            Built with intelligence, powered by purpose.
          </p>
        </div>
      </div>
    </footer>
  );
}
