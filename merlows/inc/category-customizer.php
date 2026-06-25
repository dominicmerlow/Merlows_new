<?php
/**
 * Category Pages customizer.
 *
 * Adds a "Category Pages" panel with one section per category. Each category
 * can choose how it renders as a sub-category section (Bento / Grid / List /
 * Magazine) and can switch on three extra blocks that appear directly under the
 * archive hero: Featured Article, Latest Articles, and a Promo block. Every
 * block exposes colour, font-size and (where relevant) left/right position
 * controls.
 *
 * All settings are keyed by the category term id so they stay independent
 * per-category, matching the existing mlws_cat_* theme-mod convention.
 *
 * Included from functions.php.
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

// ── Sanitizers ───────────────────────────────────────────────────────
function mlws_catx_sanitize_layout( $value ) {
    return in_array( $value, array( 'bento', 'grid', 'list', 'magazine' ), true ) ? $value : 'grid';
}
function mlws_catx_sanitize_pos( $value ) {
    return in_array( $value, array( 'left', 'right' ), true ) ? $value : 'left';
}
// Accepts a CSS length such as "28px", "1.5rem", "2em". Empty = inherit.
function mlws_catx_sanitize_size( $value ) {
    $value = trim( (string) $value );
    if ( $value === '' ) { return ''; }
    return preg_match( '/^\d*\.?\d+(px|rem|em|%|vw)$/', $value ) ? $value : '';
}

/**
 * The layout choices, reused by several controls.
 */
function mlws_catx_layout_choices() {
    return array(
        'bento'    => 'Bento (asymmetric feature grid)',
        'grid'     => 'Grid (uniform cards)',
        'list'     => 'List (horizontal rows)',
        'magazine' => 'Magazine (lead + compact list)',
    );
}

