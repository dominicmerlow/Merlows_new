"use client";

import { useState, useRef, useEffect } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

const SUGGESTED_PROMPTS = [
  "Explain quantum computing in simple terms",
  "Help me write a professional email",
  "What are the pros and cons of solar energy?",
  "Review my business idea for a sustainable fashion brand",
  "Summarize the history of the internet",
  "Help me brainstorm names for a new app",
];

const DEMO_RESPONSES: Record<string, string> = {
  default:
    "That's a great question! As Merlows AI, I'm designed to help you think through complex topics, draft content, analyse ideas, and much more.\n\nTo get the most out of our conversation, feel free to give me more context about what you're working on. I can adapt my responses to your specific needs — whether you want a brief summary, a deep dive, or a different perspective.\n\nWhat would you like to explore further?",
};

function getSimulatedResponse(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("quantum")) {
    return "**Quantum computing** in simple terms:\n\nA regular computer uses bits — tiny switches that are either 0 or 1. A quantum computer uses **qubits**, which can be 0, 1, *or both at the same time* (this is called superposition).\n\nThis allows quantum computers to process many possibilities simultaneously, making them exponentially faster for specific problems like:\n- Breaking encryption (and creating better ones)\n- Drug discovery and molecular simulation\n- Financial modeling\n- Optimization problems\n\nThink of it like this: a classical computer tries every path in a maze one at a time. A quantum computer explores all paths simultaneously.\n\nWe're still in the early days — quantum computers aren't yet better than classical ones for most everyday tasks. But they will reshape certain industries within the next decade.";
  }

  if (lower.includes("email")) {
    return "Here's a professional email template you can customize:\n\n---\n\n**Subject:** [Clear, specific subject line]\n\nDear [Name / Hi if informal],\n\nI hope this message finds you well. I'm reaching out regarding [topic/purpose in one sentence].\n\n[Body paragraph: context, request, or update — keep it concise and specific]\n\n[Optional: call to action or next step]\n\nPlease don't hesitate to reach out if you have any questions.\n\nBest regards,  \n[Your name]  \n[Title, if relevant]\n\n---\n\nWant me to draft a specific version? Just tell me:\n1. Who you're writing to\n2. What the email is about\n3. The desired tone (formal, friendly, urgent)";
  }

  if (lower.includes("solar")) {
    return "**Solar Energy — Pros & Cons**\n\n**✅ Pros:**\n- Clean, renewable, zero emissions during operation\n- Significantly reduces electricity bills long-term\n- Low maintenance after installation\n- Energy independence — less reliance on the grid\n- Prices have dropped ~90% in the past 15 years\n\n**❌ Cons:**\n- High upfront installation cost (though financing options exist)\n- Dependent on sunlight — less effective in cloudy regions or at night\n- Requires significant roof space or land\n- Battery storage for off-grid use adds cost\n- Manufacturing panels has some environmental footprint\n\n**Bottom line:** Solar is increasingly cost-effective for homeowners and businesses in sunny regions. With battery storage, it becomes a viable primary energy source. Government incentives in many countries significantly offset the initial investment.\n\nWould you like specific data for your region or a cost-benefit analysis?";
  }

  if (lower.includes("brainstorm") || lower.includes("name")) {
    return "Here are some app name ideas across different styles:\n\n**Clean & Minimal:**\n- Noma, Velo, Flux, Pith, Luma\n\n**Descriptive & Memorable:**\n- Streamly, Taproot, Brightpath, Claro\n\n**Playful & Catchy:**\n- Zippity, Woosh, Sprout, Glimmer\n\n**Premium / Professional:**\n- Meridian, Apex, Vantage, Cipher\n\n**Tips for choosing:**\n1. Check domain availability (.com, .io, .app)\n2. Make sure it's easy to spell and pronounce\n3. Verify no trademark conflicts\n4. Test it with 5-10 potential users\n\nTell me more about the app's purpose and I can generate a more targeted list!";
  }

  return DEMO_RESPONSES.default;
}

