<?php get_header(); ?>

<?php
// ── Category metadata by slug ─────────────────────────────────────
$cat_meta = [
    'breaking-news' => [
        'eyebrow'  => 'Latest Dispatches',
        'tagline'  => 'Real-time diplomatic reporting and analysis from correspondents across the region.',
        'accent'   => '#8B1A1A',
    ],
    'diplomatic-analysis' => [
        'eyebrow'  => 'Diplomatic Analysis',
        'tagline'  => 'In-depth analysis of treaties, negotiations, and state-level relations shaping the Middle East.',
        'accent'   => '#1B4F8A',
    ],
    'op-eds-commentary' => [
        'eyebrow'  => 'Op-Eds & Commentary',
        'tagline'  => 'Perspectives from diplomats, scholars, and regional voices on the path to lasting peace.',
        'accent'   => '#D4AF37',
    ],
    'cyrus-accord' => [
        'eyebrow'  => 'Cyrus Accord',
        'tagline'  => 'Authoritative coverage of the landmark Israel-Iran framework and its evolving provisions.',
        'accent'   => '#1B4F8A',
    ],
    'abraham-accords' => [
        'eyebrow'  => 'Abraham Accords',
        'tagline'  => 'Tracking normalisation progress and the expanding arc of Middle East reconciliation.',
        'accent'   => '#8B1A1A',
    ],
    'regional-voices' => [
        'eyebrow'  => 'Regional Voices',
        'tagline'  => 'Human stories from the communities at the heart of the region\'s transformation.',
        'accent'   => '#D4AF37',
    ],
];

// ── Determine context ─────────────────────────────────────────────
$arc_eyebrow     = 'Archive';
$arc_title       = get_the_archive_title();
$arc_tagline     = '';
$arc_accent      = '#D4AF37';
$arc_hero_bg     = get_template_directory_uri() . '/assets/img/news_hero.png';

$card_hero_map = [
    'breaking-news'       => 'news_hero.png',
    'diplomatic-analysis' => 'research_hero.png',
    'op-eds-commentary'   => 'opinion_hero.png',
    'cyrus-accord'        => 'hcp_hero.png',
    'abraham-accords'     => 'education_hero.png',
    'regional-voices'     => 'patient_hero.png',
];

if ( is_category() ) {
    $cat     = get_queried_object();
    $slug    = $cat->slug;
    $meta    = $cat_meta[ $slug ] ?? null;

    if ( $meta ) {
        $arc_eyebrow = $meta['eyebrow'];
        $arc_tagline = $meta['tagline'];
        $arc_accent  = $meta['accent'];
    } else {
        $arc_eyebrow = $cat->name;
        $arc_tagline = $cat->description ?: 'Independent journalism from Merlows.';
    }

    // Use the WordPress category description override if available
    if ( get_theme_mod( "mlws_cat_tagline_{$cat->term_id}" ) ) {
        $arc_tagline = get_theme_mod( "mlws_cat_tagline_{$cat->term_id}" );
    }

    // Hero image per category
    if ( isset( $card_hero_map[ $slug ] ) ) {
        $arc_hero_bg = get_template_directory_uri() . '/assets/img/' . $card_hero_map[ $slug ];
    }
    if ( get_theme_mod( "mlws_cat_hero_{$cat->term_id}" ) ) {
        $arc_hero_bg = get_theme_mod( "mlws_cat_hero_{$cat->term_id}" );
    }

    // Strip "Category: " prefix from WP auto-generated title
    $arc_title = $cat->name;
}
?>

