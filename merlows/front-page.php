<?php
/**
 * Front Page Template
 * Modern Clinical Hub Layout
 */

get_header();
?>

<style>
/* --- MODERN CLINICAL HUB STYLES --- */
:root {
    --primary-color: #1B4F8A;
    --primary-hover: #153D6E;
    --secondary-color: #0F172A;
    --accent-bg: #F5E6A3;
    --text-main: #1E293B;
    --text-light: #64748B;
    --border-color: #E2E8F0;
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 16px;
    --radius-xl: 24px;
}

body {
    background-color: #ffffff;
}

/* Section Headers */
.section-label {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 32px;
    border-bottom: 2px solid var(--border-color);
    padding-bottom: 16px;
    justify-content: space-between;
}

.section-label-left {
    display: flex;
    align-items: center;
    gap: 12px;
}

.section-label h2 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: var(--secondary-color);
    font-family: 'Outfit', sans-serif;
}

.color-bar { width: 6px; height: 24px; border-radius: var(--radius-sm); }

/* BENTO GRID (News Style) */
.bento-grid-news {
    display: grid;
    grid-template-columns: 2fr 1fr;
    grid-template-rows: repeat(2, 200px);
    gap: 24px;
}

.bento-cell-featured {
    grid-row: 1 / -1;
    position: relative;
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: #0F172A;
    color: white;
    display: flex;
    align-items: flex-end;
    text-decoration: none;
}

.bento-cell-featured img {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.6;
    transition: transform 0.4s;
}

.bento-cell-featured:hover img {
    transform: scale(1.05);
}

.bento-content-overlay {
    position: relative;
    z-index: 2;
    padding: 40px;
    background: linear-gradient(to top, rgba(0,0,0,0.9), transparent);
    width: 100%;
}

.tag {
    background: var(--primary-color);
    color: white;
    padding: 4px 12px;
    font-size: 11px;
    text-transform: uppercase;
    font-weight: 700;
    border-radius: var(--radius-sm);
    display: inline-block;
    margin-bottom: 12px;
}

.bento-cell-side {
    background: white;
    border-radius: var(--radius-lg);
    padding: 24px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    border: 1px solid var(--border-color);
    transition: all 0.2s;
    text-decoration: none;
    color: inherit;
    height: 100%;
}

.bento-cell-side:hover {
    border-color: var(--primary-color);
    transform: translateX(4px);
}

/* REVIEWS ASYMMETRIC GRID */
.bento-grid-reviews {
    display: grid;
    grid-template-columns: 1.5fr 1fr 1fr;
    gap: 24px;
}

.review-card-wide {
    background: white;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    height: 100%;
}

.review-card-wide .review-img {
    height: 240px;
    background: #e2e8f0;
    position: relative;
    background-size: cover;
    background-position: center;
}

.review-card-standard {
    background: white;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    height: 100%;
}

.review-card-standard .review-img {
    height: 160px;
    background: #e2e8f0;
    background-size: cover;
    background-position: center;
}

/* EXPERT OPINIONS POSTERS */
.bento-grid-opinions {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
}

.opinion-card {
    background: white;
    border-radius: var(--radius-lg);
    padding: 32px;
    text-align: center;
    border: 1px solid var(--border-color);
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.opinion-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 6px;
    background: var(--primary-color);
}

.author-avatar {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: #f8fafc;
    margin: 0 auto 20px;
    border: 4px solid #f8fafc;
    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
    object-fit: cover;
}

/* TYPOGRAPHY UTILS */
.heading-medium { margin: 0 0 12px 0; font-size: 18px; line-height: 1.4; color: var(--secondary-color); font-weight: 700; }
.heading-small { margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: var(--secondary-color); }
.text-body { margin: 0 0 16px 0; font-size: 14px; color: var(--text-light); line-height: 1.5; }
.meta-text { font-size: 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }

/* --- HERO SPLIT LAYOUT --- */
.hero-split {
    display: flex;
    align-items: center;
    min-height: 600px;
    background: linear-gradient(135deg, #ffffff 0%, #F8FAFC 50%, #F5E6A3 100%);
    padding: 80px 0;
}
.hero-split-left {
    flex: 0 0 55%;
    padding-right: 60px;
}
.hero-split-right {
    flex: 0 0 45%;
    display: flex;
    align-items: center;
    justify-content: center;
}
.hero-search-bar {
    display: flex;
    gap: 0;
    margin: 32px 0 28px;
    max-width: 520px;
}
.hero-search-bar input {
    flex: 1;
    padding: 16px 20px;
    border: 2px solid var(--border-color);
    border-right: none;
    border-radius: var(--radius-lg) 0 0 var(--radius-lg);
    font-size: 16px;
    outline: none;
    background: white;
    color: var(--text-main);
}
.hero-search-bar input:focus {
    border-color: var(--primary-color);
}
.hero-search-bar button {
    padding: 16px 28px;
    background: var(--primary-color);
    color: white;
    border: 2px solid var(--primary-color);
    border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
    transition: background 0.2s;
    white-space: nowrap;
}
.hero-search-bar button:hover {
    background: var(--primary-hover);
    border-color: var(--primary-hover);
}
.trust-badges {
    display: flex;
    gap: 32px;
    margin-top: 28px;
}
.trust-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--text-light);
    font-weight: 600;
}
.trust-badge svg {
    width: 18px;
    height: 18px;
    color: var(--primary-color);
    flex-shrink: 0;
}

/* --- JOURNEY PILLARS --- */
.journey-pillars {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 32px;
    margin-bottom: 80px;
}
.pillar-card {
    background: white;
    border-radius: var(--radius-xl);
    padding: 40px 32px;
    text-align: center;
    border: 1px solid var(--border-color);
    transition: all 0.35s ease;
    text-decoration: none;
    color: inherit;
    display: flex;
    flex-direction: column;
    align-items: center;
}
.pillar-card:hover {
    transform: translateY(-8px) scale(1.02);
    box-shadow: 0 20px 60px rgba(27, 79, 138, 0.15);
    border-color: var(--primary-color);
}
.pillar-icon {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
}
.pillar-icon svg {
    width: 32px;
    height: 32px;
    stroke: white;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
}

/* --- LATEST CONTENT CAROUSEL --- */
.latest-carousel-wrapper {
    position: relative;
}
.latest-carousel {
    display: flex;
    gap: 24px;
    overflow-x: auto;
    scroll-behavior: smooth;
    padding: 8px 0 24px;
    -ms-overflow-style: none;
    scrollbar-width: none;
}
.latest-carousel::-webkit-scrollbar { display: none; }
.latest-card {
    flex: 0 0 280px;
    background: white;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid var(--border-color);
    transition: all 0.3s;
    text-decoration: none;
    color: inherit;
    display: flex;
    flex-direction: column;
}
.latest-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 32px rgba(0,0,0,0.08);
    border-color: var(--primary-color);
}
.latest-card-img {
    height: 160px;
    background: #f1f5f9;
    overflow: hidden;
}
.latest-card-img img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s;
}
.latest-card:hover .latest-card-img img {
    transform: scale(1.05);
}
.latest-card-body {
    padding: 20px;
    flex: 1;
    display: flex;
    flex-direction: column;
}
.carousel-arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 44px;
    height: 44px;
    background: white;
    border: 1px solid var(--border-color);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    transition: all 0.2s;
    z-index: 5;
}
.carousel-arrow:hover {
    background: var(--primary-color);
    color: white;
    border-color: var(--primary-color);
}
.carousel-arrow:hover svg { stroke: white; }
.carousel-arrow svg { width: 20px; height: 20px; stroke: var(--text-main); fill: none; stroke-width: 2; }
.carousel-arrow-left { left: -22px; }
.carousel-arrow-right { right: -22px; }

/* --- STATS BAR --- */
.stats-bar {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 40px;
    text-align: center;
}
.stat-item .stat-number {
    font-family: 'Outfit', sans-serif;
    font-size: 48px;
    font-weight: 800;
    color: var(--primary-color);
    line-height: 1;
    margin-bottom: 8px;
}
.stat-item .stat-label {
    font-size: 15px;
    color: #94a3b8;
    font-weight: 600;
}

/* --- TOOLS STRIP --- */
.tools-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 32px;
}
.tool-card {
    background: white;
    border-radius: var(--radius-xl);
    padding: 36px 28px;
    text-align: center;
    border: 1px solid var(--border-color);
    transition: all 0.3s;
    display: flex;
    flex-direction: column;
    align-items: center;
}
.tool-card:hover {
    transform: translateY(-6px);
    box-shadow: 0 16px 48px rgba(27, 79, 138, 0.12);
    border-color: var(--primary-color);
}
.tool-icon {
    width: 60px;
    height: 60px;
    background: var(--accent-bg);
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
}
.tool-icon svg {
    width: 28px;
    height: 28px;
    stroke: var(--primary-color);
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
}
.tool-cta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 24px;
    background: var(--primary-color);
    color: white;
    border-radius: var(--radius-md);
    font-weight: 700;
    font-size: 14px;
    text-decoration: none;
    transition: background 0.2s;
    margin-top: auto;
}
.tool-cta:hover { background: var(--primary-hover); }

/* --- QUIZ CTA --- */
.quiz-cta-section {
    position: relative;
    overflow: hidden;
}
.quiz-cta-section .dot-overlay {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px);
    background-size: 20px 20px;
    pointer-events: none;
}