export default function AskAIPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! I'm Merlows AI. Ask me anything — I can help with writing, research, analysis, brainstorming, coding, and much more.\n\nWhat's on your mind today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    // Simulate AI response delay
    await new Promise((r) => setTimeout(r, 900 + Math.random() * 600));

    const response = getSimulatedResponse(text);
    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: response,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, assistantMsg]);
    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const formatContent = (content: string) => {
    return content
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/\n/g, "<br />");
  };

  return (
    <div className="pt-16 flex flex-col min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <div className="border-b border-[#1e1e2e] bg-[#0a0a0f]/90 backdrop-blur-xl sticky top-16 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-900/40">
              <span className="text-white text-sm font-bold">M</span>
            </div>
            <div>
              <h1 className="text-white font-semibold text-sm">Merlows AI</h1>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-400 text-xs">Online</span>
              </div>
            </div>
          </div>
          <button
            onClick={() =>
              setMessages([
                {
                  id: "welcome-new",
                  role: "assistant",
                  content:
                    "Hi! I'm Merlows AI. Ask me anything — I can help with writing, research, analysis, brainstorming, coding, and much more.\n\nWhat's on your mind today?",
                  timestamp: new Date(),
                },
              ])
            }
            className="text-xs text-slate-500 hover:text-slate-300 border border-[#1e1e2e] hover:border-purple-700/40 px-3 py-1.5 rounded-lg transition-all duration-200"
          >
            New chat
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {/* Suggested prompts — shown when only welcome message exists */}
          {messages.length === 1 && (
            <div className="pt-4">
              <p className="text-slate-500 text-xs font-medium mb-3 text-center">Try asking about…</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="text-left text-sm text-slate-400 hover:text-slate-200 glass-card px-4 py-3 rounded-xl hover:border-purple-700/30 transition-all duration-200 group"
                  >
                    <span className="text-purple-500 mr-2 group-hover:text-purple-400">→</span>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              {/* Avatar */}
              <div
                className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-lg ${
                  msg.role === "assistant"
                    ? "bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-purple-900/40"
                    : "bg-gradient-to-br from-slate-700 to-slate-600 text-slate-300"
                }`}
              >
                {msg.role === "assistant" ? "M" : "U"}
              </div>

              {/* Bubble */}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded-tr-sm"
                    : "glass-card text-slate-200 rounded-tl-sm"
                }`}
              >
                <div
                  dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }}
                  className="whitespace-pre-wrap"
                />
                <div
                  className={`text-xs mt-2 ${
                    msg.role === "user" ? "text-purple-200/60" : "text-slate-600"
                  }`}
                >
                  {msg.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-lg shadow-purple-900/40">
                M
              </div>
              <div className="glass-card rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-purple-400 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="sticky bottom-0 bg-[#0a0a0f]/95 backdrop-blur-xl border-t border-[#1e1e2e]">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="relative glass-card rounded-2xl flex items-end gap-3 px-4 py-3 focus-within:border-purple-700/40 transition-all duration-200">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything… (Press Enter to send, Shift+Enter for new line)"
              className="flex-1 bg-transparent text-slate-200 placeholder-slate-600 text-sm resize-none max-h-36 min-h-[24px] focus:outline-none leading-relaxed"
              rows={1}
              disabled={isLoading}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white disabled:opacity-30 disabled:cursor-not-allowed hover:from-purple-500 hover:to-indigo-500 transition-all duration-200 shadow-lg shadow-purple-900/30"
              aria-label="Send message"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19V5m0 0l-7 7m7-7l7 7"
                />
              </svg>
            </button>
          </div>
          <p className="text-center text-slate-700 text-xs mt-2">
            Merlows may produce inaccurate information. Verify critical facts independently.
          </p>
        </div>
      </div>
    </div>
  );
}