function mlws_catx_customize_register( $wp_customize ) {

    $wp_customize->add_panel( 'mlws_catx_panel', array(
        'title'       => __( 'Category Pages', 'merlows' ),
        'description' => __( 'Per-category layouts and the Featured / Latest / Promo blocks that appear under each category hero.', 'merlows' ),
        'priority'    => 45,
    ) );

    $categories = get_categories( array( 'hide_empty' => false ) );

    foreach ( $categories as $cat ) {
        $tid     = $cat->term_id;
        $section = "mlws_catx_sec_{$tid}";

        $wp_customize->add_section( $section, array(
            'title' => $cat->name,
            'panel' => 'mlws_catx_panel',
        ) );

        // ── Sub-category section layout ──────────────────────────────
        $wp_customize->add_setting( "mlws_catx_layout_{$tid}", array(
            'default'           => 'grid',
            'sanitize_callback' => 'mlws_catx_sanitize_layout',
        ) );
        $wp_customize->add_control( "mlws_catx_layout_{$tid}", array(
            'label'       => __( 'Section Layout', 'merlows' ),
            'description' => __( 'How this category looks when shown as a sub-section on its parent page, and the layout used by its own Latest Articles block.', 'merlows' ),
            'section'     => $section,
            'type'        => 'select',
            'choices'     => mlws_catx_layout_choices(),
        ) );

        // ── Featured Article block ───────────────────────────────────
        $wp_customize->add_setting( "mlws_catx_feat_show_{$tid}", array(
            'default' => false, 'sanitize_callback' => 'mlws_sanitize_checkbox',
        ) );
        $wp_customize->add_control( "mlws_catx_feat_show_{$tid}", array(
            'label' => __( '★ Featured Article — show', 'merlows' ), 'section' => $section, 'type' => 'checkbox',
        ) );

        $wp_customize->add_setting( "mlws_catx_feat_heading_{$tid}", array(
            'default' => 'Featured', 'sanitize_callback' => 'sanitize_text_field',
        ) );
        $wp_customize->add_control( "mlws_catx_feat_heading_{$tid}", array(
            'label' => __( 'Featured — eyebrow heading', 'merlows' ), 'section' => $section, 'type' => 'text',
        ) );

        $wp_customize->add_setting( "mlws_catx_feat_post_{$tid}", array(
            'default' => '', 'sanitize_callback' => 'absint',
        ) );
        $wp_customize->add_control( "mlws_catx_feat_post_{$tid}", array(
            'label'       => __( 'Featured — post ID', 'merlows' ),
            'description' => __( 'Leave blank to use the most recent post in this category.', 'merlows' ),
            'section'     => $section, 'type' => 'number',
        ) );

        $wp_customize->add_setting( "mlws_catx_feat_pos_{$tid}", array(
            'default' => 'left', 'sanitize_callback' => 'mlws_catx_sanitize_pos',
        ) );
        $wp_customize->add_control( "mlws_catx_feat_pos_{$tid}", array(
            'label' => __( 'Featured — image position', 'merlows' ), 'section' => $section, 'type' => 'select',
            'choices' => array( 'left' => 'Image left', 'right' => 'Image right' ),
        ) );

        mlws_catx_add_style_controls( $wp_customize, $section, "mlws_catx_feat_{$tid}", 'Featured' );

        // ── Latest Articles block ────────────────────────────────────
        $wp_customize->add_setting( "mlws_catx_latest_show_{$tid}", array(
            'default' => false, 'sanitize_callback' => 'mlws_sanitize_checkbox',
        ) );
        $wp_customize->add_control( "mlws_catx_latest_show_{$tid}", array(
            'label' => __( '▦ Latest Articles — show', 'merlows' ), 'section' => $section, 'type' => 'checkbox',
        ) );

        $wp_customize->add_setting( "mlws_catx_latest_heading_{$tid}", array(
            'default' => 'Latest Articles', 'sanitize_callback' => 'sanitize_text_field',
        ) );
        $wp_customize->add_control( "mlws_catx_latest_heading_{$tid}", array(
            'label' => __( 'Latest — heading', 'merlows' ), 'section' => $section, 'type' => 'text',
        ) );

        $wp_customize->add_setting( "mlws_catx_latest_count_{$tid}", array(
            'default' => 4, 'sanitize_callback' => 'absint',
        ) );
        $wp_customize->add_control( "mlws_catx_latest_count_{$tid}", array(
            'label' => __( 'Latest — number of articles', 'merlows' ), 'section' => $section, 'type' => 'number',
            'input_attrs' => array( 'min' => 1, 'max' => 24, 'step' => 1 ),
        ) );

        mlws_catx_add_style_controls( $wp_customize, $section, "mlws_catx_latest_{$tid}", 'Latest' );

        // ── Promo block ──────────────────────────────────────────────
        $wp_customize->add_setting( "mlws_catx_promo_show_{$tid}", array(
            'default' => false, 'sanitize_callback' => 'mlws_sanitize_checkbox',
        ) );
        $wp_customize->add_control( "mlws_catx_promo_show_{$tid}", array(
            'label' => __( '◈ Promo — show', 'merlows' ), 'section' => $section, 'type' => 'checkbox',
        ) );

        $wp_customize->add_setting( "mlws_catx_promo_heading_{$tid}", array(
            'default' => 'Experience the Hub', 'sanitize_callback' => 'sanitize_text_field',
        ) );
        $wp_customize->add_control( "mlws_catx_promo_heading_{$tid}", array(
            'label' => __( 'Promo — heading', 'merlows' ), 'section' => $section, 'type' => 'text',
        ) );

        $wp_customize->add_setting( "mlws_catx_promo_text_{$tid}", array(
            'default' => '', 'sanitize_callback' => 'sanitize_textarea_field',
        ) );
        $wp_customize->add_control( "mlws_catx_promo_text_{$tid}", array(
            'label' => __( 'Promo — body text', 'merlows' ), 'section' => $section, 'type' => 'textarea',
        ) );

        $wp_customize->add_setting( "mlws_catx_promo_image_{$tid}", array(
            'default' => '', 'sanitize_callback' => 'esc_url_raw',
        ) );
        $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, "mlws_catx_promo_image_{$tid}", array(
            'label' => __( 'Promo — image', 'merlows' ), 'section' => $section,
        ) ) );

        $wp_customize->add_setting( "mlws_catx_promo_btn_text_{$tid}", array(
            'default' => 'Get Started', 'sanitize_callback' => 'sanitize_text_field',
        ) );
        $wp_customize->add_control( "mlws_catx_promo_btn_text_{$tid}", array(
            'label' => __( 'Promo — button text', 'merlows' ), 'section' => $section, 'type' => 'text',
        ) );

        $wp_customize->add_setting( "mlws_catx_promo_btn_link_{$tid}", array(
            'default' => '', 'sanitize_callback' => 'esc_url_raw',
        ) );
        $wp_customize->add_control( "mlws_catx_promo_btn_link_{$tid}", array(
            'label' => __( 'Promo — button link', 'merlows' ), 'section' => $section, 'type' => 'url',
        ) );

        $wp_customize->add_setting( "mlws_catx_promo_pos_{$tid}", array(
            'default' => 'right', 'sanitize_callback' => 'mlws_catx_sanitize_pos',
        ) );
        $wp_customize->add_control( "mlws_catx_promo_pos_{$tid}", array(
            'label' => __( 'Promo — image position', 'merlows' ), 'section' => $section, 'type' => 'select',
            'choices' => array( 'left' => 'Image left', 'right' => 'Image right' ),
        ) );

        mlws_catx_add_style_controls( $wp_customize, $section, "mlws_catx_promo_{$tid}", 'Promo' );
    }
}
add_action( 'customize_register', 'mlws_catx_customize_register', 30 );

/**
 * Register the shared colour / font-size controls for one block.
 *
 * $prefix is e.g. "mlws_catx_feat_{tid}" so the resulting settings are
 * "{$prefix}_bg", "{$prefix}_title_color", "{$prefix}_title_size",
 * "{$prefix}_text_color", "{$prefix}_text_size".
 */