<style>
/* ── Archive Masthead ──────────────────────────────────────────── */
.arc-masthead {
    background: var(--primary-color);
    position: relative;
    overflow: hidden;
    padding: 80px 0 64px;
    color: white;
}
.arc-masthead::before {
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
.arc-masthead::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 4px;
    background: linear-gradient(90deg, transparent, var(--accent-color), transparent);
}
.arc-masthead__inner {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 40px;
    align-items: center;
}
.arc-masthead__eyebrow {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
}
.arc-masthead__eyebrow-line {
    height: 2px;
    width: 40px;
    background: var(--accent-color);
    flex-shrink: 0;
}
.arc-masthead__eyebrow-text {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2.5px;
    color: var(--accent-color);
    font-family: var(--font-main);
}
.arc-masthead h1 {
    font-family: var(--font-heading);
    font-size: clamp(36px, 5vw, 64px);
    font-weight: 300;
    line-height: 1.1;
    margin: 0 0 20px;
    color: white;
}
.arc-masthead h1 em {
    font-style: italic;
    color: var(--accent-color);
}
.arc-masthead__rule {
    width: 80px;
    height: 3px;
    background: linear-gradient(90deg, var(--accent-color), transparent);
    margin-bottom: 20px;
}
.arc-masthead__tagline {
    font-size: 17px;
    line-height: 1.65;
    color: rgba(255,255,255,0.75);
    max-width: 560px;
    font-family: var(--font-main);
    margin: 0;
}
.arc-masthead__stat {
    text-align: center;
    padding: 24px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.04);
}
.arc-masthead__stat-num {
    font-family: var(--font-heading);
    font-size: 42px;
    font-weight: 700;
    color: var(--accent-color);
    line-height: 1;
    display: block;
}
.arc-masthead__stat-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: rgba(255,255,255,0.5);
    margin-top: 6px;
    display: block;
    font-family: var(--font-main);
}

/* ── Category Nav ──────────────────────────────────────────────── */
.arc-nav-wrapper {
    background: #0F172A;
    border-bottom: 1px solid rgba(255,255,255,0.06);
}

/* ── Articles Grid ─────────────────────────────────────────────── */
.arc-section {
    padding: 64px 0 80px;
    background: #F8FAFD;
}
.arc-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 28px;
}

/* ── Sub-category sections (parent category landing) ───────────── */
.arc-subcat { margin-bottom: 56px; }
.arc-subcat:last-of-type { margin-bottom: 0; }
.arc-subcat__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
    padding-bottom: 12px;
    border-bottom: 2px solid #E2E8F0;
}
.arc-subcat__title {
    font-family: var(--font-heading);
    font-size: 26px;
    font-weight: 700;
    color: #0F172A;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 14px;
}
.arc-subcat__title::before {
    content: '';
    width: 6px;
    height: 26px;
    background: var(--accent-color);
    flex-shrink: 0;
}
.arc-subcat__count {
    font-family: var(--font-main);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #94A3B8;
    margin-left: 4px;
}
.arc-subcat__viewall {
    font-family: var(--font-main);
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--primary-color);
    text-decoration: none;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: gap 0.2s;
}
.arc-subcat__viewall:hover { gap: 10px; }

/* ── Dispatch Card ─────────────────────────────────────────────── */
.dispatch-card {
    background: white;
    border: 1px solid #E2E8F0;
    display: flex;
    flex-direction: column;
    transition: box-shadow 0.25s, transform 0.25s;
    overflow: hidden;
}
.dispatch-card:hover {
    box-shadow: 0 8px 32px rgba(27,79,138,0.12);
    transform: translateY(-3px);
}
.dispatch-card__img {
    height: 200px;
    background-size: cover;
    background-position: center;
    background-color: #E2E8F0;
    position: relative;
    flex-shrink: 0;
}
.dispatch-card__date-badge {
    position: absolute;
    bottom: 12px;
    left: 12px;
    background: rgba(15,23,42,0.82);
    backdrop-filter: blur(4px);
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    color: rgba(255,255,255,0.9);
    letter-spacing: 0.5px;
    font-family: var(--font-main);
}
.dispatch-card__cat-badge {
    position: absolute;
    top: 12px;
    left: 12px;
    background: var(--accent-color);
    padding: 3px 9px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #0F172A;
    font-family: var(--font-main);
}
.dispatch-card__body {
    padding: 24px 24px 28px;
    display: flex;
    flex-direction: column;
    flex: 1;
}
.dispatch-card__title {
    font-family: var(--font-heading);
    font-size: 20px;
    font-weight: 700;
    color: #0F172A;
    margin: 0 0 12px;
    line-height: 1.3;
}
.dispatch-card__title a {
    color: inherit;
    text-decoration: none;
    transition: color 0.2s;
}
.dispatch-card__title a:hover { color: var(--primary-color); }
.dispatch-card__excerpt {
    font-family: var(--font-main);
    font-size: 14px;
    color: #64748B;
    line-height: 1.6;
    flex: 1;
}
.dispatch-card__excerpt p { margin: 0; }
.dispatch-card__read-more {
    margin-top: 20px;
    font-family: var(--font-main);
    font-size: 13px;
    font-weight: 700;
    color: var(--primary-color);
    text-decoration: none;
    text-transform: uppercase;
    letter-spacing: 1px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: gap 0.2s;
}
.dispatch-card__read-more:hover { gap: 10px; }

