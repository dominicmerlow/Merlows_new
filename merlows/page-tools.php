<?php
/**
 * Template Name: Tools Hub
 * Landing page for all interactive health tools
 * Accessible at: /tools/
 */
get_header();
?>

<style>
/* ── Tools Hub Page ──────────────────────────── */
.tools-hero {
    background: linear-gradient(135deg, #0F172A 0%, #8B1A1A 50%, #1B4F8A 100%);
    padding: 100px 0 80px;
    color: white;
    text-align: center;
    position: relative;
    overflow: hidden;
}
.tools-hero::before {
    content: '';
    position: absolute;
    width: 600px;
    height: 600px;
    top: -200px;
    right: -200px;
    background: radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%);
    pointer-events: none;
}
.tools-hero::after {
    content: '';
    position: absolute;
    width: 400px;
    height: 400px;
    bottom: -150px;
    left: -100px;
    background: radial-gradient(circle, rgba(27,79,138,0.2) 0%, transparent 70%);
    pointer-events: none;
}
.tools-hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: var(--radius-sm);
    padding: 8px 16px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #D4A0C0;
    margin-bottom: 24px;
}
.tools-hero h1 {
    font-family: 'Outfit', sans-serif;
    font-size: 52px;
    font-weight: 800;
    margin: 0 0 16px;
    letter-spacing: -1px;
}
.tools-hero p {
    font-size: 20px;
    color: rgba(255,255,255,0.75);
    max-width: 640px;
    margin: 0 auto 32px;
    line-height: 1.6;
}
.tools-hero-stats {
    display: flex;
    justify-content: center;
    gap: 48px;
    margin-top: 40px;
}
.tools-hero-stat {
    text-align: center;
}
.tools-hero-stat .stat-number {
    font-family: 'Outfit', sans-serif;
    font-size: 32px;
    font-weight: 800;
    color: white;
    display: block;
}
.tools-hero-stat .stat-label {
    font-size: 13px;
    color: rgba(255,255,255,0.5);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

/* Featured Tools */
.tools-featured {
    padding: 80px 0;
    background: #F8FAFC;
}
.tools-featured-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 32px;
}
.tool-featured-card {
    background: white;
    border: 1px solid #E2E8F0;
    border-radius: var(--radius-lg);
    overflow: hidden;
    transition: all 0.3s;
    text-decoration: none;
    color: inherit;
    display: flex;
    flex-direction: column;
}
.tool-featured-card:hover {
    transform: translateY(-6px);
    box-shadow: 0 20px 50px rgba(0,0,0,0.1);
    border-color: #1B4F8A;
}
.tool-card-visual {
    height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
}
.tool-card-visual svg {
    opacity: 0.15;
    position: absolute;
}
.tool-card-icon {
    width: 72px;
    height: 72px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    z-index: 1;
}
.tool-card-body {
    padding: 32px;
    flex: 1;
    display: flex;
    flex-direction: column;
}
.tool-card-tag {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    margin-bottom: 12px;
    width: fit-content;
}
.tool-card-body h3 {
    font-family: 'Outfit', sans-serif;
    font-size: 22px;
    font-weight: 700;
    color: #0F172A;
    margin: 0 0 12px;
}
.tool-card-body p {
    font-size: 15px;
    color: #64748B;
    line-height: 1.6;
    margin: 0 0 20px;
    flex: 1;
}
.tool-card-features {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 24px;
}
.tool-card-feature {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #475569;
}
.tool-card-feature svg {
    flex-shrink: 0;
    color: #1B4F8A;
}
.tool-card-cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 700;
    color: #1B4F8A;
    transition: gap 0.2s;
}
.tool-featured-card:hover .tool-card-cta {
    gap: 12px;
}

