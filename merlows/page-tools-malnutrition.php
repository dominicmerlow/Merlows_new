<?php
/**
 * Template Name: Malnutrition Calculator Tool
 * Accessible at: /tools/malnutrition-calculator/
 */
get_header();

$tool_url = get_template_directory_uri() . '/assets/tools/malnutrition-calculator/index.html';
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
.info-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    margin-top: 48px;
}
.info-card {
    background: white;
    border: 1px solid #E2E8F0;
    border-radius: var(--radius-md);
    padding: 28px;
}
.info-card h3 {
    font-family: 'Outfit', sans-serif;
    font-size: 16px;
    font-weight: 700;
    color: #0F172A;
    margin: 0 0 8px;
}
.info-card p {
    font-size: 14px;
    color: #64748B;
    line-height: 1.6;
    margin: 0;
}
@media (max-width: 768px) {
    .tool-hero h1 { font-size: 28px; }
    .tool-hero { padding: 50px 0 40px; }
    .tool-features { flex-direction: column; gap: 16px; }
    .info-cards { grid-template-columns: 1fr; }
}
</style>

<!-- Hero -->
<section class="tool-hero">
    <div class="container">
        <div class="tool-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            Interactive Health Tool
        </div>
        <h1>Malnutrition Risk Calculator</h1>
        <p>Assess your nutritional risk using validated screening criteria. This tool helps identify potential malnutrition in patients with inflammatory bowel disease.</p>
        <div class="tool-features">
            <div class="tool-feature">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A0C0" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/></svg>
                BMI-based assessment
            </div>
            <div class="tool-feature">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A0C0" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                Weight loss tracking
            </div>
            <div class="tool-feature">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A0C0" stroke-width="2"><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>
                Intake reduction scoring
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
                style="width: 100%; height: 900px; border: none; display: block;"
                loading="lazy"
                title="Malnutrition Risk Calculator"
                allow="clipboard-write"
            ></iframe>
        </div>

        <div class="tool-disclaimer">
            <strong>Disclaimer:</strong> This screening tool is based on established nutritional assessment criteria but does not replace a clinical evaluation by a registered dietitian or healthcare professional. Results should be discussed with your medical team, especially if you have active IBD.
        </div>

        <!-- Info Section -->
        <div class="info-cards">
            <div class="info-card">
                <h3>Why Screen for Malnutrition?</h3>
                <p>Up to 85% of hospitalised IBD patients experience some degree of malnutrition. Early screening helps identify those at risk before complications arise.</p>
            </div>
            <div class="info-card">
                <h3>Key Risk Factors in IBD</h3>
                <p>Active inflammation, bowel resections, restricted diets, and medications like corticosteroids can all contribute to nutritional deficiencies in IBD patients.</p>
            </div>
            <div class="info-card">
                <h3>What to Do Next</h3>
                <p>If you score as medium or high risk, share these results with your gastroenterologist or dietitian. They can arrange further assessment and a tailored nutrition plan.</p>
            </div>
        </div>
    </div>
</section>

<?php get_footer(); ?>