/* ── Empty / Pagination ──────────────────────────────────────────── */
.arc-empty {
    grid-column: 1 / -1;
    text-align: center;
    padding: 80px 20px;
    color: #94A3B8;
    font-family: var(--font-main);
}
.arc-empty h3 { font-size: 22px; color: #64748B; margin-bottom: 8px; }

.arc-pagination {
    margin-top: 56px;
    text-align: center;
}
.arc-pagination .page-numbers {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: center;
    list-style: none;
    padding: 0;
    margin: 0;
}
.arc-pagination .page-numbers a,
.arc-pagination .page-numbers span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    font-size: 14px;
    font-weight: 600;
    border: 1px solid #E2E8F0;
    text-decoration: none;
    color: #475569;
    transition: all 0.2s;
    font-family: var(--font-main);
}
.arc-pagination .page-numbers a:hover,
.arc-pagination .page-numbers .current {
    background: var(--primary-color);
    color: white;
    border-color: var(--primary-color);
}

/* ── Sub-category layouts: Bento ───────────────────────────────── */
.arc-bento {
    grid-template-columns: repeat(3, 1fr);
    grid-auto-flow: dense;
}
.arc-bento .dispatch-card:first-child {
    grid-column: span 2;
    grid-row: span 2;
}
.arc-bento .dispatch-card:first-child .dispatch-card__img { height: 100%; min-height: 320px; }
.arc-bento .dispatch-card:first-child .dispatch-card__title { font-size: 28px; }

/* ── Sub-category layouts: List ────────────────────────────────── */
.arc-list { display: flex; flex-direction: column; gap: 20px; }
.arc-list .dispatch-card { flex-direction: row; }
.arc-list .dispatch-card__img { width: 300px; height: auto; min-height: 200px; flex-shrink: 0; }
.arc-list .dispatch-card__body { flex: 1; }

/* ── Sub-category layouts: Magazine ────────────────────────────── */
.arc-mag {
    display: grid;
    grid-template-columns: 1.5fr 1fr;
    gap: 36px;
    align-items: start;
}
.arc-mag__lead .dispatch-card__img { height: 360px; }
.arc-mag__lead .dispatch-card__title { font-size: 26px; }
.arc-mag__list { display: flex; flex-direction: column; }
.arc-mag__item {
    display: flex;
    gap: 16px;
    padding: 16px 0;
    border-bottom: 1px solid #E2E8F0;
    text-decoration: none;
}
.arc-mag__item:first-child { padding-top: 0; }
.arc-mag__item-img {
    width: 104px;
    height: 78px;
    background-size: cover;
    background-position: center;
    background-color: #E2E8F0;
    flex-shrink: 0;
}
.arc-mag__item-body { display: flex; flex-direction: column; gap: 5px; }
.arc-mag__item-date {
    font-family: var(--font-main);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #94A3B8;
}
.arc-mag__item-title {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 700;
    line-height: 1.3;
    color: #0F172A;
    transition: color 0.2s;
}
.arc-mag__item:hover .arc-mag__item-title { color: var(--primary-color); }

/* ── Under-hero blocks: shared ─────────────────────────────────── */
.catx-block { padding: 60px 0; }
.catx-block__eyebrow {
    font-family: var(--font-main);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--accent-color);
    margin: 0 0 14px;
    display: flex;
    align-items: center;
    gap: 12px;
}
.catx-block__eyebrow::before { content: ''; width: 32px; height: 2px; background: var(--accent-color); }

/* ── Featured Article block ────────────────────────────────────── */
.catx-featured__inner {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 44px;
    align-items: center;
}
.catx-featured.pos-right .catx-featured__media { order: 2; }
.catx-featured__media {
    height: 380px;
    background-size: cover;
    background-position: center;
    background-color: #E2E8F0;
}
.catx-featured__cat {
    display: inline-block;
    background: var(--accent-color);
    color: #0F172A;
    font-family: var(--font-main);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    padding: 4px 10px;
    margin-bottom: 14px;
}
.catx-featured__title {
    font-family: var(--font-heading);
    font-size: 34px;
    font-weight: 700;
    line-height: 1.2;
    color: #0F172A;
    margin: 0 0 16px;
}
.catx-featured__title a { color: inherit; text-decoration: none; }
.catx-featured__title a:hover { color: var(--primary-color); }
.catx-featured__excerpt {
    font-family: var(--font-main);
    font-size: 17px;
    line-height: 1.65;
    color: #475569;
    margin: 0 0 24px;
}
.catx-featured__link {
    font-family: var(--font-main);
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--primary-color);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: gap 0.2s;
}
.catx-featured__link:hover { gap: 10px; }

