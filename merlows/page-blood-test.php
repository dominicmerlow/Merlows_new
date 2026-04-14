<?php
/**
 * Template Name: Blood Test
 * 
 * Dedicated page template for the IBD Blood Test Analyser tool.
 * Accessible at: /blood-test/
 */
get_header();

// Hero Settings
$title_color = get_theme_mod('ibdhh_hero_title_color', '#ffffff');
$title_size = get_theme_mod('ibdhh_hero_title_size', 52);
$mask_enabled = get_theme_mod('ibdhh_hero_mask_toggle', true);
$mask_opacity = get_theme_mod('ibdhh_hero_mask_opacity', 0.5);

$hero_bg = '';
if ( has_post_thumbnail() ) {
    $hero_bg = get_the_post_thumbnail_url( get_the_ID(), 'full' );
} else {
    $hero_bg = get_theme_mod('ibdhh_homepage_hero_image') ?: get_template_directory_uri() . '/assets/img/news_hero.png';
}

$overlay_css = '';
if ( $mask_enabled ) {
    $overlay_css = "background-image: linear-gradient(rgba(10, 25, 41, {$mask_opacity}), rgba(20, 40, 70, {$mask_opacity})), url('" . esc_url($hero_bg) . "');";
} else {
    $overlay_css = "background-image: url('" . esc_url($hero_bg) . "');";
}
$bg_props = "background-position: center center; background-size: cover; background-repeat: no-repeat;";

$tool_url = get_template_directory_uri() . '/assets/tools/blood-test/index.html';
?>

<style>
    /* ── Malnutrition Calculator Page ─────────────────────────────── */
    .calc-page-hero {
        padding: 60px 0 80px;
        position: relative;
        width: 100%;
    }
    .calc-page-hero .hero-content {
        max-width: 800px;
        padding: 40px 0;
    }
    .calc-page-hero h1 {
        font-family: 'Outfit', sans-serif;
        font-weight: 800;
        margin: 0;
        line-height: 1.15;
        letter-spacing: -0.02em;
    }
    .calc-page-hero .hero-subtitle {
        font-size: 17px;
        color: rgba(255,255,255,0.8);
        margin-top: 16px;
        font-weight: 400;
        line-height: 1.6;
        max-width: 600px;
    }
    .calc-page-hero .hero-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: rgba(255,255,255,0.12);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 0;
        padding: 8px 20px;
        font-size: 12px;
        color: rgba(255,255,255,0.9);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 20px;
    }
    .calc-page-hero .hero-badge .badge-dot {
        width: 8px;
        height: 8px;
        border-radius: 0;
        background: #9F2B68;
        animation: pulse-dot 2s infinite;
    }

    @keyframes pulse-dot {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
    }

    /* Tool Container */
    .calc-embed-section {
        background: linear-gradient(180deg, #0F172A 0%, #f3f4f6 15%);
        padding: 0 20px 80px;
    }
    .calc-embed-wrapper {
        max-width: 1400px;
        margin: -50px auto 0;
        position: relative;
        z-index: 2;
    }
    .calc-embed-card {
        background: #ffffff;
        border-radius: 0;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(10, 25, 41, 0.12), 0 4px 12px rgba(0,0,0,0.06);
        border: 1px solid rgba(226, 232, 240, 0.8);
    }
    .calc-embed-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 28px;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
    }
    .calc-embed-toolbar .toolbar-left {
        display: flex;
        align-items: center;
        gap: 12px;
    }
    .calc-embed-toolbar .toolbar-icon {
        width: 36px;
        height: 36px;
        background: linear-gradient(135deg, #fd4f00 0%, #ff7a33 100%);
        border-radius: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
    }
    .calc-embed-toolbar .toolbar-title {
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: -0.01em;
    }
    .calc-embed-toolbar .toolbar-status {
        font-size: 11px;
        color: #64748b;
        font-weight: 500;
    }
    .calc-embed-toolbar .toolbar-right {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .calc-embed-toolbar .toolbar-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: 0;
        font-size: 12px;
        font-weight: 600;
        text-decoration: none;
        border: 1px solid #e2e8f0;
        background: white;
        color: #475569;
        cursor: pointer;
        transition: all 0.2s;
    }
    .calc-embed-toolbar .toolbar-btn:hover {
        background: #f1f5f9;
        border-color: #cbd5e1;
    }
    .calc-embed-iframe {
        width: 100%;
        height: 900px;
        border: none;
        display: block;
    }

    /* Info Section */
    .calc-info-section {
        max-width: 1200px;
        margin: 60px auto 0;
        padding: 0 20px;
    }
    .calc-info-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 28px;
    }
    .calc-info-card {
        background: white;
        padding: 36px 28px;
        border-radius: 0;
        border: 1px solid #e2e8f0;
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
    }
    .calc-info-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 12px 40px rgba(10, 25, 41, 0.08);
        border-color: #fd4f00;
    }
    .calc-info-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, #fd4f00, #ff7a33);
        opacity: 0;
        transition: opacity 0.3s;
    }
    .calc-info-card:hover::before {
        opacity: 1;
    }
    .calc-info-icon {
        width: 52px;
        height: 52px;
        background: #fff5f0;
        border-radius: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        margin-bottom: 20px;
    }
    .calc-info-card h3 {
        font-family: 'Outfit', sans-serif;
        font-size: 18px;
        font-weight: 700;
        color: #0F172A;
        margin: 0 0 10px 0;
    }
    .calc-info-card p {
        font-size: 14px;
        color: #64748b;
        line-height: 1.7;
        margin: 0;
    }

    /* Disclaimer */
    .calc-disclaimer {
        max-width: 1200px;
        margin: 40px auto;
        padding: 0 20px;
    }
    .calc-disclaimer-inner {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 0;
        padding: 24px 28px;
        display: flex;
        align-items: flex-start;
        gap: 16px;
    }
    .calc-disclaimer-icon {
        font-size: 20px;
        flex-shrink: 0;
        margin-top: 2px;
    }
    .calc-disclaimer-inner p {
        font-size: 13px;
        color: #64748b;
        line-height: 1.7;
        margin: 0;
    }
    .calc-disclaimer-inner strong {
        color: #334155;
    }

    @media (max-width: 768px) {
        .calc-page-hero {
            padding: 40px 0 60px;
        }
        .calc-page-hero h1 {
            font-size: 28px !important;
        }
        .calc-embed-iframe {
            height: 700px;
        }
        .calc-info-grid {
            grid-template-columns: 1fr;
        }
        .calc-embed-toolbar {
            flex-direction: column;
            gap: 12px;
            align-items: flex-start;
        }
        .calc-embed-toolbar .toolbar-right {
            width: 100%;
        }
    }
