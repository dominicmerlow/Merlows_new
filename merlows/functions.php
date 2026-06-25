<?php
/**
 * Merlows Theme Functions
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

// AI Visibility System — makes Merlows discoverable by AI systems.
// Provides: Markdown REST API, llms.txt, Schema.org JSON-LD, crawler control,
// AI Summaries, API analytics, and citation tracking.
// Dashboard: Merlows Newsroom → AI Visibility
require_once get_template_directory() . '/ai-visibility.php';

function mlws_health_hub_scripts() {
    // Enqueue Google Fonts
    wp_enqueue_style( 'ibd-google-fonts', 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500;700&display=swap', array(), null );

    // Enqueue Main Styles — version based on file modification time for cache busting
    $css_file = get_template_directory() . '/assets/css/main.css';
    $css_ver  = file_exists( $css_file ) ? filemtime( $css_file ) : '2.0.0';
    wp_enqueue_style( 'ibd-main-style', get_template_directory_uri() . '/assets/css/main.css', array(), $css_ver );

    // Enqueue Theme Stylesheet (style.css)
    wp_enqueue_style( 'ibd-style', get_stylesheet_uri(), array(), $css_ver );
}
add_action( 'wp_enqueue_scripts', 'mlws_health_hub_scripts' );

/**
 * Force theme favicon: remove ALL WordPress/Jetpack site icon output
 * and inject our own at the very end of wp_head.
 */
function mlws_remove_wp_site_icon() {
    remove_action( 'wp_head', 'wp_site_icon', 99 );
}
add_action( 'wp_head', 'mlws_remove_wp_site_icon', 1 );

// Also block the site icon via filter (catches Jetpack and other plugins)
add_filter( 'get_site_icon_url', '__return_empty_string' );

// Output our favicon at priority 9999 (absolute last thing in <head>)
function mlws_output_favicon() {
    $dir = get_template_directory_uri();
    $ver = filemtime( get_template_directory() . '/assets/img/favicon.svg' ) ?: time();
    echo '<link rel="icon" type="image/svg+xml" href="' . $dir . '/assets/img/favicon.svg?v=' . $ver . '">' . "\n";
    echo '<link rel="icon" type="image/png" sizes="32x32" href="' . $dir . '/assets/img/favicon.png?v=' . $ver . '">' . "\n";
    echo '<link rel="shortcut icon" href="' . $dir . '/assets/img/favicon.svg?v=' . $ver . '">' . "\n";
    echo '<link rel="apple-touch-icon" href="' . $dir . '/assets/img/favicon.png?v=' . $ver . '">' . "\n";
}
add_action( 'wp_head', 'mlws_output_favicon', 9999 );

function mlws_health_hub_setup() {
    // Add default posts and comments RSS feed links to head.
    add_theme_support( 'automatic-feed-links' );

    // Let WordPress manage the document title.
    add_theme_support( 'title-tag' );

    // Enable support for Post Thumbnails on posts and pages.
    add_theme_support( 'post-thumbnails' );

    // Register Navigation Menus
    register_nav_menus(
        array(
            'primary-menu' => esc_html__('Primary Menu', 'merlows' ),
            'footer-menu-1' => esc_html__('Footer Menu Topics', 'merlows' ),
            'footer-menu-2' => esc_html__('Footer Menu Writers', 'merlows' ),
            'footer-menu-3' => esc_html__('Footer Menu Readers', 'merlows' ),
        )
    );
}
add_action( 'after_setup_theme', 'mlws_health_hub_setup' );

/**
 * Theme Activation: Pre-seed all categories, tags, and default content structures
 * so the site is ready immediately without needing to create posts first.
 */
function mlws_theme_activation() {
    // --- Categories (Merlows news portal) ---
    $categories = array(
        'Breaking News'        => 'breaking-news',
        'Diplomatic Analysis'  => 'diplomatic-analysis',
        'BlitzSpirit'          => 'blitzspirit',
        'Cyrus Accord Updates' => 'cyrus-accord',
        'Abraham Accords'      => 'abraham-accords',
        'Regional Voices'      => 'regional-voices',
    );

    foreach ( $categories as $name => $slug ) {
        if ( ! term_exists( $name, 'category' ) ) {
            wp_insert_term( $name, 'category', array( 'slug' => $slug ) );
        }
    }

    // Remove default "Uncategorized" if it has no posts
    $uncat = get_term_by( 'slug', 'uncategorized', 'category' );
    if ( $uncat && $uncat->count === 0 ) {
        wp_delete_term( $uncat->term_id, 'category' );
    }

    // --- Reading Level Tags ---
    $reading_tags = array(
        'reading-beginner'     => 'Reading: Beginner',
        'reading-intermediate' => 'Reading: Intermediate',
        'reading-advanced'     => 'Reading: Advanced',
        'reading-professional' => 'Reading: Professional',
    );

    foreach ( $reading_tags as $slug => $name ) {
        if ( ! term_exists( $slug, 'post_tag' ) ) {
            wp_insert_term( $name, 'post_tag', array( 'slug' => $slug ) );
        }
    }

    // --- Geography & Topic Tags ---
    $pathway_tags = array(
        'geo-israel'      => 'Geo: Israel',
        'geo-iran'        => 'Geo: Iran',
        'geo-region'      => 'Geo: Region',
        'topic-diplomacy' => 'Topic: Diplomacy',
        'topic-culture'   => 'Topic: Culture',
        'topic-economy'   => 'Topic: Economy',
    );

    foreach ( $pathway_tags as $slug => $name ) {
        if ( ! term_exists( $slug, 'post_tag' ) ) {
            wp_insert_term( $name, 'post_tag', array( 'slug' => $slug ) );
        }
    }

    // Flush rewrite rules so CPT archives work immediately
    flush_rewrite_rules();
}
add_action( 'after_switch_theme', 'mlws_theme_activation' );

/**
 * Robust category seeder — runs on admin_init and checks if categories
 * actually exist in the DB (not just a flag). Re-seeds any missing ones.
 */
function mlws_maybe_seed_categories() {
    // Check if the core categories actually exist — not just a flag
    $required_cats = array(
        'Breaking News', 'Diplomatic Analysis', 'BlitzSpirit',
        'Cyrus Accord Updates', 'Abraham Accords', 'Regional Voices',
    );

    $all_exist = true;
    foreach ( $required_cats as $cat_name ) {
        if ( ! term_exists( $cat_name, 'category' ) ) {
            $all_exist = false;
            break;
        }
    }

    if ( ! $all_exist ) {
        mlws_theme_activation();
    }
}
add_action( 'admin_init', 'mlws_maybe_seed_categories' );

/**
 * Manual seed trigger via URL: /wp-admin/?mlws_seed=1
 * Useful if activation hook didn't fire.
 */
function mlws_manual_seed_trigger() {
    if ( isset( $_GET['mlws_seed'] ) && $_GET['mlws_seed'] === '1' && current_user_can( 'manage_options' ) ) {
        mlws_theme_activation();
        add_action( 'admin_notices', function() {
            echo '<div class="notice notice-success is-dismissible"><p><strong>Merlows:</strong> Categories, reading levels, and pathway tags have been seeded successfully.</p></div>';
        });
    }
}
add_action( 'admin_init', 'mlws_manual_seed_trigger' );

/**
 * Remove "Category:" prefix from archive titles
 */
function mlws_remove_category_prefix( $title ) {
    if ( is_category() ) {
        $title = single_cat_title( '', false );
    }
    return $title;
}
add_filter( 'get_the_archive_title', 'mlws_remove_category_prefix' );

/**
 * Include Custom Post Types in Category Archives
 * This ensures that both standard posts and CPTs appear when viewing a category
 */
function mlws_include_cpts_in_category_archives( $query ) {
    // Only modify the main query on category archives
    if ( ! is_admin() && $query->is_main_query() && is_category() ) {
        // Get all registered CPTs
        $cpts = array( 'news', 'research', 'oped', 'review', 'whitepaper', 'podcast', 'webinar', 'course', 'infographic' );
        
        // Include both standard posts and all CPTs
        $query->set( 'post_type', array_merge( array( 'post' ), $cpts ) );
    }
}
add_action( 'pre_get_posts', 'mlws_include_cpts_in_category_archives' );

/**
 * Register Custom Post Types
 * News, Clinical Research Reviews, Op-Eds, Product reviews, White papers, Podcasts, Webinars, Courses, Infographics
 */
function mlws_register_cpts() {
    $cpts = array(
        'news' => 'Healthcare News',
        'research' => 'Clinical Reviews',
        'oped' => 'Expert Opinions',
        'review' => 'Reviews',
        'whitepaper' => 'Tools & Resources',
        'podcast' => 'Media Library',
        'webinar' => 'Webinars',
        'course' => 'Education Courses',
        'infographic' => 'Infographic Gallery'
    );

    foreach ($cpts as $slug => $name) {
        $labels = array(
            'name'                  => _x( $name . 's', 'Post Type General Name', 'merlows' ),
            'singular_name'         => _x( $name, 'Post Type Singular Name', 'merlows' ),
            'menu_name'             => __($name . 's', 'merlows' ),
            'all_items'             => __('All ' . $name . 's', 'merlows' ),
            'add_new_item'          => __('Add New ' . $name, 'merlows' ),
        );
        $args = array(
            'label'                 => __($name, 'merlows' ),
            'labels'                => $labels,
            'supports'              => array( 'title', 'editor', 'thumbnail', 'excerpt', 'custom-fields', 'author' ),
            'hierarchical'          => false,
            'public'                => true,
            'show_ui'               => true,
            'has_archive'           => true,
            'publicly_queryable'    => true,
            'capability_type'       => 'post',
            'map_meta_cap'          => true,
            'show_in_rest'          => true,
            'show_in_menu'          => true, // Fixed: Setting this to true and manually moving solves permissions
            'taxonomies'            => array('category', 'post_tag'),
            'rewrite'               => array(
                'slug'                  => $slug,
                'with_front'            => false,
                'pages'                 => true,
                'feeds'                 => true,
            ),
        );
        register_post_type( $slug, $args );
    }
}
add_action( 'init', 'mlws_register_cpts' );

/**
 * Explicitly grant CPT capabilities to Administrator
 */
function mlws_grant_cpt_caps() {
    $role = get_role( 'administrator' );
    if ( ! $role ) return;

    $cpts = array('news', 'research', 'oped', 'review', 'whitepaper', 'podcast', 'webinar', 'course', 'infographic');
    foreach ($cpts as $cpt) {
        $role->add_cap( "edit_{$cpt}" );
        $role->add_cap( "read_{$cpt}" );
        $role->add_cap( "delete_{$cpt}" );
        $role->add_cap( "edit_{$cpt}s" );
        $role->add_cap( "edit_others_{$cpt}s" );
        $role->add_cap( "publish_{$cpt}s" );
        $role->add_cap( "read_private_{$cpt}s" );
        $role->add_cap( "delete_{$cpt}s" );
        $role->add_cap( "delete_others_{$cpt}s" );
        $role->add_cap( "delete_private_{$cpt}s" );
        $role->add_cap( "delete_published_{$cpt}s" );
        $role->add_cap( "edit_private_{$cpt}s" );
        $role->add_cap( "edit_published_{$cpt}s" );
    }
}
add_action( 'admin_init', 'mlws_grant_cpt_caps' );

/**
 * Flush rewrite rules on theme activation
 * This ensures the new permalink structure takes effect
 */
function mlws_flush_rewrite_rules() {
    mlws_register_cpts();
    flush_rewrite_rules();
}
add_action( 'after_switch_theme', 'mlws_flush_rewrite_rules' );

// Create Content Hub Menu
function mlws_register_content_hub_menu() {
    add_menu_page(
        'Merlows Newsroom',
        'Merlows Newsroom',
        'manage_options',
        'merlows-newsroom',
        'mlws_render_content_hub_dashboard',
        'dashicons-category',
        1 
    );

    add_submenu_page(
        'merlows-newsroom',
        'Content Hub Station',
        'Content Hub Station',
        'manage_options',
        'merlows-newsroom',
        'mlws_render_content_hub_dashboard'
    );

    add_submenu_page(
        'merlows-newsroom',
        'Customize Hub',
        'Customize Hub',
        'manage_options',
        'customize.php'
    );

    // Relocate CPTs manually to fix permission breakage while hiding top-level items
    $cpts = array(
        'news' => 'Healthcare News',
        'research' => 'Clinical Reviews',
        'oped' => 'Expert Opinions',
        // 'review' => 'Reviews', // REMOVED from Content Hub menu per user request
        'whitepaper' => 'Tools & Resources',
        'podcast' => 'Media Library',
        'webinar' => 'Webinars',
        'course' => 'Education Courses',
        'infographic' => 'Infographic Gallery'
    );

    foreach ($cpts as $slug => $name) {
        remove_menu_page('edit.php?post_type=' . $slug);
        // Submenus removed as per request to only show Station and Customize
    }
}
add_action( 'admin_menu', 'mlws_register_content_hub_menu', 999 );

/**
 * Get SVG Icon for Category
 */
function mlws_get_category_icon_url($name) {
    if (empty($name)) return '';
    
    $name = strtolower($name);
    $theme_dir = get_template_directory_uri();
    
    $mapping = array(
        'pharmaceutical' => 'pill.svg',
        'news' => 'megaphone.svg',
        'healthcare news' => 'megaphone.svg',
        'research' => 'analytics.svg',
        'clinical reviews' => 'analytics.svg',
        'expert opinions' => 'clipboard.svg',
        'oped' => 'clipboard.svg',
        'reviews' => 'star.svg',
        'product reviews' => 'star.svg',
        'tools & resources' => 'scale.svg',
        'whitepaper' => 'scale.svg',
        'media library' => 'microphone.svg',
        'podcast' => 'microphone.svg',
        'webinars' => 'video.svg',
        'education courses' => 'brain.svg',
        'course' => 'brain.svg',
        'infographic gallery' => 'dna.svg',
        'infographic' => 'dna.svg',
        'practitioner' => 'stethoscope.svg',
        'patient' => 'heart.svg',
        'industry' => 'hospital.svg',
        'neurology' => 'brain.svg',
        'cardiology' => 'pulse.svg',
        'osteology' => 'bone.svg',
        'respiratory' => 'lungs.svg',
        'orthopedic' => 'joint.svg',
        'dentistry' => 'tooth.svg',
        'ophthalmology' => 'eye.svg',
        'supplementation' => 'pill.svg',
        'medical food' => 'apple.svg',
        'lifestyle' => 'heart.svg'
    );
    
    foreach ($mapping as $key => $icon) {
        if (strpos($name, $key) !== false) {
            return $theme_dir . '/assets/img/icons/' . $icon;
        }
    }
    
    // Default if no match
    return $theme_dir . '/assets/img/icons/medkit.svg';
}

/**
 * Estimated reading time (in whole minutes) for a post.
 *
 * Uses the manually-set `_oped_read_time` post meta when present, otherwise
 * estimates from the word count at ~200 wpm. Mirrors the logic used on the
 * single-post hero so the figure is consistent everywhere it is shown.
 *
 * @param int|null $post_id Post ID (defaults to the current post in the loop).
 * @return int Minutes (minimum 1).
 */
function mlws_get_reading_time( $post_id = null ) {
    $post_id = $post_id ? $post_id : get_the_ID();
    $read_time = get_post_meta( $post_id, '_oped_read_time', true );
    if ( ! $read_time ) {
        $word_count = str_word_count( strip_tags( get_post_field( 'post_content', $post_id ) ) );
        $read_time = (int) ceil( $word_count / 200 );
    }
    return max( 1, (int) $read_time );
}

/**
 * Render the standard thumbnail text-overlay badges (category, date, reading
 * time) used across post cards. Intended to be echoed inside a thumbnail
 * container that is `position: relative` (e.g. `.dispatch-card__img`).
 *
 * Matches the dispatch-card badge styling: category top-left, date bottom-left,
 * reading time bottom-right. Any badge can be suppressed via $args.
 *
 * @param int|null $post_id Post ID (defaults to current post in the loop).
 * @param array    $args    { 'cat' => bool, 'date' => bool, 'read_time' => bool }
 */
function mlws_thumb_overlay( $post_id = null, $args = array() ) {
    $post_id = $post_id ? $post_id : get_the_ID();
    $args = array_merge( array( 'cat' => true, 'date' => true, 'read_time' => true ), $args );

    if ( $args['cat'] ) {
        $cats = get_the_category( $post_id );
        if ( ! empty( $cats ) ) {
            echo '<span class="mlws-thumb-badge mlws-thumb-badge--cat">' . esc_html( $cats[0]->name ) . '</span>';
        }
    }
    if ( $args['date'] ) {
        echo '<span class="mlws-thumb-badge mlws-thumb-badge--date">' . esc_html( get_the_date( 'j M Y', $post_id ) ) . '</span>';
    }
    if ( $args['read_time'] ) {
        $rt = mlws_get_reading_time( $post_id );
        echo '<span class="mlws-thumb-badge mlws-thumb-badge--read">'
            . '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-1px;margin-right:3px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
            . esc_html( $rt ) . ' min</span>';
    }
}