/* PROMO BLOCK STYLES */
.promo-block-section {
    padding: 100px 0;
    overflow: hidden;
}
.promo-container {
    display: flex;
    align-items: center;
    gap: 60px;
    border-radius: var(--radius-lg);
}
.promo-container.layout-left { flex-direction: row-reverse; }
.promo-container.layout-top { flex-direction: column; text-align: center; }
.promo-content { flex: 1; }
.promo-image-box { flex: 1; border-radius: var(--radius-lg); overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
.promo-image-box img { width: 100%; height: auto; display: block; }

/* RESPONSIVE */
@media (max-width: 992px) {
    .hero-split { flex-direction: column; text-align: center; padding: 60px 0; overflow: hidden; }
    .hero-split-left { flex: none; padding-right: 0; width: 100%; }
    .hero-split-right { flex: none; width: 100%; margin-top: 24px; }
    .hero-split-right svg { max-width: 300px; }
    .hero-split-right > div { max-width: 280px !important; max-height: 280px !important; margin: 0 auto; }
    .hero-search-bar { max-width: 100%; margin-left: auto; margin-right: auto; }
    .trust-badges { justify-content: center; flex-wrap: wrap; }
    .hero-actions { justify-content: center; }
    .journey-pillars { grid-template-columns: 1fr; max-width: 400px; margin-left: auto; margin-right: auto; }
    .bento-grid-news { grid-template-columns: 1fr; grid-template-rows: auto; }
    .bento-cell-featured { min-height: 400px; margin-bottom: 24px; }
    .bento-grid-reviews { grid-template-columns: 1fr; }
    .bento-grid-opinions { grid-template-columns: 1fr; }
    .stats-bar { grid-template-columns: repeat(2, 1fr); gap: 32px; }
    .tools-grid { grid-template-columns: 1fr; max-width: 400px; margin-left: auto; margin-right: auto; }
    .carousel-arrow { display: none; }
}

@media (max-width: 768px) {
    .promo-container { flex-direction: column !important; text-align: center; gap: 30px; }
    .promo-image-box { width: 100%; }
    .stats-bar { grid-template-columns: 1fr 1fr; }
}
</style>

    <?php
    $section_order = get_theme_mod('mlws_homepage_section_order', 'hero,latest,pathway,stats,promo,cats,tools,discovery,quiz_cta,kb,testimonials');
    $sections = explode(',', $section_order);

    foreach ($sections as $section_id) {
        $section_id = trim($section_id);

        // Check visibility toggle — skip section if toggled off in Customizer
        // Promo has its own mlws_promo_show toggle, so we skip it here
        if ( $section_id !== 'promo' && ! get_theme_mod( "mlws_show_section_{$section_id}", true ) ) {
            continue;
        }

        switch ($section_id) {
            case 'hero':
                ?>
    <!-- Hero Section: Modern Split Layout -->
    <?php
    $hero_bg = get_theme_mod('mlws_homepage_hero_image');
    if (!$hero_bg) {
        $hero_bg = get_template_directory_uri() . '/assets/img/news_hero.png';
    }

    $hero_tag = get_theme_mod('mlws_hero_tag_label', 'NEWS & DIPLOMACY');
    $hero_title = get_theme_mod('mlws_hero_custom_title', 'Bridging Nations, <span class="highlight">Building Peace</span>');
    $hero_subtitle = get_theme_mod('mlws_hero_custom_subtitle', 'Independent journalism covering Israel-Iran relations, the Cyrus Accord, and the path toward a new era of Middle East diplomacy.');

    $btn1_text = get_theme_mod('mlws_hero_button_1_text', "Latest News");
    $btn1_link = get_theme_mod('mlws_hero_button_1_link', '/healthcare-professionals/');
    $btn2_text = get_theme_mod('mlws_hero_button_2_text', "About Merlows");
    $btn2_link = get_theme_mod('mlws_hero_button_2_link', '/patients/');

    $mask_enabled = get_theme_mod('mlws_hero_mask_toggle', true);
    $mask_opacity = get_theme_mod('mlws_hero_mask_opacity', 0.5);
    $hero_title_size = get_theme_mod('mlws_hero_title_size', 52);
    $hero_title_color = get_theme_mod('mlws_hero_title_color', '#0F172A');
    $hero_subtitle_color = get_theme_mod('mlws_hero_subtitle_color', '#64748B');
    ?>
    <section class="hero-split">
        <div class="container" style="display: flex; align-items: center; flex-wrap: wrap;">
            <div class="hero-split-left">
                <span style="display: inline-block; background: var(--accent-bg); color: var(--primary-color); font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; font-size: 12px; padding: 6px 16px; border-radius: var(--radius-md); margin-bottom: 20px; border: 1px solid rgba(27,79,138,0.15);"><?php echo esc_html($hero_tag); ?></span>
                <h1 style="font-size: <?php echo esc_attr($hero_title_size); ?>px; color: <?php echo esc_attr($hero_title_color); ?>; line-height: 1.08; margin: 0 0 20px; font-weight: 800; font-family: 'Outfit', sans-serif; letter-spacing: -1px;">
                    <?php
                    $title_display = wp_kses_post($hero_title);
                    if (strpos($title_display, 'class="highlight"') !== false) {
                        $title_display = str_replace('class="highlight"', 'class="highlight" style="color: var(--primary-color);"', $title_display);
                    }
                    echo $title_display;
                    ?>
                </h1>
                <p style="font-size: 18px; line-height: 1.7; color: <?php echo esc_attr($hero_subtitle_color); ?>; margin: 0 0 0; max-width: 540px;">
                    <?php echo esc_html($hero_subtitle); ?>
                </p>

                <?php // Search bar removed ?>

                <div class="hero-actions" style="display: flex; gap: 16px; flex-wrap: wrap; margin-top: 32px; margin-bottom: 28px;">
                    <?php
                    $btn1_onclick = (strpos($btn1_link, 'quiz') !== false) ? 'onclick="event.preventDefault(); openQuizModal();"' : '';
                    $btn2_onclick = (strpos($btn2_link, 'quiz') !== false) ? 'onclick="event.preventDefault(); openQuizModal();"' : '';
                    ?>
                    <a href="<?php echo esc_url($btn1_link); ?>" <?php echo $btn1_onclick; ?> class="btn btn-primary" style="background: var(--primary-color); color: white; padding: 14px 28px; border-radius: var(--radius-md); font-weight: 700; text-decoration: none; transition: background 0.2s;"><?php echo esc_html($btn1_text); ?></a>
                    <a href="<?php echo esc_url($btn2_link); ?>" <?php echo $btn2_onclick; ?> class="btn btn-outline" style="border: 2px solid var(--secondary-color); color: var(--secondary-color); padding: 14px 28px; border-radius: var(--radius-md); font-weight: 700; text-decoration: none; transition: all 0.2s;"><?php echo esc_html($btn2_text); ?></a>
                </div>

                <div class="trust-badges">
                    <div class="trust-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        Independent Journalism
                    </div>
                    <div class="trust-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/></svg>
                        Solutions-Focused
                    </div>
                    <div class="trust-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                        Diplomatically Informed
                    </div>
                </div>
            </div>

            <div class="hero-split-right">
                <!-- Animated Merlows Logo in circular mask -->
                <div style="width: 420px; height: 420px; max-width: 100%; aspect-ratio: 1; border-radius: 50%; overflow: hidden; box-shadow: 0 20px 60px rgba(27, 79, 138, 0.15), 0 0 0 6px rgba(27, 79, 138, 0.08); margin: 0 auto;">
                    <img src="<?php echo content_url(); ?>/uploads/2026/04/IBD_logo_anime.gif" alt="Merlows" style="width: 100%; height: 100%; object-fit: cover;">
                </div>
                <!-- Original animated SVG removed - hidden, pending full cleanup -->
                <svg viewBox="0 0 500 520" style="display:none;" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="glowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#1B4F8A" stop-opacity="0.08"/>
                            <stop offset="100%" stop-color="#B8447A" stop-opacity="0.03"/>
                        </linearGradient>
                    </defs>

                    <!-- Soft background glow -->
                    <circle cx="250" cy="250" r="230" fill="url(#glowGrad)">
                        <animate attributeName="r" values="226;234;226" dur="5s" repeatCount="indefinite"/>
                    </circle>

                    <!-- ======================================================
                         MAIN CIRCLE RING — thick solid ring with 3 gaps
                         Drawn as 3 thick arcs. Centre at (250,250), radius 130.
                         Gaps at ~120deg, ~240deg, ~360deg (where people sit).
                         ====================================================== -->
                    <!-- Arc 1: from ~40deg to ~140deg (top-right to bottom-right, passing through right side) -->
                    <path d="M 349.5,185 A 130,130 0 0,1 315,365" fill="none" stroke="#1B4F8A" stroke-width="14" stroke-linecap="round" opacity="0"
                          stroke-dasharray="290" stroke-dashoffset="290">
                        <animate attributeName="opacity" from="0" to="1" begin="0.4s" dur="0.01s" fill="freeze"/>
                        <animate attributeName="stroke-dashoffset" from="290" to="0" dur="1s" begin="0.4s" fill="freeze" calcMode="spline" keySplines="0.42 0 0.58 1"/>
                    </path>
                    <!-- Arc 2: from ~160deg to ~260deg (bottom-right to bottom-left, passing through bottom) -->
                    <path d="M 285,375 A 130,130 0 0,1 152,185" fill="none" stroke="#1B4F8A" stroke-width="14" stroke-linecap="round" opacity="0"
                          stroke-dasharray="290" stroke-dashoffset="290">
                        <animate attributeName="opacity" from="0" to="1" begin="0.7s" dur="0.01s" fill="freeze"/>
                        <animate attributeName="stroke-dashoffset" from="290" to="0" dur="1s" begin="0.7s" fill="freeze" calcMode="spline" keySplines="0.42 0 0.58 1"/>
                    </path>
                    <!-- Arc 3: from ~280deg to ~20deg (top-left to top-right, passing through top) -->
                    <path d="M 170,165 A 130,130 0 0,1 330,165" fill="none" stroke="#1B4F8A" stroke-width="14" stroke-linecap="round" opacity="0"
                          stroke-dasharray="260" stroke-dashoffset="260">
                        <animate attributeName="opacity" from="0" to="1" begin="1s" dur="0.01s" fill="freeze"/>
                        <animate attributeName="stroke-dashoffset" from="260" to="0" dur="1s" begin="1s" fill="freeze" calcMode="spline" keySplines="0.42 0 0.58 1"/>
                    </path>

                    <!-- ======================================================
                         PERSON: TOP CENTRE (~12 o'clock)
                         Head sits ON the ring. Arms curve down to grip ring.
                         All solid teal fills and thick strokes.
                         ====================================================== -->
                    <g opacity="0">
                        <circle cx="250" cy="92" r="20" fill="#1B4F8A"/>
                        <path d="M 225,138 C 225,118 237,114 250,114 C 263,114 275,118 275,138" fill="none" stroke="#1B4F8A" stroke-width="11" stroke-linecap="round"/>
                        <path d="M 225,132 C 210,148 192,162 178,170" fill="none" stroke="#1B4F8A" stroke-width="10" stroke-linecap="round"/>
                        <path d="M 275,132 C 290,148 308,162 322,170" fill="none" stroke="#1B4F8A" stroke-width="10" stroke-linecap="round"/>
                        <animate attributeName="opacity" from="0" to="1" begin="1.7s" dur="0.4s" fill="freeze"/>
                    </g>

                    <!-- ======================================================
                         PERSON: BOTTOM-LEFT (~7 o'clock / ~220deg)
                         ====================================================== -->
                    <g opacity="0">
                        <circle cx="130" cy="370" r="20" fill="#1B4F8A"/>
                        <path d="M 105,416 C 105,396 117,392 130,392 C 143,392 155,396 155,416" fill="none" stroke="#1B4F8A" stroke-width="11" stroke-linecap="round"/>
                        <path d="M 108,408 C 100,390 100,372 108,352" fill="none" stroke="#1B4F8A" stroke-width="10" stroke-linecap="round"/>
                        <path d="M 152,408 C 168,398 186,390 202,386" fill="none" stroke="#1B4F8A" stroke-width="10" stroke-linecap="round"/>
                        <animate attributeName="opacity" from="0" to="1" begin="2s" dur="0.4s" fill="freeze"/>
                    </g>

                    <!-- ======================================================
                         PERSON: BOTTOM-RIGHT (~5 o'clock / ~320deg)
                         ====================================================== -->
                    <g opacity="0">
                        <circle cx="370" cy="370" r="20" fill="#1B4F8A"/>
                        <path d="M 345,416 C 345,396 357,392 370,392 C 383,392 395,396 395,416" fill="none" stroke="#1B4F8A" stroke-width="11" stroke-linecap="round"/>
                        <path d="M 392,408 C 400,390 400,372 392,352" fill="none" stroke="#1B4F8A" stroke-width="10" stroke-linecap="round"/>
                        <path d="M 348,408 C 332,398 314,390 298,386" fill="none" stroke="#1B4F8A" stroke-width="10" stroke-linecap="round"/>
                        <animate attributeName="opacity" from="0" to="1" begin="2.3s" dur="0.4s" fill="freeze"/>
                    </g>

                    <!-- ======================================================
                         CENTRAL GI / INTESTINE ICON
                         Solid filled shape matching the logo exactly:
                         - Oesophagus tube at top
                         - Stomach bulge
                         - 3 intestinal S-curves
                         - Tapered end at bottom
                         Drawn as a thick filled stroke outline.
                         ====================================================== -->
                    <g transform="translate(250, 252)" opacity="0">
                        <!-- Main organ outline — thick stroke, rounded joins -->
                        <path d="M 0,-80
                                 C 14,-80 24,-74 24,-62
                                 L 24,-48
                                 C 24,-38 30,-30 36,-22
                                 C 44,-12 44,4 36,14
                                 C 28,24 20,24 20,34
                                 C 20,44 28,48 36,48
                                 C 44,48 44,60 36,68
                                 C 28,76 14,80 0,80
                                 C -14,80 -28,76 -36,68
                                 C -44,60 -44,48 -36,48
                                 C -28,48 -20,44 -20,34
                                 C -20,24 -28,24 -36,14
                                 C -44,4 -44,-12 -36,-22
                                 C -30,-30 -24,-38 -24,-48
                                 L -24,-62
                                 C -24,-74 -14,-80 0,-80 Z"
                              fill="#1B4F8A"
                              opacity="0.9"
                              transform="scale(0)" transform-origin="0 0">
                            <animateTransform attributeName="transform" type="scale" from="0" to="1" begin="0.3s" dur="0.8s" fill="freeze" calcMode="spline" keySplines="0.34 1.56 0.64 1"/>
                        </path>

                        <!-- Inner cutout / negative space showing intestinal folds -->
                        <path d="M 0,-64
                                 C 8,-64 12,-58 12,-48
                                 L 12,-38
                                 C 12,-28 18,-20 24,-12
                                 C 30,-4 30,6 24,12
                                 C 16,20 8,18 8,28
                                 C 8,38 16,40 24,40
                                 C 30,40 30,52 24,58
                                 C 18,64 8,66 0,66
                                 C -8,66 -18,64 -24,58
                                 C -30,52 -30,40 -24,40
                                 C -16,40 -8,38 -8,28
                                 C -8,18 -16,20 -24,12
                                 C -30,6 -30,-4 -24,-12
                                 C -18,-20 -12,-28 -12,-38
                                 L -12,-48
                                 C -12,-58 -8,-64 0,-64 Z"
                              fill="white"
                              opacity="0"
                              transform="scale(0)" transform-origin="0 0">
                            <animate attributeName="opacity" from="0" to="1" begin="0.8s" dur="0.4s" fill="freeze"/>
                            <animateTransform attributeName="transform" type="scale" from="0" to="1" begin="0.8s" dur="0.5s" fill="freeze" calcMode="spline" keySplines="0.34 1.56 0.64 1"/>
                        </path>

                        <!-- Centre line detail — the vertical fold lines inside the GI tract -->
                        <line x1="0" y1="-56" x2="0" y2="-40" stroke="white" stroke-width="3" stroke-linecap="round" opacity="0">
                            <animate attributeName="opacity" from="0" to="0.4" begin="1.3s" dur="0.3s" fill="freeze"/>
                        </line>
                    </g>

                    <!-- ======================================================
                         SUBTLE AMBIENT ANIMATIONS
                         ====================================================== -->
                    <!-- Pulse rings -->
                    <circle cx="250" cy="250" r="140" fill="none" stroke="#1B4F8A" stroke-width="1.5" opacity="0">
                        <animate attributeName="r" values="145;190" dur="3s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.25;0" dur="3s" repeatCount="indefinite"/>
                    </circle>
                    <circle cx="250" cy="250" r="140" fill="none" stroke="#1B4F8A" stroke-width="1" opacity="0">
                        <animate attributeName="r" values="150;210" dur="3s" begin="1s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.12;0" dur="3s" begin="1s" repeatCount="indefinite"/>
                    </circle>

                    <!-- Floating particles -->
                    <circle cx="70" cy="170" r="4" fill="#1B4F8A" opacity="0.2">
                        <animate attributeName="cy" values="170;155;170" dur="5s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.2;0.4;0.2" dur="5s" repeatCount="indefinite"/>
                    </circle>
                    <circle cx="430" cy="190" r="3" fill="#B8447A" opacity="0.15">
                        <animate attributeName="cy" values="190;178;190" dur="4.2s" repeatCount="indefinite"/>
                    </circle>
                    <circle cx="90" cy="410" r="3" fill="#B8447A" opacity="0.15">
                        <animate attributeName="cy" values="410;398;410" dur="4.8s" repeatCount="indefinite"/>
                    </circle>
                    <circle cx="410" cy="430" r="3.5" fill="#1B4F8A" opacity="0.12">
                        <animate attributeName="cy" values="430;418;430" dur="5.5s" repeatCount="indefinite"/>
                    </circle>
                </svg>
            </div>
        </div>
    </section>
                <?php
                break;

            case 'latest':
                // Fetch latest published posts
                $latest_title      = get_theme_mod('mlws_pathway_latest_title', 'LATEST CONTENT');
                $latest_count      = get_theme_mod('mlws_pathway_latest_count', 6);
                $latest_cat        = (int) get_theme_mod('mlws_pathway_latest_category', 0);
                $show_date         = get_theme_mod('mlws_pathway_latest_show_date', true);
                $latest_tag_label  = get_theme_mod('mlws_latest_tag_label', 'LATEST FROM THE HUB');
                $latest_align      = get_theme_mod('mlws_latest_text_align', 'left');
                $latest_layout     = get_theme_mod('mlws_latest_layout', 'carousel');
                $latest_show_excerpt  = get_theme_mod('mlws_latest_show_excerpt', true);
                $latest_show_cat      = get_theme_mod('mlws_latest_show_category', true);
                $latest_section_bg    = get_theme_mod('mlws_latest_section_bg', '#F8FAFC');

                $cpt_post_types = array(
                    'post', 'news', 'research', 'oped', 'review',
                    'whitepaper', 'podcast', 'webinar', 'course', 'infographic',
                );

                $query_args = array(
                    'numberposts' => $latest_count,
                    'post_status' => 'publish',
                    'post_type'   => $cpt_post_types,
                    'orderby'     => 'date',
                    'order'       => 'DESC',
                );
                if ($latest_cat > 0) {
                    $query_args['category'] = $latest_cat;
                }
                $latest_posts = get_posts($query_args);

                // Reusable: get thumbnail with category fallback
                if (!function_exists('mlws_get_latest_thumb')) {
                    function mlws_get_latest_thumb($post_id) {
                        $thumb = get_the_post_thumbnail_url($post_id, 'medium');
                        if ($thumb) return $thumb;
                        $hero_map = array(
                            'breaking-news' => 'news_hero.png', 'diplomatic-analysis' => 'research_hero.png',
                            'op-eds-commentary' => 'opinion_hero.png', 'cyrus-accord' => 'hcp_hero.png',
                            'abraham-accords' => 'education_hero.png', 'regional-voices' => 'patient_hero.png',
                        );
                        $url_map = array('regional-voices' => content_url() . '/uploads/2026/04/ibdliving_hero.png');
                        $p_cats = get_the_category($post_id);
                        if (!empty($p_cats)) {
                            foreach ($p_cats as $pc) {
                                if (isset($url_map[$pc->slug])) return $url_map[$pc->slug];
                                if (isset($hero_map[$pc->slug])) return get_template_directory_uri() . '/assets/img/' . $hero_map[$pc->slug];
                            }
                        }
                        return get_template_directory_uri() . '/assets/img/news_hero.png';
                    }
                }

                $align_style = 'text-align: ' . esc_attr($latest_align) . ';';
                $justify_header = ($latest_align === 'center') ? 'justify-content: center;' : (($latest_align === 'right') ? 'justify-content: flex-end;' : 'justify-content: flex-start;');
                ?>
    <!-- Latest from the Hub Section -->
    <section style="padding: 55px 0 35px; background: <?php echo esc_attr($latest_section_bg); ?>;">
        <div class="container">
            <div style="display: flex; align-items: center; <?php echo $justify_header; ?> margin-bottom: 32px; <?php echo $align_style; ?>">
                <div style="<?php echo $align_style; ?>">
                    <span style="display: inline-block; background: var(--accent-bg); color: var(--primary-color); font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; padding: 6px 16px; border-radius: var(--radius-md); margin-bottom: 12px; border: 1px solid rgba(27,79,138,0.15);"><?php echo esc_html($latest_tag_label); ?></span>
                    <h3 style="font-family: 'Outfit', sans-serif; font-size: 28px; font-weight: 800; color: var(--secondary-color); margin: 0;"><?php echo esc_html($latest_title); ?></h3>
                </div>
            </div>

            <?php if (!empty($latest_posts)) : ?>

                <?php if ($latest_layout === 'carousel') : ?>
                <!-- Carousel Layout -->
                <div class="latest-carousel-wrapper">
                    <button class="carousel-arrow carousel-arrow-left" onclick="document.getElementById('latestCarousel').scrollBy({left:-310,behavior:'smooth'})" aria-label="Scroll left">
                        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                    <div class="latest-carousel" id="latestCarousel">
                        <?php foreach ($latest_posts as $p) : ?>
                        <a href="<?php echo get_permalink($p->ID); ?>" class="latest-card">
                            <div class="latest-card-img">
                                <img src="<?php echo esc_url(mlws_get_latest_thumb($p->ID)); ?>" alt="" style="width:100%;height:100%;object-fit:cover;">
                            </div>
                            <div class="latest-card-body">
                                <?php if ($latest_show_cat) : ?>
                                <span style="display: inline-block; background: var(--accent-bg); color: var(--primary-color); font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 3px 10px; border-radius: var(--radius-sm); margin-bottom: 10px; letter-spacing: 0.5px;">
                                    <?php $cats = get_the_category($p->ID); echo !empty($cats) ? esc_html($cats[0]->name) : 'Latest'; ?>
                                </span>
                                <?php endif; ?>
                                <h4 style="font-size: 15px; font-weight: 700; color: var(--secondary-color); margin: 0 0 8px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;"><?php echo get_the_title($p->ID); ?></h4>
                                <?php if ($latest_show_excerpt) : ?>
                                <p style="font-size: 13px; color: var(--text-light); line-height: 1.5; margin: 0 0 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;"><?php echo wp_trim_words(get_the_excerpt($p->ID), 12); ?></p>
                                <?php endif; ?>
                                <?php if ($show_date) : ?>
                                <div style="font-size: 12px; color: #94a3b8; margin-top: auto; padding-top: 10px; border-top: 1px solid #f1f5f9;"><?php echo get_the_date('', $p->ID); ?></div>
                                <?php endif; ?>
                            </div>
                        </a>
                        <?php endforeach; ?>
                    </div>
                    <button class="carousel-arrow carousel-arrow-right" onclick="document.getElementById('latestCarousel').scrollBy({left:310,behavior:'smooth'})" aria-label="Scroll right">
                        <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                </div>

                <?php elseif ($latest_layout === 'bento') : ?>
                <!-- Bento Box Layout: first post featured large, rest in grid -->
                <?php $first = array_shift($latest_posts); ?>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                    <!-- Featured post -->
                    <a href="<?php echo get_permalink($first->ID); ?>" style="text-decoration: none; display: block; background: white; border-radius: var(--radius-lg); overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; grid-row: 1 / span 2;">
                        <div style="position: relative; height: 300px; overflow: hidden;">
                            <img src="<?php echo esc_url(mlws_get_latest_thumb($first->ID)); ?>" alt="" style="width:100%;height:100%;object-fit:cover;">
                            <?php if ($show_date) : ?>
                            <div style="position: absolute; bottom: 12px; left: 12px; background: rgba(0,0,0,0.6); color: white; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 4px;"><?php echo get_the_date('', $first->ID); ?></div>
                            <?php endif; ?>
                        </div>
                        <div style="padding: 24px;">
                            <?php if ($latest_show_cat) : $cats = get_the_category($first->ID); if (!empty($cats)) : ?>
                            <span style="display: inline-block; background: var(--accent-bg); color: var(--primary-color); font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 3px 10px; border-radius: var(--radius-sm); margin-bottom: 12px; letter-spacing: 0.5px;"><?php echo esc_html($cats[0]->name); ?></span>
                            <?php endif; endif; ?>
                            <h4 style="font-size: 20px; font-weight: 800; color: var(--secondary-color); margin: 0 0 10px; line-height: 1.3;"><?php echo get_the_title($first->ID); ?></h4>
                            <?php if ($latest_show_excerpt) : ?>
                            <p style="font-size: 14px; color: var(--text-light); line-height: 1.6; margin: 0;"><?php echo wp_trim_words(get_the_excerpt($first->ID), 20); ?></p>
                            <?php endif; ?>
                        </div>
                    </a>
                    <!-- Side grid -->
                    <div style="display: flex; flex-direction: column; gap: 24px;">
                        <?php foreach ($latest_posts as $p) : ?>
                        <a href="<?php echo get_permalink($p->ID); ?>" style="text-decoration: none; display: flex; gap: 16px; background: white; border-radius: var(--radius-lg); overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06); transition: transform 0.2s; flex: 1;">
                            <div style="width: 140px; min-height: 100px; flex-shrink: 0; overflow: hidden;">
                                <img src="<?php echo esc_url(mlws_get_latest_thumb($p->ID)); ?>" alt="" style="width:100%;height:100%;object-fit:cover;">
                            </div>
                            <div style="padding: 16px 16px 16px 0; display: flex; flex-direction: column; justify-content: center;">
                                <?php if ($latest_show_cat) : $cats = get_the_category($p->ID); if (!empty($cats)) : ?>
                                <span style="display: inline-block; background: var(--accent-bg); color: var(--primary-color); font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: var(--radius-sm); margin-bottom: 6px; letter-spacing: 0.5px; width: fit-content;"><?php echo esc_html($cats[0]->name); ?></span>
                                <?php endif; endif; ?>
                                <h4 style="font-size: 14px; font-weight: 700; color: var(--secondary-color); margin: 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;"><?php echo get_the_title($p->ID); ?></h4>
                                <?php if ($show_date) : ?>
                                <div style="font-size: 11px; color: #94a3b8; margin-top: 6px;"><?php echo get_the_date('', $p->ID); ?></div>
                                <?php endif; ?>
                            </div>
                        </a>
                        <?php endforeach; ?>
                    </div>
                </div>

                <?php elseif ($latest_layout === 'grid') : ?>
                <!-- Grid Layout: equal cards -->
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px;">
                    <?php foreach ($latest_posts as $p) : ?>
                    <a href="<?php echo get_permalink($p->ID); ?>" style="text-decoration: none; display: block; background: white; border-radius: var(--radius-lg); overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s;">
                        <div style="position: relative; height: 180px; overflow: hidden;">
                            <img src="<?php echo esc_url(mlws_get_latest_thumb($p->ID)); ?>" alt="" style="width:100%;height:100%;object-fit:cover;">
                            <?php if ($show_date) : ?>
                            <div style="position: absolute; bottom: 10px; left: 10px; background: rgba(0,0,0,0.6); color: white; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 4px;"><?php echo get_the_date('', $p->ID); ?></div>
                            <?php endif; ?>
                        </div>
                        <div style="padding: 20px;">
                            <?php if ($latest_show_cat) : $cats = get_the_category($p->ID); if (!empty($cats)) : ?>
                            <span style="display: inline-block; background: var(--accent-bg); color: var(--primary-color); font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 3px 10px; border-radius: var(--radius-sm); margin-bottom: 10px; letter-spacing: 0.5px;"><?php echo esc_html($cats[0]->name); ?></span>
                            <?php endif; endif; ?>
                            <h4 style="font-size: 15px; font-weight: 700; color: var(--secondary-color); margin: 0 0 8px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;"><?php echo get_the_title($p->ID); ?></h4>
                            <?php if ($latest_show_excerpt) : ?>
                            <p style="font-size: 13px; color: var(--text-light); line-height: 1.5; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;"><?php echo wp_trim_words(get_the_excerpt($p->ID), 12); ?></p>
                            <?php endif; ?>
                        </div>
                    </a>
                    <?php endforeach; ?>
                </div>

                <?php elseif ($latest_layout === 'list') : ?>
                <!-- List Layout: horizontal rows -->
                <div style="display: flex; flex-direction: column; gap: 16px;">
                    <?php foreach ($latest_posts as $p) : ?>
                    <a href="<?php echo get_permalink($p->ID); ?>" style="text-decoration: none; display: flex; gap: 20px; background: white; border-radius: var(--radius-lg); overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06); transition: transform 0.2s; padding: 0;">
                        <div style="width: 200px; min-height: 130px; flex-shrink: 0; overflow: hidden;">
                            <img src="<?php echo esc_url(mlws_get_latest_thumb($p->ID)); ?>" alt="" style="width:100%;height:100%;object-fit:cover;">
                        </div>
                        <div style="padding: 20px 20px 20px 0; display: flex; flex-direction: column; justify-content: center; flex: 1;">
                            <?php if ($latest_show_cat) : $cats = get_the_category($p->ID); if (!empty($cats)) : ?>
                            <span style="display: inline-block; background: var(--accent-bg); color: var(--primary-color); font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 3px 10px; border-radius: var(--radius-sm); margin-bottom: 8px; letter-spacing: 0.5px; width: fit-content;"><?php echo esc_html($cats[0]->name); ?></span>
                            <?php endif; endif; ?>
                            <h4 style="font-size: 16px; font-weight: 700; color: var(--secondary-color); margin: 0 0 6px; line-height: 1.4;"><?php echo get_the_title($p->ID); ?></h4>
                            <?php if ($latest_show_excerpt) : ?>
                            <p style="font-size: 13px; color: var(--text-light); line-height: 1.5; margin: 0 0 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;"><?php echo wp_trim_words(get_the_excerpt($p->ID), 18); ?></p>
                            <?php endif; ?>
                            <?php if ($show_date) : ?>
                            <div style="font-size: 12px; color: #94a3b8;"><?php echo get_the_date('', $p->ID); ?></div>
                            <?php endif; ?>
                        </div>
                    </a>
                    <?php endforeach; ?>
                </div>
                <?php endif; ?>

            <?php else : ?>
                <div style="background: white; border-radius: var(--radius-lg); padding: 40px; text-align: center; border: 1px solid var(--border-color);">
                    <p style="color: var(--text-light); margin: 0;">No posts found.</p>
                </div>
            <?php endif; ?>
        </div>
    </section>
                <?php
                break;

            case 'pathway':
                $tile_radius = get_theme_mod('mlws_pathway_tile_radius', 16);
                $image_radius = get_theme_mod('mlws_pathway_tile_image_radius', 8);

                // Pathway Customizer values
                $pathway_hover_color    = get_theme_mod('mlws_pathway_card_hover_color', '#1B4F8A');
                $pathway_icon_bg        = get_theme_mod('mlws_pathway_icon_bg_color', '#0F172A');
                $pathway_icon_hover_bg  = get_theme_mod('mlws_pathway_icon_hover_bg_color', 'rgba(255,255,255,0.2)');
                $pathway_who_label      = get_theme_mod('mlws_pathway_who_label', 'Who Am I?');

                // Practitioner tile
                $prac_title = get_theme_mod('mlws_practitioner_tile_title', 'For Practitioners');
                $prac_desc = get_theme_mod('mlws_practitioner_tile_desc', 'Access clinical reviews, evidence-based guidelines, and professional tools tailored for modern healthcare practitioners.');
                $prac_extra = get_theme_mod('mlws_practitioner_tile_extra', 'Bridging science and clinical outcomes');
                $prac_img = get_theme_mod('mlws_practitioner_tile_image');
                $prac_link = get_theme_mod('mlws_practitioner_tile_link', '/healthcare-professionals/');
                $prac_tile_radius = get_theme_mod('mlws_practitioner_tile_radius', 16);
                $prac_img_radius = get_theme_mod('mlws_practitioner_image_radius', 8);

                // Patient tile
                $pat_title = get_theme_mod('mlws_patient_tile_title', 'For Patients');
                $pat_desc = get_theme_mod('mlws_patient_tile_desc', 'Learn about chronic conditions, health optimization, and healthy living through our expert-led patient curriculum.');
                $pat_extra = get_theme_mod('mlws_patient_tile_extra', 'Empowering your health journey daily');
                $pat_img = get_theme_mod('mlws_patient_tile_image');
                $pat_link = get_theme_mod('mlws_patient_tile_link', '/patients/');
                $pat_tile_radius = get_theme_mod('mlws_patient_tile_radius', 16);
                $pat_img_radius = get_theme_mod('mlws_patient_image_radius', 8);
                ?>
    <!-- Journey Pillars + Latest Content Section -->
    <section style="padding: 75px 0 55px; background: #F8FAFC;">
        <div class="container">
            <!-- Section Header -->
            <div style="text-align: center; margin-bottom: 60px;">
                <span style="display: inline-block; background: var(--accent-bg); color: var(--primary-color); font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; font-size: 12px; padding: 6px 16px; border-radius: var(--radius-md); margin-bottom: 16px; border: 1px solid rgba(27,79,138,0.15);">YOUR JOURNEY</span>
                <h2 style="font-family: 'Outfit', sans-serif; font-size: 38px; font-weight: 800; color: var(--secondary-color); margin: 0 0 12px; letter-spacing: -0.5px;">Choose Your Health Pathway</h2>
                <p style="color: var(--text-light); font-size: 17px; max-width: 580px; margin: 0 auto; line-height: 1.6;">Navigate evidence-based health information tailored to your role and needs.</p>
            </div>

            <!-- 3-Column Journey Pillars -->
            <div class="journey-pillars">
                <!-- Pillar 1: Understand (mapped from Practitioner tile) -->
                <a href="<?php echo esc_url($prac_link); ?>" class="pillar-card">
                    <div class="pillar-icon" style="background: linear-gradient(135deg, #1B4F8A, #B8447A);">
                        <svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><path d="M8 7h8M8 11h6"/></svg>
                    </div>
                    <h3 style="font-family: 'Outfit', sans-serif; font-size: 22px; font-weight: 800; color: var(--secondary-color); margin: 0 0 12px;"><?php echo esc_html($prac_title); ?></h3>
                    <p style="color: var(--text-light); font-size: 15px; line-height: 1.6; margin: 0 0 16px;"><?php echo esc_html($prac_desc); ?></p>
                    <span style="color: var(--primary-color); font-weight: 700; font-size: 14px;"><?php echo esc_html($prac_extra); ?> &rarr;</span>
                </a>

                <!-- Pillar 2: Manage (mapped from Patient tile) -->
                <a href="<?php echo esc_url($pat_link); ?>" class="pillar-card">
                    <div class="pillar-icon" style="background: linear-gradient(135deg, #153D6E, #1B4F8A);">
                        <svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                    </div>
                    <h3 style="font-family: 'Outfit', sans-serif; font-size: 22px; font-weight: 800; color: var(--secondary-color); margin: 0 0 12px;"><?php echo esc_html($pat_title); ?></h3>
                    <p style="color: var(--text-light); font-size: 15px; line-height: 1.6; margin: 0 0 16px;"><?php echo esc_html($pat_desc); ?></p>
                    <span style="color: var(--primary-color); font-weight: 700; font-size: 14px;"><?php echo esc_html($pat_extra); ?> &rarr;</span>
                </a>

                <!-- Pillar 3: Thrive (Community/Support) -->
                <a href="<?php echo esc_url(home_url('/community/')); ?>" class="pillar-card">
                    <div class="pillar-icon" style="background: linear-gradient(135deg, #B8447A, #C75D8E);">
                        <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                    </div>
                    <h3 style="font-family: 'Outfit', sans-serif; font-size: 22px; font-weight: 800; color: var(--secondary-color); margin: 0 0 12px;">Community &amp; Support</h3>
                    <p style="color: var(--text-light); font-size: 15px; line-height: 1.6; margin: 0 0 16px;">Connect with others on similar journeys, share experiences, and access emotional wellness resources.</p>
                    <span style="color: var(--primary-color); font-weight: 700; font-size: 14px;">Join the Community &rarr;</span>
                </a>
            </div>
        </div>
    </section>
                <?php
                break;

            case 'stats':
                $stat1_num   = get_theme_mod('mlws_stat_1_number', '12,000');
                $stat1_label = get_theme_mod('mlws_stat_1_label', 'Resources');
                $stat2_num   = get_theme_mod('mlws_stat_2_number', '500');
                $stat2_label = get_theme_mod('mlws_stat_2_label', 'Clinical Reviews');
                $stat3_num   = get_theme_mod('mlws_stat_3_number', '50');
                $stat3_label = get_theme_mod('mlws_stat_3_label', 'Expert Contributors');
                $stat4_num   = get_theme_mod('mlws_stat_4_number', '15');
                $stat4_label = get_theme_mod('mlws_stat_4_label', 'Health Tools');
                ?>
    <!-- Social Proof Stats Bar -->
    <section style="padding: 55px 0; background: #0F172A; position: relative; overflow: hidden;">
        <div style="position: absolute; top: -60px; right: -60px; width: 300px; height: 300px; background: radial-gradient(circle, rgba(27,79,138,0.15) 0%, transparent 70%); pointer-events: none;"></div>
        <div style="position: absolute; bottom: -40px; left: -40px; width: 250px; height: 250px; background: radial-gradient(circle, rgba(109,40,217,0.08) 0%, transparent 70%); pointer-events: none;"></div>
        <div class="container" style="position: relative; z-index: 1;">
            <div class="stats-bar">
                <div class="stat-item" data-target="<?php echo esc_attr(preg_replace('/[^0-9]/', '', $stat1_num)); ?>">
                    <div class="stat-number" data-suffix="+">0</div>
                    <div class="stat-label"><?php echo esc_html($stat1_label); ?></div>
                </div>
                <div class="stat-item" data-target="<?php echo esc_attr(preg_replace('/[^0-9]/', '', $stat2_num)); ?>">
                    <div class="stat-number" data-suffix="+">0</div>
                    <div class="stat-label"><?php echo esc_html($stat2_label); ?></div>
                </div>
                <div class="stat-item" data-target="<?php echo esc_attr(preg_replace('/[^0-9]/', '', $stat3_num)); ?>">
                    <div class="stat-number" data-suffix="+">0</div>
                    <div class="stat-label"><?php echo esc_html($stat3_label); ?></div>
                </div>
                <div class="stat-item" data-target="<?php echo esc_attr(preg_replace('/[^0-9]/', '', $stat4_num)); ?>">
                    <div class="stat-number" data-suffix="+">0</div>
                    <div class="stat-label"><?php echo esc_html($stat4_label); ?></div>
                </div>
            </div>
        </div>
        <script>
        document.addEventListener('DOMContentLoaded', function() {
            var statItems = document.querySelectorAll('.stat-item[data-target]');
            var observer = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (entry.isIntersecting) {
                        var el = entry.target;
                        var numEl = el.querySelector('.stat-number');
                        var target = parseInt(el.getAttribute('data-target')) || 0;
                        var suffix = numEl.getAttribute('data-suffix') || '';
                        var duration = 2000;
                        var start = 0;
                        var startTime = null;
                        function animate(ts) {
                            if (!startTime) startTime = ts;
                            var progress = Math.min((ts - startTime) / duration, 1);
                            var eased = 1 - Math.pow(1 - progress, 3);
                            numEl.textContent = Math.floor(eased * target).toLocaleString() + suffix;
                            if (progress < 1) requestAnimationFrame(animate);
                        }
                        requestAnimationFrame(animate);
                        observer.unobserve(el);
                    }
                });
            }, { threshold: 0.3 });
            statItems.forEach(function(item) { observer.observe(item); });
        });
        </script>
    </section>
                <?php
                break;

            case 'promo':
                if (get_theme_mod('mlws_promo_show', false)) :
                    $promo_h = get_theme_mod('mlws_promo_heading', 'Experience the Hub');
                    $promo_t = get_theme_mod('mlws_promo_text', '');
                    $promo_img = get_theme_mod('mlws_promo_image');
                    $promo_bg = get_theme_mod('mlws_promo_bg_color', '#F8FAFC');
                    $promo_txt_c = get_theme_mod('mlws_promo_text_color', '#0F172A');
                    $promo_btn_t = get_theme_mod('mlws_promo_button_text', 'Get Started Now');
                    $promo_btn_l = get_theme_mod('mlws_promo_button_link', wp_registration_url());
                    $promo_w = get_theme_mod('mlws_promo_width', 'container');
                    $promo_l = get_theme_mod('mlws_promo_layout', 'right');
                    ?>
    <section class="promo-block-section" style="background-color: <?php echo esc_attr($promo_bg); ?>; color: <?php echo esc_attr($promo_txt_c); ?>;">
        <div class="<?php echo $promo_w === 'container' ? 'container' : 'container-fluid'; ?>">
            <div class="promo-container layout-<?php echo esc_attr($promo_l); ?>">
                <div class="promo-content">
                    <h2 style="font-family: 'Outfit', sans-serif; font-size: 38px; font-weight: 800; margin-bottom: 24px; color: inherit;"><?php echo esc_html($promo_h); ?></h2>
                    <div style="font-size: 18px; line-height: 1.6; opacity: 0.9; margin-bottom: 32px;"><?php echo wpautop(esc_html($promo_t)); ?></div>
                    <a href="<?php echo esc_url($promo_btn_l); ?>" class="btn btn-primary" style="background: var(--primary-color); color: white; padding: 14px 40px; font-weight: 800; border-radius: var(--radius-md); text-decoration: none;"><?php echo esc_html($promo_btn_t); ?></a>
                </div>
                <?php if ($promo_img) : ?>
                <div class="promo-image-box">
                    <img src="<?php echo esc_url($promo_img); ?>" alt="Promo">
                </div>
                <?php endif; ?>
            </div>
        </div>
    </section>
                    <?php
                endif;
                break;

            case 'cats':
                // Layout settings
                $cards_per_row = get_theme_mod('mlws_homepage_cards_per_row', 6);
                $justification = get_theme_mod('mlws_homepage_card_alignment', 'center');
                $all_cats = get_categories(array('hide_empty' => false));
                $cards = array();

                foreach ($all_cats as $cat) {
                    if (get_theme_mod("mlws_cat_card_show_{$cat->term_id}", true)) {
                        $cards[] = array(
                            'cat' => $cat,
                            'priority' => get_theme_mod("mlws_cat_card_priority_{$cat->term_id}", 10),
                            'icon' => get_theme_mod("mlws_cat_card_icon_{$cat->term_id}", ''),
                        );
                    }
                }

                if (!empty($cards)) :
                    usort($cards, function($a, $b) {
                        return $a['priority'] - $b['priority'];
                    });

                    $grid_cols = "repeat($cards_per_row, 1fr)";
                    $justify = ($justification === 'left') ? 'start' : (($justification === 'right') ? 'end' : 'center');
                ?>
    <!-- CATEGORY CARDS SECTION -->
    <section class="category-cards-section" style="padding: 55px 0; background: #ffffff; position: relative;">
        <div class="container">
            <div style="text-align: center; margin-bottom: 48px;">
                <span style="display: inline-block; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: var(--primary-color); margin-bottom: 8px;">BROWSE BY TOPIC</span>
                <h2 style="font-family: 'Outfit', sans-serif; font-size: 32px; font-weight: 800; color: var(--secondary-color); margin: 0;">Explore Health Categories</h2>
            </div>
            <div style="display: grid; grid-template-columns: <?php echo $grid_cols; ?>; gap: 16px; justify-items: <?php echo $justify; ?>;">
                <?php foreach ($cards as $item):
                    $cat = $item['cat'];
                ?>
                <a href="<?php echo esc_url(get_category_link($cat->term_id)); ?>" class="ibd-category-card" style="text-decoration: none; display: flex; flex-direction: column; align-items: center; gap: 12px; background: #1E293B; border-radius: var(--radius-lg); padding: 24px 12px; transition: all 0.3s; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid #334155; width: 100%; max-width: 160px;">
                    <?php
                    $cat_icon = $item['icon'] ?: mlws_get_category_icon_url($cat->name);
                    ?>
                        <div style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.1); border-radius: var(--radius-md);">
                            <?php if ($cat_icon): ?>
                                <img src="<?php echo esc_url($cat_icon); ?>" alt="" class="orange-icon" style="width: 24px; height: 24px; object-fit: contain; filter: brightness(0) invert(1);">
                            <?php else: ?>
                                <div style="font-size: 20px;">&#128193;</div>
                            <?php endif; ?>
                        </div>
                    <h3 style="font-size: 13px; font-weight: 700; color: white; text-align: center; margin: 0; line-height: 1.2;"><?php echo esc_html($cat->name); ?></h3>
                </a>
                <?php endforeach; ?>
            </div>
        </div>
    </section>
                <?php
                endif;
                break;

            case 'tools':
                $tool1_link = get_theme_mod('mlws_tool_1_link', '/tools/blood-test-tracker/');
                $tool2_link = get_theme_mod('mlws_tool_2_link', '/tools/malnutrition-calculator/');
                $tool3_link = get_theme_mod('mlws_tool_3_link', '/ask-ai/');
                ?>
    <!-- Featured Tools Section -->
    <section style="padding: 75px 0; background: #F5E6A3;">
        <div class="container">
            <div style="text-align: center; margin-bottom: 60px;">
                <span style="display: inline-block; background: white; color: var(--primary-color); font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; font-size: 12px; padding: 6px 16px; border-radius: var(--radius-md); margin-bottom: 16px; border: 1px solid rgba(27,79,138,0.15);">INTERACTIVE</span>
                <h2 style="font-family: 'Outfit', sans-serif; font-size: 38px; font-weight: 800; color: var(--secondary-color); margin: 0 0 12px; letter-spacing: -0.5px;">Interactive Health Tools</h2>
                <p style="color: var(--text-light); font-size: 17px; max-width: 520px; margin: 0 auto; line-height: 1.6;">Clinical-grade calculators and trackers to support your health management.</p>
            </div>
            <div class="tools-grid">
                <!-- Tool 1: Blood Test Tracker -->
                <div class="tool-card">
                    <div class="tool-icon">
                        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    </div>
                    <h3 style="font-family: 'Outfit', sans-serif; font-size: 20px; font-weight: 800; color: var(--secondary-color); margin: 0 0 12px;">Blood Test Tracker</h3>
                    <p style="color: var(--text-light); font-size: 14px; line-height: 1.6; margin: 0 0 24px;">Track and visualise your blood test results over time to spot trends and stay informed.</p>
                    <a href="<?php echo esc_url($tool1_link); ?>" class="tool-cta">Try It <span>&rarr;</span></a>
                </div>
                <!-- Tool 2: Malnutrition Calculator -->
                <div class="tool-card">
                    <div class="tool-icon">
                        <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9z"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>
                    </div>
                    <h3 style="font-family: 'Outfit', sans-serif; font-size: 20px; font-weight: 800; color: var(--secondary-color); margin: 0 0 12px;">Malnutrition Calculator</h3>
                    <p style="color: var(--text-light); font-size: 14px; line-height: 1.6; margin: 0 0 24px;">Assess nutritional risk using validated screening tools and get personalised guidance.</p>
                    <a href="<?php echo esc_url($tool2_link); ?>" class="tool-cta">Try It <span>&rarr;</span></a>
                </div>
                <!-- Tool 3: IBDi AI Assistant -->
                <div class="tool-card">
                    <div class="tool-icon">
                        <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><circle cx="9" cy="10" r="1.5" fill="var(--primary-color)" stroke="none"/><circle cx="15" cy="10" r="1.5" fill="var(--primary-color)" stroke="none"/></svg>
                    </div>
                    <h3 style="font-family: 'Outfit', sans-serif; font-size: 20px; font-weight: 800; color: var(--secondary-color); margin: 0 0 12px;">IBDi AI Assistant</h3>
                    <p style="color: var(--text-light); font-size: 14px; line-height: 1.6; margin: 0 0 24px;">Ask our AI-powered clinical intelligence assistant about IBD research, treatments and more.</p>
                    <a href="<?php echo esc_url($tool3_link); ?>" class="tool-cta">Try It <span>&rarr;</span></a>
                </div>
            </div>
        </div>
    </section>
                <?php
                break;

            case 'discovery':
                $disc_title = get_theme_mod('mlws_discovery_title_text', 'CONTENT DISCOVERY SUITE');
                $disc_sub = get_theme_mod('mlws_discovery_subtitle_text', 'Use the controls below to customise and filter IBD research, clinical news, and resources relevant to you.');
                $disc_size = get_theme_mod('mlws_discovery_title_size', 32);
                $disc_color = get_theme_mod('mlws_discovery_title_color', '#0F172A');
                $disc_align = get_theme_mod('mlws_discovery_title_align', 'left');
                $disc_sub_color = get_theme_mod('mlws_discovery_subtitle_color', '#64748B');
                ?>
    <?php
    // Panel container
    $border_color = get_theme_mod('mlws_discovery_border_color', '#1B4F8A');
    $section_bg   = get_theme_mod('mlws_discovery_section_bg', 'linear-gradient(160deg, #0F172A 0%, #0F2440 55%, #0F172A 100%)');
    $panel_bg     = get_theme_mod('mlws_discovery_panel_bg', 'rgba(255,255,255,0.04)');

    // Panel header
    $disc_filters_title_size = (int) get_theme_mod('mlws_discovery_filters_title_size', 12);
    $disc_header_title_color = get_theme_mod('mlws_disc_header_title_color', '#1B4F8A');
    $disc_status_dot         = get_theme_mod('mlws_disc_status_dot_color', '#22c55e');

    // Filter labels
    $disc_field_title_size  = (int) get_theme_mod('mlws_discovery_field_title_size', 10);
    $disc_field_title_color = get_theme_mod('mlws_discovery_field_title_color', 'rgba(255,255,255,0.4)');
    $disc_item_label_size   = (int) get_theme_mod('mlws_discovery_item_label_size', 13);

    // Chips
    $c_chip_bg       = get_theme_mod('mlws_disc_chip_bg', 'rgba(255,255,255,0.06)');
    $c_chip_border   = get_theme_mod('mlws_disc_chip_border', 'rgba(255,255,255,0.12)');
    $c_chip_text     = get_theme_mod('mlws_disc_chip_text', 'rgba(255,255,255,0.75)');
    $c_chip_h_bg     = get_theme_mod('mlws_disc_chip_hover_bg', 'rgba(27,79,138,0.12)');
    $c_chip_h_border = get_theme_mod('mlws_disc_chip_hover_border', '#C75D8E');
    $c_chip_h_text   = get_theme_mod('mlws_disc_chip_hover_text', '#ffffff');
    $c_chip_s_bg     = get_theme_mod('mlws_disc_chip_selected_bg', 'rgba(27,79,138,0.25)');
    $c_chip_s_border = get_theme_mod('mlws_disc_chip_selected_border', '#1B4F8A');
    $c_chip_s_text   = get_theme_mod('mlws_disc_chip_selected_text', '#F5E6A3');

    // Toggles
    $c_toggle_bg        = get_theme_mod('mlws_disc_toggle_bg', 'rgba(255,255,255,0.1)');
    $c_toggle_active_bg = get_theme_mod('mlws_disc_toggle_active_bg', '#1B4F8A');

    // GO button
    $c_go_bg      = get_theme_mod('mlws_disc_go_btn_bg', '#1B4F8A');
    $c_go_bg_end  = get_theme_mod('mlws_disc_go_btn_bg_end', '#153D6E');
    $c_go_hover   = get_theme_mod('mlws_disc_go_btn_hover_bg', '#B8447A');

    // Secondary buttons
    $c_sec_border   = get_theme_mod('mlws_disc_secondary_btn_border', 'rgba(255,255,255,0.3)');
    $c_sec_text     = get_theme_mod('mlws_disc_secondary_btn_text', 'rgba(255,255,255,0.8)');
    $c_sec_hover_bg = get_theme_mod('mlws_disc_secondary_btn_hover_bg', 'rgba(27,79,138,0.2)');

    // Input
    $c_input_bg          = get_theme_mod('mlws_disc_input_bg', 'rgba(255,255,255,0.08)');
    $c_input_border      = get_theme_mod('mlws_disc_input_border', 'rgba(255,255,255,0.25)');
    $c_input_text        = get_theme_mod('mlws_disc_input_text', '#ffffff');
    $c_input_placeholder = get_theme_mod('mlws_disc_input_placeholder', 'rgba(255,255,255,0.4)');
    $c_input_focus       = get_theme_mod('mlws_disc_input_focus_border', '#1B4F8A');
    ?>
    <section id="discovery-suite" class="discovery-suite-section" style="padding: 75px 0; background: <?php echo esc_attr($section_bg); ?>; position: relative; overflow: hidden;">
        <!-- Background shimmer effects -->
        <div style="position: absolute; top: -80px; right: -80px; width: 400px; height: 400px; background: radial-gradient(circle, rgba(27,79,138,0.15) 0%, transparent 70%); pointer-events: none;"></div>
        <div style="position: absolute; bottom: -60px; left: -60px; width: 350px; height: 350px; background: radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%); pointer-events: none;"></div>

        <div class="container" style="max-width: 1120px; margin: 0 auto; position: relative; z-index: 1;">

            <header style="margin-bottom: 36px; text-align: <?php echo esc_attr($disc_align); ?>;">
                <h2 style="font-family: 'Outfit', sans-serif; font-size: <?php echo esc_attr($disc_size); ?>px; font-weight: 900; margin: 0 0 10px; color: <?php echo esc_attr($disc_color); ?>; letter-spacing: -0.5px; line-height: 1.15;"><?php echo esc_html($disc_title); ?></h2>
                <p style="color: <?php echo esc_attr($disc_sub_color); ?>; font-size: 15px; margin: 0; max-width: 680px; line-height: 1.6; <?php echo $disc_align === 'center' ? 'margin: 0 auto;' : ''; ?>"><?php echo esc_html($disc_sub); ?></p>
            </header>

            <div class="discovery-panel" style="background: <?php echo esc_attr($panel_bg); ?>; border-radius: var(--radius-lg); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 30px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08); overflow: hidden; backdrop-filter: blur(20px);">

                <!-- EXPLORE CONTENT TAB -->
                <div class="tab-content active" id="tab-explore">
                    <div class="explore-layout" style="display: flex; flex-direction: column;">

                        <!-- Filters (Full Width) -->
                        <div class="explore-filters" style="padding: 24px 28px; display: flex; flex-direction: column;">

                            <!-- PANEL HEADER -->
                            <div class="panel-header-bar" style="display: flex; align-items: center; justify-content: space-between; padding: 0 0 12px 0; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 16px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <div style="width: 28px; height: 28px; background: linear-gradient(135deg, <?php echo esc_attr($border_color); ?>, <?php echo esc_attr($c_go_bg_end); ?>); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px;" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                                    </div>
                                    <div>
                                        <div style="font-size: <?php echo esc_attr($disc_filters_title_size); ?>px; font-weight: 700; color: <?php echo esc_attr($disc_header_title_color); ?>; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1.2;">Discovery Filters</div>
                                        <div style="font-size: 10px; color: rgba(255,255,255,0.5); margin-top: 1px;"><span style="display:inline-block; width:6px; height:6px; background:<?php echo esc_attr($disc_status_dot); ?>; border-radius:50%; margin-right:4px; vertical-align:middle;"></span>Active</div>
                                    </div>
                                </div>
                            </div>

                            <form action="<?php echo home_url('/discovery-results/'); ?>" method="GET" id="discovery-form" style="display: flex; flex-direction: column; flex: 1;">
                            <div class="discovery-filter-grid">

                                <!-- READING LEVEL -->
                                <div class="filter-group">
                                    <div class="filter-label">Reading Level</div>
                                    <div class="toggle-row">
                                        <?php
                                        $all_tags = get_terms(array('taxonomy' => 'post_tag', 'hide_empty' => false));
                                        if (is_wp_error($all_tags)) $all_tags = array();
                                        $reading_tags = array();
                                        foreach($all_tags as $tag) {
                                            if((stripos($tag->name, 'reading-') === 0 || stripos($tag->slug, 'reading-') === 0) && get_theme_mod("mlws_discovery_reading_show_{$tag->term_id}")) {
                                                $reading_tags[] = array(
                                                    'tag' => $tag,
                                                    'order' => get_theme_mod("mlws_discovery_reading_order_{$tag->term_id}", 10),
                                                    'text' => get_theme_mod("mlws_discovery_reading_text_{$tag->term_id}", str_replace('reading-', '', $tag->name))
                                                );
                                            }
                                        }
                                        usort($reading_tags, function($a, $b) { return $a['order'] - $b['order']; });
                                        foreach($reading_tags as $item) :
                                            $tag = $item['tag'];
                                        ?>
                                        <label class="toggle-item" style="cursor: pointer;">
                                            <input type="checkbox" name="reading_level[]" value="<?php echo esc_attr($tag->slug); ?>" style="display: none;" onchange="this.parentElement.classList.toggle('active', this.checked)">
                                            <div class="toggle-switch"></div>
                                            <span class="toggle-label"><?php echo esc_html($item['text']); ?></span>
                                        </label>
                                        <?php endforeach; ?>
                                    </div>
                                </div>

                                <!-- HEALTHCARE PATHWAY -->
                                <div class="filter-group">
                                    <div class="filter-label">Healthcare Pathway</div>
                                    <div class="chip-grid">
                                        <?php
                                        $path_tags = array();
                                        foreach($all_tags as $tag) {
                                            if((stripos($tag->name, 'path-') === 0 || stripos($tag->slug, 'path-') === 0) && get_theme_mod("mlws_discovery_path_show_{$tag->term_id}")) {
                                                $path_tags[] = array(
                                                    'tag' => $tag,
                                                    'order' => get_theme_mod("mlws_discovery_path_order_{$tag->term_id}", 10),
                                                    'text' => get_theme_mod("mlws_discovery_path_text_{$tag->term_id}", str_replace('path-', '', $tag->name))
                                                );
                                            }
                                        }
                                        usort($path_tags, function($a, $b) { return $a['order'] - $b['order']; });
                                        foreach($path_tags as $item) :
                                        ?>
                                        <label class="text-chip" style="margin: 0;">
                                            <input type="checkbox" name="pathway_tag[]" value="<?php echo esc_attr($item['tag']->slug); ?>" style="display: none;" onchange="this.parentElement.classList.toggle('selected', this.checked)">
                                            <span><?php echo esc_html($item['text']); ?></span>
                                        </label>
                                        <?php endforeach; ?>
                                    </div>
                                </div>

                                <!-- CONTENT TYPE -->
                                <div class="filter-group">
                                    <div class="filter-label">Content Type</div>
                                    <div class="chip-grid">
                                        <?php
                                        $type_cats = array();
                                        $all_categories = get_categories(array('hide_empty' => false));
                                        foreach($all_categories as $cat) {
                                            if(get_theme_mod("mlws_discovery_type_show_{$cat->term_id}")) {
                                                $type_cats[] = array(
                                                    'cat' => $cat,
                                                    'order' => get_theme_mod("mlws_discovery_type_order_{$cat->term_id}", 10),
                                                    'text' => get_theme_mod("mlws_discovery_type_text_{$cat->term_id}", $cat->name)
                                                );
                                            }
                                        }
                                        usort($type_cats, function($a, $b) { return $a['order'] - $b['order']; });
                                        foreach($type_cats as $item) :
                                        ?>
                                        <label class="text-chip" style="margin: 0;">
                                            <input type="checkbox" name="content_type[]" value="<?php echo esc_attr($item['cat']->slug); ?>" style="display: none;" onchange="this.parentElement.classList.toggle('selected', this.checked)">
                                            <span><?php echo esc_html($item['text']); ?></span>
                                        </label>
                                        <?php endforeach; ?>
                                    </div>
                                </div>

                                <!-- KEYWORD SEARCH -->
                                <div class="filter-group" style="margin-bottom:0;">
                                    <div class="keyword-row">
                                        <input type="text" name="s" class="keyword-input" placeholder="Keyword Search (Optional)">
                                    </div>
                                </div>

                            </div><!-- /filter grid -->

                            <!-- ACTION ROW -->
                            <div class="action-row" style="padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 14px;">
                                    <button type="submit" class="btn-go">GO</button>
                                    <button type="reset" class="btn-text" onclick="setTimeout(()=>window.location.reload(), 100)">Clear</button>
                                    <button type="button" class="btn-text" onclick="openSaveSearchModal()">Save Search</button>
                                </div>
                            </form>
                        </div>

                        <!-- Ask IBDi panel removed -->
                    </div>
                </div>

                <!-- Ask IBDi tab removed -->
            </div>
        </div>

        <style>
        .tab-content { display: none; }
        .tab-content.active { display: block; }

        /* --- Filter Grid — Compact 2-col --- */
        .discovery-filter-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px 32px;
        }

        /* --- Filter Groups --- */
        .filter-group { margin-bottom: 0; }
        .filter-label {
            font-family: 'Outfit', sans-serif;
            font-size: <?php echo $disc_field_title_size; ?>px;
            font-weight: 800;
            color: <?php echo esc_attr($disc_field_title_color); ?>;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 1.5px;
        }

        /* --- Reading Level Toggles --- */
        .toggle-row { display: flex; gap: 14px; flex-wrap: wrap; }
        .toggle-item { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 4px 0; }
        .toggle-switch {
            width: 36px; height: 20px;
            background: <?php echo esc_attr($c_toggle_bg); ?>;
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 10px;
            position: relative;
            transition: 0.3s;
            flex-shrink: 0;
        }
        .toggle-switch::after {
            content: ''; position: absolute;
            top: 2px; left: 2px;
            width: 14px; height: 14px;
            background: rgba(255,255,255,0.6);
            border-radius: 50%;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            transition: 0.3s;
        }
        .toggle-item:hover .toggle-switch { border-color: <?php echo esc_attr($c_chip_h_border); ?>; background: rgba(255,255,255,0.15); }
        .toggle-item.active .toggle-switch { background: <?php echo esc_attr($c_toggle_active_bg); ?>; border-color: <?php echo esc_attr($c_toggle_active_bg); ?>; }
        .toggle-item.active .toggle-switch::after { transform: translateX(16px); background: white; }
        .toggle-label { font-size: <?php echo $disc_item_label_size; ?>px; font-weight: 600; color: <?php echo esc_attr($c_chip_text); ?>; transition: color 0.2s; }
        .toggle-item:hover .toggle-label { color: <?php echo esc_attr($c_chip_h_text); ?>; }

        /* --- Text Chips (Pathway & Type) --- */
        .chip-grid { display: flex; flex-wrap: wrap; gap: 6px; }
        .text-chip {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 7px 14px;
            background: <?php echo esc_attr($c_chip_bg); ?>;
            border: 1px solid <?php echo esc_attr($c_chip_border); ?>;
            border-radius: var(--radius-sm);
            font-size: <?php echo $disc_item_label_size; ?>px;
            font-weight: 600;
            color: <?php echo esc_attr($c_chip_text); ?>;
            cursor: pointer;
            transition: all 0.2s ease;
            text-align: center;
            letter-spacing: 0.3px;
            user-select: none;
        }
        .text-chip:hover {
            border-color: <?php echo esc_attr($c_chip_h_border); ?>;
            background: <?php echo esc_attr($c_chip_h_bg); ?>;
            color: <?php echo esc_attr($c_chip_h_text); ?>;
            transform: translateY(-1px);
        }
        .text-chip.selected {
            background: <?php echo esc_attr($c_chip_s_bg); ?>;
            border-color: <?php echo esc_attr($c_chip_s_border); ?>;
            color: <?php echo esc_attr($c_chip_s_text); ?>;
            box-shadow: 0 0 0 1px <?php echo esc_attr($c_chip_s_border); ?>33, 0 4px 10px <?php echo esc_attr($c_chip_s_border); ?>22;
        }

        /* --- Keyword Input (spans full width) --- */
        .filter-group:last-child { grid-column: 1 / -1; }
        .keyword-row { display: flex; align-items: center; gap: 12px; }
        .keyword-input {
            flex: 1;
            padding: 10px 14px;
            border: 1px solid <?php echo esc_attr($c_input_border); ?>;
            border-radius: var(--radius-md);
            font-size: 13px;
            outline: none;
            background: <?php echo esc_attr($c_input_bg); ?>;
            color: <?php echo esc_attr($c_input_text); ?>;
            transition: border-color 0.2s, background 0.2s;
        }
        .keyword-input::placeholder { color: <?php echo esc_attr($c_input_placeholder); ?>; }
        .keyword-input:focus { border-color: <?php echo esc_attr($c_input_focus); ?>; background: rgba(255,255,255,0.12); }

        /* --- Action Buttons --- */
        .action-row { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
        .btn-go {
            padding: 10px 28px;
            background: linear-gradient(135deg, <?php echo esc_attr($c_go_bg); ?> 0%, <?php echo esc_attr($c_go_bg_end); ?> 100%);
            color: white;
            border: 2px solid transparent;
            border-radius: var(--radius-md);
            font-family: 'Outfit', sans-serif;
            font-size: 13px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            cursor: pointer;
            transition: all 0.25s ease;
            box-shadow: 0 4px 12px <?php echo esc_attr($c_go_bg); ?>66;
        }
        .btn-go:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px <?php echo esc_attr($c_go_bg); ?>99;
            background: linear-gradient(135deg, <?php echo esc_attr($c_go_hover); ?> 0%, <?php echo esc_attr($c_go_bg); ?> 100%);
        }
        .btn-text {
            background: rgba(255,255,255,0.04);
            border: 1.5px solid <?php echo esc_attr($c_sec_border); ?>;
            border-radius: var(--radius-md);
            padding: 9px 16px;
            font-size: 11px;
            font-weight: 700;
            color: <?php echo esc_attr($c_sec_text); ?>;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            transition: all 0.25s ease;
        }
        .btn-text:hover {
            border-color: <?php echo esc_attr($c_chip_h_border); ?>;
            color: #ffffff;
            background: <?php echo esc_attr($c_sec_hover_bg); ?>;
            box-shadow: 0 4px 10px <?php echo esc_attr($c_go_bg); ?>33;
        }

        @media (max-width: 768px) {
            .discovery-filter-grid {
                grid-template-columns: 1fr;
                gap: 16px;
            }
            .explore-filters {
                padding: 20px 16px !important;
            }
        }
        </style>

        <script>
        document.addEventListener('DOMContentLoaded', function() {
            // Global Quiz Interceptor
            document.addEventListener('click', function(e) {
                const link = e.target.closest('a');
                if (link && link.getAttribute('href') && link.getAttribute('href').includes('healthcare-quiz')) {
                    e.preventDefault();
                    if (typeof openQuizModal === 'function') {
                        openQuizModal();
                    } else {
                        window.location.href = link.getAttribute('href');
                    }
                }
            });
        });
        </script>
    </section>
                <?php
                break;

            case 'quiz_cta':
                ?>
    <!-- Quiz CTA Section -->
    <section class="quiz-cta-section" style="padding: 75px 0; background: linear-gradient(135deg, #1B4F8A 0%, #0F172A 100%); text-align: center; color: white; position: relative;">
        <div class="dot-overlay"></div>
        <div class="container" style="position: relative; z-index: 1; max-width: 700px;">
            <div style="width: 64px; height: 64px; background: rgba(255,255,255,0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;">
                <svg viewBox="0 0 24 24" style="width: 28px; height: 28px;" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
            </div>
            <h2 style="font-family: 'Outfit', sans-serif; font-size: 42px; font-weight: 800; margin: 0 0 16px; line-height: 1.1; letter-spacing: -0.5px;">Discover Your Health Pathway</h2>
            <p style="font-size: 18px; color: rgba(255,255,255,0.8); line-height: 1.6; margin: 0 0 36px; max-width: 540px; margin-left: auto; margin-right: auto;">Take our quick assessment to get personalised content recommendations based on your role and health interests.</p>
            <button onclick="openQuizModal()" style="display: inline-flex; align-items: center; gap: 8px; padding: 18px 40px; background: white; color: var(--primary-color); border: none; border-radius: var(--radius-lg); font-family: 'Outfit', sans-serif; font-size: 17px; font-weight: 800; cursor: pointer; transition: all 0.2s; box-shadow: 0 8px 30px rgba(0,0,0,0.2);">
                Start the Quiz
                <svg viewBox="0 0 24 24" style="width: 20px; height: 20px;" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
        </div>
    </section>
                <?php
                break;

            case 'kb':
                $kb_title = get_theme_mod('mlws_kb_mini_hero_title', 'IBD RESEARCH CENTRE');
                $kb_subtitle = get_theme_mod('mlws_kb_mini_hero_subtitle', 'Catch Up on the Latest Articles and More...');
                $kb_padding = get_theme_mod('mlws_kb_mini_hero_padding', '60px 0 80px');
                $kb_height = get_theme_mod('mlws_kb_mini_hero_height', '');
                $kb_font_color = get_theme_mod('mlws_kb_mini_hero_font_color', '#ffffff');
                $kb_opacity = (int) get_theme_mod('mlws_kb_mini_hero_opacity', 80) / 100;
                $kb_opacity_2 = min(1, $kb_opacity + 0.1);
                $kb_mini_bg = get_theme_mod('mlws_kb_mini_hero_bg');
                if(!$kb_mini_bg) $kb_mini_bg = get_template_directory_uri() . '/assets/img/patient_hero.png';

                $hero_style = "position: relative; padding: " . esc_attr($kb_padding) . "; background: linear-gradient(rgba(10, 25, 41, " . $kb_opacity . "), rgba(10, 25, 41, " . $kb_opacity_2 . ")), url('" . esc_url($kb_mini_bg) . "') center center / cover; text-align: center; color: " . esc_attr($kb_font_color) . "; border-radius: 0;";
                if ($kb_height) {
                    $hero_style .= " min-height: " . esc_attr($kb_height) . "px; display: flex; align-items: center;";
                }
                ?>
    <section class="kb-section-wrapper" style="background: white; border-top: 2px solid var(--primary-color);">
        <section class="kb-mini-hero" style="<?php echo $hero_style; ?>">
            <div class="container" style="width: 100%;">
                <h2 style="font-family: 'Outfit', sans-serif; font-size: 38px; font-weight: 800; margin: 0 0 12px 0; color: inherit;"><?php echo esc_html($kb_title); ?></h2>
                <p style="font-size: 18px; opacity: 0.8; max-width: 600px; margin: 0 auto; color: inherit;"><?php echo esc_html($kb_subtitle); ?></p>
            </div>
        </section>

        <?php
        $kb_cats = get_categories(array('hide_empty' => false));
        $kb_sections = array();
        foreach ($kb_cats as $cat) {
            if (get_theme_mod("mlws_kb_show_{$cat->term_id}", true)) {
                $kb_sections[] = array(
                    'cat' => $cat,
                    'priority' => get_theme_mod("mlws_kb_priority_{$cat->term_id}", 10),
                    'count' => get_theme_mod("mlws_kb_count_{$cat->term_id}", 4),
                    'layout' => get_theme_mod("mlws_kb_layout_{$cat->term_id}", 'grid-4'),
                    'view_all' => get_theme_mod("mlws_kb_view_all_{$cat->term_id}", 'View All'),
                );
            }
        }
        usort($kb_sections, function($a, $b) { return $a['priority'] - $b['priority']; });

        foreach ($kb_sections as $sec):
            $cat = $sec['cat'];
            $layout = $sec['layout'];
            if ($cat->name === 'Op-Eds & Commentary' || $cat->slug === 'op-eds-commentary') { $layout = 'bento'; }
            $post_count = ($layout === 'bento' || $layout === 'asymmetric' || $layout === 'posters') ? 3 : intval($sec['count']);

            $posts_array = get_posts(array(
                'numberposts' => $post_count,
                'category' => $cat->term_id,
                'orderby' => 'date',
                'order' => 'DESC',
                'post_type' => 'any',
                'post_status' => 'publish',
            ));

            if (empty($posts_array)) continue;
            $colors = array('#F59E0B', '#0EA5E9', '#1B4F8A', '#1B4F8A', '#C75D8E');
            $color = $colors[array_rand($colors)];

            // Category-based default hero image map
            $cat_hero_map = array(
                'breaking-news'       => 'news_hero.png',
                'diplomatic-analysis' => 'research_hero.png',
                'op-eds-commentary'   => 'opinion_hero.png',
                'cyrus-accord'        => 'hcp_hero.png',
                'abraham-accords'     => 'education_hero.png',
                'regional-voices'     => 'patient_hero.png',
            );
            // Categories with full URL overrides (e.g. uploaded images)
            $cat_hero_url_map = array(
                'regional-voices' => content_url() . '/uploads/2026/04/ibdliving_hero.png',
            );
            $cat_default_hero = get_template_directory_uri() . '/assets/img/news_hero.png';
            if (isset($cat_hero_url_map[$cat->slug])) {
                $cat_default_hero = $cat_hero_url_map[$cat->slug];
            } elseif (isset($cat_hero_map[$cat->slug])) {
                $cat_default_hero = get_template_directory_uri() . '/assets/img/' . $cat_hero_map[$cat->slug];
            }
        ?>
        <section style="padding: 35px 0;">
            <div class="container">
                <div class="section-label">
                    <div class="section-label-left">
                        <div class="color-bar" style="background: <?php echo $color; ?>"></div>
                        <h2><?php echo esc_html($cat->name); ?></h2>
                    </div>
                    <a href="<?php echo esc_url(get_category_link($cat->term_id)); ?>" style="color: var(--primary-color); font-weight: 600; text-decoration: none; font-size: 14px;"><?php echo esc_html($sec['view_all']); ?> &rarr;</a>
                </div>

                <?php if ($layout === 'bento' && count($posts_array) >= 3): ?>
                    <div class="bento-grid-news">
                        <?php $p = $posts_array[0]; ?>
                        <a href="<?php echo get_permalink($p->ID); ?>" class="bento-cell-featured">
                            <img src="<?php echo get_the_post_thumbnail_url($p->ID, 'large') ?: esc_url($cat_default_hero); ?>" alt="">
                            <div class="bento-content-overlay">
                                <span class="tag" style="background:<?php echo $color; ?>">Featured</span>
                                <h3 style="font-size: 28px; color: white; margin-bottom: 12px;"><?php echo get_the_title($p->ID); ?></h3>
                                <div class="meta" style="color: rgba(255,255,255,0.8);">By <?php echo get_the_author_meta('display_name', $p->post_author); ?> &bull; <?php echo get_the_date('', $p->ID); ?></div>
                            </div>
                        </a>
                        <div style="display: flex; flex-direction: column; gap: 24px;">
                            <?php for($i=1; $i<=2; $i++): $p = $posts_array[$i]; ?>
                            <a href="<?php echo get_permalink($p->ID); ?>" class="bento-cell-side">
                                <span class="meta" style="color:<?php echo $color; ?>; margin-bottom:8px;"><?php echo $cat->name; ?></span>
                                <h4 class="heading-small"><?php echo get_the_title($p->ID); ?></h4>
                                <p class="text-body" style="font-size: 13px; margin-bottom: 8px;"><?php echo wp_trim_words(get_the_excerpt($p->ID), 12); ?></p>
                                <div class="meta"><?php echo human_time_diff(get_post_time('U', false, $p->ID), current_time('timestamp')) . ' ago'; ?></div>
                            </a>
                            <?php endfor; ?>
                        </div>
                    </div>
                <?php else: ?>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 24px;">
                        <?php foreach ($posts_array as $p): ?>
                        <article style="background: white; border-radius: var(--radius-lg); overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid var(--border-color); transition: all 0.3s; height: 100%; display: flex; flex-direction: column;">
                            <div style="position: relative; overflow: hidden; height: 180px; background: #f1f5f9;">
                                <img src="<?php echo has_post_thumbnail($p->ID) ? get_the_post_thumbnail_url($p->ID, 'medium') : esc_url($cat_default_hero); ?>" alt="" style="width: 100%; height: 100%; object-fit: cover;">
                            </div>
                            <div style="padding: 20px; flex-grow: 1; display: flex; flex-direction: column;">
                                <h3 style="font-size: 16px; margin-bottom: 10px; line-height: 1.4;">
                                    <a href="<?php echo get_permalink($p->ID); ?>" style="color: #0f172a; text-decoration: none; font-weight: 600;"><?php echo get_the_title($p->ID); ?></a>
                                </h3>
                                <p style="font-size: 14px; color: #64748b; line-height: 1.6; margin-bottom: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                                    <?php echo wp_trim_words(get_the_excerpt($p->ID), 15); ?>
                                </p>
                                <div style="font-size: 12px; color: #94a3b8; padding-top: 12px; border-top: 1px solid #f1f5f9; margin-top: auto;">
                                    <?php echo get_the_date('', $p->ID); ?>
                                </div>
                            </div>
                        </article>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </div>
        </section>
        <?php endforeach; ?>
    </section>
                <?php
                break;

            case 'testimonials':
                ?>
    <section style="background: #F8FAFC;">
                <?php echo mlws_testimonials_shortcode(array()); ?>
    </section>
                <?php
                break;
        }
        // White line separator between sections (skip after last section)
        if ($section_id !== end($sections)) {
            echo '<hr style="border: none; border-top: 1px solid #E2E8F0; margin: 0;">';
        }
    }
    ?>