</style>

<!-- Hero Section -->
<section class="calc-page-hero" style="<?php echo $overlay_css . ' ' . $bg_props; ?>">
    <div class="container">
        <div class="hero-content">
            <div class="hero-badge">
                <span class="badge-dot"></span>
                <span>Clinical Tool &nbsp;&middot;&nbsp; Precision Diagnostics</span>
            </div>
            <h1 style="font-size: <?php echo intval($title_size); ?>px; color: <?php echo esc_attr($title_color); ?>">
                IBD Blood Test<br>Analyser
            </h1>
            <p class="hero-subtitle">
                Assess your nutritional biomarkers against UK clinical standards. Enter your lab results and receive a clinically-grounded interpretation with personalised guidance.
            </p>
        </div>
    </div>
</section>

<!-- Calculator Embed -->
<section class="calc-embed-section">
    <div class="calc-embed-wrapper">
        <div class="calc-embed-card">
            <div class="calc-embed-toolbar">
                <div class="toolbar-left">
                    <div class="toolbar-icon">🧪</div>
                    <div>
                        <div class="toolbar-title">IBD Blood Test Analyser</div>
                        <div class="toolbar-status">IBD Health Hub · Precision Diagnostics</div>
                    </div>
                </div>
                <div class="toolbar-right">
                    <button class="toolbar-btn" onclick="document.querySelector('.calc-embed-iframe').contentWindow.location.reload()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                        Reset
                    </button>
                    <a href="<?php echo esc_url($tool_url); ?>" target="_blank" class="toolbar-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        Open Full
                    </a>
                </div>
            </div>
            <iframe 
                class="calc-embed-iframe" 
                src="<?php echo esc_url($tool_url); ?>" 
                loading="lazy"
                title="IBD Malnutrition Calculator"
                allow="clipboard-write"
            ></iframe>
        </div>
    </div>

    <!-- Info Cards -->
    <div class="calc-info-section">
        <div class="calc-info-grid">
            <div class="calc-info-card">
                <div class="calc-info-icon">🔬</div>
                <h3>UK Clinical Standards</h3>
                <p>All reference ranges are benchmarked against NICE guidelines and established UK clinical laboratory standards for IBD patients.</p>
            </div>
            <div class="calc-info-card">
                <div class="calc-info-icon">🧠</div>
                <h3>Deficiency Detection</h3>
                <p>Identifies sub-optimal values across key nutritional markers and flags areas of concern with tailored clinical context.</p>
            </div>
            <div class="calc-info-card">
                <div class="calc-info-icon">📊</div>
                <h3>7 Key Biomarkers</h3>
                <p>Covers Vitamin D, Ferritin, B12, Folate, Magnesium, Zinc, and HbA1c &mdash; the most critical nutritional markers for IBD management.</p>
            </div>
        </div>
    </div>

    <!-- Disclaimer -->
    <div class="calc-disclaimer">
        <div class="calc-disclaimer-inner">
            <span class="calc-disclaimer-icon">⚕️</span>
            <p>
                <strong>Clinical Disclaimer:</strong> This tool is intended for educational and informational purposes only. 
                It does not constitute medical advice. Always consult with your GP, gastroenterologist, or an IBD Health Hub specialist 
                before making changes to your supplementation or treatment regimen. Reference data follows 
                NICE and IBDHealthHub internal standards.
            </p>
        </div>
    </div>
</section>

<?php get_footer(); ?>
