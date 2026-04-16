<?php
/**
 * Template Name: Ask AI Page
 * Accessible at: /ask-ai/
 */
get_header();

// Get customizer settings
$hero_title    = get_theme_mod('mlws_askai_hero_title',    'Ask Merlows AI');
$hero_subtitle = get_theme_mod('mlws_askai_hero_subtitle', 'Your research companion for Middle East diplomacy. Explore the Cyrus Accord, Abraham Accords, and regional analysis through our AI assistant.');
$hero_badge    = get_theme_mod('mlws_askai_hero_badge',    'Research Assistant v1.0');
?>

<style>
/* ── Ask AI Masthead ───────────────────────────────────────────── */
.askai-masthead {
    background: var(--primary-color);
    padding: 80px 0 64px;
    color: white;
    position: relative;
    overflow: hidden;
}
.askai-masthead::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: repeating-linear-gradient(
        90deg,
        rgba(255,255,255,0.04) 0px,
        rgba(255,255,255,0.04) 1px,
        transparent 1px,
        transparent 80px
    );
    pointer-events: none;
}
.askai-masthead::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 4px;
    background: linear-gradient(90deg, transparent, var(--accent-color), transparent);
}
.askai-masthead__inner {
    position: relative;
    z-index: 2;
}
.askai-masthead__eyebrow {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
}
.askai-masthead__eyebrow-line {
    height: 2px;
    width: 40px;
    background: var(--accent-color);
    flex-shrink: 0;
}
.askai-masthead__eyebrow-text {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2.5px;
    color: var(--accent-color);
    font-family: var(--font-main);
}
.askai-masthead h1 {
    font-family: var(--font-heading);
    font-size: clamp(36px, 5vw, 60px);
    font-weight: 300;
    line-height: 1.1;
    margin: 0 0 20px;
    color: white;
}
.askai-masthead h1 em {
    font-style: italic;
    color: var(--accent-color);
}
.askai-masthead__rule {
    width: 80px;
    height: 3px;
    background: linear-gradient(90deg, var(--accent-color), transparent);
    margin-bottom: 20px;
}
.askai-masthead p {
    font-family: var(--font-main);
    font-size: 18px;
    color: rgba(255,255,255,0.78);
    max-width: 620px;
    line-height: 1.65;
    margin: 0 0 28px;
}
.askai-features {
    display: flex;
    gap: 32px;
    flex-wrap: wrap;
}
.askai-feature {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--font-main);
    font-size: 14px;
    color: rgba(255,255,255,0.7);
}