/**
 * Render Content Hub Management Dashboard
 */
function mlws_render_content_hub_dashboard() {
    $cpts = array(
        'news' => array('name' => 'Healthcare News', 'icon' => 'dashicons-megaphone', 'desc' => 'Articles and updates about the healthcare industry.'),
        'research' => array('name' => 'Clinical Reviews', 'icon' => 'dashicons-analytics', 'desc' => 'In-depth reviews of clinical research and trials.'),
        'oped' => array('name' => 'Expert Opinions', 'icon' => 'dashicons-id-alt', 'desc' => 'Professional perspectives and thought leadership.'),
        'review' => array('name' => 'Product Reviews', 'icon' => 'dashicons-star-filled', 'desc' => 'Reviews of healthcare products and supplements.'),
        'whitepaper' => array('name' => 'Tools & Resources', 'icon' => 'dashicons-media-text', 'desc' => 'Technical papers, guides, and professional tools.'),
        'podcast' => array('name' => 'Media Library', 'icon' => 'dashicons-microphone', 'desc' => 'Audio content and professional discussions.'),
        'webinar' => array('name' => 'Webinars', 'icon' => 'dashicons-video-alt3', 'desc' => 'Educational webinars and video presentations.'),
        'course' => array('name' => 'Education Courses', 'icon' => 'dashicons-welcome-learn-more', 'desc' => 'Structured learning and professional development.'),
        'infographic' => array('name' => 'Infographic Gallery', 'icon' => 'dashicons-format-image', 'desc' => 'Visual clinical data and educational graphics.')
    );
    ?>
    <div class="wrap" style="max-width: 1200px; margin: 30px auto;">
        <div style="background: white; border-radius: 0; padding: 40px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; margin-bottom: 30px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h1 style="font-size: 32px; font-weight: 800; color: #0F172A; margin: 0 0 10px 0; font-family: 'Outfit', sans-serif;">CONTENT HUB STATION</h1>
                    <p style="font-size: 16px; color: #64748b; margin: 0;">Manage your healthcare content and clinical resources.</p>
                </div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px;">
            <?php foreach ($cpts as $slug => $data) : ?>
            <div style="background: white; border-radius: 0; border: 1px solid #e2e8f0; padding: 30px; display: flex; flex-direction: column; transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='translateY(0)'">
                <div style="display: flex; align-items: flex-start; gap: 15px; margin-bottom: 20px;">
                    <div style="width: 48px; height: 48px; background: #f1f5f9; border-radius: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <img src="<?php echo mlws_get_category_icon_url($data['name']); ?>" style="width: 28px; height: 28px; object-fit: contain; filter: none !important;">
                    </div>
                    <div>
                        <h2 style="font-size: 16px; font-weight: 700; color: #0F172A; margin: 0; text-transform: uppercase;"><?php echo esc_html($data['name']); ?></h2>
                        <p style="color: #64748b; font-size: 13px; margin: 5px 0 0 0; line-height: 1.5;"><?php echo esc_html($data['desc']); ?></p>
                    </div>
                </div>
                
                <div style="margin-top: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <a href="<?php echo admin_url('edit.php?post_type=' . $slug); ?>" class="button" style="text-align: center; border-radius: 0;">View All</a>
                    <a href="<?php echo admin_url('post-new.php?post_type=' . $slug); ?>" class="button button-primary" style="text-align: center; background: #0F172A; border-color: #0F172A; border-radius: 0;">+ Add New</a>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
    <?php
}

/**
 * Render Media Hub Management Dashboard
 */
function mlws_render_media_hub_dashboard() {
    $cpts = array(
        'podcast' => array('name' => 'Podcasts', 'icon' => 'dashicons-microphone', 'desc' => 'Audio content and professional discussions.'),
        'webinar' => array('name' => 'Webinars & Videos', 'icon' => 'dashicons-video-alt3', 'desc' => 'Educational webinars and video presentations.'),
        'course' => array('name' => 'Courses', 'icon' => 'dashicons-welcome-learn-more', 'desc' => 'Structured learning and professional development.'),
        'infographic' => array('name' => 'Infographics', 'icon' => 'dashicons-format-image', 'desc' => 'Visual clinical data and educational graphics.'),
        'event' => array('name' => 'Events', 'icon' => 'dashicons-calendar-alt', 'desc' => 'Manage upcoming and past events, conferences, and workshops.'),
    );
    ?>
    <div class="wrap" style="max-width: 1200px; margin: 30px auto;">
        <div style="background: white; border-radius: 0; padding: 40px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; margin-bottom: 30px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h1 style="font-size: 32px; font-weight: 800; color: #0F172A; margin: 0 0 10px 0; font-family: 'Outfit', sans-serif;">MEDIA HUB STATION</h1>
                    <p style="font-size: 16px; color: #64748b; margin: 0;">Manage your multimedia content and educational resources.</p>
                </div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px;">
            <?php foreach ($cpts as $slug => $data) : ?>
            <div style="background: white; border-radius: 0; border: 1px solid #e2e8f0; padding: 30px; display: flex; flex-direction: column; transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='translateY(0)'">
                <div style="display: flex; align-items: flex-start; gap: 15px; margin-bottom: 20px;">
                    <div style="width: 48px; height: 48px; background: #f1f5f9; border-radius: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <img src="<?php echo mlws_get_category_icon_url($data['name']); ?>" style="width: 28px; height: 28px; object-fit: contain; filter: none !important;">
                    </div>
                    <div>
                        <h2 style="font-size: 16px; font-weight: 700; color: #0F172A; margin: 0; text-transform: uppercase;"><?php echo esc_html($data['name']); ?></h2>
                        <p style="color: #64748b; font-size: 13px; margin: 5px 0 0 0; line-height: 1.5;"><?php echo esc_html($data['desc']); ?></p>
                    </div>
                </div>
                
                <div style="margin-top: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <a href="<?php echo admin_url('edit.php?post_type=' . $slug); ?>" class="button" style="text-align: center; border-radius: 0;">View All</a>
                    <a href="<?php echo admin_url('post-new.php?post_type=' . $slug); ?>" class="button button-primary" style="text-align: center; background: #0F172A; border-color: #0F172A; border-radius: 0;">+ Add New</a>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
    <?php
}

/**
 * Sync My Dashboard Profile Image with get_avatar
 */
function mlws_filter_get_avatar( $args, $id_or_email ) {
    $user_id = 0;
    if ( is_numeric( $id_or_email ) ) {
        $user_id = (int) $id_or_email;
    } elseif ( is_string( $id_or_email ) && ( $user = get_user_by( 'email', $id_or_email ) ) ) {
        $user_id = $user->ID;
    } elseif ( is_object( $id_or_email ) && isset( $id_or_email->user_id ) ) {
        $user_id = (int) $id_or_email->user_id;
    }

    if ( $user_id ) {
        $custom_avatar = get_user_meta( $user_id, '_mlws_profile_image_url', true );
        if ( $custom_avatar ) {
            $args['url'] = $custom_avatar;
        }
    }
    return $args;
}
add_filter( 'get_avatar_data', 'mlws_filter_get_avatar', 10, 2 );

// Auto-assign Category based on CPT
function mlws_auto_assign_category( $post_id, $post, $update ) {
    // If it's a revision, skip
    if ( wp_is_post_revision( $post_id ) ) {
        return;
    }

    $cpts = array(
        'news' => 'Healthcare News',
        'research' => 'Clinical Reviews',
        'oped' => 'Expert Opinions',
        'review' => 'Expert Opinions',
        'whitepaper' => 'Tools & Resources',
        'podcast' => 'Media Library',
        'webinar' => 'Media Library',
        'course' => 'Education Courses',
        'infographic' => 'Infographic Gallery'
    );

    // Auto-assign category for CPTs
    if ( array_key_exists( $post->post_type, $cpts ) ) {
        $cat_name = $cpts[$post->post_type];
        $term = term_exists( $cat_name, 'category' );
        
        if ( ! $term ) {
            $term = wp_insert_term( $cat_name, 'category' );
        }
        
        if ( ! is_wp_error( $term ) ) {
            $term_id = is_array( $term ) ? $term['term_id'] : $term;
            // Replace existing categories with the auto-assigned one for CPTs
            wp_set_post_categories( $post_id, array( $term_id ), false );
        }
    }
}
add_action( 'save_post', 'mlws_auto_assign_category', 10, 3 );

/**
 * Add admin notice to guide users on post creation workflow
 */
function mlws_content_creation_notice() {
    $screen = get_current_screen();
    
    // Show notice on post edit screens
    if ( $screen && ( $screen->post_type === 'post' || in_array( $screen->post_type, array( 'news', 'research', 'oped', 'review', 'whitepaper', 'podcast', 'webinar', 'course', 'infographic' ) ) ) ) {
        if ( $screen->post_type === 'post' ) {
            echo '<div class="notice notice-info is-dismissible">
                <p><strong>Content Creation Guide:</strong> When creating standard posts, make sure to select the appropriate category. This category will be used in the primary menu.</p>
            </div>';
        } else {
            $cpt_names = array(
                'news' => 'Healthcare News',
                'research' => 'Clinical Reviews',
                'oped' => 'Expert Opinions',
                'review' => 'Expert Opinions',
                'whitepaper' => 'Tools & Resources',
                'podcast' => 'Media Library',
                'webinar' => 'Media Library',
                'course' => 'Education Courses',
                'infographic' => 'Infographic Gallery'
            );
            $cpt_name = isset( $cpt_names[ $screen->post_type ] ) ? $cpt_names[ $screen->post_type ] : $screen->post_type;
            echo '<div class="notice notice-info is-dismissible">
                <p><strong>Content Hub Post:</strong> This post will automatically be assigned to the "' . esc_html( $cpt_name ) . '" category. The URL will match standard posts (no post type slug).</p>
            </div>';
        }
    }
}
add_action( 'admin_notices', 'mlws_content_creation_notice' );

/**
 * Filter post type links to remove post type slug
 * This ensures CPTs have the same URL structure as standard posts
 */
function mlws_remove_cpt_slug_from_permalink( $post_link, $post ) {
    $cpts = array( 'news', 'research', 'oped', 'review', 'whitepaper', 'podcast', 'webinar', 'course', 'infographic' );
    
    if ( in_array( $post->post_type, $cpts ) && 'publish' === $post->post_status ) {
        // Remove post type slug from URL
        $post_link = str_replace( '/' . $post->post_type . '/', '/', $post_link );
    }
    
    return $post_link;
}
add_filter( 'post_type_link', 'mlws_remove_cpt_slug_from_permalink', 10, 2 );

/**
 * Parse request to handle CPTs without post type slug in URL
 * This allows CPTs to be accessed with the same URL structure as standard posts
 */
function mlws_parse_cpt_request( $wp ) {
    // Only parse if it's not an admin request and we have a name query var
    if ( is_admin() || ! isset( $wp->query_vars['name'] ) ) {
        return;
    }
    
    // Don't parse if we already have a post_type set
    if ( isset( $wp->query_vars['post_type'] ) ) {
        return;
    }
    
    $cpts = array( 'news', 'research', 'oped', 'review', 'whitepaper', 'podcast', 'webinar', 'course', 'infographic' );
    $name = $wp->query_vars['name'];
    
    if ( ! empty( $name ) ) {
        // Try to find the post in any of our CPTs
        foreach ( $cpts as $cpt ) {
            $post = get_page_by_path( $name, OBJECT, $cpt );
            if ( $post ) {
                $wp->query_vars['post_type'] = $cpt;
                $wp->query_vars['name'] = $name;
                break;
            }
        }
    }
}
add_action( 'parse_request', 'mlws_parse_cpt_request' );

















/**
 * Google OAuth Login Integration
 * 
 * To enable Google OAuth login:
 * 1. Go to https://console.cloud.google.com/
 * 2. Create a new project or select existing
 * 3. Enable Google+ API
 * 4. Go to Credentials > Create Credentials > OAuth Client ID
 * 5. Set Application type to "Web application"
 * 6. Add your site URL to Authorized JavaScript origins
 * 7. Add callback URL to Authorized redirect URIs: https://yoursite.com/wp-admin/admin-ajax.php
 * 8. Copy Client ID and add to wp-config.php: define('GOOGLE_CLIENT_ID', 'your-client-id');
 * 9. Copy Client Secret and add: define('GOOGLE_CLIENT_SECRET', 'your-client-secret');
 */

// Enqueue Google Identity Services
function mlws_enqueue_google_oauth_scripts() {
    if ( ! is_user_logged_in() ) {
        wp_enqueue_script( 'google-gsi', 'https://accounts.google.com/gsi/client', array(), null, true );
    }
}
add_action( 'wp_enqueue_scripts', 'mlws_enqueue_google_oauth_scripts' );

// Google OAuth Login Button Shortcode
function mlws_google_login_button_shortcode( $atts ) {
    if ( is_user_logged_in() ) {
        $current_user = wp_get_current_user();
        return '<div class="ibd-user-logged-in">
            <span>Welcome, ' . esc_html( $current_user->display_name ) . '</span>
            <a href="' . wp_logout_url( home_url() ) . '" class="btn btn-outline" style="margin-left: 12px;">Logout</a>
        </div>';
    }
    
    $client_id = defined('GOOGLE_CLIENT_ID') ? GOOGLE_CLIENT_ID : '';
    
    if ( empty( $client_id ) ) {
        return '<a href="' . wp_login_url() . '" class="btn btn-primary">Login / Register</a>';
    }
    
    $nonce = wp_create_nonce( 'google_oauth_nonce' );
    
    return '
    <div id="google-login-container">
        <div id="g_id_onload"
             data-client_id="' . esc_attr( $client_id ) . '"
             data-context="signin"
             data-ux_mode="popup"
             data-callback="handleGoogleCredentialResponse"
             data-auto_prompt="false">
        </div>
        <div class="g_id_signin"
             data-type="standard"
             data-shape="rectangular"
             data-theme="outline"
             data-text="signin_with"
             data-size="large"
             data-logo_alignment="left">
        </div>
    </div>
    <script>
    function handleGoogleCredentialResponse(response) {
        fetch("' . admin_url('admin-ajax.php') . '", {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: "action=mlws_google_oauth_callback&credential=" + response.credential + "&nonce=' . $nonce . '"
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                window.location.reload();
            } else {
                alert("Login failed: " + data.data);
            }
        });
    }
    </script>';
}
add_shortcode( 'google_login', 'mlws_google_login_button_shortcode' );

// Handle Google OAuth Callback
function mlws_google_oauth_callback() {
    // Check if POST data exists
    if ( ! isset( $_POST['nonce'] ) || ! isset( $_POST['credential'] ) ) {
        wp_send_json_error( 'Missing required data' );
    }
    
    if ( ! wp_verify_nonce( $_POST['nonce'], 'google_oauth_nonce' ) ) {
        wp_send_json_error( 'Invalid nonce' );
    }
    
    $credential = sanitize_text_field( $_POST['credential'] );
    
    // Decode JWT token (basic decode - in production use a proper JWT library)
    $parts = explode('.', $credential);
    if ( count($parts) !== 3 || ! isset( $parts[1] ) ) {
        wp_send_json_error( 'Invalid token format' );
    }
    
    $payload = json_decode( base64_decode( strtr( $parts[1], '-_', '+/' ) ), true );
    
    if ( ! $payload || ! isset( $payload['email'] ) ) {
        wp_send_json_error( 'Could not decode token' );
    }
    
    $email = sanitize_email( $payload['email'] );
    $name = isset( $payload['name'] ) ? sanitize_text_field( $payload['name'] ) : '';
    $google_id = isset( $payload['sub'] ) ? sanitize_text_field( $payload['sub'] ) : '';
    
    // Check if user exists
    $user = get_user_by( 'email', $email );
    
    if ( ! $user ) {
        // Create new user
        $username = sanitize_user( strstr( $email, '@', true ) );
        $username = str_replace( '.', '_', $username );
        
        // Make sure username is unique
        $base_username = $username;
        $i = 1;
        while ( username_exists( $username ) ) {
            $username = $base_username . $i;
            $i++;
        }
        
        $user_id = wp_create_user( $username, wp_generate_password(), $email );
        
        if ( is_wp_error( $user_id ) ) {
            wp_send_json_error( $user_id->get_error_message() );
        }
        
        // Update user meta
        $name_parts = explode(' ', $name);
        wp_update_user( array(
            'ID' => $user_id,
            'display_name' => $name,
            'first_name' => isset( $name_parts[0] ) ? $name_parts[0] : '',
            'last_name' => isset( $name_parts[1] ) ? $name_parts[1] : ''
        ) );
        
        update_user_meta( $user_id, 'google_id', $google_id );
        
        // Default to Member (reader) Role
        update_user_meta( $user_id, '_mlws_user_type', 'member' );
        update_user_meta( $user_id, '_mlws_dashboard_role', 'member' );
        
        $user = get_user_by( 'id', $user_id );
    }
    
    // Log the user in
    wp_set_current_user( $user->ID );
    wp_set_auth_cookie( $user->ID, true );
    
    wp_send_json_success( array( 'message' => 'Logged in successfully' ) );
}
add_action( 'wp_ajax_nopriv_mlws_google_oauth_callback', 'mlws_google_oauth_callback' );
add_action( 'wp_ajax_mlws_google_oauth_callback', 'mlws_google_oauth_callback' );