function mlws_catx_add_style_controls( $wp_customize, $section, $prefix, $label ) {
    $wp_customize->add_setting( "{$prefix}_bg", array( 'default' => '', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "{$prefix}_bg", array(
        'label' => "{$label} — background colour", 'section' => $section,
    ) ) );

    $wp_customize->add_setting( "{$prefix}_title_color", array( 'default' => '', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "{$prefix}_title_color", array(
        'label' => "{$label} — title colour", 'section' => $section,
    ) ) );

    $wp_customize->add_setting( "{$prefix}_title_size", array( 'default' => '', 'sanitize_callback' => 'mlws_catx_sanitize_size' ) );
    $wp_customize->add_control( "{$prefix}_title_size", array(
        'label' => "{$label} — title size (e.g. 32px)", 'section' => $section, 'type' => 'text',
    ) );

    $wp_customize->add_setting( "{$prefix}_text_color", array( 'default' => '', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "{$prefix}_text_color", array(
        'label' => "{$label} — text colour", 'section' => $section,
    ) ) );

    $wp_customize->add_setting( "{$prefix}_text_size", array( 'default' => '', 'sanitize_callback' => 'mlws_catx_sanitize_size' ) );
    $wp_customize->add_control( "{$prefix}_text_size", array(
        'label' => "{$label} — text size (e.g. 16px)", 'section' => $section, 'type' => 'text',
    ) );
}

// ─────────────────────────────────────────────────────────────────────
// Front-end render helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Build an inline style="" string from a block's colour/size mods.
 * $which selects which of the block's tokens map onto which CSS props.
 */
function mlws_catx_style_attr( $prefix, $parts ) {
    $css = array();
    foreach ( $parts as $css_prop => $mod_suffix ) {
        $val = get_theme_mod( "{$prefix}_{$mod_suffix}", '' );
        if ( $val !== '' ) {
            $css[] = $css_prop . ':' . $val;
        }
    }
    return empty( $css ) ? '' : ' style="' . esc_attr( implode( ';', $css ) ) . '"';
}

/**
 * Render N cards from a WP_Query in the requested layout. Relies on
 * mlws_render_dispatch_card() (defined in archive.php) for the base card.
 */
function mlws_catx_render_layout( $query, $layout, $card_hero_map ) {
    if ( ! $query->have_posts() ) { return; }

    switch ( $layout ) {
        case 'bento':
            echo '<div class="arc-grid arc-bento">';
            while ( $query->have_posts() ) { $query->the_post(); mlws_render_dispatch_card( $card_hero_map ); }
            echo '</div>';
            break;

        case 'list':
            echo '<div class="arc-list">';
            while ( $query->have_posts() ) { $query->the_post(); mlws_render_dispatch_card( $card_hero_map ); }
            echo '</div>';
            break;

        case 'magazine':
            echo '<div class="arc-mag">';
            $i = 0;
            while ( $query->have_posts() ) {
                $query->the_post();
                if ( $i === 0 ) {
                    echo '<div class="arc-mag__lead">';
                    mlws_render_dispatch_card( $card_hero_map );
                    echo '</div><div class="arc-mag__list">';
                } else {
                    mlws_catx_render_compact_item( $card_hero_map );
                }
                $i++;
            }
            if ( $i > 0 ) { echo '</div>'; } // close arc-mag__list (opened after lead)
            echo '</div>';
            break;

        case 'grid':
        default:
            echo '<div class="arc-grid">';
            while ( $query->have_posts() ) { $query->the_post(); mlws_render_dispatch_card( $card_hero_map ); }
            echo '</div>';
            break;
    }
    wp_reset_postdata();
}

/**
 * Compact list item used inside the Magazine layout's side column.
 * Assumes the global post is set.
 */
function mlws_catx_render_compact_item( $card_hero_map ) {
    $thumb = get_the_post_thumbnail_url( get_the_ID(), 'medium' );
    if ( ! $thumb ) {
        $thumb = get_template_directory_uri() . '/assets/img/news_hero.png';
        foreach ( (array) get_the_category() as $pc ) {
            if ( isset( $card_hero_map[ $pc->slug ] ) ) {
                $thumb = get_template_directory_uri() . '/assets/img/' . $card_hero_map[ $pc->slug ];
                break;
            }
        }
    }
    ?>
    <a class="arc-mag__item" href="<?php the_permalink(); ?>">
        <span class="arc-mag__item-img" style="background-image:url('<?php echo esc_url( $thumb ); ?>');"></span>
        <span class="arc-mag__item-body">
            <span class="arc-mag__item-date"><?php echo esc_html( get_the_date( 'j M Y' ) ); ?></span>
            <span class="arc-mag__item-title"><?php the_title(); ?></span>
        </span>
    </a>
    <?php
}