/* ── Chat Shell ────────────────────────────────────────────────── */
.askai-section {
    padding: 60px 0 80px;
    background: #F8FAFD;
}
.chat-main {
    background: white;
    border: 1px solid #E2E8F0;
    box-shadow: 0 4px 24px rgba(27,79,138,0.07);
    overflow: hidden;
}
.agent-profile {
    padding: 20px 28px;
    background: #F8FAFD;
    border-bottom: 1px solid #E2E8F0;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.profile-left {
    display: flex;
    align-items: center;
    gap: 14px;
}
.agent-avatar {
    width: 44px;
    height: 44px;
    background: var(--primary-color);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.agent-info h2 {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 700;
    color: #0F172A;
    margin: 0;
}
.agent-status {
    font-family: var(--font-main);
    font-size: 12px;
    color: #22C55E;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
}
.agent-status .status-dot {
    width: 6px;
    height: 6px;
    background: #22C55E;
    border-radius: 50%;
    animation: pulse-status 2s infinite;
}
@keyframes pulse-status { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

.save-chat-btn {
    background: white;
    color: #475569;
    border: 1px solid #E2E8F0;
    padding: 8px 16px;
    font-family: var(--font-main);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
}
.save-chat-btn:hover {
    border-color: var(--primary-color);
    color: var(--primary-color);
}

.chat-messages {
    padding: 28px;
    min-height: 450px;
    max-height: 560px;
    overflow-y: auto;
}
.msg {
    margin-bottom: 18px;
    display: flex;
    gap: 10px;
}
.msg.user { flex-direction: row-reverse; }
.msg .msg-avatar {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.msg .msg-bubble {
    max-width: 80%;
    padding: 14px 18px;
    font-family: var(--font-main);
    font-size: 15px;
    line-height: 1.65;
    white-space: pre-wrap;
}
.msg.bot .msg-avatar { background: var(--primary-color); }
.msg.bot .msg-bubble { background: #F8FAFD; border: 1px solid #E2E8F0; color: #1E293B; }
.msg.user .msg-avatar { background: #0F172A; }
.msg.user .msg-bubble { background: #0F172A; color: white; }

.chat-input-bar {
    padding: 16px 28px;
    border-top: 1px solid #E2E8F0;
    display: flex;
    gap: 12px;
    background: white;
}
.chat-input {
    flex: 1;
    padding: 14px 18px;
    border: 2px solid #E2E8F0;
    font-family: var(--font-main);
    font-size: 15px;
    outline: none;
    transition: border-color 0.2s;
    color: #0F172A;
}
.chat-input:focus { border-color: var(--primary-color); }
.chat-input::placeholder { color: #94A3B8; }
.chat-send {
    padding: 14px 28px;
    background: var(--primary-color);
    color: white;
    border: none;
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
    transition: background 0.2s;
    white-space: nowrap;
}
.chat-send:hover { background: var(--primary-hover); }
.chat-send:disabled { opacity: 0.6; cursor: not-allowed; }

.typing-indicator { display: flex; gap: 4px; padding: 5px 0; }
.typing-dot { width: 6px; height: 6px; background: #94A3B8; border-radius: 50%; animation: typing 1.4s infinite ease-in-out both; }
.typing-dot:nth-child(1) { animation-delay: -0.32s; }
.typing-dot:nth-child(2) { animation-delay: -0.16s; }
@keyframes typing { 0%,80%,100% { transform: scale(0); } 40% { transform: scale(1); } }

/* ── Disclaimer ────────────────────────────────────────────────── */
.askai-disclaimer {
    max-width: 900px;
    margin: 32px auto 0;
    padding: 20px 24px;
    background: white;
    border: 1px solid #E2E8F0;
    border-left: 4px solid var(--accent-color);
    font-family: var(--font-main);
    font-size: 13px;
    color: #64748B;
    line-height: 1.6;
}
.askai-disclaimer strong { color: #1E293B; }

/* ── Sibling Tools ─────────────────────────────────────────────── */
.askai-tools {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
    max-width: 900px;
    margin: 32px auto 0;
}
.askai-tool-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px;
    background: white;
    border: 1px solid #E2E8F0;
    text-decoration: none;
    color: inherit;
    transition: all 0.2s;
}
.askai-tool-card:hover {
    border-color: var(--primary-color);
    background: rgba(27,79,138,0.03);
    transform: translateX(4px);
}
.askai-tool-icon {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.askai-tool-card h4 {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 700;
    color: #0F172A;
    margin: 0 0 4px;
}
.askai-tool-card p {
    font-family: var(--font-main);
    font-size: 13px;
    color: #64748B;
    margin: 0;
    line-height: 1.4;
}

@media (max-width: 768px) {
    .askai-masthead { padding: 50px 0 40px; }
    .askai-features { flex-direction: column; gap: 16px; }
    .askai-tools { grid-template-columns: 1fr; }
    .chat-messages { padding: 16px; min-height: 320px; }
    .chat-input-bar { padding: 12px 16px; flex-direction: column; }
    .chat-send { width: 100%; }
}
</style>

<!-- Masthead -->
<section class="askai-masthead">
    <div class="container">
        <div class="askai-masthead__inner">
            <div class="askai-masthead__eyebrow">
                <span class="askai-masthead__eyebrow-line"></span>
                <span class="askai-masthead__eyebrow-text">Merlows AI Research Assistant</span>
                <span class="askai-masthead__eyebrow-line"></span>
            </div>
            <h1><?php echo esc_html( $hero_title ); ?></h1>
            <div class="askai-masthead__rule"></div>
            <p><?php echo esc_html( $hero_subtitle ); ?></p>
            <div class="askai-features">
                <div class="askai-feature">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="<?php echo esc_attr( '#D4AF37' ); ?>" stroke-width="2"><path d="M9 12l2 2 4-4"/><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/></svg>
                    Grounded in Merlows editorial sources
                </div>
                <div class="askai-feature">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="<?php echo esc_attr( '#D4AF37' ); ?>" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                    Diplomatic & regional context
                </div>
                <div class="askai-feature">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="<?php echo esc_attr( '#D4AF37' ); ?>" stroke-width="2"><path d="M17 21v-8H7v8M7 3v5h8M5 3h11l5 5v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>
                    Save conversations to dashboard
                </div>
            </div>
        </div>
    </div>
</section>

<!-- Chat Interface -->
<section class="askai-section">
    <div class="container" style="max-width: 900px;">

        <main class="chat-main">
            <div class="agent-profile">
                <div class="profile-left">
                    <div class="agent-avatar">
                        <svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:none;stroke:white;stroke-width:2;">
                            <circle cx="12" cy="8" r="3"/><path d="M17 21H7a2 2 0 01-2-2v-1a5 5 0 0110 0v1a2 2 0 01-2 2z"/><path d="M12 11v3"/><circle cx="12" cy="15" r="0.5" fill="white" stroke="none"/>
                        </svg>
                    </div>
                    <div class="agent-info">
                        <h2>Merlows AI</h2>
                        <div class="agent-status">
                            <span class="status-dot"></span>
                            <?php echo esc_html( $hero_badge ); ?>
                        </div>
                    </div>
                </div>
                <?php if ( is_user_logged_in() ) : ?>
                <button type="button" class="save-chat-btn" id="save-chat-trigger">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-8H7v8M7 3v5h8M5 3h11l5 5v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>
                    Save Chat
                </button>
                <?php endif; ?>
            </div>

            <div class="chat-messages" id="ibdi-chat-messages">
                <div class="msg bot">
                    <div class="msg-avatar">
                        <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:white;stroke-width:2;"><circle cx="12" cy="8" r="3"/><path d="M17 21H7a2 2 0 01-2-2v-1a5 5 0 0110 0v1a2 2 0 01-2 2z"/></svg>
                    </div>
                    <div class="msg-bubble">Welcome to Merlows AI. I can help you explore our diplomatic content library — ask me about the Cyrus Accord, Abraham Accords, Israel-Iran relations, or any regional analysis. What would you like to explore?</div>
                </div>
            </div>

            <div class="chat-input-bar">
                <input type="text" id="ibdi-chat-input" class="chat-input" placeholder="Ask about the Cyrus Accord, Abraham Accords, or regional diplomacy…">
                <button class="chat-send" id="ibdi-chat-send">Send</button>
            </div>
        </main>

        <!-- Disclaimer -->
        <div class="askai-disclaimer">
            <strong>Editorial note:</strong> Merlows AI synthesises content from our editorial library to support research and exploration. It may not reflect the most recent developments. For breaking news, consult the <a href="/breaking-news/" style="color: var(--primary-color); font-weight: 600;">latest dispatches</a>. Always verify critical information with primary sources.
        </div>

        <!-- Sibling Tools -->
        <div class="askai-tools">
            <a href="/dashboard/" class="askai-tool-card">
                <div class="askai-tool-icon" style="background: rgba(27,79,138,0.08);">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                </div>
                <div>
                    <h4>My Dashboard</h4>
                    <p>Access your saved chats, reading history, and personalised Merlows content.</p>
                </div>
            </a>
            <a href="/how-to-use/" class="askai-tool-card">
                <div class="askai-tool-icon" style="background: rgba(212,175,55,0.12);">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                </div>
                <div>
                    <h4>How to Use Merlows</h4>
                    <p>A guide to navigating dispatches, the archive, and contributing articles.</p>
                </div>
            </a>
        </div>

    </div>
</section>

<!-- Chat JS — fetch endpoints preserved verbatim -->
<script>
document.addEventListener('DOMContentLoaded', function() {
    var chatInput    = document.getElementById('ibdi-chat-input');
    var chatSend     = document.getElementById('ibdi-chat-send');
    var chatMessages = document.getElementById('ibdi-chat-messages');
    var saveBtn      = document.getElementById('save-chat-trigger');
    var messages     = [];

    function appendMessage(role, text) {
        var mdText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        var msgDiv = document.createElement('div');
        msgDiv.className = 'msg ' + (role === 'user' ? 'user' : 'bot');

        var avatarHtml = role === 'user'
            ? '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:white;stroke-width:2"><path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"/></svg>'
            : '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:white;stroke-width:2"><circle cx="12" cy="8" r="3"/><path d="M17 21H7a2 2 0 01-2-2v-1a5 5 0 0110 0v1a2 2 0 01-2 2z"/></svg>';

        msgDiv.innerHTML = '<div class="msg-avatar">' + avatarHtml + '</div><div class="msg-bubble">' + mdText + '</div>';
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        if (!text.includes('typing-indicator')) messages.push({role: role, content: text});
    }

    function sendMessage() {
        var text = chatInput.value.trim();
        if (!text) return;
        appendMessage('user', text);
        chatInput.value = '';

        var typingDiv = document.createElement('div');
        typingDiv.className = 'msg bot';
        typingDiv.id = 'ibdi-typing';
        typingDiv.innerHTML = '<div class="msg-avatar"><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:white;stroke-width:2"><circle cx="12" cy="8" r="3"/><path d="M17 21H7a2 2 0 01-2-2v-1a5 5 0 0110 0v1a2 2 0 01-2 2z"/></svg></div><div class="msg-bubble" style="background:transparent;border:none;padding:14px 18px;"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>';
        chatMessages.appendChild(typingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        chatSend.disabled = true;
        chatSend.style.opacity = '0.6';

        fetch('<?php echo home_url("/wp-json/ibd-health/v1/ai-chat"); ?>', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ messages: messages })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var el = document.getElementById('ibdi-typing');
            if (el) el.remove();
            chatSend.disabled = false;
            chatSend.style.opacity = '1';
            if (data.success && data.reply) appendMessage('model', data.reply);
            else appendMessage('model', "I'm having trouble connecting right now. Please try again.");
        })
        .catch(function() {
            var el = document.getElementById('ibdi-typing');
            if (el) el.remove();
            chatSend.disabled = false;
            chatSend.style.opacity = '1';
            appendMessage('model', "Network error. Please check your connection and try again.");
        });
    }

    if (chatSend) chatSend.addEventListener('click', sendMessage);
    if (chatInput) chatInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') sendMessage(); });

    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            if (messages.length === 0) { alert("No conversation to save yet."); return; }

            var dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            var chatName = prompt("Name this conversation:", "Merlows AI Chat - " + dateStr);
            if (chatName === null) return;
            if (chatName.trim() === '') chatName = "Merlows AI Chat - " + dateStr;

            saveBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg> Saving...';

            fetch('<?php echo home_url("/wp-json/ibd-health/v1/save-chat"); ?>', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'X-WP-Nonce': '<?php echo wp_create_nonce("wp_rest"); ?>'},
                body: JSON.stringify({ transcript: messages, title: chatName })
            })
            .then(function(r) { return r.json(); })
            .then(function(d) {
                if (d.success) {
                    saveBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Saved!';
                    setTimeout(function() { saveBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-8H7v8M7 3v5h8M5 3h11l5 5v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg> Save Chat'; }, 3000);
                } else {
                    saveBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-8H7v8M7 3v5h8M5 3h11l5 5v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg> Save Chat';
                }
            })
            .catch(function() { saveBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-8H7v8M7 3v5h8M5 3h11l5 5v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg> Save Chat'; });
        });
    }
});
</script>

<?php get_footer(); ?>
