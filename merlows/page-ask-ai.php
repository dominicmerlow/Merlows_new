<?php
/**
 * Template Name: Ask AI Page
 * Child of Tools Hub — IBDi Clinical AI Assistant
 * Accessible at: /ask-ai/
 */
get_header();

// Get customizer settings
$hero_title = get_theme_mod('mlws_askai_hero_title', 'Ask IBDi');
$hero_subtitle = get_theme_mod('mlws_askai_hero_subtitle', 'Direct access to our IBD Research Centre. Ask anything about IBD, clinical nutrition, and gastrointestinal health.');
$hero_badge = get_theme_mod('mlws_askai_hero_badge', 'Clinical Assistant v1.0');
?>

<style>
/* ── Tool Hero (shared with sibling tool pages) ── */
.tool-hero {
    background: linear-gradient(135deg, #0F172A 0%, #8B1A1A 100%);
    padding: 80px 0 60px;
    color: white;
    position: relative;
    overflow: hidden;
}
.tool-hero::before {
    content: '';
    position: absolute;
    top: -80px;
    right: -80px;
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, rgba(27,79,138,0.2) 0%, transparent 70%);
    pointer-events: none;
}
.tool-hero h1 {
    font-family: 'Outfit', sans-serif;
    font-size: 44px;
    font-weight: 800;
    margin: 0 0 16px;
    letter-spacing: -0.5px;
}
.tool-hero p {
    font-size: 18px;
    color: rgba(255,255,255,0.8);
    max-width: 640px;
    line-height: 1.6;
    margin: 0 0 24px;
}
.tool-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(124,58,237,0.2);
    border: 1px solid rgba(124,58,237,0.4);
    border-radius: var(--radius-sm);
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #C4B5FD;
    margin-bottom: 20px;
}
.tool-features {
    display: flex;
    gap: 32px;
    margin-top: 32px;
    flex-wrap: wrap;
}
.tool-feature {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    color: rgba(255,255,255,0.7);
}

/* ── Chat Section ── */
.tool-embed-section {
    padding: 60px 0 80px;
    background: #F8FAFC;
}
.chat-main {
    background: white;
    border-radius: var(--radius-lg);
    box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    border: 1px solid #E2E8F0;
    overflow: hidden;
}
.agent-profile {
    padding: 20px 28px;
    background: #F8FAFC;
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
    background: #7C3AED;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
}
.agent-info h2 {
    font-family: 'Outfit', sans-serif;
    font-size: 15px;
    font-weight: 700;
    color: #0F172A;
    margin: 0;
}
.agent-status {
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
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
}
.save-chat-btn:hover {
    border-color: #7C3AED;
    color: #7C3AED;
}