/* Additional Tools */
.tools-more {
    padding: 80px 0;
    background: white;
}
.tools-more-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
    max-width: 900px;
    margin: 0 auto;
}
.tool-mini-card {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 24px;
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: var(--radius-md);
    text-decoration: none;
    color: inherit;
    transition: all 0.2s;
}
.tool-mini-card:hover {
    border-color: #1B4F8A;
    background: #F5E6A3;
    transform: translateX(4px);
}
.tool-mini-icon {
    width: 52px;
    height: 52px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.tool-mini-card h4 {
    font-size: 16px;
    font-weight: 700;
    color: #0F172A;
    margin: 0 0 4px;
}
.tool-mini-card p {
    font-size: 13px;
    color: #64748B;
    margin: 0;
    line-height: 1.4;
}

/* CTA */
.tools-cta {
    padding: 80px 0;
    background: #F8FAFC;
}
.tools-cta-inner {
    background: linear-gradient(135deg, #0F172A 0%, #8B1A1A 100%);
    border-radius: var(--radius-xl);
    padding: 60px;
    text-align: center;
    color: white;
    max-width: 800px;
    margin: 0 auto;
    position: relative;
    overflow: hidden;
}
.tools-cta-inner::before {
    content: '';
    position: absolute;
    width: 300px;
    height: 300px;
    top: -100px;
    right: -100px;
    background: radial-gradient(circle, rgba(27,79,138,0.3) 0%, transparent 70%);
    pointer-events: none;
}
.tools-cta-inner h2 {
    font-family: 'Outfit', sans-serif;
    font-size: 32px;
    font-weight: 800;
    margin: 0 0 12px;
    position: relative;
}
.tools-cta-inner p {
    font-size: 18px;
    opacity: 0.8;
    margin: 0 0 28px;
    position: relative;
}

@media (max-width: 768px) {
    .tools-hero h1 { font-size: 32px; }
    .tools-hero { padding: 60px 0 50px; }
    .tools-hero-stats { flex-direction: column; gap: 20px; }
    .tools-featured-grid { grid-template-columns: 1fr; }
    .tools-more-grid { grid-template-columns: 1fr; }
    .tools-cta-inner { padding: 40px 24px; }
}
</style>

<!-- Hero -->
<section class="tools-hero">
    <div class="container" style="position: relative; z-index: 1;">
        <div class="tools-hero-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            Interactive Health Tools
        </div>
        <h1>Your Health Toolkit</h1>
        <p>Free, interactive tools to help you explore and understand Middle East diplomacy and the story of the Accords. Built for Merlows readers, designed for everyone.</p>

        <div class="tools-hero-stats">
            <div class="tools-hero-stat">
                <span class="stat-number">5+</span>
                <span class="stat-label">Health Tools</span>
            </div>
            <div class="tools-hero-stat">
                <span class="stat-number">100%</span>
                <span class="stat-label">Free to Use</span>
            </div>
            <div class="tools-hero-stat">
                <span class="stat-number">0</span>
                <span class="stat-label">Data Shared</span>
            </div>
        </div>
    </div>
</section>

<!-- Featured Tools -->
<section class="tools-featured">
    <div class="container">
        <div style="text-align: center; margin-bottom: 48px;">
            <h2 style="font-family: 'Outfit', sans-serif; font-size: 32px; font-weight: 800; color: #0F172A; margin: 0 0 12px;">Featured Tools</h2>
            <p style="font-size: 16px; color: #64748B; max-width: 520px; margin: 0 auto;">Clinical-grade tools you can use from home, right from your browser.</p>
        </div>

        <div class="tools-featured-grid">

            <!-- Accords Timeline Explorer (coming soon) -->
            <div class="tool-featured-card" style="cursor: default;">
                <div class="tool-card-visual" style="background: linear-gradient(135deg, #EEF4FB, #DCE7F5);">
                    <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="#1B4F8A" stroke-width="0.5"><line x1="3" y1="12" x2="21" y2="12"/><circle cx="7" cy="12" r="2"/><circle cx="17" cy="12" r="2"/></svg>
                    <div class="tool-card-icon" style="background: #1B4F8A;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><circle cx="7" cy="12" r="2"/><circle cx="17" cy="12" r="2"/><line x1="12" y1="5" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="19"/></svg>
                    </div>
                </div>
                <div class="tool-card-body">
                    <span class="tool-card-tag" style="background: #EEF4FB; color: #1B4F8A;">Coming Soon</span>
                    <h3>Accords Timeline Explorer</h3>
                    <p>An interactive timeline of the Abraham Accords and Cyrus Accord &mdash; scrub through the milestones, signings and turning points that shaped the region.</p>
                    <span class="tool-card-cta" style="opacity: 0.6;">In development</span>
                </div>
            </div>

            <!-- Middle East Map Room (coming soon) -->
            <div class="tool-featured-card" style="cursor: default;">
                <div class="tool-card-visual" style="background: linear-gradient(135deg, #F0FAF7, #D8F0E8);">
                    <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="#0D9488" stroke-width="0.5"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/></svg>
                    <div class="tool-card-icon" style="background: #0D9488;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
                    </div>
                </div>
                <div class="tool-card-body">
                    <span class="tool-card-tag" style="background: #F0FAF7; color: #0D9488;">Coming Soon</span>
                    <h3>Middle East Map Room</h3>
                    <p>A clickable regional map that surfaces the latest Merlows reporting by country &mdash; explore signatories, hotspots and diplomatic ties at a glance.</p>
                    <span class="tool-card-cta" style="opacity: 0.6;">In development</span>
                </div>
            </div>

            <!-- Test Your Knowledge Quiz (coming soon) -->
            <div class="tool-featured-card" style="cursor: default;">
                <div class="tool-card-visual" style="background: linear-gradient(135deg, #FFF7ED, #FFE8D6);">
                    <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="#FD4F00" stroke-width="0.5"><circle cx="12" cy="12" r="10"/></svg>
                    <div class="tool-card-icon" style="background: #FD4F00;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    </div>
                </div>
                <div class="tool-card-body">
                    <span class="tool-card-tag" style="background: #FFF7ED; color: #C2410C;">Coming Soon</span>
                    <h3>Test Your Knowledge Quiz</h3>
                    <p>A quick, fun current-affairs quiz on regional history and the Blitz Spirit &mdash; rack up a streak and see how your knowledge stacks up against other readers.</p>
                    <span class="tool-card-cta" style="opacity: 0.6;">In development</span>
                </div>
            </div>

            <!-- IBDi AI Assistant -->
            <a href="/ask-ai/" class="tool-featured-card">
                <div class="tool-card-visual" style="background: linear-gradient(135deg, #F5F3FF, #EDE9FE);">
                    <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="0.5"><rect x="3" y="4" width="18" height="12" rx="2"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/></svg>
                    <div class="tool-card-icon" style="background: #7C3AED;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="3" y="4" width="18" height="12" rx="2"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/><circle cx="9" cy="10" r="1" fill="white" stroke="none"/><circle cx="15" cy="10" r="1" fill="white" stroke="none"/></svg>
                    </div>
                </div>
                <div class="tool-card-body">
                    <span class="tool-card-tag" style="background: #F5F3FF; color: #7C3AED;">AI-Powered</span>
                    <h3>Ask IBDi</h3>
                    <p>Our clinical AI assistant trained on peer-reviewed IBD research. Ask questions about conditions, treatments, nutrition, and more.</p>
                    <div class="tool-card-features">
                        <div class="tool-card-feature">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                            Evidence-based responses
                        </div>
                        <div class="tool-card-feature">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                            Save conversations to dashboard
                        </div>
                        <div class="tool-card-feature">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                            Research &amp; web content modes
                        </div>
                    </div>
                    <span class="tool-card-cta">
                        Ask a Question
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    </span>
                </div>
            </a>

        </div>
    </div>
</section>

<!-- More Tools -->
<section class="tools-more">
    <div class="container">
        <div style="text-align: center; margin-bottom: 48px;">
            <h2 style="font-family: 'Outfit', sans-serif; font-size: 28px; font-weight: 800; color: #0F172A; margin: 0 0 12px;">More Resources</h2>
            <p style="font-size: 16px; color: #64748B; max-width: 480px; margin: 0 auto;">Additional tools and features available through your dashboard.</p>
        </div>

        <div class="tools-more-grid">
            <a href="/dashboard/" class="tool-mini-card">
                <div class="tool-mini-icon" style="background: #EFF6FF;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                </div>
                <div>
                    <h4>Personal Dashboard</h4>
                    <p>Save articles, track reading history, and manage your health library.</p>
                </div>
            </a>

            <a href="/healthcare-quiz/" class="tool-mini-card">
                <div class="tool-mini-icon" style="background: #F5F0FA;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div>
                    <h4>Health Pathway Quiz</h4>
                    <p>Answer a few questions to get personalised content recommendations.</p>
                </div>
            </a>

            <a href="/my-notes/" class="tool-mini-card">
                <div class="tool-mini-icon" style="background: #ECFDF5;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1B4F8A" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                </div>
                <div>
                    <h4>My Notes</h4>
                    <p>Clip paragraphs from articles and build personal research notes.</p>
                </div>
            </a>

            <a href="/discovery-results/" class="tool-mini-card">
                <div class="tool-mini-icon" style="background: #F5F3FF;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </div>
                <div>
                    <h4>Content Discovery</h4>
                    <p>Filter and explore content by reading level, pathway, and type.</p>
                </div>
            </a>
        </div>
    </div>
</section>

<!-- CTA -->
<section class="tools-cta">
    <div class="container">
        <div class="tools-cta-inner">
            <h2>All Tools. Always Free.</h2>
            <p>Create a free account to save your results and track your progress over time.</p>
            <a href="<?php echo wp_registration_url(); ?>" class="btn" style="background: white; color: #1B4F8A; padding: 14px 36px; font-weight: 700; border-radius: var(--radius-md); font-size: 16px; position: relative;">Get Started Free</a>
        </div>
    </div>
</section>

<?php get_footer(); ?>