/* ── Latest Articles block ─────────────────────────────────────── */
.catx-latest__title {
    font-family: var(--font-heading);
    font-size: 28px;
    font-weight: 700;
    color: #0F172A;
    margin: 0 0 28px;
}

/* ── Promo block ───────────────────────────────────────────────── */
.catx-promo__inner {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 44px;
    align-items: center;
}
.catx-promo.pos-right .catx-promo__media { order: 2; }
.catx-promo.no-image .catx-promo__inner { grid-template-columns: 1fr; text-align: center; }
.catx-promo__media {
    height: 320px;
    background-size: cover;
    background-position: center;
    background-color: #E2E8F0;
}
.catx-promo__title {
    font-family: var(--font-heading);
    font-size: 32px;
    font-weight: 700;
    line-height: 1.2;
    color: #0F172A;
    margin: 0 0 16px;
}
.catx-promo__text {
    font-family: var(--font-main);
    font-size: 17px;
    line-height: 1.65;
    color: #475569;
    margin: 0 0 24px;
}
.catx-promo__btn {
    display: inline-block;
    background: var(--primary-color);
    color: #fff;
    font-family: var(--font-main);
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    text-decoration: none;
    padding: 14px 32px;
    transition: opacity 0.2s;
}
.catx-promo__btn:hover { opacity: 0.9; }

@media (max-width: 768px) {
    .arc-masthead__inner { grid-template-columns: 1fr; }
    .arc-masthead__stat { display: none; }
    .arc-grid { grid-template-columns: 1fr; }
    .arc-bento { grid-template-columns: 1fr; }
    .arc-bento .dispatch-card:first-child { grid-column: auto; grid-row: auto; }
    .arc-list .dispatch-card { flex-direction: column; }
    .arc-list .dispatch-card__img { width: 100%; height: 200px; }
    .arc-mag { grid-template-columns: 1fr; }
    .catx-featured__inner,
    .catx-promo__inner { grid-template-columns: 1fr; }
    .catx-featured.pos-right .catx-featured__media,
    .catx-promo.pos-right .catx-promo__media { order: 0; }
    .catx-featured__media { height: 240px; }
}
</style>