</main>

<!-- Modals & Scripts -->

    <!-- PREMIUM SUBSCRIBE SECTION -->
    <section class="premium-subscribe-section" style="background: #0f172a; padding: 100px 0; color: white;">
        <div class="container" style="display: flex; align-items: center; justify-content: space-between; gap: 60px; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 300px;">
                <span style="color: var(--primary-color); font-weight: 700; text-transform: uppercase; letter-spacing: 2px; font-size: 14px; margin-bottom: 16px; display: block;">Join the Inner Circle</span>
                <h2 style="font-family: 'Outfit', sans-serif; font-size: 42px; font-weight: 800; line-height: 1.1; margin-bottom: 24px;">Access <span style="color: var(--primary-color);">IBD Clinical Resources</span></h2>
                <p style="font-size: 18px; color: #94a3b8; line-height: 1.6; margin-bottom: 32px; max-width: 500px;">
                    Gain access to premium articles, monthly masterclasses, and a personalized health dashboard. Join 50,000+ members on the path to better living.
                </p>
                <div style="display: flex; gap: 24px; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 12px; font-size: 14px; font-weight: 600; color: #cbd5e1;">
                        <span style="background: rgba(255,255,255,0.1); width: 24px; height: 24px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; color: var(--primary-color);">&#10003;</span> Expert Reviews
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px; font-size: 14px; font-weight: 600; color: #cbd5e1;">
                        <span style="background: rgba(255,255,255,0.1); width: 24px; height: 24px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; color: var(--primary-color);">&#10003;</span> Weekly Digests
                    </div>
                </div>
            </div>
            <div style="flex-shrink: 0; background: rgba(255,255,255,0.05); padding: 40px; border-radius: var(--radius-xl); border: 1px solid rgba(255,255,255,0.1); max-width: 400px; width: 100%;">
                <h3 style="font-size: 24px; font-weight: 700; margin-bottom: 8px;">Start Your Journey</h3>
                <p style="color: #94a3b8; font-size: 14px; margin-bottom: 24px;"></p>

                <form action="<?php echo wp_registration_url(); ?>" method="get" style="display: flex; flex-direction: column; gap: 16px;">
                    <input type="email" name="user_email" placeholder="Enter your email address" required style="width: 100%; padding: 16px; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.2); color: white; font-size: 16px;">
                    <button type="submit" style="width: 100%; padding: 16px; border-radius: var(--radius-md); border: none; background: var(--primary-color); color: white; font-weight: 700; font-size: 16px; cursor: pointer; transition: background 0.2s;">Get Started Now &rarr;</button>
                    <p style="text-align: center; font-size: 12px; color: #64748b; margin: 0;"></p>
                </form>
            </div>
        </div>
    </section>

<?php get_footer(); ?>
