<?php
/**
 * Template Name: Community
 * Accessible at: /community/
 */
get_header();
?>

<style>
.community-hero {
    background: linear-gradient(135deg, #0F172A 0%, #5C1742 50%, #9F2B68 100%);
    padding: 100px 0 80px;
    color: white;
    text-align: center;
    position: relative;
    overflow: hidden;
}
.community-hero::before {
    content: '';
    position: absolute;
    top: -100px;
    right: -100px;
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, rgba(159,43,104,0.3) 0%, transparent 70%);
    pointer-events: none;
}
.community-hero h1 {
    font-family: 'Outfit', sans-serif;
    font-size: 52px;
    font-weight: 800;
    margin: 0 0 16px;
    letter-spacing: -1px;
}
.community-hero p {
    font-size: 20px;
    color: rgba(255,255,255,0.8);
    max-width: 640px;
    margin: 0 auto 32px;
    line-height: 1.6;
}
.community-section {
    padding: 80px 0;
}
.community-section:nth-child(even) {
    background: #F8FAFC;
}
.community-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 32px;
}
.community-card {
    background: white;
    border: 1px solid #E2E8F0;
    border-radius: var(--radius-lg);
    padding: 40px 32px;
    text-align: center;
    transition: all 0.3s;
}
.community-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 20px 40px rgba(0,0,0,0.08);
    border-color: #9F2B68;
}
.community-card-icon {
    width: 64px;
    height: 64px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
    font-size: 28px;
}
.community-card h3 {
    font-family: 'Outfit', sans-serif;
    font-size: 20px;
    font-weight: 700;
    color: #0F172A;
    margin: 0 0 12px;
}
.community-card p {
    font-size: 14px;
    color: #64748B;
    line-height: 1.6;
    margin: 0;
}
.values-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
    max-width: 900px;
    margin: 0 auto;
}
.value-item {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    padding: 24px;
    background: white;
    border-radius: var(--radius-md);
    border: 1px solid #E2E8F0;
}
.value-icon {
    width: 44px;
    height: 44px;
    background: #E6E6FA;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
}
.value-item h4 {
    font-size: 16px;
    font-weight: 700;
    color: #0F172A;
    margin: 0 0 6px;
}
.value-item p {
    font-size: 14px;
    color: #64748B;
    margin: 0;
    line-height: 1.5;
}
.cta-banner {
    background: linear-gradient(135deg, #9F2B68 0%, #7A1F50 100%);
    border-radius: var(--radius-xl);
    padding: 60px;
    text-align: center;
    color: white;
    max-width: 900px;
    margin: 0 auto;
}
.cta-banner h2 {
    font-family: 'Outfit', sans-serif;
    font-size: 32px;
    font-weight: 800;
    margin: 0 0 12px;
}
.cta-banner p {
    font-size: 18px;
    opacity: 0.9;
    margin: 0 0 28px;
}
@media (max-width: 768px) {
    .community-hero h1 { font-size: 32px; }
    .community-hero { padding: 60px 0 50px; }
    .community-grid { grid-template-columns: 1fr; }
    .values-grid { grid-template-columns: 1fr; }
    .cta-banner { padding: 40px 24px; }
}
</style>

<!-- Hero -->
<section class="community-hero">
    <div class="container">
        <h1>Our Community</h1>
        <p>A trusted space for patients, carers, and healthcare professionals navigating inflammatory bowel disease together.</p>
        <a href="<?php echo wp_registration_url(); ?>" class="btn btn-primary" style="background: white; color: #9F2B68; padding: 14px 32px; font-weight: 700; border-radius: var(--radius-md);">Join the Community</a>
    </div>
</section>

<!-- What We Offer -->
<section class="community-section">
    <div class="container">
        <div style="text-align: center; margin-bottom: 48px;">
            <h2 style="font-family: 'Outfit', sans-serif; font-size: 32px; font-weight: 800; color: #0F172A; margin: 0 0 12px;">What You'll Find Here</h2>
            <p style="font-size: 16px; color: #64748B; max-width: 560px; margin: 0 auto;">Resources and connections designed to support every stage of your IBD journey.</p>
        </div>
        <div class="community-grid">
            <div class="community-card">
                <div class="community-card-icon" style="background: #E6E6FA;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9F2B68" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <h3>Patient Support</h3>
                <p>Connect with others living with Crohn's disease, ulcerative colitis, and microscopic colitis. Share experiences and find understanding.</p>
            </div>
            <div class="community-card">
                <div class="community-card-icon" style="background: #EFF6FF;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                </div>
                <h3>Evidence-Based Education</h3>
                <p>Access clinical reviews, expert opinions, and research summaries written in plain language by healthcare professionals.</p>
            </div>
            <div class="community-card">
                <div class="community-card-icon" style="background: #F5F0FA;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                </div>
                <h3>Interactive Health Tools</h3>
                <p>Track your blood test results, assess nutritional status, and explore personalised health insights with our free tools.</p>
            </div>
            <div class="community-card">
                <div class="community-card-icon" style="background: #F5F3FF;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                </div>
                <h3>Personal Dashboard</h3>
                <p>Save articles, bookmark resources, track your reading history, and build a personalised knowledge library.</p>
            </div>
            <div class="community-card">
                <div class="community-card-icon" style="background: #FEF2F2;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </div>
                <h3>HCP Resources</h3>
                <p>Healthcare professionals access clinical guidelines, prescribing information, and continuing education modules.</p>
            </div>
            <div class="community-card">
                <div class="community-card-icon" style="background: #ECFDF5;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9F2B68" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <h3>Ask IBDi</h3>
                <p>Our AI-powered clinical assistant answers your IBD questions using evidence from peer-reviewed research and clinical guidelines.</p>
            </div>
        </div>
    </div>
</section>

<!-- Our Values -->
<section class="community-section">
    <div class="container">
        <div style="text-align: center; margin-bottom: 48px;">
            <h2 style="font-family: 'Outfit', sans-serif; font-size: 32px; font-weight: 800; color: #0F172A; margin: 0 0 12px;">Community Values</h2>
            <p style="font-size: 16px; color: #64748B; max-width: 560px; margin: 0 auto;">The principles that guide everything we do.</p>
        </div>
        <div class="values-grid">
            <div class="value-item">
                <div class="value-icon">&#x1F52C;</div>
                <div>
                    <h4>Science First</h4>
                    <p>Every piece of content is grounded in peer-reviewed research and clinical evidence. No pseudoscience, no hype.</p>
                </div>
            </div>
            <div class="value-item">
                <div class="value-icon">&#x1F91D;</div>
                <div>
                    <h4>Inclusive & Respectful</h4>
                    <p>All IBD conditions, all perspectives. We respect patient experiences alongside clinical expertise.</p>
                </div>
            </div>
            <div class="value-item">
                <div class="value-icon">&#x1F512;</div>
                <div>
                    <h4>Privacy Protected</h4>
                    <p>Your health data stays yours. We never sell personal information or share it with third parties.</p>
                </div>
            </div>
            <div class="value-item">
                <div class="value-icon">&#x1F310;</div>
                <div>
                    <h4>Free & Accessible</h4>
                    <p>Core resources, tools, and community features are free for everyone, everywhere.</p>
                </div>
            </div>
        </div>
    </div>
</section>

<!-- CTA -->
<section class="community-section">
    <div class="container">
        <div class="cta-banner">
            <h2>Ready to Join?</h2>
            <p>Create your free account and start building your personalised IBD health library today.</p>
            <a href="<?php echo wp_registration_url(); ?>" class="btn" style="background: white; color: #9F2B68; padding: 14px 36px; font-weight: 700; border-radius: var(--radius-md); font-size: 16px;">Create Free Account</a>
        </div>
    </div>
</section>

<?php get_footer(); ?>