/**
 * Include Op-Ed Template Functions
 * Provides meta boxes and asset management for Op-Ed posts
 */
require get_template_directory() . '/inc/oped-template-functions.php';

/**
 * Include Tool Embedding Functions
 * Provides shortcode for embedding React tools in posts
 */
require get_template_directory() . '/inc/tool-embed.php';

/**
 * AJAX: Save Calculator Result
 * Stores a calculator result entry into user meta, keyed by tool type.
 */
function mlws_save_calc_result() {
    if ( ! is_user_logged_in() ) { wp_send_json_error( 'Not logged in' ); }
    if ( ! isset( $_POST['nonce'] ) || ! wp_verify_nonce( $_POST['nonce'], 'mlws_dashboard_nonce' ) ) {
        wp_send_json_error( 'Invalid nonce' );
    }

    $user_id  = get_current_user_id();
        $tool     = sanitize_key( isset($_POST['tool']) ? $_POST['tool'] : 'malnutrition' );
    $meta_key = '_mlws_calc_results_' . $tool;

        $new_entry = array(
        'id'         => sanitize_text_field( isset($_POST['result_id']) ? $_POST['result_id'] : uniqid( 'r_' ) ),
        'date'       => sanitize_text_field( isset($_POST['date']) ? $_POST['date'] : current_time( 'c' ) ),
        'score'      => intval( isset($_POST['score']) ? $_POST['score'] : 0 ),
        'risk_level' => sanitize_key( isset($_POST['risk_level']) ? $_POST['risk_level'] : '' ),
        'risk_label' => sanitize_text_field( isset($_POST['risk_label']) ? $_POST['risk_label'] : '' ),
        'bmi'        => floatval( isset($_POST['bmi']) ? $_POST['bmi'] : 0 ),
        'bmi_cat'    => sanitize_text_field( isset($_POST['bmi_cat']) ? $_POST['bmi_cat'] : '' ),
        'ibd_type'   => sanitize_key( isset($_POST['ibd_type']) ? $_POST['ibd_type'] : '' ),
    );

    $results = get_user_meta( $user_id, $meta_key, true ) ?: array();
    // Prepend newest first, cap at 50 entries
    array_unshift( $results, $new_entry );
    $results = array_slice( $results, 0, 50 );
    update_user_meta( $user_id, $meta_key, $results );

    wp_send_json_success( array( 'saved' => true ) );
}
add_action( 'wp_ajax_mlws_save_calc_result', 'mlws_save_calc_result' );

/**
 * AJAX: Get Calculator Results
 * Returns saved results for the current user, sorted newest first.
 */
function mlws_get_calc_results() {
    if ( ! is_user_logged_in() ) { wp_send_json_error( 'Not logged in' ); }
    if ( ! isset( $_POST['nonce'] ) || ! wp_verify_nonce( $_POST['nonce'], 'mlws_dashboard_nonce' ) ) {
        wp_send_json_error( 'Invalid nonce' );
    }

    $user_id  = get_current_user_id();
        $tool     = sanitize_key( isset($_POST['tool']) ? $_POST['tool'] : 'malnutrition' );
    $meta_key = '_mlws_calc_results_' . $tool;
    $results  = get_user_meta( $user_id, $meta_key, true ) ?: array();

    wp_send_json_success( $results );
}
add_action( 'wp_ajax_mlws_get_calc_results', 'mlws_get_calc_results' );

/**
 * Include Dashboard Functions
 * Handles User Dashboard logic (AJAX, Profiles, Bookmarks)
 */
require get_template_directory() . '/inc/dashboard-functions.php';


/**
 * Increase maximum upload size to 10MB
 */
function mlws_increase_upload_size_limit( $limit ) {
    return 10 * 1024 * 1024; // 10MB in bytes
}
add_filter( 'upload_size_limit', 'mlws_increase_upload_size_limit' );

/**
 * Add Advanced Theme Settings to Customizer
 */