.chat-messages {
    padding: 28px;
    min-height: 450px;
    max-height: 550px;
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
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.msg .msg-bubble {
    max-width: 80%;
    padding: 14px 18px;
    border-radius: var(--radius-md);
    font-size: 15px;
    line-height: 1.65;
    white-space: pre-wrap;
}
.msg.bot .msg-avatar { background: #7C3AED; }
.msg.bot .msg-bubble { background: #F8FAFC; border: 1px solid #E2E8F0; color: #1E293B; }
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
    border-radius: var(--radius-md);
    font-size: 15px;
    outline: none;
    transition: border-color 0.2s;
}
.chat-input:focus { border-color: #7C3AED; }
.chat-send {
    padding: 14px 28px;
    background: #7C3AED;
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
    transition: background 0.2s;
}
.chat-send:hover { background: #6D28D9; }

.typing-indicator { display: flex; gap: 4px; padding: 5px 0; }
.typing-dot { width: 6px; height: 6px; background: #94A3B8; border-radius: 50%; animation: typing 1.4s infinite ease-in-out both; }
.typing-dot:nth-child(1) { animation-delay: -0.32s; }
.typing-dot:nth-child(2) { animation-delay: -0.16s; }
@keyframes typing { 0%,80%,100% { transform: scale(0); } 40% { transform: scale(1); } }

/* Tool Disclaimer (shared) */
.tool-disclaimer {
    max-width: 800px;
    margin: 40px auto 0;
    padding: 24px;
    background: white;
    border: 1px solid #E2E8F0;
    border-radius: var(--radius-md);
    font-size: 13px;
    color: #64748B;
    line-height: 1.6;
}
.tool-disclaimer strong { color: #1E293B; }

/* Sibling Tools */
.sibling-tools {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
    max-width: 800px;
    margin: 40px auto 0;
}
.sibling-tool-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px;
    background: white;
    border: 1px solid #E2E8F0;
    border-radius: var(--radius-md);
    text-decoration: none;
    color: inherit;
    transition: all 0.2s;
}
.sibling-tool-card:hover {
    border-color: #1B4F8A;
    background: #F5E6A3;
    transform: translateX(4px);
}
.sibling-tool-icon {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.sibling-tool-card h4 { font-size: 15px; font-weight: 700; color: #0F172A; margin: 0 0 4px; }
.sibling-tool-card p { font-size: 13px; color: #64748B; margin: 0; line-height: 1.4; }

@media (max-width: 768px) {
    .tool-hero h1 { font-size: 28px; }
    .tool-hero { padding: 50px 0 40px; }
    .tool-features { flex-direction: column; gap: 16px; }
    .sibling-tools { grid-template-columns: 1fr; }
    .chat-messages { padding: 16px; }
    .chat-input-bar { padding: 12px 16px; }
}
</style>

<!-- Hero (matches Tools Hub child pages) -->
<section class="tool-hero">
    <div class="container">
        <div class="tool-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="12" rx="2"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/></svg>
            AI-Powered Clinical Tool
        </div>
        <h1><?php echo esc_html($hero_title); ?></h1>
        <p><?php echo esc_html($hero_subtitle); ?></p>
        <div class="tool-features">
            <div class="tool-feature">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C4B5FD" stroke-width="2"><path d="M9 12l2 2 4-4"/><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/></svg>
                Evidence-based responses
            </div>
            <div class="tool-feature">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C4B5FD" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                Peer-reviewed research
            </div>
            <div class="tool-feature">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C4B5FD" stroke-width="2"><path d="M17 21v-8H7v8M7 3v5h8M5 3h11l5 5v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>
                Save to dashboard
            </div>
        </div>
    </div>
</section>

<!-- Chat Interface -->
<section class="tool-embed-section">
    <div class="container" style="max-width: 900px;">
        <main class="chat-main">
            <div class="agent-profile">
                <div class="profile-left">
                    <div class="agent-avatar">
                        <svg viewBox="0 0 24 24" style="width: 22px; height: 22px; fill: none; stroke: white; stroke-width: 2;"><rect x="3" y="4" width="18" height="12" rx="2"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/><circle cx="9" cy="10" r="1" fill="white" stroke="none"/><circle cx="15" cy="10" r="1" fill="white" stroke="none"/></svg>
                    </div>
                    <div class="agent-info">
                        <h2>IBDi Clinical Intelligence</h2>
                        <div class="agent-status"><span class="status-dot"></span> <?php echo esc_html($hero_badge); ?></div>
                    </div>
                </div>
                <?php if (is_user_logged_in()): ?>
                <button type="button" class="save-chat-btn" id="save-chat-trigger">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-8H7v8M7 3v5h8M5 3h11l5 5v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>
                    Save Chat
                </button>
                <?php endif; ?>
            </div>

            <div class="chat-messages" id="ibdi-chat-messages">
                <div class="msg bot">
                    <div class="msg-avatar">
                        <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: none; stroke: white; stroke-width: 2;"><rect x="3" y="4" width="18" height="12" rx="2"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/></svg>
                    </div>
                    <div class="msg-bubble">Welcome to IBDi. I can help you explore our IBD content library and answer questions about inflammatory bowel disease, clinical nutrition, and gastrointestinal health. What would you like to know?</div>
                </div>
            </div>

            <div class="chat-input-bar">
                <input type="text" id="ibdi-chat-input" class="chat-input" placeholder="Ask IBDi a question...">
                <button class="chat-send" id="ibdi-chat-send">Send</button>
            </div>
        </main>

        <!-- Disclaimer -->
        <div class="tool-disclaimer">
            <strong>Medical Disclaimer:</strong> This AI tool is designed for IBD research synthesis and clinical nutrition analysis. It is not a substitute for professional medical advice, diagnosis, or treatment. Always verify information with peer-reviewed literature and consult with qualified health professionals.
        </div>

        <!-- Sibling Tools -->
        <div class="sibling-tools">
            <a href="/tools/blood-test-tracker/" class="sibling-tool-card">
                <div class="sibling-tool-icon" style="background: #FEF2F2;">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                </div>
                <div>
                    <h4>Blood Test Tracker</h4>
                    <p>Track inflammatory markers and nutritional levels over time.</p>
                </div>
            </a>
            <a href="/tools/malnutrition-calculator/" class="sibling-tool-card">
                <div class="sibling-tool-icon" style="background: #F5E6A3;">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1B4F8A" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                </div>
                <div>
                    <h4>Malnutrition Calculator</h4>
                    <p>Screen for nutritional risk using validated criteria.</p>
                </div>
            </a>
        </div>
    </div>
</section>

<!-- Chat JS (preserved from original) -->
<script>
document.addEventListener('DOMContentLoaded', function() {
    var chatInput = document.getElementById('ibdi-chat-input');
    var chatSend = document.getElementById('ibdi-chat-send');
    var chatMessages = document.getElementById('ibdi-chat-messages');
    var saveBtn = document.getElementById('save-chat-trigger');
    var messages = [];

    function appendMessage(role, text) {
        var mdText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        var msgDiv = document.createElement('div');
        msgDiv.className = 'msg ' + (role === 'user' ? 'user' : 'bot');

        var avatarHtml = role === 'user'
            ? '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:white;stroke-width:2"><path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"/></svg>'
            : '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:white;stroke-width:2"><rect x="3" y="4" width="18" height="12" rx="2"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/></svg>';

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
        typingDiv.innerHTML = '<div class="msg-avatar"><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:white;stroke-width:2"><rect x="3" y="4" width="18" height="12" rx="2"/></svg></div><div class="msg-bubble" style="background:transparent;border:none;padding:14px 18px;"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>';
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
            var chatName = prompt("Name this conversation:", "IBDi Chat - " + dateStr);
            if (chatName === null) return;
            if (chatName.trim() === '') chatName = "IBDi Chat - " + dateStr;

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