<main>

    <!-- Masthead -->
    <section class="arc-masthead">
        <div class="container">
            <div class="arc-masthead__inner">
                <div>
                    <div class="arc-masthead__eyebrow">
                        <span class="arc-masthead__eyebrow-line"></span>
                        <span class="arc-masthead__eyebrow-text"><?php echo esc_html( $arc_eyebrow ); ?></span>
                        <span class="arc-masthead__eyebrow-line"></span>
                    </div>
                    <h1><?php echo wp_kses_post( $arc_title ); ?></h1>
                    <div class="arc-masthead__rule"></div>
                    <?php if ( $arc_tagline ) : ?>
                        <p class="arc-masthead__tagline"><?php echo esc_html( $arc_tagline ); ?></p>
                    <?php endif; ?>
                </div>
                <?php if ( is_category() ) :
                    global $wp_query;
                    $total = $wp_query->found_posts;
                ?>
                <div class="arc-masthead__stat">
                    <span class="arc-masthead__stat-num"><?php echo esc_html( number_format( $total ) ); ?></span>
                    <span class="arc-masthead__stat-label">Published Dispatches</span>
                </div>
                <?php endif; ?>
            </div>
        </div>
    </section>

    <!-- Category navigation -->
    <div class="arc-nav-wrapper">
        <?php get_template_part( 'template-parts/inner-category-nav' ); ?>
    </div>

    <?php
    // Reusable dispatch-card renderer — assumes it runs inside a post loop
    // (the global post is set). Used by both the flat grid and the per
    // sub-category sections so the markup stays identical.
    if ( ! function_exists( 'mlws_render_dispatch_card' ) ) :
    function mlws_render_dispatch_card( $card_hero_map ) {
        $thumb = get_the_post_thumbnail_url( get_the_ID(), 'medium_large' );
        if ( ! $thumb ) {
            $thumb = get_template_directory_uri() . '/assets/img/news_hero.png';
            $post_cats = get_the_category();
            if ( ! empty( $post_cats ) ) {
                foreach ( $post_cats as $pc ) {
                    if ( isset( $card_hero_map[ $pc->slug ] ) ) {
                        $thumb = get_template_directory_uri() . '/assets/img/' . $card_hero_map[ $pc->slug ];
                        break;
                    }
                }
            }
        }
        $first_cat = '';
        $post_cats_all = get_the_category();
        if ( ! empty( $post_cats_all ) ) {
            $first_cat = $post_cats_all[0]->name;
        }
        ?>
        <article id="post-<?php the_ID(); ?>" <?php post_class('dispatch-card'); ?>>
            <div class="dispatch-card__img" style="background-image: url('<?php echo esc_url( $thumb ); ?>');">
                <?php if ( $first_cat ) : ?>
                    <span class="dispatch-card__cat-badge"><?php echo esc_html( $first_cat ); ?></span>
                <?php endif; ?>
                <span class="dispatch-card__date-badge"><?php echo get_the_date( 'j M Y' ); ?></span>
                <?php if ( function_exists( 'mlws_thumb_overlay' ) ) { mlws_thumb_overlay( get_the_ID(), array( 'cat' => false, 'date' => false ) ); } ?>
            </div>
            <div class="dispatch-card__body">
                <h2 class="dispatch-card__title">
                    <a href="<?php the_permalink(); ?>" rel="bookmark"><?php the_title(); ?></a>
                </h2>
                <div class="dispatch-card__excerpt">
                    <?php the_excerpt(); ?>
                </div>
                <a href="<?php the_permalink(); ?>" class="dispatch-card__read-more">
                    Read Dispatch
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </a>
            </div>
        </article>
        <?php
    }
    endif;

    // On a parent-category landing that has child sub-categories, render one
    // section per sub-category instead of a flat list. Each section pulls its
    // own posts (so it works regardless of parent/child archive inclusion) and
    // links through to the sub-category's full archive when it overflows.
    $arc_children = ( is_category() && isset( $cat ) )
        ? get_terms( [ 'taxonomy' => 'category', 'parent' => $cat->term_id, 'hide_empty' => true ] )
        : [];
    $arc_has_sections = ( ! is_wp_error( $arc_children ) && ! empty( $arc_children ) );
    $arc_subcat_limit = 12; // cards shown per sub-category on the landing
    ?>

    <?php
    // ── Under-hero blocks: Featured Article, Latest Articles, Promo ──
    // Per-category, configured in Customizer → Category Pages. Rendered in the
    // fixed order requested (Featured → Latest → Promo) directly under the hero.
    if ( is_category() && isset( $cat ) ) :
        $tid = $cat->term_id;

        // ── 1. Featured Article ──────────────────────────────────────
        if ( get_theme_mod( "mlws_catx_feat_show_{$tid}", false ) ) :
            $feat_id   = absint( get_theme_mod( "mlws_catx_feat_post_{$tid}", 0 ) );
            $feat_post = null;
            if ( $feat_id ) {
                $maybe = get_post( $feat_id );
                if ( $maybe && $maybe->post_status === 'publish' ) { $feat_post = $maybe; }
            }
            if ( ! $feat_post ) {
                $fq = new WP_Query( array(
                    'cat'                 => $tid,
                    'post_type'           => 'any',
                    'posts_per_page'      => 1,
                    'ignore_sticky_posts' => true,
                ) );
                if ( $fq->have_posts() ) { $feat_post = $fq->posts[0]; }
                wp_reset_postdata();
            }
            if ( $feat_post ) :
                $fp_id   = $feat_post->ID;
                $f_pref  = "mlws_catx_feat_{$tid}";
                $f_pos   = get_theme_mod( "mlws_catx_feat_pos_{$tid}", 'left' );
                $f_head  = get_theme_mod( "mlws_catx_feat_heading_{$tid}", 'Featured' );
                $f_thumb = get_the_post_thumbnail_url( $fp_id, 'large' );
                if ( ! $f_thumb ) {
                    $f_thumb = $arc_hero_bg;
                    foreach ( (array) get_the_category( $fp_id ) as $pc ) {
                        if ( isset( $card_hero_map[ $pc->slug ] ) ) {
                            $f_thumb = get_template_directory_uri() . '/assets/img/' . $card_hero_map[ $pc->slug ];
                            break;
                        }
                    }
                }
                $f_cats = get_the_category( $fp_id );
                ?>
                <section class="catx-block catx-featured pos-<?php echo esc_attr( $f_pos ); ?>"<?php echo mlws_catx_style_attr( $f_pref, array( 'background-color' => 'bg' ) ); ?>>
                    <div class="container">
                        <div class="catx-featured__inner">
                            <div class="catx-featured__media" style="background-image:url('<?php echo esc_url( $f_thumb ); ?>');"></div>
                            <div class="catx-featured__content">
                                <?php if ( $f_head ) : ?>
                                    <p class="catx-block__eyebrow"><?php echo esc_html( $f_head ); ?></p>
                                <?php endif; ?>
                                <?php if ( ! empty( $f_cats ) ) : ?>
                                    <span class="catx-featured__cat"><?php echo esc_html( $f_cats[0]->name ); ?></span>
                                <?php endif; ?>
                                <h2 class="catx-featured__title"<?php echo mlws_catx_style_attr( $f_pref, array( 'color' => 'title_color', 'font-size' => 'title_size' ) ); ?>>
                                    <a href="<?php echo esc_url( get_permalink( $fp_id ) ); ?>"><?php echo esc_html( get_the_title( $fp_id ) ); ?></a>
                                </h2>
                                <div class="catx-featured__excerpt"<?php echo mlws_catx_style_attr( $f_pref, array( 'color' => 'text_color', 'font-size' => 'text_size' ) ); ?>>
                                    <?php echo wp_kses_post( wpautop( get_the_excerpt( $fp_id ) ) ); ?>
                                </div>
                                <a class="catx-featured__link" href="<?php echo esc_url( get_permalink( $fp_id ) ); ?>">
                                    Read Dispatch
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                                </a>
                            </div>
                        </div>
                    </div>
                </section>
            <?php endif; ?>
        <?php endif; ?>

        <?php
        // ── 2. Latest Articles ───────────────────────────────────────
        if ( get_theme_mod( "mlws_catx_latest_show_{$tid}", false ) ) :
            $l_pref   = "mlws_catx_latest_{$tid}";
            $l_count  = absint( get_theme_mod( "mlws_catx_latest_count_{$tid}", 4 ) );
            if ( $l_count < 1 ) { $l_count = 4; }
            $l_layout = get_theme_mod( "mlws_catx_layout_{$tid}", 'grid' );
            $l_head   = get_theme_mod( "mlws_catx_latest_heading_{$tid}", 'Latest Articles' );
            $lq = new WP_Query( array(
                'cat'                 => $tid,
                'post_type'           => 'any',
                'posts_per_page'      => $l_count,
                'ignore_sticky_posts' => true,
            ) );
            if ( $lq->have_posts() ) : ?>
                <section class="catx-block catx-latest"<?php echo mlws_catx_style_attr( $l_pref, array( 'background-color' => 'bg' ) ); ?>>
                    <div class="container">
                        <?php if ( $l_head ) : ?>
                            <h2 class="catx-latest__title"<?php echo mlws_catx_style_attr( $l_pref, array( 'color' => 'title_color', 'font-size' => 'title_size' ) ); ?>><?php echo esc_html( $l_head ); ?></h2>
                        <?php endif; ?>
                        <?php mlws_catx_render_layout( $lq, $l_layout, $card_hero_map ); ?>
                    </div>
                </section>
            <?php endif;
            wp_reset_postdata();
        endif;
        ?>

        <?php
        // ── 3. Promo ─────────────────────────────────────────────────
        if ( get_theme_mod( "mlws_catx_promo_show_{$tid}", false ) ) :
            $p_pref  = "mlws_catx_promo_{$tid}";
            $p_head  = get_theme_mod( "mlws_catx_promo_heading_{$tid}", '' );
            $p_text  = get_theme_mod( "mlws_catx_promo_text_{$tid}", '' );
            $p_img   = get_theme_mod( "mlws_catx_promo_image_{$tid}", '' );
            $p_btn   = get_theme_mod( "mlws_catx_promo_btn_text_{$tid}", '' );
            $p_link  = get_theme_mod( "mlws_catx_promo_btn_link_{$tid}", '' );
            $p_pos   = get_theme_mod( "mlws_catx_promo_pos_{$tid}", 'right' );
            ?>
            <section class="catx-block catx-promo pos-<?php echo esc_attr( $p_pos ); ?><?php echo $p_img ? '' : ' no-image'; ?>"<?php echo mlws_catx_style_attr( $p_pref, array( 'background-color' => 'bg' ) ); ?>>
                <div class="container">
                    <div class="catx-promo__inner">
                        <?php if ( $p_img ) : ?>
                            <div class="catx-promo__media" style="background-image:url('<?php echo esc_url( $p_img ); ?>');"></div>
                        <?php endif; ?>
                        <div class="catx-promo__content">
                            <?php if ( $p_head ) : ?>
                                <h2 class="catx-promo__title"<?php echo mlws_catx_style_attr( $p_pref, array( 'color' => 'title_color', 'font-size' => 'title_size' ) ); ?>><?php echo esc_html( $p_head ); ?></h2>
                            <?php endif; ?>
                            <?php if ( $p_text ) : ?>
                                <div class="catx-promo__text"<?php echo mlws_catx_style_attr( $p_pref, array( 'color' => 'text_color', 'font-size' => 'text_size' ) ); ?>><?php echo wp_kses_post( wpautop( $p_text ) ); ?></div>
                            <?php endif; ?>
                            <?php if ( $p_btn && $p_link ) : ?>
                                <a class="catx-promo__btn" href="<?php echo esc_url( $p_link ); ?>"><?php echo esc_html( $p_btn ); ?></a>
                            <?php endif; ?>
                        </div>
                    </div>
                </div>
            </section>
        <?php endif; ?>

    <?php endif; ?>

    <!-- Articles -->
    <section class="arc-section">
        <div class="container">
        <?php if ( $arc_has_sections ) : ?>
            <?php foreach ( $arc_children as $child ) :
                $sub_q = new WP_Query( [
                    'cat'                 => $child->term_id,
                    'post_type'           => 'any',
                    'posts_per_page'      => $arc_subcat_limit,
                    'ignore_sticky_posts' => true,
                ] );
                if ( ! $sub_q->have_posts() ) { wp_reset_postdata(); continue; }
                $sub_total = (int) $sub_q->found_posts;
                ?>
                <div class="arc-subcat">
                    <div class="arc-subcat__head">
                        <h2 class="arc-subcat__title">
                            <?php echo esc_html( $child->name ); ?>
                            <span class="arc-subcat__count"><?php echo esc_html( number_format( $sub_total ) ); ?> <?php echo $sub_total === 1 ? 'dispatch' : 'dispatches'; ?></span>
                        </h2>
                        <?php if ( $sub_total > $arc_subcat_limit ) : ?>
                            <a class="arc-subcat__viewall" href="<?php echo esc_url( get_category_link( $child->term_id ) ); ?>">
                                View all
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                            </a>
                        <?php endif; ?>
                    </div>
                    <?php
                    $child_layout = get_theme_mod( "mlws_catx_layout_{$child->term_id}", 'grid' );
                    mlws_catx_render_layout( $sub_q, $child_layout, $card_hero_map );
                    ?>
                </div>
                <?php wp_reset_postdata(); ?>
            <?php endforeach; ?>
        <?php else : ?>
            <div class="arc-grid">
                <?php if ( have_posts() ) : ?>
                    <?php while ( have_posts() ) : the_post(); ?>
                        <?php mlws_render_dispatch_card( $card_hero_map ); ?>
                    <?php endwhile; ?>
                <?php else : ?>
                    <div class="arc-empty">
                        <h3>No dispatches yet</h3>
                        <p>Check back soon — Merlows correspondents are working on it.</p>
                    </div>
                <?php endif; ?>
            </div>

            <?php if ( have_posts() ) : ?>
                <div class="arc-pagination">
                    <?php the_posts_pagination( [
                        'mid_size'  => 2,
                        'prev_text' => '&larr;',
                        'next_text' => '&rarr;',
                    ] ); ?>
                </div>
            <?php endif; ?>
        <?php endif; ?>
        </div>
    </section>

</main>

<?php get_footer(); ?>