function mlws_customize_register( $wp_customize ) {
    // 0. IBD Theme Panels
    $wp_customize->add_panel( 'mlws_brand_panel', array( 'title' => __('IBD Theme -> Brand Identity', 'merlows' ), 'priority' => 10 ) );
    $wp_customize->add_panel( 'mlws_homepage_panel', array( 'title' => __('IBD Theme -> Homepage', 'merlows' ), 'priority' => 11 ) );
    $wp_customize->add_panel( 'mlws_content_panel', array( 'title' => __('IBD Theme -> Content', 'merlows' ), 'priority' => 12 ) );
    $wp_customize->add_panel( 'mlws_footer_panel', array( 'title' => __('IBD Theme -> Footer', 'merlows' ), 'priority' => 13 ) );
    $wp_customize->add_panel( 'mlws_advanced_panel', array( 'title' => __('IBD Theme -> Advanced', 'merlows' ), 'priority' => 14 ) );

    // Move Site Identity into IBD Theme Settings
    if ( $wp_customize->get_section('title_tagline') ) {
        $wp_customize->get_section('title_tagline')->panel = 'mlws_brand_panel';
        $wp_customize->get_section('title_tagline')->priority = 5;
    }

    // 1. Social Media Links Section
    $wp_customize->add_section( 'mlws_social_links', array(
        'title'    => __('Social Media Links', 'merlows' ),
        'priority' => 30,
        'panel'    => 'mlws_brand_panel',
    ) );

    $social_networks = array(
        'linkedin'  => 'LinkedIn',
        'facebook'  => 'Facebook',
        'twitter'   => 'X (formerly Twitter)',
        'instagram' => 'Instagram',
    );

    foreach ( $social_networks as $key => $label ) {
        $wp_customize->add_setting( 'mlws_social_' . $key, array(
            'default'           => '',
            'sanitize_callback' => 'esc_url_raw',
        ) );

        $wp_customize->add_control( 'mlws_social_' . $key, array(
            'label'   => $label,
            'section' => 'mlws_social_links',
            'type'    => 'url',
        ) );
    }

    // 2. Hero Images & Content Section
    $wp_customize->add_section( 'mlws_hero_settings', array(
        'title'       => __('Hero', 'merlows' ),
        'description' => __('Manage hero images, text, and styling.', 'merlows' ),
        'priority'    => 31,
        'panel'       => 'mlws_homepage_panel',
    ) );

    $wp_customize->add_setting( 'mlws_homepage_hero_image', array(
        'default'           => '',
        'sanitize_callback' => 'esc_url_raw',
    ) );

    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, 'mlws_homepage_hero_image', array(
        'label'       => __('Homepage Hero Image', 'merlows' ),
        'description' => __('High resolution (1920x800px) ensures clarity.', 'merlows' ),
        'section'     => 'mlws_hero_settings',
    ) ) );

    $wp_customize->add_setting( 'mlws_category_hero_image', array(
        'default'           => '',
        'sanitize_callback' => 'esc_url_raw',
    ) );

    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, 'mlws_category_hero_image', array(
        'label'       => __('Category/Archive Hero Image', 'merlows' ),
        'description' => __('Default hero for all category pages.', 'merlows' ),
        'section'     => 'mlws_hero_settings',
    ) ) );

    // Hero Text Content (New)
    $wp_customize->add_setting( 'mlws_hero_custom_title', array(
        'default'           => 'Evidence-Based Healthcare Knowledge',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_hero_custom_title', array(
        'label'       => __('Homepage Hero Title', 'merlows' ),
        'section'     => 'mlws_hero_settings',
        'type'        => 'text',
    ) );

    $wp_customize->add_setting( 'mlws_hero_custom_subtitle', array(
        'default'           => 'Independent reporting, diplomatic analysis, and regional voices for readers and writers.',
        'sanitize_callback' => 'sanitize_textarea_field',
    ) );
    $wp_customize->add_control( 'mlws_hero_custom_subtitle', array(
        'label'       => __('Homepage Hero Subtitle', 'merlows' ),
        'section'     => 'mlws_hero_settings',
        'type'        => 'textarea',
    ) );

    // Hero Tag & Buttons
    $wp_customize->add_setting( 'mlws_hero_tag_label', array(
        'default'           => 'NEWS & DIPLOMACY',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_hero_tag_label', array(
        'label'   => __('Hero Tag Label', 'merlows' ),
        'section' => 'mlws_hero_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'mlws_hero_button_1_text', array(
        'default'           => "Latest News",
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_hero_button_1_text', array(
        'label'   => __('Hero Button 1 Text', 'merlows' ),
        'section' => 'mlws_hero_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'mlws_hero_button_1_link', array(
        'default'           => '/healthcare-professionals/',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_hero_button_1_link', array(
        'label'   => __('Hero Button 1 Link', 'merlows' ),
        'section' => 'mlws_hero_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'mlws_hero_button_2_text', array(
        'default'           => "About Merlows",
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_hero_button_2_text', array(
        'label'   => __('Hero Button 2 Text', 'merlows' ),
        'section' => 'mlws_hero_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'mlws_hero_button_2_link', array(
        'default'           => '/',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_hero_button_2_link', array(
        'label'   => __('Hero Button 2 Link', 'merlows' ),
        'section' => 'mlws_hero_settings',
        'type'    => 'text',
    ) );

    // Hero Styling Settings
    $wp_customize->add_setting( 'mlws_hero_title_color', array(
        'default'           => '#ffffff',
        'sanitize_callback' => 'sanitize_hex_color',
    ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'mlws_hero_title_color', array(
        'label'   => __('Hero Title Color', 'merlows' ),
        'section' => 'mlws_hero_settings',
    ) ) );

    $wp_customize->add_setting( 'mlws_hero_title_size', array(
        'default'           => 52,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'mlws_hero_title_size', array(
        'label'       => __('Hero Title Size (px)', 'merlows' ),
        'section'     => 'mlws_hero_settings',
        'type'        => 'range',
        'input_attrs' => array( 'min' => 24, 'max' => 100, 'step' => 1 ),
    ) );

    $wp_customize->add_setting( 'mlws_hero_mask_toggle', array(
        'default'           => true,
        'sanitize_callback' => 'mlws_sanitize_checkbox',
    ) );
    $wp_customize->add_control( 'mlws_hero_mask_toggle', array(
        'label'   => __('Enable Dark Overlay Mask', 'merlows' ),
        'section' => 'mlws_hero_settings',
        'type'    => 'checkbox',
    ) );

    $wp_customize->add_setting( 'mlws_hero_mask_opacity', array(
        'default'           => 0.5,
        'sanitize_callback' => 'floatval',
    ) );
    $wp_customize->add_control( 'mlws_hero_mask_opacity', array(
        'label'       => __('Overlay Opacity (0.0 - 1.0)', 'merlows' ),
        'section'     => 'mlws_hero_settings',
        'type'        => 'range',
        'input_attrs' => array( 'min' => 0, 'max' => 1, 'step' => 0.1 ),
    ) );

    $wp_customize->add_setting( 'mlws_hero_subtitle_color', array(
        'default'           => '#cbd5e1',
        'sanitize_callback' => 'sanitize_hex_color',
    ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'mlws_hero_subtitle_color', array(
        'label'   => __('Hero Subtitle Color', 'merlows' ),
        'section' => 'mlws_hero_settings',
    ) ) );

    // 2.5 Discovery Suite Settings (Nested under IBD Theme Settings)
    $wp_customize->add_section( 'mlws_discovery_general', array(
        'title'    => __('Discovery Engine (General)', 'merlows' ),
        'priority' => 31.5,
        'panel'    => 'mlws_homepage_panel',
    ) );

    $wp_customize->add_section( 'mlws_discovery_reading', array(
        'title'    => __('Discovery Engine (Reading Levels)', 'merlows' ),
        'panel'    => 'mlws_homepage_panel',
        'priority' => 31.6,
    ) );

    $wp_customize->add_section( 'mlws_discovery_type', array(
        'title'    => __('Discovery Engine (Content Types)', 'merlows' ),
        'panel'    => 'mlws_homepage_panel',
        'priority' => 31.7,
    ) );

    $wp_customize->add_section( 'mlws_discovery_path', array(
        'title'    => __('Discovery Engine (Healthcare Pathways)', 'merlows' ),
        'panel'    => 'mlws_homepage_panel',
        'priority' => 31.8,
    ) );

    $wp_customize->add_section( 'mlws_discovery_focus', array(
        'title'    => __('Discovery Engine (IBD Research Focus)', 'merlows' ),
        'panel'    => 'mlws_homepage_panel',
        'priority' => 31.9,
    ) );

    // Get all tags for Discovery Suite configuration
    $all_tags = get_terms( array(
        'taxonomy'   => 'post_tag',
        'hide_empty' => false,
    ) );

    // Ensure we have an array
    if ( is_wp_error( $all_tags ) || ! is_array( $all_tags ) ) {
        $all_tags = array();
    }
    
    // Filter tags by prefix (Case-insensitive check of both name and slug)
    $reading_tags = array_filter($all_tags, function($tag) {
        return stripos($tag->name, 'reading-') === 0 || stripos($tag->slug, 'reading-') === 0;
    });
    
    $path_tags = array_filter($all_tags, function($tag) {
        return stripos($tag->name, 'path-') === 0 || stripos($tag->slug, 'path-') === 0;
    });
    
    $indication_tags = array_filter($all_tags, function($tag) {
        return stripos($tag->name, 'indication-') === 0 || stripos($tag->slug, 'indication-') === 0;
    });
    
    // Get categories for Content Types
    $categories = get_categories(array('hide_empty' => false));
    
    // Reading Level Tags (reading- prefix)
    if (empty($reading_tags)) {
        $wp_customize->get_section('mlws_discovery_reading')->description = __('No tags found with "reading-" prefix. Please create tags like "reading-novice" in the WordPress admin to see options here.', 'merlows');
    }
    
    foreach ($reading_tags as $tag) {
        // Show/Hide Toggle
        $wp_customize->add_setting("mlws_discovery_reading_show_{$tag->term_id}", array(
            'default'           => false,
            'sanitize_callback' => 'mlws_sanitize_checkbox',
        ));
        $wp_customize->add_control("mlws_discovery_reading_show_{$tag->term_id}", array(
            'label'   => sprintf(__('Show: %s', 'merlows'), $tag->name),
            'section' => 'mlws_discovery_reading',
            'type'    => 'checkbox',
        ));
        
        // Display Text
        $wp_customize->add_setting("mlws_discovery_reading_text_{$tag->term_id}", array(
            'default'           => str_replace('reading-', '', $tag->name),
            'sanitize_callback' => 'sanitize_text_field',
        ));
        $wp_customize->add_control("mlws_discovery_reading_text_{$tag->term_id}", array(
            'label'   => sprintf(__('Display Text: %s', 'merlows'), $tag->name),
            'section' => 'mlws_discovery_reading',
            'type'    => 'text',
        ));
        
        // Display Order
        $wp_customize->add_setting("mlws_discovery_reading_order_{$tag->term_id}", array(
            'default'           => 10,
            'sanitize_callback' => 'absint',
        ));
        $wp_customize->add_control("mlws_discovery_reading_order_{$tag->term_id}", array(
            'label'   => sprintf(__('Order: %s', 'merlows'), $tag->name),
            'section' => 'mlws_discovery_reading',
            'type'    => 'number',
        ));
    }
    
    // Content Type Categories
    foreach ($categories as $cat) {
        // Show/Hide Toggle
        $wp_customize->add_setting("mlws_discovery_type_show_{$cat->term_id}", array(
            'default'           => false,
            'sanitize_callback' => 'mlws_sanitize_checkbox',
        ));
        $wp_customize->add_control("mlws_discovery_type_show_{$cat->term_id}", array(
            'label'   => sprintf(__('Show: %s', 'merlows'), $cat->name),
            'section' => 'mlws_discovery_type',
            'type'    => 'checkbox',
        ));
        
        // Display Text
        $wp_customize->add_setting("mlws_discovery_type_text_{$cat->term_id}", array(
            'default'           => $cat->name,
            'sanitize_callback' => 'sanitize_text_field',
        ));
        $wp_customize->add_control("mlws_discovery_type_text_{$cat->term_id}", array(
            'label'   => sprintf(__('Display Text: %s', 'merlows'), $cat->name),
            'section' => 'mlws_discovery_type',
            'type'    => 'text',
        ));
        
        // Display Order
        $wp_customize->add_setting("mlws_discovery_type_order_{$cat->term_id}", array(
            'default'           => 10,
            'sanitize_callback' => 'absint',
        ));
        $wp_customize->add_control("mlws_discovery_type_order_{$cat->term_id}", array(
            'label'   => sprintf(__('Order: %s', 'merlows'), $cat->name),
            'section' => 'mlws_discovery_type',
            'type'    => 'number',
        ));
    }
    
    // IBD Research Path Tags (path- prefix)
    if (empty($path_tags)) {
        $wp_customize->get_section('mlws_discovery_path')->description = __('No tags found with "path-" prefix. Please create tags like "path-clinical" in the WordPress admin to see options here.', 'merlows');
    }
    
    foreach ($path_tags as $tag) {
        // Show/Hide Toggle
        $wp_customize->add_setting("mlws_discovery_path_show_{$tag->term_id}", array(
            'default'           => false,
            'sanitize_callback' => 'mlws_sanitize_checkbox',
        ));
        $wp_customize->add_control("mlws_discovery_path_show_{$tag->term_id}", array(
            'label'   => sprintf(__('Show: %s', 'merlows'), $tag->name),
            'section' => 'mlws_discovery_path',
            'type'    => 'checkbox',
        ));
        
        // Display Text
        $wp_customize->add_setting("mlws_discovery_path_text_{$tag->term_id}", array(
            'default'           => str_replace('path-', '', $tag->name),
            'sanitize_callback' => 'sanitize_text_field',
        ));
        $wp_customize->add_control("mlws_discovery_path_text_{$tag->term_id}", array(
            'label'   => sprintf(__('Display Text: %s', 'merlows'), $tag->name),
            'section' => 'mlws_discovery_path',
            'type'    => 'text',
        ));
        
        // Display Order
        $wp_customize->add_setting("mlws_discovery_path_order_{$tag->term_id}", array(
            'default'           => 10,
            'sanitize_callback' => 'absint',
        ));
        $wp_customize->add_control("mlws_discovery_path_order_{$tag->term_id}", array(
            'label'   => sprintf(__('Order: %s', 'merlows'), $tag->name),
            'section' => 'mlws_discovery_path',
            'type'    => 'number',
        ));
    }
    
    // IBD Research Focus Tags (indication- prefix)
    if (empty($indication_tags)) {
        $wp_customize->get_section('mlws_discovery_focus')->description = __('No tags found with "indication-" prefix. Please create tags like "indication-cardio" in the WordPress admin to see options here.', 'merlows');
    }
    
    foreach ($indication_tags as $tag) {
        // Show/Hide Toggle
        $wp_customize->add_setting("mlws_discovery_focus_show_{$tag->term_id}", array(
            'default'           => false,
            'sanitize_callback' => 'mlws_sanitize_checkbox',
        ));
        $wp_customize->add_control("mlws_discovery_focus_show_{$tag->term_id}", array(
            'label'   => sprintf(__('Show: %s', 'merlows'), $tag->name),
            'section' => 'mlws_discovery_focus',
            'type'    => 'checkbox',
        ));
        
        // Display Text
        $wp_customize->add_setting("mlws_discovery_focus_text_{$tag->term_id}", array(
            'default'           => str_replace('indication-', '', $tag->name),
            'sanitize_callback' => 'sanitize_text_field',
        ));
        $wp_customize->add_control("mlws_discovery_focus_text_{$tag->term_id}", array(
            'label'   => sprintf(__('Display Text: %s', 'merlows'), $tag->name),
            'section' => 'mlws_discovery_focus',
            'type'    => 'text',
        ));
        
        // Display Order
        $wp_customize->add_setting("mlws_discovery_focus_order_{$tag->term_id}", array(
            'default'           => 10,
            'sanitize_callback' => 'absint',
        ));
        $wp_customize->add_control("mlws_discovery_focus_order_{$tag->term_id}", array(
            'label'   => sprintf(__('Order: %s', 'merlows'), $tag->name),
            'section' => 'mlws_discovery_focus',
            'type'    => 'number',
        ));
    }

    // 2.6 Pathway Tile Settings
    $wp_customize->add_section( 'mlws_pathway_tiles_settings', array(
        'title'    => __('Pathway Tiles', 'merlows' ),
        'priority' => 31.6,
        'panel'    => 'mlws_homepage_panel',
    ) );

    // Readers Tile (pillar 1)
    $wp_customize->add_setting( 'mlws_practitioner_tile_title', array(
        'default'           => 'For Readers',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_practitioner_tile_title', array(
        'label'   => __('Readers Tile Title', 'merlows' ),
        'section' => 'mlws_pathway_tiles_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'mlws_practitioner_tile_desc', array(
        'default'           => 'Browse breaking dispatches, diplomatic analysis, and regional voices covering Israel-Iran relations and the Abraham Accords.',
        'sanitize_callback' => 'sanitize_textarea_field',
    ) );
    $wp_customize->add_control( 'mlws_practitioner_tile_desc', array(
        'label'   => __('Readers Tile Description', 'merlows' ),
        'section' => 'mlws_pathway_tiles_settings',
        'type'    => 'textarea',
    ) );

    $wp_customize->add_setting( 'mlws_practitioner_tile_extra', array(
        'default'           => 'Explore the archive',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_practitioner_tile_extra', array(
        'label'   => __('Readers Tile Extra Font Text', 'merlows' ),
        'section' => 'mlws_pathway_tiles_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'mlws_practitioner_tile_image', array(
        'default'           => '',
        'sanitize_callback' => 'esc_url_raw',
    ) );
    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, 'mlws_practitioner_tile_image', array(
        'label'   => __('Readers Tile Bottom Image', 'merlows' ),
        'section' => 'mlws_pathway_tiles_settings',
    ) ) );

    // Writers Tile (pillar 2)
    $wp_customize->add_setting( 'mlws_patient_tile_title', array(
        'default'           => 'For Writers',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_patient_tile_title', array(
        'label'   => __('Writers Tile Title', 'merlows' ),
        'section' => 'mlws_pathway_tiles_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'mlws_patient_tile_desc', array(
        'default'           => 'Submit analysis, op-eds, and regional voices. Our editorial team reviews all submissions for fit, tone, and factual accuracy.',
        'sanitize_callback' => 'sanitize_textarea_field',
    ) );
    $wp_customize->add_control( 'mlws_patient_tile_desc', array(
        'label'   => __('Writers Tile Description', 'merlows' ),
        'section' => 'mlws_pathway_tiles_settings',
        'type'    => 'textarea',
    ) );

    $wp_customize->add_setting( 'mlws_patient_tile_extra', array(
        'default'           => 'Submit an article',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_patient_tile_extra', array(
        'label'   => __('Writers Tile Extra Font Text', 'merlows' ),
        'section' => 'mlws_pathway_tiles_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'mlws_patient_tile_image', array(
        'default'           => '',
        'sanitize_callback' => 'esc_url_raw',
    ) );
    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, 'mlws_patient_tile_image', array(
        'label'   => __('Writers Tile Bottom Image', 'merlows' ),
        'section' => 'mlws_pathway_tiles_settings',
    ) ) );

    $wp_customize->add_setting( 'mlws_practitioner_tile_link', array( 'default' => '/', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_practitioner_tile_link', array( 'label' => 'Readers Tile Link', 'section' => 'mlws_pathway_tiles_settings', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_patient_tile_link', array( 'default' => '/contact-us/', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_patient_tile_link', array( 'label' => 'Writers Tile Link', 'section' => 'mlws_pathway_tiles_settings', 'type' => 'text' ) );

    // Border Radius Controls - Writers Tile
    $wp_customize->add_setting( 'mlws_patient_tile_radius', array(
        'default'           => 16,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'mlws_patient_tile_radius', array(
        'label'   => __('Writers Tile Radius (px)', 'merlows' ),
        'section' => 'mlws_pathway_tiles_settings',
        'type'    => 'number',
        'input_attrs' => array( 'min' => 0, 'max' => 100 ),
    ) );

    $wp_customize->add_setting( 'mlws_patient_image_radius', array(
        'default'           => 8,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'mlws_patient_image_radius', array(
        'label'   => __('Writers Image Radius (px)', 'merlows' ),
        'section' => 'mlws_pathway_tiles_settings',
        'type'    => 'number',
        'input_attrs' => array( 'min' => 0, 'max' => 100 ),
    ) );

    // Border Radius Controls - Readers Tile
    $wp_customize->add_setting( 'mlws_practitioner_tile_radius', array(
        'default'           => 16,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'mlws_practitioner_tile_radius', array(
        'label'   => __('Readers Tile Radius (px)', 'merlows' ),
        'section' => 'mlws_pathway_tiles_settings',
        'type'    => 'number',
        'input_attrs' => array( 'min' => 0, 'max' => 100 ),
    ) );

    $wp_customize->add_setting( 'mlws_practitioner_image_radius', array(
        'default'           => 8,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'mlws_practitioner_image_radius', array(
        'label'   => __('Readers Image Radius (px)', 'merlows' ),
        'section' => 'mlws_pathway_tiles_settings',
        'type'    => 'number',
        'input_attrs' => array( 'min' => 0, 'max' => 100 ),
    ) );

    // Pathway card hover colour
    $wp_customize->add_setting( 'mlws_pathway_card_hover_color', array(
        'default'           => '#1B4F8A',
        'sanitize_callback' => 'sanitize_hex_color',
    ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'mlws_pathway_card_hover_color', array(
        'label'       => __('Card Hover Background Colour', 'merlows' ),
        'description' => __('Background colour applied to pathway cards on hover. Text and icon automatically invert to white.', 'merlows' ),
        'section'     => 'mlws_pathway_tiles_settings',
    ) ) );

    // Pathway section label
    $wp_customize->add_setting( 'mlws_pathway_who_label', array(
        'default'           => 'Who Am I?',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_pathway_who_label', array(
        'label'   => __('Section Label', 'merlows' ),
        'section' => 'mlws_pathway_tiles_settings',
        'type'    => 'text',
    ) );

    // Pathway card icon background colour
    $wp_customize->add_setting( 'mlws_pathway_icon_bg_color', array(
        'default'           => '#0F172A',
        'sanitize_callback' => 'sanitize_hex_color',
    ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'mlws_pathway_icon_bg_color', array(
        'label'       => __('Icon Initial Background Colour', 'merlows' ),
        'section'     => 'mlws_pathway_tiles_settings',
    ) ) );

    // Pathway card icon hover background colour
    $wp_customize->add_setting( 'mlws_pathway_icon_hover_bg_color', array(
        'default'           => 'rgba(255,255,255,0.2)',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_pathway_icon_hover_bg_color', array(
        'label'       => __('Icon Hover Background Colour (Hex or RGBA)', 'merlows' ),
        'section'     => 'mlws_pathway_tiles_settings',
        'type'        => 'text',
    ) );

    // 2.6.5 Latest Content Grid Settings (Right side of Pathway section)
    $wp_customize->add_section( 'mlws_pathway_latest_settings', array(
        'title'    => __('Pathway Section: Latest Content', 'merlows' ),
        'priority' => 31.65,
        'panel'    => 'mlws_homepage_panel',
    ) );

    $wp_customize->add_setting( 'mlws_pathway_latest_title', array(
        'default'           => 'LATEST CONTENT',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_pathway_latest_title', array(
        'label'   => __('Grid Title', 'merlows' ),
        'section' => 'mlws_pathway_latest_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'mlws_pathway_latest_count', array(
        'default'           => 3,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'mlws_pathway_latest_count', array(
        'label'   => __('Number of Posts', 'merlows' ),
        'description' => __('The bento layout style works best with 3 items.', 'merlows' ),
        'section' => 'mlws_pathway_latest_settings',
        'type'    => 'number',
        'input_attrs' => array( 'min' => 1, 'max' => 10 ),
    ) );

    $wp_customize->add_setting( 'mlws_pathway_latest_category', array(
        'default'           => 0,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'mlws_pathway_latest_category', array(
        'label'   => __('Filter by Category', 'merlows' ),
        'description' => __('Select a specific category or show latest from all.', 'merlows' ),
        'section' => 'mlws_pathway_latest_settings',
        'type'    => 'select',
        'choices' => mlws_get_cpt_category_choices(),
    ) );

    $wp_customize->add_setting( 'mlws_pathway_latest_show_date', array(
        'default'           => true,
        'sanitize_callback' => 'mlws_sanitize_checkbox',
    ) );
    $wp_customize->add_control( 'mlws_pathway_latest_show_date', array(
        'label'   => __('Show Post Date', 'merlows' ),
        'section' => 'mlws_pathway_latest_settings',
        'type'    => 'checkbox',
    ) );

    // Latest Section: Tag Label
    $wp_customize->add_setting( 'mlws_latest_tag_label', array(
        'default'           => 'LATEST FROM THE HUB',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_latest_tag_label', array(
        'label'       => __('Section Tag Label', 'merlows' ),
        'description' => __('The small tag displayed above the title.', 'merlows' ),
        'section'     => 'mlws_pathway_latest_settings',
        'type'        => 'text',
    ) );

    // Latest Section: Text Alignment
    $wp_customize->add_setting( 'mlws_latest_text_align', array(
        'default'           => 'left',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_latest_text_align', array(
        'label'   => __('Header Text Alignment', 'merlows' ),
        'section' => 'mlws_pathway_latest_settings',
        'type'    => 'select',
        'choices' => array(
            'left'   => __('Left', 'merlows' ),
            'center' => __('Center', 'merlows' ),
            'right'  => __('Right', 'merlows' ),
        ),
    ) );

    // Latest Section: Layout Style
    $wp_customize->add_setting( 'mlws_latest_layout', array(
        'default'           => 'carousel',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_latest_layout', array(
        'label'       => __('Post Layout Style', 'merlows' ),
        'description' => __('Choose how posts are displayed.', 'merlows' ),
        'section'     => 'mlws_pathway_latest_settings',
        'type'        => 'select',
        'choices'     => array(
            'carousel' => __('Carousel (horizontal scroll)', 'merlows' ),
            'bento'    => __('Bento Box (featured + grid)', 'merlows' ),
            'grid'     => __('Grid (equal cards)', 'merlows' ),
            'list'     => __('List (horizontal rows)', 'merlows' ),
        ),
    ) );

    // Latest Section: Show Excerpt
    $wp_customize->add_setting( 'mlws_latest_show_excerpt', array(
        'default'           => true,
        'sanitize_callback' => 'mlws_sanitize_checkbox',
    ) );
    $wp_customize->add_control( 'mlws_latest_show_excerpt', array(
        'label'   => __('Show Post Excerpt', 'merlows' ),
        'section' => 'mlws_pathway_latest_settings',
        'type'    => 'checkbox',
    ) );

    // Latest Section: Show Category Tag
    $wp_customize->add_setting( 'mlws_latest_show_category', array(
        'default'           => true,
        'sanitize_callback' => 'mlws_sanitize_checkbox',
    ) );
    $wp_customize->add_control( 'mlws_latest_show_category', array(
        'label'   => __('Show Category Tag on Cards', 'merlows' ),
        'section' => 'mlws_pathway_latest_settings',
        'type'    => 'checkbox',
    ) );

    // Section background color
    $wp_customize->add_setting( 'mlws_latest_section_bg', array(
        'default'           => '#F8FAFC',
        'sanitize_callback' => 'sanitize_hex_color',
    ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'mlws_latest_section_bg', array(
        'label'   => __('Section Background Color', 'merlows' ),
        'section' => 'mlws_pathway_latest_settings',
    ) ) );

    // 2.7 Knowledgebase Mini-Hero Section
    $wp_customize->add_section( 'mlws_kb_mini_hero', array(
        'title'    => __('Knowledge Base Mini-Hero', 'merlows' ),
        'priority' => 31.7,
        'panel'    => 'mlws_content_panel',
    ) );

    $wp_customize->add_setting( 'mlws_kb_mini_hero_title', array( 'default' => 'IBD Research KNOWLEDGEBASE', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_kb_mini_hero_title', array( 'label' => 'Main Title Text', 'section' => 'mlws_kb_mini_hero', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_kb_mini_hero_subtitle', array( 'default' => 'Catch Up on the Latest Articles and More...', 'sanitize_callback' => 'sanitize_textarea_field' ) );
    $wp_customize->add_control( 'mlws_kb_mini_hero_subtitle', array( 'label' => 'Subtitle Text', 'section' => 'mlws_kb_mini_hero', 'type' => 'textarea' ) );

    $wp_customize->add_setting( 'mlws_kb_mini_hero_bg', array( 'default' => '', 'sanitize_callback' => 'esc_url_raw' ) );
    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, 'mlws_kb_mini_hero_bg', array( 'label' => 'Background Image', 'section' => 'mlws_kb_mini_hero' ) ) );

    $wp_customize->add_setting( 'mlws_kb_mini_hero_font_color', array( 'default' => '#ffffff', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'mlws_kb_mini_hero_font_color', array( 'label' => 'Font Color', 'section' => 'mlws_kb_mini_hero' ) ) );

    $wp_customize->add_setting( 'mlws_kb_mini_hero_height', array( 'default' => '', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_kb_mini_hero_height', array( 'label' => 'Min-Height (px)', 'section' => 'mlws_kb_mini_hero', 'type' => 'number' ) );
    
    $wp_customize->add_setting( 'mlws_kb_mini_hero_padding', array( 'default' => '60px 0 80px', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_kb_mini_hero_padding', array( 'label' => 'Padding (e.g. 60px 0 80px)', 'section' => 'mlws_kb_mini_hero', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_kb_mini_hero_opacity', array( 'default' => 80, 'sanitize_callback' => 'absint' ) );
    $wp_customize->add_control( 'mlws_kb_mini_hero_opacity', array( 'label' => 'Overlay Opacity (%)', 'section' => 'mlws_kb_mini_hero', 'type' => 'range', 'input_attrs' => array( 'min' => 0, 'max' => 100, 'step' => 5 ) ) );

    // 2.8 Join Merlows Section
    $wp_customize->add_section( 'mlws_join_community', array(
        'title'    => __('Join Merlows Block', 'merlows' ),
        'priority' => 31.8,
        'panel'    => 'mlws_content_panel',
    ) );

    $wp_customize->add_setting( 'mlws_join_title', array(
        'default'           => 'Join Merlows',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_join_title', array(
        'label'   => __('Main Title', 'merlows' ),
        'section' => 'mlws_join_community',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'mlws_join_subtitle', array(
        'default'           => 'Select your role to get started with a personalized experience.',
        'sanitize_callback' => 'sanitize_textarea_field',
    ) );
    $wp_customize->add_control( 'mlws_join_subtitle', array(
        'label'   => __('Subtitle', 'merlows' ),
        'section' => 'mlws_join_community',
        'type'    => 'textarea',
    ) );

    $wp_customize->add_setting( 'mlws_join_practitioner_label', array(
        'default'           => "I'm a Writer",
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_join_practitioner_label', array(
        'label'   => __('Writer Checkbox Label', 'merlows' ),
        'section' => 'mlws_join_community',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'mlws_join_patient_label', array(
        'default'           => "I'm a Reader",
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_join_patient_label', array(
        'label'   => __('Reader Checkbox Label', 'merlows' ),
        'section' => 'mlws_join_community',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'mlws_join_button_text', array(
        'default'           => 'REGISTER NOW',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_join_button_text', array(
        'label'   => __('Button Text', 'merlows' ),
        'section' => 'mlws_join_community',
        'type'    => 'text',
    ) );


    // 2.9 Ask AI Settings
    $wp_customize->add_section( 'mlws_askai_settings', array(
        'title'    => __('Ask AI Configuration', 'merlows' ),
        'priority' => 31.9,
        'panel'    => 'mlws_content_panel',
    ) );

    // Hero Settings
    $wp_customize->add_setting( 'mlws_askai_hero_bg', array(
        'default'           => '',
        'sanitize_callback' => 'esc_url_raw',
    ) );
    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, 'mlws_askai_hero_bg', array(
        'label'   => __('Hero Background Image', 'merlows' ),
        'section' => 'mlws_askai_settings',
    ) ) );

    $wp_customize->add_setting( 'mlws_askai_hero_title', array(
        'default'           => 'Clinical AI Assistant',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_askai_hero_title', array(
        'label'   => __('Hero Title', 'merlows' ),
        'section' => 'mlws_askai_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'mlws_askai_hero_subtitle', array(
        'default'           => 'Ask complex clinical questions and get evidence-based answers instantly.',
        'sanitize_callback' => 'sanitize_textarea_field',
    ) );
    $wp_customize->add_control( 'mlws_askai_hero_subtitle', array(
        'label'   => __('Hero Subtitle', 'merlows' ),
        'section' => 'mlws_askai_settings',
        'type'    => 'textarea',
    ) );

    $wp_customize->add_setting( 'mlws_askai_hero_badge', array(
        'default'           => 'Beta Feature v1.0',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_askai_hero_badge', array(
        'label'   => __('Hero Badge Text', 'merlows' ),
        'section' => 'mlws_askai_settings',
        'type'    => 'text',
    ) );

    // API Credentials
    $wp_customize->add_setting( 'mlws_askai_api_key', array(
        'default'           => '',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_askai_api_key', array(
        'label'       => __('AI API Key', 'merlows' ),
        'description' => __('Enter your OpenAI or Anthropic API key', 'merlows' ),
        'section'     => 'mlws_askai_settings',
        'type'        => 'text',
    ) );

    $wp_customize->add_setting( 'mlws_askai_api_provider', array(
        'default'           => 'openai',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_askai_api_provider', array(
        'label'   => __('AI Provider', 'merlows' ),
        'section' => 'mlws_askai_settings',
        'type'    => 'select',
        'choices' => array(
            'openai'     => 'OpenAI (GPT-4)',
            'anthropic'  => 'Anthropic (Claude)',
            'google'     => 'Google (Gemini)',
        ),
    ) );

    $wp_customize->add_setting( 'mlws_askai_model', array(
        'default'           => 'gpt-4',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_askai_model', array(
        'label'       => __('AI Model', 'merlows' ),
        'description' => __('e.g., gpt-4, claude-3-opus, gemini-pro', 'merlows' ),
        'section'     => 'mlws_askai_settings',
        'type'        => 'text',
    ) );


    // 4. Dynamic Homepage & Inner Nav Category Cards
    $wp_customize->add_section( 'mlws_homepage_categories', array(
        'title'       => __('Category Cards', 'merlows' ),
        'description' => __('Configure display logic for category cards across the site.', 'merlows' ),
        'priority'    => 33,
        'panel'       => 'mlws_homepage_panel',
    ) );

    // --- HOMEPAGE SPECIFIC ---
    $wp_customize->add_setting( 'mlws_homepage_cards_per_row', array(
        'default'           => 6,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'mlws_homepage_cards_per_row', array(
        'label'   => __('Homepage: Cards Per Row', 'merlows' ),
        'section' => 'mlws_homepage_categories',
        'type'    => 'number',
        'input_attrs' => array('min' => 1, 'max' => 12),
    ) );

    $wp_customize->add_setting( 'mlws_homepage_card_alignment', array(
        'default'           => 'center',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_homepage_card_alignment', array(
        'label'   => __('Homepage: Card Alignment', 'merlows' ),
        'section' => 'mlws_homepage_categories',
        'type'    => 'select',
        'choices' => array(
            'left'   => 'Left',
            'center' => 'Center',
            'right'  => 'Right',
        ),
    ) );

    // --- INNER NAV SPECIFIC ---
    $wp_customize->add_setting( 'mlws_show_inner_nav', array(
        'default'           => true,
        'sanitize_callback' => 'mlws_sanitize_checkbox',
    ) );
    $wp_customize->add_control( 'mlws_show_inner_nav', array(
        'label'   => __('Show Inner Page Horizontal Nav', 'merlows' ),
        'section' => 'mlws_homepage_categories',
        'type'    => 'checkbox',
    ) );

    $wp_customize->add_setting( 'mlws_inner_nav_cards_per_row', array(
        'default'           => 8,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'mlws_inner_nav_cards_per_row', array(
        'label'   => __('Inner Nav: Cards Per Row', 'merlows' ),
        'section' => 'mlws_homepage_categories',
        'type'    => 'number',
        'input_attrs' => array('min' => 1, 'max' => 16),
    ) );

    $wp_customize->add_setting( 'mlws_inner_nav_total_items', array(
        'default'           => 8,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'mlws_inner_nav_total_items', array(
        'label'   => __('Inner Nav: Total Items to Show', 'merlows' ),
        'section' => 'mlws_homepage_categories',
        'type'    => 'number',
        'input_attrs' => array('min' => 1, 'max' => 50),
    ) );

    // --- DISCOVERY SUITE STYLING ---
    $wp_customize->add_section( 'mlws_discovery_styling', array(
        'title'    => __('Discovery Engine (Styling)', 'merlows' ),
        'priority' => 32,
        'panel'    => 'mlws_homepage_panel',
    ) );

    // ── SECTION HEADER ──
    $wp_customize->add_setting( 'mlws_discovery_title_text', array( 'default' => 'Content Discovery Suite', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_discovery_title_text', array( 'label' => 'Main Title Text', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_discovery_subtitle_text', array( 'default' => 'Explore our comprehensive database...', 'sanitize_callback' => 'sanitize_textarea_field' ) );
    $wp_customize->add_control( 'mlws_discovery_subtitle_text', array( 'label' => 'Subtitle Text', 'section' => 'mlws_discovery_styling', 'type' => 'textarea' ) );

    $wp_customize->add_setting( 'mlws_discovery_title_size', array( 'default' => 32, 'sanitize_callback' => 'absint' ) );
    $wp_customize->add_control( 'mlws_discovery_title_size', array( 'label' => 'Title Size (px)', 'section' => 'mlws_discovery_styling', 'type' => 'range', 'input_attrs' => array('min' => 12, 'max' => 60) ) );

    $wp_customize->add_setting( 'mlws_discovery_title_color', array( 'default' => '#0F172A', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'mlws_discovery_title_color', array( 'label' => 'Title Color', 'section' => 'mlws_discovery_styling' ) ) );

    $wp_customize->add_setting( 'mlws_discovery_subtitle_color', array( 'default' => '#64748B', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'mlws_discovery_subtitle_color', array( 'label' => 'Subtitle Text Color', 'section' => 'mlws_discovery_styling' ) ) );

    $wp_customize->add_setting( 'mlws_discovery_title_align', array( 'default' => 'left', 'sanitize_callback' => 'sanitize_key' ) );
    $wp_customize->add_control( 'mlws_discovery_title_align', array( 'label' => 'Alignment', 'section' => 'mlws_discovery_styling', 'type' => 'select', 'choices' => array('left' => 'Left', 'center' => 'Center', 'right' => 'Right') ));

    // ── PANEL HEADER ("Discovery Filters" bar) ──
    $wp_customize->add_setting( 'mlws_discovery_filters_title_size', array( 'default' => 12, 'sanitize_callback' => 'absint' ) );
    $wp_customize->add_control( 'mlws_discovery_filters_title_size', array( 'label' => '"Discovery Filters" Title Size (px)', 'section' => 'mlws_discovery_styling', 'type' => 'number', 'input_attrs' => array('min' => 8, 'max' => 30) ) );

    $wp_customize->add_setting( 'mlws_disc_header_title_color', array( 'default' => '#1B4F8A', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_header_title_color', array( 'label' => '"Discovery Filters" Title Color', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_disc_status_dot_color', array( 'default' => '#22c55e', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_status_dot_color', array( 'label' => 'Status Dot Color', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    // ── FILTER LABELS ──
    $wp_customize->add_setting( 'mlws_discovery_field_title_size', array( 'default' => 10, 'sanitize_callback' => 'absint' ) );
    $wp_customize->add_control( 'mlws_discovery_field_title_size', array( 'label' => 'Filter Label Size (px)', 'section' => 'mlws_discovery_styling', 'type' => 'number', 'input_attrs' => array('min' => 8, 'max' => 30) ) );

    $wp_customize->add_setting( 'mlws_discovery_field_title_color', array( 'default' => 'rgba(255,255,255,0.4)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_discovery_field_title_color', array( 'label' => 'Filter Label Color', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_discovery_item_label_size', array( 'default' => 13, 'sanitize_callback' => 'absint' ) );
    $wp_customize->add_control( 'mlws_discovery_item_label_size', array( 'label' => 'Filter Item Text Size (px)', 'section' => 'mlws_discovery_styling', 'type' => 'number', 'input_attrs' => array('min' => 8, 'max' => 30) ) );

    // ── CHIPS (default / hover / selected) ──
    $wp_customize->add_setting( 'mlws_disc_chip_bg', array( 'default' => 'rgba(255,255,255,0.06)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_chip_bg', array( 'label' => 'Chip — Background', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_disc_chip_border', array( 'default' => 'rgba(255,255,255,0.12)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_chip_border', array( 'label' => 'Chip — Border', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_disc_chip_text', array( 'default' => 'rgba(255,255,255,0.75)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_chip_text', array( 'label' => 'Chip — Text', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_disc_chip_hover_bg', array( 'default' => 'rgba(27,79,138,0.12)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_chip_hover_bg', array( 'label' => 'Chip Hover — Background', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_disc_chip_hover_border', array( 'default' => '#C75D8E', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_chip_hover_border', array( 'label' => 'Chip Hover — Border', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_disc_chip_hover_text', array( 'default' => '#ffffff', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_chip_hover_text', array( 'label' => 'Chip Hover — Text', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_disc_chip_selected_bg', array( 'default' => 'rgba(27,79,138,0.25)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_chip_selected_bg', array( 'label' => 'Chip Selected — Background', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_disc_chip_selected_border', array( 'default' => '#1B4F8A', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_chip_selected_border', array( 'label' => 'Chip Selected — Border', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_disc_chip_selected_text', array( 'default' => '#F5E6A3', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_chip_selected_text', array( 'label' => 'Chip Selected — Text', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    // ── TOGGLES ──
    $wp_customize->add_setting( 'mlws_disc_toggle_bg', array( 'default' => 'rgba(255,255,255,0.1)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_toggle_bg', array( 'label' => 'Toggle Off — Background', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_disc_toggle_active_bg', array( 'default' => '#1B4F8A', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_toggle_active_bg', array( 'label' => 'Toggle On — Background', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    // ── GO BUTTON ──
    $wp_customize->add_setting( 'mlws_disc_go_btn_bg', array( 'default' => '#1B4F8A', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'mlws_disc_go_btn_bg', array( 'label' => 'GO Button — Gradient Start', 'section' => 'mlws_discovery_styling' ) ) );

    $wp_customize->add_setting( 'mlws_disc_go_btn_bg_end', array( 'default' => '#153D6E', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'mlws_disc_go_btn_bg_end', array( 'label' => 'GO Button — Gradient End', 'section' => 'mlws_discovery_styling' ) ) );

    $wp_customize->add_setting( 'mlws_disc_go_btn_hover_bg', array( 'default' => '#B8447A', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'mlws_disc_go_btn_hover_bg', array( 'label' => 'GO Button — Hover Start', 'section' => 'mlws_discovery_styling' ) ) );

    // ── SECONDARY BUTTONS (Clear / Save) ──
    $wp_customize->add_setting( 'mlws_disc_secondary_btn_border', array( 'default' => 'rgba(255,255,255,0.3)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_secondary_btn_border', array( 'label' => 'Clear/Save Button — Border', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_disc_secondary_btn_text', array( 'default' => 'rgba(255,255,255,0.8)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_secondary_btn_text', array( 'label' => 'Clear/Save Button — Text', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_disc_secondary_btn_hover_bg', array( 'default' => 'rgba(27,79,138,0.2)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_secondary_btn_hover_bg', array( 'label' => 'Clear/Save Button — Hover BG', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    // ── KEYWORD INPUT ──
    $wp_customize->add_setting( 'mlws_disc_input_bg', array( 'default' => 'rgba(255,255,255,0.08)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_input_bg', array( 'label' => 'Search Input — Background', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_disc_input_border', array( 'default' => 'rgba(255,255,255,0.25)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_input_border', array( 'label' => 'Search Input — Border', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_disc_input_text', array( 'default' => '#ffffff', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_input_text', array( 'label' => 'Search Input — Text Color', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_disc_input_placeholder', array( 'default' => 'rgba(255,255,255,0.4)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_input_placeholder', array( 'label' => 'Search Input — Placeholder Color', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_disc_input_focus_border', array( 'default' => '#1B4F8A', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_disc_input_focus_border', array( 'label' => 'Search Input — Focus Border', 'section' => 'mlws_discovery_styling', 'type' => 'text' ) );

    // ── PANEL CONTAINER ──
    $wp_customize->add_setting( 'mlws_discovery_border_color', array( 'default' => '#1B4F8A', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'mlws_discovery_border_color', array( 'label' => 'Panel Accent Color', 'section' => 'mlws_discovery_styling' ) ) );

    $wp_customize->add_setting( 'mlws_discovery_button_radius', array( 'default' => 8, 'sanitize_callback' => 'absint' ) );
    $wp_customize->add_control( 'mlws_discovery_button_radius', array( 'label' => 'Chip / Button Radius (px)', 'section' => 'mlws_discovery_styling', 'type' => 'range', 'input_attrs' => array('min' => 0, 'max' => 40, 'step' => 1) ));

    $wp_customize->add_setting( 'mlws_discovery_panel_radius', array( 'default' => 20, 'sanitize_callback' => 'absint' ) );
    $wp_customize->add_control( 'mlws_discovery_panel_radius', array( 'label' => 'Panel Radius (px)', 'section' => 'mlws_discovery_styling', 'type' => 'range', 'input_attrs' => array('min' => 0, 'max' => 48, 'step' => 2) ));

    $wp_customize->add_setting( 'mlws_discovery_section_bg', array( 'default' => 'linear-gradient(160deg, #0F172A 0%, #0F2440 55%, #0F172A 100%)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_discovery_section_bg', array( 'label' => 'Section Background', 'description' => 'CSS color or gradient', 'section' => 'mlws_discovery_styling', 'type' => 'text' ));

    $wp_customize->add_setting( 'mlws_discovery_panel_bg', array( 'default' => 'rgba(255,255,255,0.04)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_discovery_panel_bg', array( 'label' => 'Panel Background', 'description' => 'CSS color (e.g. rgba(...))', 'section' => 'mlws_discovery_styling', 'type' => 'text' ));

    // --- DISCOVERY SUITE GRID LOGIC ---
    $wp_customize->add_setting( 'mlws_discovery_path_cols', array(
        'default'           => 4,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'mlws_discovery_path_cols', array(
        'label'   => __('Discovery: Path Columns', 'merlows' ),
        'section' => 'mlws_discovery_path',
        'type'    => 'number',
        'input_attrs' => array('min' => 1, 'max' => 6),
    ) );

    $wp_customize->add_setting( 'mlws_discovery_type_cols', array(
        'default'           => 6,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'mlws_discovery_type_cols', array(
        'label'   => __('Discovery: Type Columns', 'merlows' ),
        'section' => 'mlws_discovery_type',
        'type'    => 'number',
        'input_attrs' => array('min' => 1, 'max' => 10),
    ) );

    // --- INDIVIDUAL CARD CONTROLS ---
    $categories = get_categories( array( 'hide_empty' => false ) );
    foreach ( $categories as $cat ) {
        // Show/Hide Toggle
        $wp_customize->add_setting( "mlws_cat_card_show_{$cat->term_id}", array(
            'default'           => true,
            'sanitize_callback' => 'mlws_sanitize_checkbox',
        ) );
        $wp_customize->add_control( "mlws_cat_card_show_{$cat->term_id}", array(
            'label'   => sprintf( __('Show "%s" Card', 'merlows' ), $cat->name ),
            'section' => 'mlws_homepage_categories',
            'type'    => 'checkbox',
        ) );
        
        // Priority (Order)
        $wp_customize->add_setting( "mlws_cat_card_priority_{$cat->term_id}", array(
            'default'           => 10,
            'sanitize_callback' => 'absint',
        ) );
        $wp_customize->add_control( "mlws_cat_card_priority_{$cat->term_id}", array(
            'label'       => sprintf( __('"%s" Priority (Order)', 'merlows' ), $cat->name ),
            'description' => __('Lower numbers appear first.', 'merlows' ),
            'section'     => 'mlws_homepage_categories',
            'type'        => 'number',
            'input_attrs' => array( 'min' => 1, 'max' => 100 ),
        ) );
        
        // Custom Icon
        $wp_customize->add_setting( "mlws_cat_card_icon_{$cat->term_id}", array(
            'default'           => '',
            'sanitize_callback' => 'esc_url_raw',
        ) );
        $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, "mlws_cat_card_icon_{$cat->term_id}", array(
            'label'       => sprintf( __('"%s" Icon', 'merlows' ), $cat->name ),
            'description' => __('Optional: Upload custom icon (recommended: 48x48px PNG).', 'merlows' ),
            'section'     => 'mlws_homepage_categories',
        ) ) );
    }

    // 4. Social API Settings Section
    $wp_customize->add_section( 'mlws_social_api', array(
        'title'       => __('Social API Settings', 'merlows' ),
        'description' => __('Configure the webhook URL for social media automation (e.g. Make/Zapier).', 'merlows' ),
        'priority'    => 33,
        'panel'       => 'mlws_advanced_panel',
    ) );

    $wp_customize->add_setting( 'mlws_social_webhook_url', array(
        'default'           => '',
        'sanitize_callback' => 'esc_url_raw',
    ) );

    $wp_customize->add_control( 'mlws_social_webhook_url', array(
        'label'   => __('Automation Webhook URL', 'merlows' ),
        'section' => 'mlws_social_api',
        'type'    => 'url',
    ) );

    // 4.5 Newsletter Settings
    $wp_customize->add_section( 'mlws_newsletter', array(
        'title'       => __('Newsletter', 'merlows' ),
        'priority'    => 33,
        'panel'       => 'mlws_footer_panel',
    ) );

    $wp_customize->add_setting( 'mlws_newsletter_action', array(
        'default'           => '',
        'sanitize_callback' => 'esc_url_raw',
    ) );
    $wp_customize->add_control( 'mlws_newsletter_action', array(
        'label'       => __('Form Action URL', 'merlows' ),
        'description' => __('Mailchimp/Hubspot form action URL.', 'merlows' ),
        'section'     => 'mlws_newsletter',
        'type'        => 'url',
    ) );

    $wp_customize->add_setting( 'mlws_newsletter_heading', array(
        'default'           => 'Join Merlows',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_newsletter_heading', array(
        'label'   => __('Heading', 'merlows' ),
        'section' => 'mlws_newsletter',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'mlws_newsletter_desc', array(
        'default'           => 'Get diplomatic analysis and breaking news delivered.',
        'sanitize_callback' => 'sanitize_textarea_field',
    ) );
    $wp_customize->add_control( 'mlws_newsletter_desc', array(
        'label'   => __('Description', 'merlows' ),
        'section' => 'mlws_newsletter',
        'type'    => 'textarea',
    ) );

    // 4.6 Footer Brand & Widgets
    $wp_customize->add_section( 'mlws_footer_brand', array(
        'title'       => __('Brand & Widgets', 'merlows' ),
        'priority'    => 33.5,
        'panel'       => 'mlws_footer_panel',
    ) );

    $wp_customize->add_setting( 'mlws_footer_logo', array( 'default' => '', 'sanitize_callback' => 'esc_url_raw' ) );
    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, 'mlws_footer_logo', array( 'label' => 'Footer Logo Image', 'section' => 'mlws_footer_brand' ) ) );

    $wp_customize->add_setting( 'mlws_footer_brand_text', array( 'default' => 'Advancing IBD Research knowledge and tools transforming the modern healthcare environment.', 'sanitize_callback' => 'sanitize_textarea_field' ) );
    $wp_customize->add_control( 'mlws_footer_brand_text', array( 'label' => 'Brand Text below Logo', 'section' => 'mlws_footer_brand', 'type' => 'textarea' ) );

    $wp_customize->add_setting( 'mlws_footer_copyright', array( 'default' => '(c) 2024 Merlows. All rights reserved.', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_footer_copyright', array( 'label' => 'Copyright Text', 'section' => 'mlws_footer_brand', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_footer_heading_col1', array( 'default' => 'Topics', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_footer_heading_col1', array( 'label' => 'Column 1 Heading', 'section' => 'mlws_footer_brand', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_footer_heading_col2', array( 'default' => 'For Writers', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_footer_heading_col2', array( 'label' => 'Column 2 Heading', 'section' => 'mlws_footer_brand', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_footer_heading_col3', array( 'default' => 'For Readers', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_footer_heading_col3', array( 'label' => 'Column 3 Heading', 'section' => 'mlws_footer_brand', 'type' => 'text' ) );

    // 5. Category Hero Overrides Section
    $wp_customize->add_section( 'mlws_category_heroes', array(
        'title'       => __('Category Heroes', 'merlows' ),
        'description' => __('Set unique hero images, taglines, and titles for specific categories.', 'merlows' ),
        'priority'    => 34,
        'panel'       => 'mlws_content_panel',
    ) );

    foreach ( $categories as $cat ) {
        // Hero Image
        $wp_customize->add_setting( "mlws_cat_hero_{$cat->term_id}", array(
            'default'           => '',
            'sanitize_callback' => 'esc_url_raw',
        ) );
        $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, "mlws_cat_hero_{$cat->term_id}", array(
            'label'   => sprintf( __('%s: Hero Image', 'merlows' ), $cat->name ),
            'section' => 'mlws_category_heroes',
        ) ) );

        // Tagline
        $wp_customize->add_setting( "mlws_cat_tagline_{$cat->term_id}", array(
            'default'           => '',
            'sanitize_callback' => 'sanitize_text_field',
        ) );
        $wp_customize->add_control( "mlws_cat_tagline_{$cat->term_id}", array(
            'label'   => sprintf( __('%s: Tagline', 'merlows' ), $cat->name ),
            'section' => 'mlws_category_heroes',
            'type'    => 'text',
        ) );

        // Title Override (New)
        $wp_customize->add_setting( "mlws_cat_title_{$cat->term_id}", array(
            'default'           => '',
            'sanitize_callback' => 'sanitize_text_field',
        ) );
        $wp_customize->add_control( "mlws_cat_title_{$cat->term_id}", array(
            'label'   => sprintf( __('%s: Title Override', 'merlows' ), $cat->name ),
            'section' => 'mlws_category_heroes',
            'type'    => 'text',
        ) );
    }

    // 6. Homepage Section Ordering
    $wp_customize->add_section( 'mlws_homepage_order', array(
        'title'    => __('Section Order', 'merlows' ),
        'priority' => 35,
        'panel'    => 'mlws_homepage_panel',
    ) );

    $wp_customize->add_setting( 'mlws_homepage_section_order', array(
        'default'           => 'hero,pathway,promo,cats,discovery,kb,testimonials',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_homepage_section_order', array(
        'label'       => __('Section Order (Comma-separated IDs)', 'merlows' ),
        'description' => __('IDs: hero, pathway, promo, cats, discovery, kb, testimonials', 'merlows' ),
        'section'     => 'mlws_homepage_order',
        'type'        => 'text',
    ) );

    // 6b. Homepage Section Visibility Toggles
    $wp_customize->add_section( 'mlws_homepage_visibility', array(
        'title'    => __('Section Visibility', 'merlows' ),
        'priority' => 36,
        'panel'    => 'mlws_homepage_panel',
    ) );

    $visibility_sections = array(
        'hero'         => array( 'Show Hero Section', true ),
        'pathway'      => array( 'Show Journey Pillars & Latest Content', true ),
        'stats'        => array( 'Show Homepage Stats Bar (uncheck to hide)', true ),
        'cats'         => array( 'Show Browse by Topic', true ),
        'tools'        => array( 'Show Featured Tools', true ),
        'discovery'    => array( 'Show Content Discovery Suite', true ),
        'quiz_cta'     => array( 'Show Quiz CTA', true ),
        'kb'           => array( 'Show Knowledge Base', true ),
        'testimonials' => array( 'Show Testimonials', true ),
    );

    foreach ( $visibility_sections as $key => $config ) {
        $wp_customize->add_setting( "mlws_show_section_{$key}", array(
            'default'           => $config[1],
            'sanitize_callback' => 'mlws_sanitize_checkbox',
        ) );
        $wp_customize->add_control( "mlws_show_section_{$key}", array(
            'label'   => $config[0],
            'section' => 'mlws_homepage_visibility',
            'type'    => 'checkbox',
        ) );
    }

    // 7. Promo Content Block (New)
    $wp_customize->add_section( 'mlws_promo_block', array(
        'title'    => __('Promo Block', 'merlows' ),
        'priority' => 31.55,
        'panel'    => 'mlws_homepage_panel',
    ) );

    $wp_customize->add_setting( 'mlws_promo_show', array( 'default' => false, 'sanitize_callback' => 'mlws_sanitize_checkbox' ) );
    $wp_customize->add_control( 'mlws_promo_show', array( 'label' => 'Show Promo Block', 'section' => 'mlws_promo_block', 'type' => 'checkbox' ) );

    $wp_customize->add_setting( 'mlws_promo_heading', array( 'default' => 'Experience the Hub', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_promo_heading', array( 'label' => 'Heading', 'section' => 'mlws_promo_block', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_promo_text', array( 'default' => '', 'sanitize_callback' => 'sanitize_textarea_field' ) );
    $wp_customize->add_control( 'mlws_promo_text', array( 'label' => 'Body Text', 'section' => 'mlws_promo_block', 'type' => 'textarea' ) );

    $wp_customize->add_setting( 'mlws_promo_image', array( 'default' => '', 'sanitize_callback' => 'esc_url_raw' ) );
    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, 'mlws_promo_image', array( 'label' => 'Promo Image', 'section' => 'mlws_promo_block' ) ) );

    $wp_customize->add_setting( 'mlws_promo_bg_color', array( 'default' => '#F8FAFC', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'mlws_promo_bg_color', array( 'label' => 'Background Color', 'section' => 'mlws_promo_block' ) ) );

    $wp_customize->add_setting( 'mlws_promo_text_color', array( 'default' => '#0F172A', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'mlws_promo_text_color', array( 'label' => 'Text Color', 'section' => 'mlws_promo_block' ) ) );

    $wp_customize->add_setting( 'mlws_promo_button_text', array( 'default' => 'Get Started Now', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_promo_button_text', array( 'label' => 'Button Text', 'section' => 'mlws_promo_block', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_promo_button_link', array( 'default' => '', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'mlws_promo_button_link', array( 'label' => 'Button Link', 'section' => 'mlws_promo_block', 'type' => 'text' ) );

    $wp_customize->add_setting( 'mlws_promo_width', array( 'default' => 'container', 'sanitize_callback' => 'sanitize_key' ) );
    $wp_customize->add_control( 'mlws_promo_width', array( 'label' => 'Width', 'section' => 'mlws_promo_block', 'type' => 'select', 'choices' => array('container' => 'Container (Narrow)', 'full' => 'Full Width') ) );

    $wp_customize->add_setting( 'mlws_promo_layout', array( 'default' => 'right', 'sanitize_callback' => 'sanitize_key' ) );
    $wp_customize->add_control( 'mlws_promo_layout', array( 'label' => 'Image Position', 'section' => 'mlws_promo_block', 'type' => 'select', 'choices' => array('left' => 'Left', 'right' => 'Right', 'top' => 'Top') ) );

    // 8. Join Block Settings
    $wp_customize->add_section( 'mlws_join_community', array(
        'title'    => __('Join Block', 'merlows' ),
        'priority' => 31.6,
        'panel'    => 'mlws_homepage_panel',
    ) );

    // 8. Join Toggle
    $wp_customize->add_setting( 'mlws_join_show', array( 'default' => true, 'sanitize_callback' => 'mlws_sanitize_checkbox' ) );
    $wp_customize->add_control( 'mlws_join_show', array( 'label' => 'Show "Join Merlows" Block', 'section' => 'mlws_join_community', 'type' => 'checkbox' ) );

    // 6. Dynamic Knowledgebase Sections
    $wp_customize->add_section( 'mlws_knowledgebase_sections', array(
        'title'       => __('Knowledge Base', 'merlows' ),
        'description' => __('Control which categories appear as content sections on the homepage.', 'merlows' ),
        'priority'    => 35,
        'panel'       => 'mlws_content_panel',
    ) );

    // KB Mini-Hero Settings have been consolidated in the "Knowledge Base Mini-Hero" section above.

    $categories = get_categories( array( 'hide_empty' => false ) );
    
    foreach ( $categories as $cat ) {
        // Show/Hide Toggle
        $wp_customize->add_setting( "mlws_kb_show_{$cat->term_id}", array(
            'default'           => true,
            'sanitize_callback' => 'mlws_sanitize_checkbox',
        ) );
        $wp_customize->add_control( "mlws_kb_show_{$cat->term_id}", array(
            'label'   => sprintf( __('Show "%s" Section', 'merlows' ), $cat->name ),
            'section' => 'mlws_knowledgebase_sections',
            'type'    => 'checkbox',
        ) );
        
        // Priority (Order)
        $wp_customize->add_setting( "mlws_kb_priority_{$cat->term_id}", array(
            'default'           => 10,
            'sanitize_callback' => 'absint',
        ) );
        $wp_customize->add_control( "mlws_kb_priority_{$cat->term_id}", array(
            'label'       => sprintf( __('"%s" Priority (Order)', 'merlows' ), $cat->name ),
            'description' => __('Lower numbers appear first.', 'merlows' ),
            'section'     => 'mlws_knowledgebase_sections',
            'type'        => 'number',
            'input_attrs' => array( 'min' => 1, 'max' => 100 ),
        ) );
        
        // Description
        $wp_customize->add_setting( "mlws_kb_desc_{$cat->term_id}", array(
            'default'           => $cat->description,
            'sanitize_callback' => 'sanitize_textarea_field',
        ) );
        $wp_customize->add_control( "mlws_kb_desc_{$cat->term_id}", array(
            'label'   => sprintf( __('"%s" Description', 'merlows' ), $cat->name ),
            'section' => 'mlws_knowledgebase_sections',
            'type'    => 'textarea',
        ) );
        
        // Post Count
        $wp_customize->add_setting( "mlws_kb_count_{$cat->term_id}", array(
            'default'           => 4,
            'sanitize_callback' => 'absint',
        ) );
        $wp_customize->add_control( "mlws_kb_count_{$cat->term_id}", array(
            'label'       => sprintf( __('"%s" Number of Posts', 'merlows' ), $cat->name ),
            'section'     => 'mlws_knowledgebase_sections',
            'type'        => 'number',
            'input_attrs' => array( 'min' => 1, 'max' => 12, 'step' => 1 ),
        ) );
        
        $wp_customize->add_setting( "mlws_kb_view_all_{$cat->term_id}", array(
            'default'           => 'View All',
            'sanitize_callback' => 'sanitize_text_field',
        ) );

        $wp_customize->add_control( "mlws_kb_view_all_{$cat->term_id}", array(
            'label'   => sprintf( __('"%s" View All Label', 'merlows' ), $cat->name ),
            'section' => 'mlws_knowledgebase_sections',
            'type'    => 'text',
        ) );

        // Layout
        $wp_customize->add_setting( "mlws_kb_layout_{$cat->term_id}", array(
            'default'           => 'grid-4',
            'sanitize_callback' => 'sanitize_text_field',
        ) );
        $wp_customize->add_control( "mlws_kb_layout_{$cat->term_id}", array(
            'label'   => sprintf( __('"%s" Layout', 'merlows' ), $cat->name ),
            'section' => 'mlws_knowledgebase_sections',
            'type'    => 'select',
            'choices' => array(
                'grid-4'     => 'Standard Grid (4 Cols)',
                'bento'      => 'Bento Grid (News Style)',
                'asymmetric' => 'Asymmetric (Review Style)',
                'posters'    => 'Posters (Opinion Style)',
            ),
        ) );
    }

    // 7. Scripts & Analytics
    $wp_customize->add_section( 'mlws_scripts', array(
        'title'       => __('Scripts', 'merlows' ),
        'priority'    => 40,
        'description' => __('Add Google Analytics (GA4), Tag Manager, or other tracking scripts.', 'merlows' ),
        'panel'       => 'mlws_advanced_panel',
    ) );

    $wp_customize->add_setting( 'mlws_header_scripts', array(
        'default'           => '',
        'sanitize_callback' => 'mlws_sanitize_scripts', // We need to allow script tags
    ) );
    $wp_customize->add_control( 'mlws_header_scripts', array(
        'label'       => __('Header Scripts (Before </head>)', 'merlows' ),
        'section'     => 'mlws_scripts',
        'type'        => 'textarea',
    ) );

    $wp_customize->add_setting( 'mlws_footer_scripts', array(
        'default'           => '',
        'sanitize_callback' => 'mlws_sanitize_scripts',
    ) );
    $wp_customize->add_control( 'mlws_footer_scripts', array(
        'label'       => __('Footer Scripts (Before </body>)', 'merlows' ),
        'section'     => 'mlws_scripts',
        'type'        => 'textarea',
    ) );

    // Move core Site Identity section to our panel
    if ( $wp_customize->get_section( 'title_tagline' ) ) {
        $wp_customize->get_section( 'title_tagline' )->panel = 'mlws_brand_panel';
        $wp_customize->get_section( 'title_tagline' )->title = __('Site Title & Logo', 'merlows' );
    }
}
add_action( 'customize_register', 'mlws_customize_register' );

/**
 * Sanitize scripts (allow HTML/Script tags)
 * WARNING: Only for trusted admin users
 */
function mlws_sanitize_scripts( $input ) {
    return $input; // Allow everything for admins
}

/**
 * Checkbox sanitization callback
 */
function mlws_sanitize_checkbox( $checked ) {
    return ( ( isset( $checked ) && true == $checked ) ? true : false );
}

/**
 * Get category choices for Customizer (all categories)
 */
function mlws_get_category_choices() {
    $categories = get_categories( array( 'hide_empty' => false ) );
    $choices = array( '0' => 'All Categories' );
    foreach ( $categories as $cat ) {
        $choices[$cat->term_id] = $cat->name;
    }
    return $choices;
}

/**
 * Get category choices scoped to Content Hub Station CPT categories.
 * These categories are auto-assigned when content is created via the CPTs
 * registered in mlws_register_cpts() (news, research, oped, etc.).
 */
function mlws_get_cpt_category_choices() {
    // Map of CPT slugs => auto-assigned category names (mirrors mlws_auto_assign_category)
    $cpt_category_names = array(
        'Healthcare News',
        'Clinical Reviews',
        'Expert Opinions',
        'Tools & Resources',
        'Media Library',
        'Webinars',
        'Education Courses',
        'Infographic Gallery',
    );

    $choices = array( '0' => 'All Content Types' );

    foreach ( $cpt_category_names as $name ) {
        $term = get_term_by( 'name', $name, 'category' );
        if ( $term && ! is_wp_error( $term ) ) {
            $choices[ $term->term_id ] = $term->name;
        }
    }

    return $choices;
}

/**
 * Social Media Meta Box
 */
function mlws_add_social_share_meta_box() {
    $post_types = array_merge( array( 'post' ), array( 'news', 'research', 'oped', 'review', 'whitepaper', 'podcast', 'webinar', 'course', 'infographic' ) );
    add_meta_box(
        'mlws_social_share',
        __('Social Media Automation', 'merlows' ),
        'mlws_render_social_share_meta_box',
        $post_types,
        'side',
        'high'
    );
}
add_action( 'add_meta_boxes', 'mlws_add_social_share_meta_box' );

function mlws_render_social_share_meta_box( $post ) {
    $share_on_publish = get_post_meta( $post->ID, '_mlws_share_on_publish', true );
    $channels = get_post_meta( $post->ID, '_mlws_social_channels', true ) ?: array();
    $custom_msg = get_post_meta( $post->ID, '_mlws_social_message', true );
    
    wp_nonce_field( 'mlws_social_share_save', 'mlws_social_share_nonce' );
    ?>
    <div style="margin-top: 10px;">
        <label style="font-weight: 600; display: block; margin-bottom: 8px;">
            <input type="checkbox" name="mlws_share_on_publish" value="1" <?php checked( $share_on_publish, '1' ); ?>>
            <?php _e( 'Enable Auto-Post', 'merlows' ); ?>
        </label>
        
        <div id="ibd-social-channels" style="margin-left: 24px; margin-bottom: 12px; <?php echo $share_on_publish ? '' : 'display:none;'; ?>">
            <p style="margin-bottom: 4px; font-weight: 600; font-size: 12px; color: #64748b;">Select Channels:</p>
            <label style="display: block; margin-bottom: 4px;">
                <input type="checkbox" name="mlws_social_channels[]" value="linkedin" <?php checked( in_array('linkedin', $channels) ); ?>> LinkedIn
            </label>
            <label style="display: block; margin-bottom: 4px;">
                <input type="checkbox" name="mlws_social_channels[]" value="twitter" <?php checked( in_array('twitter', $channels) ); ?>> X (Twitter)
            </label>
            <label style="display: block; margin-bottom: 4px;">
                <input type="checkbox" name="mlws_social_channels[]" value="facebook" <?php checked( in_array('facebook', $channels) ); ?>> Facebook
            </label>
        </div>

        <div id="ibd-social-message" style="margin-left: 0; margin-top: 12px; <?php echo $share_on_publish ? '' : 'display:none;'; ?>">
            <label style="display: block; margin-bottom: 4px; font-weight: 600; font-size: 12px;">Custom Message (Optional)</label>
            <textarea name="mlws_social_message" rows="3" style="width: 100%;" placeholder="Enter custom caption here..."><?php echo esc_textarea( $custom_msg ); ?></textarea>
            <p class="description" style="font-size: 11px;">If empty, the excerpt will be used.</p>
        </div>

        <script>
        jQuery(document).ready(function($) {
            $('input[name="mlws_share_on_publish"]').change(function() {
                if($(this).is(':checked')) {
                    $('#ibd-social-channels, #ibd-social-message').slideDown();
                } else {
                    $('#ibd-social-channels, #ibd-social-message').slideUp();
                }
            });
        });
        </script>
    </div>
    <?php
}

function mlws_save_social_share_meta( $post_id ) {
    if ( ! isset( $_POST['mlws_social_share_nonce'] ) || ! wp_verify_nonce( $_POST['mlws_social_share_nonce'], 'mlws_social_share_save' ) ) {
        return;
    }
    
    $share = isset( $_POST['mlws_share_on_publish'] ) ? '1' : '0';
    update_post_meta( $post_id, '_mlws_share_on_publish', $share );
    
    $channels = isset( $_POST['mlws_social_channels'] ) ? (array) $_POST['mlws_social_channels'] : array();
    update_post_meta( $post_id, '_mlws_social_channels', $channels );
    
    if ( isset( $_POST['mlws_social_message'] ) ) {
        update_post_meta( $post_id, '_mlws_social_message', sanitize_textarea_field( $_POST['mlws_social_message'] ) );
    }
}
add_action( 'save_post', 'mlws_save_social_share_meta' );

/**
 * Trigger Social Share on Publish
 */
function mlws_trigger_social_share( $new_status, $old_status, $post ) {
    if ( 'publish' !== $new_status || 'publish' === $old_status ) {
        return;
    }

    $should_share = get_post_meta( $post->ID, '_mlws_share_on_publish', true );
    if ( '1' !== $should_share ) {
        return;
    }

    $webhook_url = get_theme_mod( 'mlws_social_webhook_url' );
    if ( empty( $webhook_url ) ) {
        return;
    }
    
    $channels = get_post_meta( $post->ID, '_mlws_social_channels', true ) ?: array();
    $custom_msg = get_post_meta( $post->ID, '_mlws_social_message', true );
    $description = $custom_msg ?: get_the_excerpt( $post );
    $featured_image = get_the_post_thumbnail_url( $post->ID, 'full' );

    $payload = array(
        'title'       => get_the_title( $post ),
        'url'         => get_permalink( $post ),
        'description' => $description,
        'image'       => $featured_image,
        'channels'    => $channels,
        'post_type'   => $post->post_type,
        'date'        => $post->post_date,
        'author'      => get_the_author_meta( 'display_name', $post->post_author ),
    );

    // Send to Webhook
    wp_remote_post( $webhook_url, array(
        'method'      => 'POST',
        'timeout'     => 45,
        'redirection' => 5,
        'httpversion' => '1.0',
        'blocking'    => false, 
        'headers'     => array( 'Content-Type' => 'application/json' ),
        'body'        => json_encode( $payload ),
        'cookies'     => array(),
    ) );
}
add_action( 'transition_post_status', 'mlws_trigger_social_share', 10, 3 );
/**
 * Add Custom Roles
 */
function mlws_setup_custom_roles() {
    // The two key user roles on Merlows: Writers (contributors) and Members
    // (readers). 'practitioner' is the internal slug for the Writer role; its
    // display label is "Writer". 'member' is the new reader-tier role.
    add_role( 'practitioner', __('Writer', 'merlows' ), array(
        'read' => true,
        'edit_posts' => false,
        'delete_posts' => false,
    ));
    add_role( 'member', __('Member', 'merlows' ), array(
        'read' => true,
        'edit_posts' => false,
        'delete_posts' => false,
    ));
    // Backward-compat: keep the legacy 'patient' role registered so existing
    // users assigned to it are not orphaned. New signups use 'member'.
    add_role( 'patient', __('Member', 'merlows' ), array(
        'read' => true,
        'edit_posts' => false,
        'delete_posts' => false,
    ));
}
add_action( 'init', 'mlws_setup_custom_roles' );

/**
 * Authentication & Redirects
 */

// 1. Custom Login Logo
function mlws_login_logo() { 
    ?> 
    <style type="text/css"> 
        #login h1 a, .login h1 a {
            background-image: url(<?php echo get_template_directory_uri(); ?>/assets/img/logo.png);
            height: 100px; 
            width: 300px; 
            background-size: contain; 
            background-repeat: no-repeat; 
            padding-bottom: 30px; 
        }
        body.login { background-color: #f8fafc; }
        .login form { box-shadow: 0 4px 6px rgba(0,0,0,0.05); border-radius: 0; border: 1px solid #e2e8f0; }
        .wp-core-ui .button-primary { background: #1B4F8A; border-color: #1B4F8A; }
    </style>
    <?php 
}
add_action( 'login_enqueue_scripts', 'mlws_login_logo' );

function mlws_login_logo_url() {
    return home_url();
}
add_filter( 'login_headerurl', 'mlws_login_logo_url' );

// 2. Login Redirect to Dashboard
function mlws_login_redirect( $redirect_to, $request, $user ) {
    // Is there a user to check?
    if ( isset( $user->roles ) && is_array( $user->roles ) ) {
        //check for admins
        if ( in_array( 'administrator', $user->roles ) ) {
            // Only redirect if no specific destination is set
            return ( $redirect_to && $redirect_to != admin_url() ) ? $redirect_to : admin_url();
        } else {
            return home_url( '/dashboard/' );
        }
    } else {
        return $redirect_to;
    }
}
add_filter( 'login_redirect', 'mlws_login_redirect', 10, 3 );

/**
 * Default new signups to the 'member' (reader) role
 */
function mlws_default_user_role_on_register( $user_id ) {
    $user = new WP_User( $user_id );
    $user->set_role( 'member' );

    update_user_meta( $user_id, '_mlws_user_type', 'member' );
    update_user_meta( $user_id, '_mlws_dashboard_role', 'member' );
}
add_action( 'user_register', 'mlws_default_user_role_on_register' );

/**
 * Rename 'Subscriber' role to 'Member' (disabled — left for reference)
 */
function mlws_rename_subscriber_role() {
    $role = get_role( 'subscriber' );
    if ( $role ) {
        // Just checking if we can safely rename it without global object mutation
        // but actually, maybe it's better to NOT do this if it's causing plugin issues.
    }
}
// add_action( 'init', 'mlws_rename_subscriber_role' );

/**
 * Redirect default WP registration to custom registration page
 */
function mlws_custom_registration_url($register_url) {
    return home_url('/register/');
}
add_filter('register_url', 'mlws_custom_registration_url');

/**
 * Enhanced Login Page Styling
 */
function mlws_enhanced_login_styles() {
    ?>
    <style type="text/css">
        body.login {
            background: linear-gradient(135deg, #0F172A 0%, #112240 100%);
        }
        
        #login {
            padding-top: 5%;
        }
        
        .login form {
            background: white;
            border-radius: 0;
            padding: 32px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            border: none;
        }
        
        .login form .input {
            border-radius: 0;
            border: 2px solid #E2E8F0;
            padding: 8px 12px;
            font-size: 14px;
        }
        
        .login form .input:focus {
            border-color: #1B4F8A;
            box-shadow: 0 0 0 3px rgba(255, 90, 0, 0.1);
        }
        
        .wp-core-ui .button-primary {
            background: #1B4F8A;
            border-color: #1B4F8A;
            border-radius: 0;
            padding: 8px 24px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            box-shadow: 0 4px 12px rgba(255, 90, 0, 0.3);
            transition: all 0.2s;
        }
        
        .wp-core-ui .button-primary:hover {
            background: #e65100;
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(255, 90, 0, 0.4);
        }
        
        #login form p {
            margin-bottom: 16px;
        }
        
        .login #nav a,
        .login #backtoblog a {
            color: white;
            font-weight: 600;
        }
        
        .login #nav a:hover,
        .login #backtoblog a:hover {
            color: #1B4F8A;
        }
        
        .login .message,
        .login .success {
            background: #F5F0FA;
            border-left: 4px solid #1B4F8A;
            border-radius: 0;
            padding: 12px 16px;
        }
        
        .login #login_error {
            background: #FEE2E2;
            border-left: 4px solid #EF4444;
            border-radius: 0;
            padding: 12px 16px;
        }
    </style>
    <?php
}
add_action('login_enqueue_scripts', 'mlws_enhanced_login_styles');

/**
 * Add "Create Account" link to login page
 */
function mlws_add_register_link_to_login() {
    echo '<p style="text-align: center; margin-top: 20px;">
        <a href="' . home_url('/register/') . '" style="color: white; font-weight: 600; text-decoration: none; background: #1B4F8A; padding: 10px 24px; border-radius: 0; display: inline-block; box-shadow: 0 4px 12px rgba(255, 90, 0, 0.3);">Create New Account</a>
    </p>';
}
add_action('login_footer', 'mlws_add_register_link_to_login');

/**
 * Handle role-based registration redirect
 */
function mlws_handle_registration_redirect() {
    if (isset($_GET['role']) && !is_user_logged_in()) {
        $role = sanitize_text_field($_GET['role']);
        if (in_array($role, array('practitioner', 'member', 'patient'))) {
            setcookie('mlws_pending_role', $role, time() + 3600, '/');
        }
    }
}
add_action('init', 'mlws_handle_registration_redirect');

/**
 * Set user role from cookie on registration
 */
function mlws_set_role_from_cookie($user_id) {
    if (isset($_COOKIE['mlws_pending_role'])) {
        $role = sanitize_text_field($_COOKIE['mlws_pending_role']);
        $user = new WP_User($user_id);
        
        if ($role === 'practitioner') {
            $user->set_role('practitioner');
            update_user_meta($user_id, '_mlws_user_type', 'practitioner');
            update_user_meta($user_id, '_mlws_dashboard_role', 'practitioner');
        } else {
            $user->set_role('member');
            update_user_meta($user_id, '_mlws_user_type', 'member');
            update_user_meta($user_id, '_mlws_dashboard_role', 'member');
        }
        
        // Clear cookie
        setcookie('mlws_pending_role', '', time() - 3600, '/');
    }
}
add_action('user_register', 'mlws_set_role_from_cookie', 20);

/**
 * Hide Admin Bar for non-administrators
 */
function mlws_hide_admin_bar() {
    if ( ! current_user_can( 'administrator' ) ) {
        show_admin_bar( false );
    }
}
add_action( 'after_setup_theme', 'mlws_hide_admin_bar' );

/**
 * ==========================================
 * TESTIMONIALS SYSTEM
 * ==========================================
 */

/**
 * 1. Register Testimonial Post Type
 */
function mlws_register_testimonial_cpt() {
    $labels = array(
        'name'                  => _x( 'Testimonials', 'Post Type General Name', 'merlows' ),
        'singular_name'         => _x( 'Testimonial', 'Post Type Singular Name', 'merlows' ),
        'menu_name'             => __('Testimonials', 'merlows' ),
        'all_items'             => __('All Testimonials', 'merlows' ),
        'add_new_item'          => __('Add New Testimonial', 'merlows' ),
        'new_item'              => __('New Testimonial', 'merlows' ),
    );
    $args = array(
        'label'                 => __('Testimonial', 'merlows' ),
        'labels'                => $labels,
        'supports'              => array( 'title', 'editor', 'thumbnail', 'custom-fields' ), 
        'hierarchical'          => false,
        'public'                => true,
        'show_ui'               => true,
        'show_in_menu'          => true,
        'menu_position'         => 20,
        'menu_icon'             => 'dashicons-format-quote',
        'show_in_admin_bar'     => true,
        'show_in_nav_menus'     => false,
        'can_export'            => true,
        'has_archive'           => false,
        'exclude_from_search'   => true,
        'publicly_queryable'    => false, 
        'capability_type'       => 'post',
    );
    register_post_type( 'testimonial', $args );
}
add_action( 'init', 'mlws_register_testimonial_cpt' );

/**
 * 2. Add Customizer Settings for Testimonials
 */
function mlws_customize_testimonials( $wp_customize ) {
    // Section
    $wp_customize->add_section( 'mlws_testimonials_section', array(
        'title'    => __('Content: Testimonials', 'merlows' ),
        'priority' => 45,
        'panel'    => 'mlws_theme_panel',
        'description' => 'Manage the "What Our Community Says" section.'
    ) );

    // Toggle Display
    $wp_customize->add_setting( 'mlws_show_testimonials', array(
        'default'           => true,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'mlws_show_testimonials', array(
        'label'    => __('Show Section', 'merlows' ),
        'section'  => 'mlws_testimonials_section',
        'type'     => 'checkbox',
    ) );

    // Heading
    $wp_customize->add_setting( 'mlws_testimonial_heading', array(
        'default'           => 'What Our Community Says',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_testimonial_heading', array(
        'label'   => __('Section Heading', 'merlows' ),
        'section' => 'mlws_testimonials_section',
        'type'    => 'text',
    ) );

    // Selection Mode
    $wp_customize->add_setting( 'mlws_testimonial_select_type', array(
        'default'           => 'latest',
        'sanitize_callback' => 'sanitize_key',
    ) );
    $wp_customize->add_control( 'mlws_testimonial_select_type', array(
        'label'   => __('Selection Mode', 'merlows' ),
        'section' => 'mlws_testimonials_section',
        'type'    => 'select',
        'choices' => array(
            'latest' => 'Latest Published',
            'manual' => 'Manual Selection (IDs)'
        )
    ) );

    // Manual IDs
    $wp_customize->add_setting( 'mlws_testimonial_ids', array(
        'default'           => '',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'mlws_testimonial_ids', array(
        'label'       => __('Specific Testimonial IDs', 'merlows' ),
        'description' => __('Comma-separated list (e.g. 104, 156). Ignored if mode is "Latest".', 'merlows' ),
        'section'     => 'mlws_testimonials_section',
        'type'        => 'text',
    ) );

    // Count
    $wp_customize->add_setting( 'mlws_testimonial_count', array(
        'default'           => 3,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'mlws_testimonial_count', array(
        'label'       => __('Number to Show', 'merlows' ),
        'section'     => 'mlws_testimonials_section',
        'type'    => 'number',
        'input_attrs' => array( 'min' => 1, 'max' => 9 ),
    ) );
}
add_action( 'customize_register', 'mlws_customize_testimonials' );

/**
 * 3. Testimonials Shortcode [testimonials]
 */
function mlws_testimonials_shortcode( $atts ) {
    // Check toggle
    if ( ! get_theme_mod( 'mlws_show_testimonials', true ) ) {
        return '';
    }

    $heading = get_theme_mod( 'mlws_testimonial_heading', 'What Our Community Says' );
    $mode    = get_theme_mod( 'mlws_testimonial_select_type', 'latest' );
    $ids_str = get_theme_mod( 'mlws_testimonial_ids', '' );
    $count   = get_theme_mod( 'mlws_testimonial_count', 3 );

    $args = array(
        'post_type'      => 'testimonial',
        'post_status'    => 'publish',
        'posts_per_page' => $count,
    );

    if ( $mode === 'manual' && ! empty( $ids_str ) ) {
        $ids = array_map( 'intval', explode( ',', $ids_str ) );
        $args['post__in'] = $ids;
        $args['orderby']  = 'post__in';
    } else {
        $args['orderby'] = 'date';
        $args['order']   = 'DESC';
    }

    $query = new WP_Query( $args );

    // Output Buffer
    ob_start();
    ?>
    <section class="ibd-testimonials-section" style="padding: 100px 0; background: #F8FAFC; border-top: 1px solid #e2e8f0; position: relative; z-index: 10;">
        <div class="container">
            <?php if ( $query->have_posts() ) : ?>
                <?php if ( $heading ) : ?>
                    <div class="section-label" style="display: flex; align-items: center; gap: 12px; margin-bottom: 40px; border-bottom: 2px solid #e5e7eb; padding-bottom: 16px;">
                        <div class="color-bar" style="background: #1B4F8A; width: 6px; height: 24px; border-radius: 0;"></div>
                        <h2 style="margin: 0; font-size: 24px; font-weight: 800; color: #0F172A; font-family: 'Outfit', sans-serif; text-transform: uppercase;"><?php echo esc_html( $heading ); ?></h2>
                    </div>
                <?php endif; ?>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px;">
                    <?php while ( $query->have_posts() ) : $query->the_post(); 
                        $role = get_post_meta( get_the_ID(), '_testimonial_role', true ); 
                    ?>
                        <div style="background: white; border-radius: 0; padding: 40px 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; display: flex; flex-direction: column; position: relative;">
                            <!-- Quote Icon -->
                            <div style="position: absolute; top: 24px; right: 24px;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="#1B4F8A" style="opacity: 0.1;">
                                    <path d="M14.017 21L14.017 18C14.017 16.8954 14.9124 16 16.017 16H19.017C19.5693 16 20.017 15.5523 20.017 15V9C20.017 8.44772 19.5693 8 19.017 8H15.017C14.4647 8 14.017 8.44772 14.017 9V11C14.017 11.5523 13.5693 12 13.017 12H12.017V5H22.017V15C22.017 18.3137 19.3307 21 16.017 21H14.017ZM5.01697 21L5.01697 18C5.01697 16.8954 5.9124 16 7.01697 16H10.017C10.5693 16 11.017 15.5523 11.017 15V9C11.017 8.44772 10.5693 8 10.017 8H6.01697C5.46468 8 5.01697 8.44772 5.01697 9V11C5.01697 11.5523 4.56925 12 4.01697 12H3.01697V5H13.017V15C13.017 18.3137 10.3307 21 7.01697 21H5.01697Z"></path>
                                </svg>
                            </div>
                            
                            <!-- Content -->
                            <div style="font-family: 'Inter', sans-serif; font-size: 16px; color: #475569; line-height: 1.7; font-style: italic; margin-bottom: 24px; flex-grow: 1;">
                                "<?php echo get_the_content(); ?>"
                            </div>
                            
                            <!-- Author -->
                            <div style="display: flex; align-items: center; gap: 16px; border-top: 1px solid #f1f5f9; padding-top: 24px; margin-top: auto;">
                                <?php if( has_post_thumbnail() ): ?>
                                    <img src="<?php echo get_the_post_thumbnail_url( get_the_ID(), 'thumbnail' ); ?>" style="width: 56px; height: 56px; border-radius: 0; object-fit: cover; border: 3px solid #f8fafc;">
                                <?php else: ?>
                                    <div style="width: 56px; height: 56px; border-radius: 0; background: #0F172A; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 20px; font-family: 'Outfit', sans-serif;">
                                        <?php echo strtoupper(substr(get_the_title(), 0, 1)); ?>
                                    </div>
                                <?php endif; ?>
                                <div>
                                    <h4 style="margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; font-family: 'Outfit', sans-serif;"><?php the_title(); ?></h4>
                                    <?php if($role): ?>
                                        <span style="font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;"><?php echo esc_html($role); ?></span>
                                    <?php endif; ?>
                                </div>
                            </div>
                        </div>
                    <?php endwhile; ?>
                </div>
            <?php else : ?>
                <!-- No Testimonials Found -->
                <div style="display: none;">No Testimonials Found</div>
            <?php endif; ?>
        </div>
    </section>
    <?php
    wp_reset_postdata();
    return ob_get_clean();
}
add_shortcode( 'testimonials', 'mlws_testimonials_shortcode' );

/**
 * 4. Helper: Add Role Field to Testimonials in Admin
 */
function mlws_testimonial_meta_box() {
    add_meta_box( 'mlws_testimonial_meta', 'Testimonial Details', 'mlws_testimonial_meta_callback', 'testimonial', 'normal', 'high' );
}
add_action( 'add_meta_boxes', 'mlws_testimonial_meta_box' );

function mlws_testimonial_meta_callback( $post ) {
    $role = get_post_meta( $post->ID, '_testimonial_role', true );
    ?>
    <p>
        <label for="testimonial_role" style="font-weight: 600;">Author Role/Title:</label><br>
        <input type="text" id="testimonial_role" name="testimonial_role" value="<?php echo esc_attr( $role ); ?>" style="width: 100%; margin-top: 5px;" placeholder="e.g. Editor, Reader, or Analyst">
    </p>
    <?php
}

function mlws_save_testimonial_meta( $post_id ) {
    if ( isset( $_POST['testimonial_role'] ) ) {
        update_post_meta( $post_id, '_testimonial_role', sanitize_text_field( $_POST['testimonial_role'] ) );
    }
}
add_action( 'save_post', 'mlws_save_testimonial_meta' );






/**
 * Writer, Reader & About Us Pages Customizer Settings
 */
require_once get_template_directory() . '/customizer-pages.php';

/**
 * Category Pages Customizer (per-category layouts + Featured/Latest/Promo blocks)
 */
require_once get_template_directory() . '/inc/category-customizer.php';



/**
 * AJAX: Save Detailed Clinical Profile
 */
function mlws_save_clinical_profile() {
    check_ajax_referer( 'mlws_clinical_nonce', 'nonce' );
    if ( ! is_user_logged_in() ) wp_send_json_error( 'Not logged in' );

    $user_id = get_current_user_id();
    $data = isset($_POST['profile_data']) ? $_POST['profile_data'] : array();
    
    if ( ! is_array( $data ) && is_string( $data ) ) {
        $data = json_decode( stripslashes( $data ), true );
    }

    if ( ! empty( $data ) ) {
        update_user_meta( $user_id, '_mlws_clinical_profile', $data );
        wp_send_json_success( 'Clinical profile updated' );
    } else {
        wp_send_json_error( 'No data' );
    }
}
add_action( 'wp_ajax_mlws_save_clinical_profile', 'mlws_save_clinical_profile' );

/**
 * Add Quiz Modal Base Styles
 */
function mlws_quiz_modal_styles() {
    ?>
    <style>
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .modal-option-item {
            display: flex; align-items: center; gap: 15px; padding: 16px 20px; border: 2px solid #f1f5f9; border-radius: 0; cursor: pointer; transition: all 0.2s;
        }
        .modal-option-item:hover { border-color: #1B4F8A; background: #fffcf9; }
        .modal-option-item.selected { border-color: #1B4F8A; background: #F5F0FA; }
        .modal-option-item.selected .modal-option-radio { border-color: #1B4F8A !important; background: #1B4F8A; box-shadow: inset 0 0 0 4px white; }
        .option-text { font-size: 15px; font-weight: 600; color: #334155; }
        .modal-btn-save { background: transparent; color: #94a3b8; border: 1px solid #e2e8f0; padding: 14px 24px; border-radius: 0; font-weight: 700; cursor: pointer; transition: all 0.2s; }
        .modal-btn-save:hover { background: #f8fafc; color: #475569; }
    </style>
    <?php
}
add_action( 'wp_footer', 'mlws_quiz_modal_styles' );

/**
 * AJAX: Save Healthcare Quiz Results
 * Stores quiz answers into user meta under _mlws_healthcare_quiz_results.
 * Called by both the standalone page and the modal version of the quiz.
 */
function mlws_save_quiz_results() {
    if ( ! is_user_logged_in() ) {
        wp_send_json_error( 'Not logged in' );
    }

    if ( ! isset( $_POST['nonce'] ) || ! wp_verify_nonce( $_POST['nonce'], 'mlws_quiz_nonce' ) ) {
        wp_send_json_error( 'Invalid nonce' );
    }

    $raw  = isset( $_POST['quiz_data'] ) ? (array) $_POST['quiz_data'] : array();
    $data = array();
    foreach ( $raw as $key => $val ) {
        if ( is_array( $val ) ) {
            $data[ $key ] = sanitize_text_field( implode( ', ', $val ) );
        } else {
            $data[ $key ] = sanitize_text_field( $val );
        }
    }

    if ( empty( $data ) ) {
        wp_send_json_error( 'No data received' );
    }

    $user_id = get_current_user_id();

    // Ensure we merge into an array to prevent fatal errors
    $existing = get_user_meta( $user_id, '_mlws_healthcare_quiz_results', true );
    if ( ! is_array( $existing ) ) {
        $existing = array();
    }
    
    $merged = array_merge( $existing, $data );

    update_user_meta( $user_id, '_mlws_healthcare_quiz_results', $merged );

    wp_send_json_success( array( 'saved' => true ) );
}
add_action( 'wp_ajax_mlws_save_quiz_results', 'mlws_save_quiz_results' );


// End of File

