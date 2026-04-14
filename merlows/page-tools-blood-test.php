<?php
/**
 * Template Name: Blood Test Tracker Tool
 * Accessible at: /tools/blood-test-tracker/
 */
get_header();

$tool_url = get_template_directory_uri() . '/assets/tools/blood-test/index.html';
?>

<style>
.tool-hero {
    background: linear-gradient(135deg, #0F172A 0%, #5C1742 100%);
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
    background: radial-gradient(circle, rgba(159,43,104,0.2) 0%, transparent 70%);
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
    background: rgba(159,43,104,0.2);
    border: 1px solid rgba(159,43,104,0.4);
    border-radius: var(--radius-sm);
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #D4A0C0;
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
.tool-feature svg {
    flex-shrink: 0;
}
.tool-embed-section {
    padding: 60px 0 80px;
    background: #F8FAFC;
}
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
.tool-disclaimer strong {
    color: #1E293B;
}
@media (max-width: 768px) {
    .tool-hero h1 { font-size: 28px; }
    .tool-hero { padding: 50px 0 40px; }
    .tool-features { flex-direction: column; gap: 16px; }
}
</style>

<!-- Hero -->
<section class="tool-hero">
    <div class="container">
        <div class="tool-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            Interactive Health Tool
        </div>
        <h1>Blood Test Tracker</h1>
        <p>Upload or manually enter your blood test results to track key biomarkers over time. Understand your inflammatory markers, nutritional status, and overall health trends.</p>
        <div class="tool-features">
            <div class="tool-feature">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A0C0" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                Track CRP, ESR, Calprotectin
            </div>
            <div class="tool-feature">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A0C0" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Monitor Iron, B12, Vitamin D
            </div>
            <div class="tool-feature">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A0C0" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Historical trend charts
            </div>
        </div>
    </div>
</section>

<!-- Tool Embed -->
<section class="tool-embed-section">
    <div class="container">
        <div style="background: white; border-radius: var(--radius-lg); box-shadow: 0 4px 20px rgba(0,0,0,0.06); overflow: hidden; border: 1px solid #E2E8F0;">
            <iframe
                src="<?php echo esc_url($tool_url); ?>"
                style="width: 100%; height: 850px; border: none; display: block;"
                loading="lazy"
                title="Blood Test Tracker"
                allow="clipboard-write"
            ></iframe>
        </div>

        <div class="tool-disclaimer">
            <strong>Disclaimer:</strong> This tool is for educational and self-monitoring purposes only. It does not replace laboratory analysis or clinical assessment. Always discuss your blood test results with your healthcare provider. Reference ranges may vary between laboratories.
        </div>
    </div>
</section>

<?php get_footer(); ?>
