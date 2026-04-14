<?php
/**
 * IBD Health Hub Theme Functions
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

function ibdhh_health_hub_scripts() {
    // Enqueue Google Fonts
    wp_enqueue_style( 'ibd-google-fonts', 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500;700&display=swap', array(), null );

    // Enqueue Main Styles — version based on file modification time for cache busting
    $css_file = get_template_directory() . '/assets/css/main.css';
    $css_ver  = file_exists( $css_file ) ? filemtime( $css_file ) : '2.0.0';
    wp_enqueue_style( 'ibd-main-style', get_template_directory_uri() . '/assets/css/main.css', array(), $css_ver );

    // Enqueue Theme Stylesheet (style.css)
    wp_enqueue_style( 'ibd-style', get_stylesheet_uri(), array(), $css_ver );
}
add_action( 'wp_enqueue_scripts', 'ibdhh_health_hub_scripts' );

/**
 * Force theme favicon: remove ALL WordPress/Jetpack site icon output
 * and inject our own at the very end of wp_head.
 */
function ibdhh_remove_wp_site_icon() {
    remove_action( 'wp_head', 'wp_site_icon', 99 );
}
add_action( 'wp_head', 'ibdhh_remove_wp_site_icon', 1 );

// Also block the site icon via filter (catches Jetpack and other plugins)
add_filter( 'get_site_icon_url', '__return_empty_string' );

// Output our favicon at priority 9999 (absolute last thing in <head>)
function ibdhh_output_favicon() {
    $dir = get_template_directory_uri();
    $ver = filemtime( get_template_directory() . '/assets/img/favicon.svg' ) ?: time();
    echo '<link rel="icon" type="image/svg+xml" href="' . $dir . '/assets/img/favicon.svg?v=' . $ver . '">' . "\n";
    echo '<link rel="icon" type="image/png" sizes="32x32" href="' . $dir . '/assets/img/favicon.png?v=' . $ver . '">' . "\n";
    echo '<link rel="shortcut icon" href="' . $dir . '/assets/img/favicon.svg?v=' . $ver . '">' . "\n";
    echo '<link rel="apple-touch-icon" href="' . $dir . '/assets/img/favicon.png?v=' . $ver . '">' . "\n";
}
add_action( 'wp_head', 'ibdhh_output_favicon', 9999 );

function ibdhh_health_hub_setup() {
    // Add default posts and comments RSS feed links to head.
    add_theme_support( 'automatic-feed-links' );

    // Let WordPress manage the document title.
    add_theme_support( 'title-tag' );

    // Enable support for Post Thumbnails on posts and pages.
    add_theme_support( 'post-thumbnails' );

    // Register Navigation Menus
    register_nav_menus(
        array(
            'primary-menu' => esc_html__( 'Primary Menu', 'ibd-health-hub' ),
            'footer-menu-1' => esc_html__( 'Footer Menu Topics', 'ibd-health-hub' ),
            'footer-menu-2' => esc_html__( 'Footer Menu Professionals', 'ibd-health-hub' ),
            'footer-menu-3' => esc_html__( 'Footer Menu Patients', 'ibd-health-hub' ),
        )
    );
}
add_action( 'after_setup_theme', 'ibdhh_health_hub_setup' );

/**
 * Theme Activation: Pre-seed all categories, tags, and default content structures
 * so the site is ready immediately without needing to create posts first.
 */
function ibdhh_theme_activation() {
    // --- Categories (matching SLA Health) ---
    $categories = array(
        'Healthcare News'     => 'healthcare-news',
        'Clinical Reviews'    => 'clinical-reviews',
        'Expert Opinions'     => 'expert-opinions',
        'Tools & Resources'   => 'tools-resources',
        'Media Library'       => 'media-library',
        'Education Courses'   => 'education-courses',
        'Infographic Gallery' => 'infographic-gallery',
        'Patient Education'   => 'patient-education',
        'Nutrition Science'   => 'nutrition-science',
        'Gastro Health'       => 'gastro-health',
        'IBD Management'      => 'ibd-management',
        'Living with IBD'     => 'living-with-ibd',
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

    // --- Pathway Tags ---
    $pathway_tags = array(
        'path-patient'      => 'Path: Patient',
        'path-practitioner' => 'Path: Practitioner',
        'path-caregiver'    => 'Path: Caregiver',
        'path-researcher'   => 'Path: Researcher',
    );

    foreach ( $pathway_tags as $slug => $name ) {
        if ( ! term_exists( $slug, 'post_tag' ) ) {
            wp_insert_term( $name, 'post_tag', array( 'slug' => $slug ) );
        }
    }

    // Flush rewrite rules so CPT archives work immediately
    flush_rewrite_rules();
}
add_action( 'after_switch_theme', 'ibdhh_theme_activation' );

/**
 * Robust category seeder — runs on admin_init and checks if categories
 * actually exist in the DB (not just a flag). Re-seeds any missing ones.
 */
function ibdhh_maybe_seed_categories() {
    // Check if the core categories actually exist — not just a flag
    $required_cats = array(
        'Healthcare News', 'Clinical Reviews', 'Expert Opinions',
        'Tools & Resources', 'Media Library', 'Education Courses',
        'Infographic Gallery',
    );

    $all_exist = true;
    foreach ( $required_cats as $cat_name ) {
        if ( ! term_exists( $cat_name, 'category' ) ) {
            $all_exist = false;
            break;
        }
    }

    if ( ! $all_exist ) {
        ibdhh_theme_activation();
    }
}
add_action( 'admin_init', 'ibdhh_maybe_seed_categories' );

/**
 * Manual seed trigger via URL: /wp-admin/?ibdhh_seed=1
 * Useful if activation hook didn't fire.
 */
function ibdhh_manual_seed_trigger() {
    if ( isset( $_GET['ibdhh_seed'] ) && $_GET['ibdhh_seed'] === '1' && current_user_can( 'manage_options' ) ) {
        ibdhh_theme_activation();
        add_action( 'admin_notices', function() {
            echo '<div class="notice notice-success is-dismissible"><p><strong>IBD Health Hub:</strong> Categories, reading levels, and pathway tags have been seeded successfully.</p></div>';
        });
    }
}
add_action( 'admin_init', 'ibdhh_manual_seed_trigger' );

/**
 * Remove "Category:" prefix from archive titles
 */
function ibdhh_remove_category_prefix( $title ) {
    if ( is_category() ) {
        $title = single_cat_title( '', false );
    }
    return $title;
}
add_filter( 'get_the_archive_title', 'ibdhh_remove_category_prefix' );

/**
 * Include Custom Post Types in Category Archives
 * This ensures that both standard posts and CPTs appear when viewing a category
 */
function ibdhh_include_cpts_in_category_archives( $query ) {
    // Only modify the main query on category archives
    if ( ! is_admin() && $query->is_main_query() && is_category() ) {
        // Get all registered CPTs
        $cpts = array( 'news', 'research', 'oped', 'review', 'whitepaper', 'podcast', 'webinar', 'course', 'infographic' );
        
        // Include both standard posts and all CPTs
        $query->set( 'post_type', array_merge( array( 'post' ), $cpts ) );
    }
}
add_action( 'pre_get_posts', 'ibdhh_include_cpts_in_category_archives' );

/**
 * Register Custom Post Types
 * News, Clinical Research Reviews, Op-Eds, Product reviews, White papers, Podcasts, Webinars, Courses, Infographics
 */
function ibdhh_register_cpts() {
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
            'name'                  => _x( $name . 's', 'Post Type General Name', 'ibd-health-hub' ),
            'singular_name'         => _x( $name, 'Post Type Singular Name', 'ibd-health-hub' ),
            'menu_name'             => __( $name . 's', 'ibd-health-hub' ),
            'all_items'             => __( 'All ' . $name . 's', 'ibd-health-hub' ),
            'add_new_item'          => __( 'Add New ' . $name, 'ibd-health-hub' ),
        );
        $args = array(
            'label'                 => __( $name, 'ibd-health-hub' ),
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
add_action( 'init', 'ibdhh_register_cpts' );

/**
 * Explicitly grant CPT capabilities to Administrator
 */
function ibdhh_grant_cpt_caps() {
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
add_action( 'admin_init', 'ibdhh_grant_cpt_caps' );

/**
 * Flush rewrite rules on theme activation
 * This ensures the new permalink structure takes effect
 */
function ibdhh_flush_rewrite_rules() {
    ibdhh_register_cpts();
    flush_rewrite_rules();
}
add_action( 'after_switch_theme', 'ibdhh_flush_rewrite_rules' );

// Create Content Hub Menu
function ibdhh_register_content_hub_menu() {
    add_menu_page(
        'IBD Research Centre',
        'IBD Research Centre',
        'manage_options',
        'ibd-content-hub',
        'ibdhh_render_content_hub_dashboard',
        'dashicons-category',
        1 
    );

    add_submenu_page(
        'ibd-content-hub',
        'Content Hub Station',
        'Content Hub Station',
        'manage_options',
        'ibd-content-hub',
        'ibdhh_render_content_hub_dashboard'
    );

    add_submenu_page(
        'ibd-content-hub',
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
add_action( 'admin_menu', 'ibdhh_register_content_hub_menu', 999 );

/**
 * Get SVG Icon for Category
 */
function ibdhh_get_category_icon_url($name) {
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
 * Render Content Hub Management Dashboard
 */
function ibdhh_render_content_hub_dashboard() {
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
                        <img src="<?php echo ibdhh_get_category_icon_url($data['name']); ?>" style="width: 28px; height: 28px; object-fit: contain; filter: none !important;">
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
function ibdhh_render_media_hub_dashboard() {
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
                        <img src="<?php echo ibdhh_get_category_icon_url($data['name']); ?>" style="width: 28px; height: 28px; object-fit: contain; filter: none !important;">
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
function ibdhh_filter_get_avatar( $args, $id_or_email ) {
    $user_id = 0;
    if ( is_numeric( $id_or_email ) ) {
        $user_id = (int) $id_or_email;
    } elseif ( is_string( $id_or_email ) && ( $user = get_user_by( 'email', $id_or_email ) ) ) {
        $user_id = $user->ID;
    } elseif ( is_object( $id_or_email ) && isset( $id_or_email->user_id ) ) {
        $user_id = (int) $id_or_email->user_id;
    }

    if ( $user_id ) {
        $custom_avatar = get_user_meta( $user_id, '_ibdhh_profile_image_url', true );
        if ( $custom_avatar ) {
            $args['url'] = $custom_avatar;
        }
    }
    return $args;
}
add_filter( 'get_avatar_data', 'ibdhh_filter_get_avatar', 10, 2 );

// Auto-assign Category based on CPT
function ibdhh_auto_assign_category( $post_id, $post, $update ) {
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
add_action( 'save_post', 'ibdhh_auto_assign_category', 10, 3 );

/**
 * Add admin notice to guide users on post creation workflow
 */
function ibdhh_content_creation_notice() {
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
add_action( 'admin_notices', 'ibdhh_content_creation_notice' );

/**
 * Filter post type links to remove post type slug
 * This ensures CPTs have the same URL structure as standard posts
 */
function ibdhh_remove_cpt_slug_from_permalink( $post_link, $post ) {
    $cpts = array( 'news', 'research', 'oped', 'review', 'whitepaper', 'podcast', 'webinar', 'course', 'infographic' );
    
    if ( in_array( $post->post_type, $cpts ) && 'publish' === $post->post_status ) {
        // Remove post type slug from URL
        $post_link = str_replace( '/' . $post->post_type . '/', '/', $post_link );
    }
    
    return $post_link;
}
add_filter( 'post_type_link', 'ibdhh_remove_cpt_slug_from_permalink', 10, 2 );

/**
 * Parse request to handle CPTs without post type slug in URL
 * This allows CPTs to be accessed with the same URL structure as standard posts
 */
function ibdhh_parse_cpt_request( $wp ) {
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
add_action( 'parse_request', 'ibdhh_parse_cpt_request' );

















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
function ibdhh_enqueue_google_oauth_scripts() {
    if ( ! is_user_logged_in() ) {
        wp_enqueue_script( 'google-gsi', 'https://accounts.google.com/gsi/client', array(), null, true );
    }
}
add_action( 'wp_enqueue_scripts', 'ibdhh_enqueue_google_oauth_scripts' );

// Google OAuth Login Button Shortcode
function ibdhh_google_login_button_shortcode( $atts ) {
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
            body: "action=ibdhh_google_oauth_callback&credential=" + response.credential + "&nonce=' . $nonce . '"
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
add_shortcode( 'google_login', 'ibdhh_google_login_button_shortcode' );

// Handle Google OAuth Callback
function ibdhh_google_oauth_callback() {
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
        
        // Default to Patient Role
        update_user_meta( $user_id, '_ibdhh_user_type', 'patient' );
        update_user_meta( $user_id, '_ibdhh_dashboard_role', 'patient' );
        
        $user = get_user_by( 'id', $user_id );
    }
    
    // Log the user in
    wp_set_current_user( $user->ID );
    wp_set_auth_cookie( $user->ID, true );
    
    wp_send_json_success( array( 'message' => 'Logged in successfully' ) );
}
add_action( 'wp_ajax_nopriv_ibdhh_google_oauth_callback', 'ibdhh_google_oauth_callback' );
add_action( 'wp_ajax_ibdhh_google_oauth_callback', 'ibdhh_google_oauth_callback' );

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
function ibdhh_save_calc_result() {
    if ( ! is_user_logged_in() ) { wp_send_json_error( 'Not logged in' ); }
    if ( ! isset( $_POST['nonce'] ) || ! wp_verify_nonce( $_POST['nonce'], 'ibdhh_dashboard_nonce' ) ) {
        wp_send_json_error( 'Invalid nonce' );
    }

    $user_id  = get_current_user_id();
        $tool     = sanitize_key( isset($_POST['tool']) ? $_POST['tool'] : 'malnutrition' );
    $meta_key = '_ibdhh_calc_results_' . $tool;

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
add_action( 'wp_ajax_ibdhh_save_calc_result', 'ibdhh_save_calc_result' );

/**
 * AJAX: Get Calculator Results
 * Returns saved results for the current user, sorted newest first.
 */
function ibdhh_get_calc_results() {
    if ( ! is_user_logged_in() ) { wp_send_json_error( 'Not logged in' ); }
    if ( ! isset( $_POST['nonce'] ) || ! wp_verify_nonce( $_POST['nonce'], 'ibdhh_dashboard_nonce' ) ) {
        wp_send_json_error( 'Invalid nonce' );
    }

    $user_id  = get_current_user_id();
        $tool     = sanitize_key( isset($_POST['tool']) ? $_POST['tool'] : 'malnutrition' );
    $meta_key = '_ibdhh_calc_results_' . $tool;
    $results  = get_user_meta( $user_id, $meta_key, true ) ?: array();

    wp_send_json_success( $results );
}
add_action( 'wp_ajax_ibdhh_get_calc_results', 'ibdhh_get_calc_results' );

/**
 * Include Dashboard Functions
 * Handles User Dashboard logic (AJAX, Profiles, Bookmarks)
 */
require get_template_directory() . '/inc/dashboard-functions.php';


/**
 * Increase maximum upload size to 10MB
 */
function ibdhh_increase_upload_size_limit( $limit ) {
    return 10 * 1024 * 1024; // 10MB in bytes
}
add_filter( 'upload_size_limit', 'ibdhh_increase_upload_size_limit' );

/**
 * Add Advanced Theme Settings to Customizer
 */
function ibdhh_customize_register( $wp_customize ) {
    // 0. IBD Theme Panels
    $wp_customize->add_panel( 'ibdhh_brand_panel', array( 'title' => __( 'IBD Theme -> Brand Identity', 'ibd-health-hub' ), 'priority' => 10 ) );
    $wp_customize->add_panel( 'ibdhh_homepage_panel', array( 'title' => __( 'IBD Theme -> Homepage', 'ibd-health-hub' ), 'priority' => 11 ) );
    $wp_customize->add_panel( 'ibdhh_content_panel', array( 'title' => __( 'IBD Theme -> Content', 'ibd-health-hub' ), 'priority' => 12 ) );
    $wp_customize->add_panel( 'ibdhh_footer_panel', array( 'title' => __( 'IBD Theme -> Footer', 'ibd-health-hub' ), 'priority' => 13 ) );
    $wp_customize->add_panel( 'ibdhh_advanced_panel', array( 'title' => __( 'IBD Theme -> Advanced', 'ibd-health-hub' ), 'priority' => 14 ) );

    // Move Site Identity into IBD Theme Settings
    if ( $wp_customize->get_section('title_tagline') ) {
        $wp_customize->get_section('title_tagline')->panel = 'ibdhh_brand_panel';
        $wp_customize->get_section('title_tagline')->priority = 5;
    }

    // 1. Social Media Links Section
    $wp_customize->add_section( 'ibdhh_social_links', array(
        'title'    => __( 'Social Media Links', 'ibd-health-hub' ),
        'priority' => 30,
        'panel'    => 'ibdhh_brand_panel',
    ) );

    $social_networks = array(
        'linkedin'  => 'LinkedIn',
        'facebook'  => 'Facebook',
        'twitter'   => 'X (formerly Twitter)',
        'instagram' => 'Instagram',
    );

    foreach ( $social_networks as $key => $label ) {
        $wp_customize->add_setting( 'ibdhh_social_' . $key, array(
            'default'           => '',
            'sanitize_callback' => 'esc_url_raw',
        ) );

        $wp_customize->add_control( 'ibdhh_social_' . $key, array(
            'label'   => $label,
            'section' => 'ibdhh_social_links',
            'type'    => 'url',
        ) );
    }

    // 2. Hero Images & Content Section
    $wp_customize->add_section( 'ibdhh_hero_settings', array(
        'title'       => __( 'Hero', 'ibd-health-hub' ),
        'description' => __( 'Manage hero images, text, and styling.', 'ibd-health-hub' ),
        'priority'    => 31,
        'panel'       => 'ibdhh_homepage_panel',
    ) );

    $wp_customize->add_setting( 'ibdhh_homepage_hero_image', array(
        'default'           => '',
        'sanitize_callback' => 'esc_url_raw',
    ) );

    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, 'ibdhh_homepage_hero_image', array(
        'label'       => __( 'Homepage Hero Image', 'ibd-health-hub' ),
        'description' => __( 'High resolution (1920x800px) ensures clarity.', 'ibd-health-hub' ),
        'section'     => 'ibdhh_hero_settings',
    ) ) );

    $wp_customize->add_setting( 'ibdhh_category_hero_image', array(
        'default'           => '',
        'sanitize_callback' => 'esc_url_raw',
    ) );

    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, 'ibdhh_category_hero_image', array(
        'label'       => __( 'Category/Archive Hero Image', 'ibd-health-hub' ),
        'description' => __( 'Default hero for all category pages.', 'ibd-health-hub' ),
        'section'     => 'ibdhh_hero_settings',
    ) ) );

    // Hero Text Content (New)
    $wp_customize->add_setting( 'ibdhh_hero_custom_title', array(
        'default'           => 'Evidence-Based Healthcare Knowledge',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_hero_custom_title', array(
        'label'       => __( 'Homepage Hero Title', 'ibd-health-hub' ),
        'section'     => 'ibdhh_hero_settings',
        'type'        => 'text',
    ) );

    $wp_customize->add_setting( 'ibdhh_hero_custom_subtitle', array(
        'default'           => 'Pharma-grade clinical resources, research, and tools for healthcare professionals.',
        'sanitize_callback' => 'sanitize_textarea_field',
    ) );
    $wp_customize->add_control( 'ibdhh_hero_custom_subtitle', array(
        'label'       => __( 'Homepage Hero Subtitle', 'ibd-health-hub' ),
        'section'     => 'ibdhh_hero_settings',
        'type'        => 'textarea',
    ) );

    // Hero Tag & Buttons
    $wp_customize->add_setting( 'ibdhh_hero_tag_label', array(
        'default'           => 'HEALTHCARE KNOWLEDGE HUB',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_hero_tag_label', array(
        'label'   => __( 'Hero Tag Label', 'ibd-health-hub' ),
        'section' => 'ibdhh_hero_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'ibdhh_hero_button_1_text', array(
        'default'           => "I'm a Practitioner",
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_hero_button_1_text', array(
        'label'   => __( 'Hero Button 1 Text', 'ibd-health-hub' ),
        'section' => 'ibdhh_hero_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'ibdhh_hero_button_1_link', array(
        'default'           => '/healthcare-professionals/',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_hero_button_1_link', array(
        'label'   => __( 'Hero Button 1 Link', 'ibd-health-hub' ),
        'section' => 'ibdhh_hero_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'ibdhh_hero_button_2_text', array(
        'default'           => "I'm a Patient",
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_hero_button_2_text', array(
        'label'   => __( 'Hero Button 2 Text', 'ibd-health-hub' ),
        'section' => 'ibdhh_hero_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'ibdhh_hero_button_2_link', array(
        'default'           => '/patients/',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_hero_button_2_link', array(
        'label'   => __( 'Hero Button 2 Link', 'ibd-health-hub' ),
        'section' => 'ibdhh_hero_settings',
        'type'    => 'text',
    ) );

    // Hero Styling Settings
    $wp_customize->add_setting( 'ibdhh_hero_title_color', array(
        'default'           => '#ffffff',
        'sanitize_callback' => 'sanitize_hex_color',
    ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'ibdhh_hero_title_color', array(
        'label'   => __( 'Hero Title Color', 'ibd-health-hub' ),
        'section' => 'ibdhh_hero_settings',
    ) ) );

    $wp_customize->add_setting( 'ibdhh_hero_title_size', array(
        'default'           => 52,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'ibdhh_hero_title_size', array(
        'label'       => __( 'Hero Title Size (px)', 'ibd-health-hub' ),
        'section'     => 'ibdhh_hero_settings',
        'type'        => 'range',
        'input_attrs' => array( 'min' => 24, 'max' => 100, 'step' => 1 ),
    ) );

    $wp_customize->add_setting( 'ibdhh_hero_mask_toggle', array(
        'default'           => true,
        'sanitize_callback' => 'ibdhh_sanitize_checkbox',
    ) );
    $wp_customize->add_control( 'ibdhh_hero_mask_toggle', array(
        'label'   => __( 'Enable Dark Overlay Mask', 'ibd-health-hub' ),
        'section' => 'ibdhh_hero_settings',
        'type'    => 'checkbox',
    ) );

    $wp_customize->add_setting( 'ibdhh_hero_mask_opacity', array(
        'default'           => 0.5,
        'sanitize_callback' => 'floatval',
    ) );
    $wp_customize->add_control( 'ibdhh_hero_mask_opacity', array(
        'label'       => __( 'Overlay Opacity (0.0 - 1.0)', 'ibd-health-hub' ),
        'section'     => 'ibdhh_hero_settings',
        'type'        => 'range',
        'input_attrs' => array( 'min' => 0, 'max' => 1, 'step' => 0.1 ),
    ) );

    $wp_customize->add_setting( 'ibdhh_hero_subtitle_color', array(
        'default'           => '#cbd5e1',
        'sanitize_callback' => 'sanitize_hex_color',
    ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'ibdhh_hero_subtitle_color', array(
        'label'   => __( 'Hero Subtitle Color', 'ibd-health-hub' ),
        'section' => 'ibdhh_hero_settings',
    ) ) );

    // 2.5 Discovery Suite Settings (Nested under IBD Theme Settings)
    $wp_customize->add_section( 'ibdhh_discovery_general', array(
        'title'    => __( 'Discovery Engine (General)', 'ibd-health-hub' ),
        'priority' => 31.5,
        'panel'    => 'ibdhh_homepage_panel',
    ) );

    $wp_customize->add_section( 'ibdhh_discovery_reading', array(
        'title'    => __( 'Discovery Engine (Reading Levels)', 'ibd-health-hub' ),
        'panel'    => 'ibdhh_homepage_panel',
        'priority' => 31.6,
    ) );

    $wp_customize->add_section( 'ibdhh_discovery_type', array(
        'title'    => __( 'Discovery Engine (Content Types)', 'ibd-health-hub' ),
        'panel'    => 'ibdhh_homepage_panel',
        'priority' => 31.7,
    ) );

    $wp_customize->add_section( 'ibdhh_discovery_path', array(
        'title'    => __( 'Discovery Engine (Healthcare Pathways)', 'ibd-health-hub' ),
        'panel'    => 'ibdhh_homepage_panel',
        'priority' => 31.8,
    ) );

    $wp_customize->add_section( 'ibdhh_discovery_focus', array(
        'title'    => __( 'Discovery Engine (IBD Research Focus)', 'ibd-health-hub' ),
        'panel'    => 'ibdhh_homepage_panel',
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
        $wp_customize->get_section('ibdhh_discovery_reading')->description = __('No tags found with "reading-" prefix. Please create tags like "reading-novice" in the WordPress admin to see options here.', 'ibd-health-hub');
    }
    
    foreach ($reading_tags as $tag) {
        // Show/Hide Toggle
        $wp_customize->add_setting("ibdhh_discovery_reading_show_{$tag->term_id}", array(
            'default'           => false,
            'sanitize_callback' => 'ibdhh_sanitize_checkbox',
        ));
        $wp_customize->add_control("ibdhh_discovery_reading_show_{$tag->term_id}", array(
            'label'   => sprintf(__('Show: %s', 'ibd-health-hub'), $tag->name),
            'section' => 'ibdhh_discovery_reading',
            'type'    => 'checkbox',
        ));
        
        // Display Text
        $wp_customize->add_setting("ibdhh_discovery_reading_text_{$tag->term_id}", array(
            'default'           => str_replace('reading-', '', $tag->name),
            'sanitize_callback' => 'sanitize_text_field',
        ));
        $wp_customize->add_control("ibdhh_discovery_reading_text_{$tag->term_id}", array(
            'label'   => sprintf(__('Display Text: %s', 'ibd-health-hub'), $tag->name),
            'section' => 'ibdhh_discovery_reading',
            'type'    => 'text',
        ));
        
        // Display Order
        $wp_customize->add_setting("ibdhh_discovery_reading_order_{$tag->term_id}", array(
            'default'           => 10,
            'sanitize_callback' => 'absint',
        ));
        $wp_customize->add_control("ibdhh_discovery_reading_order_{$tag->term_id}", array(
            'label'   => sprintf(__('Order: %s', 'ibd-health-hub'), $tag->name),
            'section' => 'ibdhh_discovery_reading',
            'type'    => 'number',
        ));
    }
    
    // Content Type Categories
    foreach ($categories as $cat) {
        // Show/Hide Toggle
        $wp_customize->add_setting("ibdhh_discovery_type_show_{$cat->term_id}", array(
            'default'           => false,
            'sanitize_callback' => 'ibdhh_sanitize_checkbox',
        ));
        $wp_customize->add_control("ibdhh_discovery_type_show_{$cat->term_id}", array(
            'label'   => sprintf(__('Show: %s', 'ibd-health-hub'), $cat->name),
            'section' => 'ibdhh_discovery_type',
            'type'    => 'checkbox',
        ));
        
        // Display Text
        $wp_customize->add_setting("ibdhh_discovery_type_text_{$cat->term_id}", array(
            'default'           => $cat->name,
            'sanitize_callback' => 'sanitize_text_field',
        ));
        $wp_customize->add_control("ibdhh_discovery_type_text_{$cat->term_id}", array(
            'label'   => sprintf(__('Display Text: %s', 'ibd-health-hub'), $cat->name),
            'section' => 'ibdhh_discovery_type',
            'type'    => 'text',
        ));
        
        // Display Order
        $wp_customize->add_setting("ibdhh_discovery_type_order_{$cat->term_id}", array(
            'default'           => 10,
            'sanitize_callback' => 'absint',
        ));
        $wp_customize->add_control("ibdhh_discovery_type_order_{$cat->term_id}", array(
            'label'   => sprintf(__('Order: %s', 'ibd-health-hub'), $cat->name),
            'section' => 'ibdhh_discovery_type',
            'type'    => 'number',
        ));
    }
    
    // IBD Research Path Tags (path- prefix)
    if (empty($path_tags)) {
        $wp_customize->get_section('ibdhh_discovery_path')->description = __('No tags found with "path-" prefix. Please create tags like "path-clinical" in the WordPress admin to see options here.', 'ibd-health-hub');
    }
    
    foreach ($path_tags as $tag) {
        // Show/Hide Toggle
        $wp_customize->add_setting("ibdhh_discovery_path_show_{$tag->term_id}", array(
            'default'           => false,
            'sanitize_callback' => 'ibdhh_sanitize_checkbox',
        ));
        $wp_customize->add_control("ibdhh_discovery_path_show_{$tag->term_id}", array(
            'label'   => sprintf(__('Show: %s', 'ibd-health-hub'), $tag->name),
            'section' => 'ibdhh_discovery_path',
            'type'    => 'checkbox',
        ));
        
        // Display Text
        $wp_customize->add_setting("ibdhh_discovery_path_text_{$tag->term_id}", array(
            'default'           => str_replace('path-', '', $tag->name),
            'sanitize_callback' => 'sanitize_text_field',
        ));
        $wp_customize->add_control("ibdhh_discovery_path_text_{$tag->term_id}", array(
            'label'   => sprintf(__('Display Text: %s', 'ibd-health-hub'), $tag->name),
            'section' => 'ibdhh_discovery_path',
            'type'    => 'text',
        ));
        
        // Display Order
        $wp_customize->add_setting("ibdhh_discovery_path_order_{$tag->term_id}", array(
            'default'           => 10,
            'sanitize_callback' => 'absint',
        ));
        $wp_customize->add_control("ibdhh_discovery_path_order_{$tag->term_id}", array(
            'label'   => sprintf(__('Order: %s', 'ibd-health-hub'), $tag->name),
            'section' => 'ibdhh_discovery_path',
            'type'    => 'number',
        ));
    }
    
    // IBD Research Focus Tags (indication- prefix)
    if (empty($indication_tags)) {
        $wp_customize->get_section('ibdhh_discovery_focus')->description = __('No tags found with "indication-" prefix. Please create tags like "indication-cardio" in the WordPress admin to see options here.', 'ibd-health-hub');
    }
    
    foreach ($indication_tags as $tag) {
        // Show/Hide Toggle
        $wp_customize->add_setting("ibdhh_discovery_focus_show_{$tag->term_id}", array(
            'default'           => false,
            'sanitize_callback' => 'ibdhh_sanitize_checkbox',
        ));
        $wp_customize->add_control("ibdhh_discovery_focus_show_{$tag->term_id}", array(
            'label'   => sprintf(__('Show: %s', 'ibd-health-hub'), $tag->name),
            'section' => 'ibdhh_discovery_focus',
            'type'    => 'checkbox',
        ));
        
        // Display Text
        $wp_customize->add_setting("ibdhh_discovery_focus_text_{$tag->term_id}", array(
            'default'           => str_replace('indication-', '', $tag->name),
            'sanitize_callback' => 'sanitize_text_field',
        ));
        $wp_customize->add_control("ibdhh_discovery_focus_text_{$tag->term_id}", array(
            'label'   => sprintf(__('Display Text: %s', 'ibd-health-hub'), $tag->name),
            'section' => 'ibdhh_discovery_focus',
            'type'    => 'text',
        ));
        
        // Display Order
        $wp_customize->add_setting("ibdhh_discovery_focus_order_{$tag->term_id}", array(
            'default'           => 10,
            'sanitize_callback' => 'absint',
        ));
        $wp_customize->add_control("ibdhh_discovery_focus_order_{$tag->term_id}", array(
            'label'   => sprintf(__('Order: %s', 'ibd-health-hub'), $tag->name),
            'section' => 'ibdhh_discovery_focus',
            'type'    => 'number',
        ));
    }

    // 2.6 Pathway Tile Settings
    $wp_customize->add_section( 'ibdhh_pathway_tiles_settings', array(
        'title'    => __( 'Pathway Tiles', 'ibd-health-hub' ),
        'priority' => 31.6,
        'panel'    => 'ibdhh_homepage_panel',
    ) );

    // Practitioner Tile
    $wp_customize->add_setting( 'ibdhh_practitioner_tile_title', array(
        'default'           => 'For Practitioners',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_practitioner_tile_title', array(
        'label'   => __( 'Practitioner Tile Title', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_tiles_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'ibdhh_practitioner_tile_desc', array(
        'default'           => 'Access clinical reviews, evidence-based guidelines, and professional tools tailored for modern healthcare practitioners.',
        'sanitize_callback' => 'sanitize_textarea_field',
    ) );
    $wp_customize->add_control( 'ibdhh_practitioner_tile_desc', array(
        'label'   => __( 'Practitioner Tile Description', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_tiles_settings',
        'type'    => 'textarea',
    ) );

    $wp_customize->add_setting( 'ibdhh_practitioner_tile_extra', array(
        'default'           => 'Bridging science and clinical outcomes',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_practitioner_tile_extra', array(
        'label'   => __( 'Practitioner Tile Extra Font Text', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_tiles_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'ibdhh_practitioner_tile_image', array(
        'default'           => '',
        'sanitize_callback' => 'esc_url_raw',
    ) );
    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, 'ibdhh_practitioner_tile_image', array(
        'label'   => __( 'Practitioner Tile Bottom Image', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_tiles_settings',
    ) ) );

    // Patient Tile
    $wp_customize->add_setting( 'ibdhh_patient_tile_title', array(
        'default'           => 'For Patients',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_patient_tile_title', array(
        'label'   => __( 'Patient Tile Title', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_tiles_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'ibdhh_patient_tile_desc', array(
        'default'           => 'Learn about chronic conditions, health optimization, and healthy living through our expert-led patient curriculum.',
        'sanitize_callback' => 'sanitize_textarea_field',
    ) );
    $wp_customize->add_control( 'ibdhh_patient_tile_desc', array(
        'label'   => __( 'Patient Tile Description', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_tiles_settings',
        'type'    => 'textarea',
    ) );

    $wp_customize->add_setting( 'ibdhh_patient_tile_extra', array(
        'default'           => 'Empowering your health journey daily',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_patient_tile_extra', array(
        'label'   => __( 'Patient Tile Extra Font Text', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_tiles_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'ibdhh_patient_tile_image', array(
        'default'           => '',
        'sanitize_callback' => 'esc_url_raw',
    ) );
    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, 'ibdhh_patient_tile_image', array(
        'label'   => __( 'Patient Tile Bottom Image', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_tiles_settings',
    ) ) );

    $wp_customize->add_setting( 'ibdhh_practitioner_tile_link', array( 'default' => '/healthcare-professionals/', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_practitioner_tile_link', array( 'label' => 'Practitioner Tile Link', 'section' => 'ibdhh_pathway_tiles_settings', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_patient_tile_link', array( 'default' => '/patients/', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_patient_tile_link', array( 'label' => 'Patient Tile Link', 'section' => 'ibdhh_pathway_tiles_settings', 'type' => 'text' ) );

    // Border Radius Controls - Patient
    $wp_customize->add_setting( 'ibdhh_patient_tile_radius', array(
        'default'           => 16,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'ibdhh_patient_tile_radius', array(
        'label'   => __( 'Patient Tile Radius (px)', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_tiles_settings',
        'type'    => 'number',
        'input_attrs' => array( 'min' => 0, 'max' => 100 ),
    ) );

    $wp_customize->add_setting( 'ibdhh_patient_image_radius', array(
        'default'           => 8,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'ibdhh_patient_image_radius', array(
        'label'   => __( 'Patient Image Radius (px)', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_tiles_settings',
        'type'    => 'number',
        'input_attrs' => array( 'min' => 0, 'max' => 100 ),
    ) );

    // Border Radius Controls - Practitioner
    $wp_customize->add_setting( 'ibdhh_practitioner_tile_radius', array(
        'default'           => 16,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'ibdhh_practitioner_tile_radius', array(
        'label'   => __( 'Practitioner Tile Radius (px)', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_tiles_settings',
        'type'    => 'number',
        'input_attrs' => array( 'min' => 0, 'max' => 100 ),
    ) );

    $wp_customize->add_setting( 'ibdhh_practitioner_image_radius', array(
        'default'           => 8,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'ibdhh_practitioner_image_radius', array(
        'label'   => __( 'Practitioner Image Radius (px)', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_tiles_settings',
        'type'    => 'number',
        'input_attrs' => array( 'min' => 0, 'max' => 100 ),
    ) );

    // Pathway card hover colour
    $wp_customize->add_setting( 'ibdhh_pathway_card_hover_color', array(
        'default'           => '#9F2B68',
        'sanitize_callback' => 'sanitize_hex_color',
    ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'ibdhh_pathway_card_hover_color', array(
        'label'       => __( 'Card Hover Background Colour', 'ibd-health-hub' ),
        'description' => __( 'Background colour applied to pathway cards on hover. Text and icon automatically invert to white.', 'ibd-health-hub' ),
        'section'     => 'ibdhh_pathway_tiles_settings',
    ) ) );

    // Pathway section label
    $wp_customize->add_setting( 'ibdhh_pathway_who_label', array(
        'default'           => 'Who Am I?',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_pathway_who_label', array(
        'label'   => __( 'Section Label', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_tiles_settings',
        'type'    => 'text',
    ) );

    // Pathway card icon background colour
    $wp_customize->add_setting( 'ibdhh_pathway_icon_bg_color', array(
        'default'           => '#0F172A',
        'sanitize_callback' => 'sanitize_hex_color',
    ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'ibdhh_pathway_icon_bg_color', array(
        'label'       => __( 'Icon Initial Background Colour', 'ibd-health-hub' ),
        'section'     => 'ibdhh_pathway_tiles_settings',
    ) ) );

    // Pathway card icon hover background colour
    $wp_customize->add_setting( 'ibdhh_pathway_icon_hover_bg_color', array(
        'default'           => 'rgba(255,255,255,0.2)',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_pathway_icon_hover_bg_color', array(
        'label'       => __( 'Icon Hover Background Colour (Hex or RGBA)', 'ibd-health-hub' ),
        'section'     => 'ibdhh_pathway_tiles_settings',
        'type'        => 'text',
    ) );

    // 2.6.5 Latest Content Grid Settings (Right side of Pathway section)
    $wp_customize->add_section( 'ibdhh_pathway_latest_settings', array(
        'title'    => __( 'Pathway Section: Latest Content', 'ibd-health-hub' ),
        'priority' => 31.65,
        'panel'    => 'ibdhh_homepage_panel',
    ) );

    $wp_customize->add_setting( 'ibdhh_pathway_latest_title', array(
        'default'           => 'LATEST CONTENT',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_pathway_latest_title', array(
        'label'   => __( 'Grid Title', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_latest_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'ibdhh_pathway_latest_count', array(
        'default'           => 3,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'ibdhh_pathway_latest_count', array(
        'label'   => __( 'Number of Posts', 'ibd-health-hub' ),
        'description' => __( 'The bento layout style works best with 3 items.', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_latest_settings',
        'type'    => 'number',
        'input_attrs' => array( 'min' => 1, 'max' => 10 ),
    ) );

    $wp_customize->add_setting( 'ibdhh_pathway_latest_category', array(
        'default'           => 0,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'ibdhh_pathway_latest_category', array(
        'label'   => __( 'Filter by Category', 'ibd-health-hub' ),
        'description' => __( 'Select a specific category or show latest from all.', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_latest_settings',
        'type'    => 'select',
        'choices' => ibdhh_get_cpt_category_choices(),
    ) );

    $wp_customize->add_setting( 'ibdhh_pathway_latest_show_date', array(
        'default'           => true,
        'sanitize_callback' => 'ibdhh_sanitize_checkbox',
    ) );
    $wp_customize->add_control( 'ibdhh_pathway_latest_show_date', array(
        'label'   => __( 'Show Post Date', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_latest_settings',
        'type'    => 'checkbox',
    ) );

    // Latest Section: Tag Label
    $wp_customize->add_setting( 'ibdhh_latest_tag_label', array(
        'default'           => 'LATEST FROM THE HUB',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_latest_tag_label', array(
        'label'       => __( 'Section Tag Label', 'ibd-health-hub' ),
        'description' => __( 'The small tag displayed above the title.', 'ibd-health-hub' ),
        'section'     => 'ibdhh_pathway_latest_settings',
        'type'        => 'text',
    ) );

    // Latest Section: Text Alignment
    $wp_customize->add_setting( 'ibdhh_latest_text_align', array(
        'default'           => 'left',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_latest_text_align', array(
        'label'   => __( 'Header Text Alignment', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_latest_settings',
        'type'    => 'select',
        'choices' => array(
            'left'   => __( 'Left', 'ibd-health-hub' ),
            'center' => __( 'Center', 'ibd-health-hub' ),
            'right'  => __( 'Right', 'ibd-health-hub' ),
        ),
    ) );

    // Latest Section: Layout Style
    $wp_customize->add_setting( 'ibdhh_latest_layout', array(
        'default'           => 'carousel',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_latest_layout', array(
        'label'       => __( 'Post Layout Style', 'ibd-health-hub' ),
        'description' => __( 'Choose how posts are displayed.', 'ibd-health-hub' ),
        'section'     => 'ibdhh_pathway_latest_settings',
        'type'        => 'select',
        'choices'     => array(
            'carousel' => __( 'Carousel (horizontal scroll)', 'ibd-health-hub' ),
            'bento'    => __( 'Bento Box (featured + grid)', 'ibd-health-hub' ),
            'grid'     => __( 'Grid (equal cards)', 'ibd-health-hub' ),
            'list'     => __( 'List (horizontal rows)', 'ibd-health-hub' ),
        ),
    ) );

    // Latest Section: Show Excerpt
    $wp_customize->add_setting( 'ibdhh_latest_show_excerpt', array(
        'default'           => true,
        'sanitize_callback' => 'ibdhh_sanitize_checkbox',
    ) );
    $wp_customize->add_control( 'ibdhh_latest_show_excerpt', array(
        'label'   => __( 'Show Post Excerpt', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_latest_settings',
        'type'    => 'checkbox',
    ) );

    // Latest Section: Show Category Tag
    $wp_customize->add_setting( 'ibdhh_latest_show_category', array(
        'default'           => true,
        'sanitize_callback' => 'ibdhh_sanitize_checkbox',
    ) );
    $wp_customize->add_control( 'ibdhh_latest_show_category', array(
        'label'   => __( 'Show Category Tag on Cards', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_latest_settings',
        'type'    => 'checkbox',
    ) );

    // Section background color
    $wp_customize->add_setting( 'ibdhh_latest_section_bg', array(
        'default'           => '#F8FAFC',
        'sanitize_callback' => 'sanitize_hex_color',
    ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'ibdhh_latest_section_bg', array(
        'label'   => __( 'Section Background Color', 'ibd-health-hub' ),
        'section' => 'ibdhh_pathway_latest_settings',
    ) ) );

    // 2.7 Knowledgebase Mini-Hero Section
    $wp_customize->add_section( 'ibdhh_kb_mini_hero', array(
        'title'    => __( 'Knowledge Base Mini-Hero', 'ibd-health-hub' ),
        'priority' => 31.7,
        'panel'    => 'ibdhh_content_panel',
    ) );

    $wp_customize->add_setting( 'ibdhh_kb_mini_hero_title', array( 'default' => 'IBD Research KNOWLEDGEBASE', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_kb_mini_hero_title', array( 'label' => 'Main Title Text', 'section' => 'ibdhh_kb_mini_hero', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_kb_mini_hero_subtitle', array( 'default' => 'Catch Up on the Latest Articles and More...', 'sanitize_callback' => 'sanitize_textarea_field' ) );
    $wp_customize->add_control( 'ibdhh_kb_mini_hero_subtitle', array( 'label' => 'Subtitle Text', 'section' => 'ibdhh_kb_mini_hero', 'type' => 'textarea' ) );

    $wp_customize->add_setting( 'ibdhh_kb_mini_hero_bg', array( 'default' => '', 'sanitize_callback' => 'esc_url_raw' ) );
    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, 'ibdhh_kb_mini_hero_bg', array( 'label' => 'Background Image', 'section' => 'ibdhh_kb_mini_hero' ) ) );

    $wp_customize->add_setting( 'ibdhh_kb_mini_hero_font_color', array( 'default' => '#ffffff', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'ibdhh_kb_mini_hero_font_color', array( 'label' => 'Font Color', 'section' => 'ibdhh_kb_mini_hero' ) ) );

    $wp_customize->add_setting( 'ibdhh_kb_mini_hero_height', array( 'default' => '', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_kb_mini_hero_height', array( 'label' => 'Min-Height (px)', 'section' => 'ibdhh_kb_mini_hero', 'type' => 'number' ) );
    
    $wp_customize->add_setting( 'ibdhh_kb_mini_hero_padding', array( 'default' => '60px 0 80px', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_kb_mini_hero_padding', array( 'label' => 'Padding (e.g. 60px 0 80px)', 'section' => 'ibdhh_kb_mini_hero', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_kb_mini_hero_opacity', array( 'default' => 80, 'sanitize_callback' => 'absint' ) );
    $wp_customize->add_control( 'ibdhh_kb_mini_hero_opacity', array( 'label' => 'Overlay Opacity (%)', 'section' => 'ibdhh_kb_mini_hero', 'type' => 'range', 'input_attrs' => array( 'min' => 0, 'max' => 100, 'step' => 5 ) ) );

    // 2.8 Join the Hub Section
    $wp_customize->add_section( 'ibdhh_join_community', array(
        'title'    => __( 'Join the Hub Block', 'ibd-health-hub' ),
        'priority' => 31.8,
        'panel'    => 'ibdhh_content_panel',
    ) );

    $wp_customize->add_setting( 'ibdhh_join_title', array(
        'default'           => 'Join the Hub',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_join_title', array(
        'label'   => __( 'Main Title', 'ibd-health-hub' ),
        'section' => 'ibdhh_join_community',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'ibdhh_join_subtitle', array(
        'default'           => 'Select your role to get started with a personalized experience.',
        'sanitize_callback' => 'sanitize_textarea_field',
    ) );
    $wp_customize->add_control( 'ibdhh_join_subtitle', array(
        'label'   => __( 'Subtitle', 'ibd-health-hub' ),
        'section' => 'ibdhh_join_community',
        'type'    => 'textarea',
    ) );

    $wp_customize->add_setting( 'ibdhh_join_practitioner_label', array(
        'default'           => "I'm a Healthcare Practitioner",
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_join_practitioner_label', array(
        'label'   => __( 'Practitioner Checkbox Label', 'ibd-health-hub' ),
        'section' => 'ibdhh_join_community',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'ibdhh_join_patient_label', array(
        'default'           => "I'm a Patient / Caregiver",
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_join_patient_label', array(
        'label'   => __( 'Patient Checkbox Label', 'ibd-health-hub' ),
        'section' => 'ibdhh_join_community',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'ibdhh_join_button_text', array(
        'default'           => 'REGISTER NOW',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_join_button_text', array(
        'label'   => __( 'Button Text', 'ibd-health-hub' ),
        'section' => 'ibdhh_join_community',
        'type'    => 'text',
    ) );


    // 2.9 Ask AI Settings
    $wp_customize->add_section( 'ibdhh_askai_settings', array(
        'title'    => __( 'Ask AI Configuration', 'ibd-health-hub' ),
        'priority' => 31.9,
        'panel'    => 'ibdhh_content_panel',
    ) );

    // Hero Settings
    $wp_customize->add_setting( 'ibdhh_askai_hero_bg', array(
        'default'           => '',
        'sanitize_callback' => 'esc_url_raw',
    ) );
    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, 'ibdhh_askai_hero_bg', array(
        'label'   => __( 'Hero Background Image', 'ibd-health-hub' ),
        'section' => 'ibdhh_askai_settings',
    ) ) );

    $wp_customize->add_setting( 'ibdhh_askai_hero_title', array(
        'default'           => 'Clinical AI Assistant',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_askai_hero_title', array(
        'label'   => __( 'Hero Title', 'ibd-health-hub' ),
        'section' => 'ibdhh_askai_settings',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'ibdhh_askai_hero_subtitle', array(
        'default'           => 'Ask complex clinical questions and get evidence-based answers instantly.',
        'sanitize_callback' => 'sanitize_textarea_field',
    ) );
    $wp_customize->add_control( 'ibdhh_askai_hero_subtitle', array(
        'label'   => __( 'Hero Subtitle', 'ibd-health-hub' ),
        'section' => 'ibdhh_askai_settings',
        'type'    => 'textarea',
    ) );

    $wp_customize->add_setting( 'ibdhh_askai_hero_badge', array(
        'default'           => 'Beta Feature v1.0',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_askai_hero_badge', array(
        'label'   => __( 'Hero Badge Text', 'ibd-health-hub' ),
        'section' => 'ibdhh_askai_settings',
        'type'    => 'text',
    ) );

    // API Credentials
    $wp_customize->add_setting( 'ibdhh_askai_api_key', array(
        'default'           => '',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_askai_api_key', array(
        'label'       => __( 'AI API Key', 'ibd-health-hub' ),
        'description' => __( 'Enter your OpenAI or Anthropic API key', 'ibd-health-hub' ),
        'section'     => 'ibdhh_askai_settings',
        'type'        => 'text',
    ) );

    $wp_customize->add_setting( 'ibdhh_askai_api_provider', array(
        'default'           => 'openai',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_askai_api_provider', array(
        'label'   => __( 'AI Provider', 'ibd-health-hub' ),
        'section' => 'ibdhh_askai_settings',
        'type'    => 'select',
        'choices' => array(
            'openai'     => 'OpenAI (GPT-4)',
            'anthropic'  => 'Anthropic (Claude)',
            'google'     => 'Google (Gemini)',
        ),
    ) );

    $wp_customize->add_setting( 'ibdhh_askai_model', array(
        'default'           => 'gpt-4',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_askai_model', array(
        'label'       => __( 'AI Model', 'ibd-health-hub' ),
        'description' => __( 'e.g., gpt-4, claude-3-opus, gemini-pro', 'ibd-health-hub' ),
        'section'     => 'ibdhh_askai_settings',
        'type'        => 'text',
    ) );


    // 4. Dynamic Homepage & Inner Nav Category Cards
    $wp_customize->add_section( 'ibdhh_homepage_categories', array(
        'title'       => __( 'Category Cards', 'ibd-health-hub' ),
        'description' => __( 'Configure display logic for category cards across the site.', 'ibd-health-hub' ),
        'priority'    => 33,
        'panel'       => 'ibdhh_homepage_panel',
    ) );

    // --- HOMEPAGE SPECIFIC ---
    $wp_customize->add_setting( 'ibdhh_homepage_cards_per_row', array(
        'default'           => 6,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'ibdhh_homepage_cards_per_row', array(
        'label'   => __( 'Homepage: Cards Per Row', 'ibd-health-hub' ),
        'section' => 'ibdhh_homepage_categories',
        'type'    => 'number',
        'input_attrs' => array('min' => 1, 'max' => 12),
    ) );

    $wp_customize->add_setting( 'ibdhh_homepage_card_alignment', array(
        'default'           => 'center',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_homepage_card_alignment', array(
        'label'   => __( 'Homepage: Card Alignment', 'ibd-health-hub' ),
        'section' => 'ibdhh_homepage_categories',
        'type'    => 'select',
        'choices' => array(
            'left'   => 'Left',
            'center' => 'Center',
            'right'  => 'Right',
        ),
    ) );

    // --- INNER NAV SPECIFIC ---
    $wp_customize->add_setting( 'ibdhh_show_inner_nav', array(
        'default'           => true,
        'sanitize_callback' => 'ibdhh_sanitize_checkbox',
    ) );
    $wp_customize->add_control( 'ibdhh_show_inner_nav', array(
        'label'   => __( 'Show Inner Page Horizontal Nav', 'ibd-health-hub' ),
        'section' => 'ibdhh_homepage_categories',
        'type'    => 'checkbox',
    ) );

    $wp_customize->add_setting( 'ibdhh_inner_nav_cards_per_row', array(
        'default'           => 8,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'ibdhh_inner_nav_cards_per_row', array(
        'label'   => __( 'Inner Nav: Cards Per Row', 'ibd-health-hub' ),
        'section' => 'ibdhh_homepage_categories',
        'type'    => 'number',
        'input_attrs' => array('min' => 1, 'max' => 16),
    ) );

    $wp_customize->add_setting( 'ibdhh_inner_nav_total_items', array(
        'default'           => 8,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'ibdhh_inner_nav_total_items', array(
        'label'   => __( 'Inner Nav: Total Items to Show', 'ibd-health-hub' ),
        'section' => 'ibdhh_homepage_categories',
        'type'    => 'number',
        'input_attrs' => array('min' => 1, 'max' => 50),
    ) );

    // --- DISCOVERY SUITE STYLING ---
    $wp_customize->add_section( 'ibdhh_discovery_styling', array(
        'title'    => __( 'Discovery Engine (Styling)', 'ibd-health-hub' ),
        'priority' => 32,
        'panel'    => 'ibdhh_homepage_panel',
    ) );

    // ── SECTION HEADER ──
    $wp_customize->add_setting( 'ibdhh_discovery_title_text', array( 'default' => 'Content Discovery Suite', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_discovery_title_text', array( 'label' => 'Main Title Text', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_discovery_subtitle_text', array( 'default' => 'Explore our comprehensive database...', 'sanitize_callback' => 'sanitize_textarea_field' ) );
    $wp_customize->add_control( 'ibdhh_discovery_subtitle_text', array( 'label' => 'Subtitle Text', 'section' => 'ibdhh_discovery_styling', 'type' => 'textarea' ) );

    $wp_customize->add_setting( 'ibdhh_discovery_title_size', array( 'default' => 32, 'sanitize_callback' => 'absint' ) );
    $wp_customize->add_control( 'ibdhh_discovery_title_size', array( 'label' => 'Title Size (px)', 'section' => 'ibdhh_discovery_styling', 'type' => 'range', 'input_attrs' => array('min' => 12, 'max' => 60) ) );

    $wp_customize->add_setting( 'ibdhh_discovery_title_color', array( 'default' => '#0F172A', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'ibdhh_discovery_title_color', array( 'label' => 'Title Color', 'section' => 'ibdhh_discovery_styling' ) ) );

    $wp_customize->add_setting( 'ibdhh_discovery_subtitle_color', array( 'default' => '#64748B', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'ibdhh_discovery_subtitle_color', array( 'label' => 'Subtitle Text Color', 'section' => 'ibdhh_discovery_styling' ) ) );

    $wp_customize->add_setting( 'ibdhh_discovery_title_align', array( 'default' => 'left', 'sanitize_callback' => 'sanitize_key' ) );
    $wp_customize->add_control( 'ibdhh_discovery_title_align', array( 'label' => 'Alignment', 'section' => 'ibdhh_discovery_styling', 'type' => 'select', 'choices' => array('left' => 'Left', 'center' => 'Center', 'right' => 'Right') ));

    // ── PANEL HEADER ("Discovery Filters" bar) ──
    $wp_customize->add_setting( 'ibdhh_discovery_filters_title_size', array( 'default' => 12, 'sanitize_callback' => 'absint' ) );
    $wp_customize->add_control( 'ibdhh_discovery_filters_title_size', array( 'label' => '"Discovery Filters" Title Size (px)', 'section' => 'ibdhh_discovery_styling', 'type' => 'number', 'input_attrs' => array('min' => 8, 'max' => 30) ) );

    $wp_customize->add_setting( 'ibdhh_disc_header_title_color', array( 'default' => '#9F2B68', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_header_title_color', array( 'label' => '"Discovery Filters" Title Color', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_disc_status_dot_color', array( 'default' => '#22c55e', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_status_dot_color', array( 'label' => 'Status Dot Color', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    // ── FILTER LABELS ──
    $wp_customize->add_setting( 'ibdhh_discovery_field_title_size', array( 'default' => 10, 'sanitize_callback' => 'absint' ) );
    $wp_customize->add_control( 'ibdhh_discovery_field_title_size', array( 'label' => 'Filter Label Size (px)', 'section' => 'ibdhh_discovery_styling', 'type' => 'number', 'input_attrs' => array('min' => 8, 'max' => 30) ) );

    $wp_customize->add_setting( 'ibdhh_discovery_field_title_color', array( 'default' => 'rgba(255,255,255,0.4)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_discovery_field_title_color', array( 'label' => 'Filter Label Color', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_discovery_item_label_size', array( 'default' => 13, 'sanitize_callback' => 'absint' ) );
    $wp_customize->add_control( 'ibdhh_discovery_item_label_size', array( 'label' => 'Filter Item Text Size (px)', 'section' => 'ibdhh_discovery_styling', 'type' => 'number', 'input_attrs' => array('min' => 8, 'max' => 30) ) );

    // ── CHIPS (default / hover / selected) ──
    $wp_customize->add_setting( 'ibdhh_disc_chip_bg', array( 'default' => 'rgba(255,255,255,0.06)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_chip_bg', array( 'label' => 'Chip — Background', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_disc_chip_border', array( 'default' => 'rgba(255,255,255,0.12)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_chip_border', array( 'label' => 'Chip — Border', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_disc_chip_text', array( 'default' => 'rgba(255,255,255,0.75)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_chip_text', array( 'label' => 'Chip — Text', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_disc_chip_hover_bg', array( 'default' => 'rgba(159,43,104,0.12)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_chip_hover_bg', array( 'label' => 'Chip Hover — Background', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_disc_chip_hover_border', array( 'default' => '#C75D8E', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_chip_hover_border', array( 'label' => 'Chip Hover — Border', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_disc_chip_hover_text', array( 'default' => '#ffffff', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_chip_hover_text', array( 'label' => 'Chip Hover — Text', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_disc_chip_selected_bg', array( 'default' => 'rgba(159,43,104,0.25)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_chip_selected_bg', array( 'label' => 'Chip Selected — Background', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_disc_chip_selected_border', array( 'default' => '#9F2B68', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_chip_selected_border', array( 'label' => 'Chip Selected — Border', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_disc_chip_selected_text', array( 'default' => '#E6E6FA', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_chip_selected_text', array( 'label' => 'Chip Selected — Text', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    // ── TOGGLES ──
    $wp_customize->add_setting( 'ibdhh_disc_toggle_bg', array( 'default' => 'rgba(255,255,255,0.1)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_toggle_bg', array( 'label' => 'Toggle Off — Background', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_disc_toggle_active_bg', array( 'default' => '#9F2B68', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_toggle_active_bg', array( 'label' => 'Toggle On — Background', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    // ── GO BUTTON ──
    $wp_customize->add_setting( 'ibdhh_disc_go_btn_bg', array( 'default' => '#9F2B68', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'ibdhh_disc_go_btn_bg', array( 'label' => 'GO Button — Gradient Start', 'section' => 'ibdhh_discovery_styling' ) ) );

    $wp_customize->add_setting( 'ibdhh_disc_go_btn_bg_end', array( 'default' => '#7A1F50', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'ibdhh_disc_go_btn_bg_end', array( 'label' => 'GO Button — Gradient End', 'section' => 'ibdhh_discovery_styling' ) ) );

    $wp_customize->add_setting( 'ibdhh_disc_go_btn_hover_bg', array( 'default' => '#B8447A', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'ibdhh_disc_go_btn_hover_bg', array( 'label' => 'GO Button — Hover Start', 'section' => 'ibdhh_discovery_styling' ) ) );

    // ── SECONDARY BUTTONS (Clear / Save) ──
    $wp_customize->add_setting( 'ibdhh_disc_secondary_btn_border', array( 'default' => 'rgba(255,255,255,0.3)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_secondary_btn_border', array( 'label' => 'Clear/Save Button — Border', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_disc_secondary_btn_text', array( 'default' => 'rgba(255,255,255,0.8)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_secondary_btn_text', array( 'label' => 'Clear/Save Button — Text', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_disc_secondary_btn_hover_bg', array( 'default' => 'rgba(159,43,104,0.2)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_secondary_btn_hover_bg', array( 'label' => 'Clear/Save Button — Hover BG', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    // ── KEYWORD INPUT ──
    $wp_customize->add_setting( 'ibdhh_disc_input_bg', array( 'default' => 'rgba(255,255,255,0.08)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_input_bg', array( 'label' => 'Search Input — Background', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_disc_input_border', array( 'default' => 'rgba(255,255,255,0.25)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_input_border', array( 'label' => 'Search Input — Border', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_disc_input_text', array( 'default' => '#ffffff', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_input_text', array( 'label' => 'Search Input — Text Color', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_disc_input_placeholder', array( 'default' => 'rgba(255,255,255,0.4)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_input_placeholder', array( 'label' => 'Search Input — Placeholder Color', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_disc_input_focus_border', array( 'default' => '#9F2B68', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_disc_input_focus_border', array( 'label' => 'Search Input — Focus Border', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ) );

    // ── PANEL CONTAINER ──
    $wp_customize->add_setting( 'ibdhh_discovery_border_color', array( 'default' => '#9F2B68', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'ibdhh_discovery_border_color', array( 'label' => 'Panel Accent Color', 'section' => 'ibdhh_discovery_styling' ) ) );

    $wp_customize->add_setting( 'ibdhh_discovery_button_radius', array( 'default' => 8, 'sanitize_callback' => 'absint' ) );
    $wp_customize->add_control( 'ibdhh_discovery_button_radius', array( 'label' => 'Chip / Button Radius (px)', 'section' => 'ibdhh_discovery_styling', 'type' => 'range', 'input_attrs' => array('min' => 0, 'max' => 40, 'step' => 1) ));

    $wp_customize->add_setting( 'ibdhh_discovery_panel_radius', array( 'default' => 20, 'sanitize_callback' => 'absint' ) );
    $wp_customize->add_control( 'ibdhh_discovery_panel_radius', array( 'label' => 'Panel Radius (px)', 'section' => 'ibdhh_discovery_styling', 'type' => 'range', 'input_attrs' => array('min' => 0, 'max' => 48, 'step' => 2) ));

    $wp_customize->add_setting( 'ibdhh_discovery_section_bg', array( 'default' => 'linear-gradient(160deg, #0F172A 0%, #0F2440 55%, #0F172A 100%)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_discovery_section_bg', array( 'label' => 'Section Background', 'description' => 'CSS color or gradient', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ));

    $wp_customize->add_setting( 'ibdhh_discovery_panel_bg', array( 'default' => 'rgba(255,255,255,0.04)', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_discovery_panel_bg', array( 'label' => 'Panel Background', 'description' => 'CSS color (e.g. rgba(...))', 'section' => 'ibdhh_discovery_styling', 'type' => 'text' ));

    // --- DISCOVERY SUITE GRID LOGIC ---
    $wp_customize->add_setting( 'ibdhh_discovery_path_cols', array(
        'default'           => 4,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'ibdhh_discovery_path_cols', array(
        'label'   => __( 'Discovery: Path Columns', 'ibd-health-hub' ),
        'section' => 'ibdhh_discovery_path',
        'type'    => 'number',
        'input_attrs' => array('min' => 1, 'max' => 6),
    ) );

    $wp_customize->add_setting( 'ibdhh_discovery_type_cols', array(
        'default'           => 6,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'ibdhh_discovery_type_cols', array(
        'label'   => __( 'Discovery: Type Columns', 'ibd-health-hub' ),
        'section' => 'ibdhh_discovery_type',
        'type'    => 'number',
        'input_attrs' => array('min' => 1, 'max' => 10),
    ) );

    // --- INDIVIDUAL CARD CONTROLS ---
    $categories = get_categories( array( 'hide_empty' => false ) );
    foreach ( $categories as $cat ) {
        // Show/Hide Toggle
        $wp_customize->add_setting( "ibdhh_cat_card_show_{$cat->term_id}", array(
            'default'           => true,
            'sanitize_callback' => 'ibdhh_sanitize_checkbox',
        ) );
        $wp_customize->add_control( "ibdhh_cat_card_show_{$cat->term_id}", array(
            'label'   => sprintf( __( 'Show "%s" Card', 'ibd-health-hub' ), $cat->name ),
            'section' => 'ibdhh_homepage_categories',
            'type'    => 'checkbox',
        ) );
        
        // Priority (Order)
        $wp_customize->add_setting( "ibdhh_cat_card_priority_{$cat->term_id}", array(
            'default'           => 10,
            'sanitize_callback' => 'absint',
        ) );
        $wp_customize->add_control( "ibdhh_cat_card_priority_{$cat->term_id}", array(
            'label'       => sprintf( __( '"%s" Priority (Order)', 'ibd-health-hub' ), $cat->name ),
            'description' => __( 'Lower numbers appear first.', 'ibd-health-hub' ),
            'section'     => 'ibdhh_homepage_categories',
            'type'        => 'number',
            'input_attrs' => array( 'min' => 1, 'max' => 100 ),
        ) );
        
        // Custom Icon
        $wp_customize->add_setting( "ibdhh_cat_card_icon_{$cat->term_id}", array(
            'default'           => '',
            'sanitize_callback' => 'esc_url_raw',
        ) );
        $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, "ibdhh_cat_card_icon_{$cat->term_id}", array(
            'label'       => sprintf( __( '"%s" Icon', 'ibd-health-hub' ), $cat->name ),
            'description' => __( 'Optional: Upload custom icon (recommended: 48x48px PNG).', 'ibd-health-hub' ),
            'section'     => 'ibdhh_homepage_categories',
        ) ) );
    }

    // 4. Social API Settings Section
    $wp_customize->add_section( 'ibdhh_social_api', array(
        'title'       => __( 'Social API Settings', 'ibd-health-hub' ),
        'description' => __( 'Configure the webhook URL for social media automation (e.g. Make/Zapier).', 'ibd-health-hub' ),
        'priority'    => 33,
        'panel'       => 'ibdhh_advanced_panel',
    ) );

    $wp_customize->add_setting( 'ibdhh_social_webhook_url', array(
        'default'           => '',
        'sanitize_callback' => 'esc_url_raw',
    ) );

    $wp_customize->add_control( 'ibdhh_social_webhook_url', array(
        'label'   => __( 'Automation Webhook URL', 'ibd-health-hub' ),
        'section' => 'ibdhh_social_api',
        'type'    => 'url',
    ) );

    // 4.5 Newsletter Settings
    $wp_customize->add_section( 'ibdhh_newsletter', array(
        'title'       => __( 'Newsletter', 'ibd-health-hub' ),
        'priority'    => 33,
        'panel'       => 'ibdhh_footer_panel',
    ) );

    $wp_customize->add_setting( 'ibdhh_newsletter_action', array(
        'default'           => '',
        'sanitize_callback' => 'esc_url_raw',
    ) );
    $wp_customize->add_control( 'ibdhh_newsletter_action', array(
        'label'       => __( 'Form Action URL', 'ibd-health-hub' ),
        'description' => __( 'Mailchimp/Hubspot form action URL.', 'ibd-health-hub' ),
        'section'     => 'ibdhh_newsletter',
        'type'        => 'url',
    ) );

    $wp_customize->add_setting( 'ibdhh_newsletter_heading', array(
        'default'           => 'Join the Hub',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_newsletter_heading', array(
        'label'   => __( 'Heading', 'ibd-health-hub' ),
        'section' => 'ibdhh_newsletter',
        'type'    => 'text',
    ) );

    $wp_customize->add_setting( 'ibdhh_newsletter_desc', array(
        'default'           => 'Get the latest clinical reviews and tools.',
        'sanitize_callback' => 'sanitize_textarea_field',
    ) );
    $wp_customize->add_control( 'ibdhh_newsletter_desc', array(
        'label'   => __( 'Description', 'ibd-health-hub' ),
        'section' => 'ibdhh_newsletter',
        'type'    => 'textarea',
    ) );

    // 4.6 Footer Brand & Widgets
    $wp_customize->add_section( 'ibdhh_footer_brand', array(
        'title'       => __( 'Brand & Widgets', 'ibd-health-hub' ),
        'priority'    => 33.5,
        'panel'       => 'ibdhh_footer_panel',
    ) );

    $wp_customize->add_setting( 'ibdhh_footer_logo', array( 'default' => '', 'sanitize_callback' => 'esc_url_raw' ) );
    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, 'ibdhh_footer_logo', array( 'label' => 'Footer Logo Image', 'section' => 'ibdhh_footer_brand' ) ) );

    $wp_customize->add_setting( 'ibdhh_footer_brand_text', array( 'default' => 'Advancing IBD Research knowledge and tools transforming the modern healthcare environment.', 'sanitize_callback' => 'sanitize_textarea_field' ) );
    $wp_customize->add_control( 'ibdhh_footer_brand_text', array( 'label' => 'Brand Text below Logo', 'section' => 'ibdhh_footer_brand', 'type' => 'textarea' ) );

    $wp_customize->add_setting( 'ibdhh_footer_copyright', array( 'default' => '(c) 2024 IBD Health Hub. All rights reserved.', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_footer_copyright', array( 'label' => 'Copyright Text', 'section' => 'ibdhh_footer_brand', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_footer_heading_col1', array( 'default' => 'Topics', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_footer_heading_col1', array( 'label' => 'Column 1 Heading', 'section' => 'ibdhh_footer_brand', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_footer_heading_col2', array( 'default' => 'For Professionals', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_footer_heading_col2', array( 'label' => 'Column 2 Heading', 'section' => 'ibdhh_footer_brand', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_footer_heading_col3', array( 'default' => 'For Patients', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_footer_heading_col3', array( 'label' => 'Column 3 Heading', 'section' => 'ibdhh_footer_brand', 'type' => 'text' ) );

    // 5. Category Hero Overrides Section
    $wp_customize->add_section( 'ibdhh_category_heroes', array(
        'title'       => __( 'Category Heroes', 'ibd-health-hub' ),
        'description' => __( 'Set unique hero images, taglines, and titles for specific categories.', 'ibd-health-hub' ),
        'priority'    => 34,
        'panel'       => 'ibdhh_content_panel',
    ) );

    foreach ( $categories as $cat ) {
        // Hero Image
        $wp_customize->add_setting( "ibdhh_cat_hero_{$cat->term_id}", array(
            'default'           => '',
            'sanitize_callback' => 'esc_url_raw',
        ) );
        $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, "ibdhh_cat_hero_{$cat->term_id}", array(
            'label'   => sprintf( __( '%s: Hero Image', 'ibd-health-hub' ), $cat->name ),
            'section' => 'ibdhh_category_heroes',
        ) ) );

        // Tagline
        $wp_customize->add_setting( "ibdhh_cat_tagline_{$cat->term_id}", array(
            'default'           => '',
            'sanitize_callback' => 'sanitize_text_field',
        ) );
        $wp_customize->add_control( "ibdhh_cat_tagline_{$cat->term_id}", array(
            'label'   => sprintf( __( '%s: Tagline', 'ibd-health-hub' ), $cat->name ),
            'section' => 'ibdhh_category_heroes',
            'type'    => 'text',
        ) );

        // Title Override (New)
        $wp_customize->add_setting( "ibdhh_cat_title_{$cat->term_id}", array(
            'default'           => '',
            'sanitize_callback' => 'sanitize_text_field',
        ) );
        $wp_customize->add_control( "ibdhh_cat_title_{$cat->term_id}", array(
            'label'   => sprintf( __( '%s: Title Override', 'ibd-health-hub' ), $cat->name ),
            'section' => 'ibdhh_category_heroes',
            'type'    => 'text',
        ) );
    }

    // 6. Homepage Section Ordering
    $wp_customize->add_section( 'ibdhh_homepage_order', array(
        'title'    => __( 'Section Order', 'ibd-health-hub' ),
        'priority' => 35,
        'panel'    => 'ibdhh_homepage_panel',
    ) );

    $wp_customize->add_setting( 'ibdhh_homepage_section_order', array(
        'default'           => 'hero,pathway,promo,cats,discovery,kb,testimonials',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_homepage_section_order', array(
        'label'       => __( 'Section Order (Comma-separated IDs)', 'ibd-health-hub' ),
        'description' => __( 'IDs: hero, pathway, promo, cats, discovery, kb, testimonials', 'ibd-health-hub' ),
        'section'     => 'ibdhh_homepage_order',
        'type'        => 'text',
    ) );

    // 6b. Homepage Section Visibility Toggles
    $wp_customize->add_section( 'ibdhh_homepage_visibility', array(
        'title'    => __( 'Section Visibility', 'ibd-health-hub' ),
        'priority' => 36,
        'panel'    => 'ibdhh_homepage_panel',
    ) );

    $visibility_sections = array(
        'hero'         => array( 'Show Hero Section', true ),
        'pathway'      => array( 'Show Journey Pillars & Latest Content', true ),
        'stats'        => array( 'Show Stats Counter Bar', true ),
        'cats'         => array( 'Show Browse by Topic', true ),
        'tools'        => array( 'Show Featured Tools', true ),
        'discovery'    => array( 'Show Content Discovery Suite', true ),
        'quiz_cta'     => array( 'Show Quiz CTA', true ),
        'kb'           => array( 'Show Knowledge Base', true ),
        'testimonials' => array( 'Show Testimonials', true ),
    );

    foreach ( $visibility_sections as $key => $config ) {
        $wp_customize->add_setting( "ibdhh_show_section_{$key}", array(
            'default'           => $config[1],
            'sanitize_callback' => 'ibdhh_sanitize_checkbox',
        ) );
        $wp_customize->add_control( "ibdhh_show_section_{$key}", array(
            'label'   => $config[0],
            'section' => 'ibdhh_homepage_visibility',
            'type'    => 'checkbox',
        ) );
    }

    // 7. Promo Content Block (New)
    $wp_customize->add_section( 'ibdhh_promo_block', array(
        'title'    => __( 'Promo Block', 'ibd-health-hub' ),
        'priority' => 31.55,
        'panel'    => 'ibdhh_homepage_panel',
    ) );

    $wp_customize->add_setting( 'ibdhh_promo_show', array( 'default' => false, 'sanitize_callback' => 'ibdhh_sanitize_checkbox' ) );
    $wp_customize->add_control( 'ibdhh_promo_show', array( 'label' => 'Show Promo Block', 'section' => 'ibdhh_promo_block', 'type' => 'checkbox' ) );

    $wp_customize->add_setting( 'ibdhh_promo_heading', array( 'default' => 'Experience the Hub', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_promo_heading', array( 'label' => 'Heading', 'section' => 'ibdhh_promo_block', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_promo_text', array( 'default' => '', 'sanitize_callback' => 'sanitize_textarea_field' ) );
    $wp_customize->add_control( 'ibdhh_promo_text', array( 'label' => 'Body Text', 'section' => 'ibdhh_promo_block', 'type' => 'textarea' ) );

    $wp_customize->add_setting( 'ibdhh_promo_image', array( 'default' => '', 'sanitize_callback' => 'esc_url_raw' ) );
    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, 'ibdhh_promo_image', array( 'label' => 'Promo Image', 'section' => 'ibdhh_promo_block' ) ) );

    $wp_customize->add_setting( 'ibdhh_promo_bg_color', array( 'default' => '#F8FAFC', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'ibdhh_promo_bg_color', array( 'label' => 'Background Color', 'section' => 'ibdhh_promo_block' ) ) );

    $wp_customize->add_setting( 'ibdhh_promo_text_color', array( 'default' => '#0F172A', 'sanitize_callback' => 'sanitize_hex_color' ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, 'ibdhh_promo_text_color', array( 'label' => 'Text Color', 'section' => 'ibdhh_promo_block' ) ) );

    $wp_customize->add_setting( 'ibdhh_promo_button_text', array( 'default' => 'Get Started Now', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_promo_button_text', array( 'label' => 'Button Text', 'section' => 'ibdhh_promo_block', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_promo_button_link', array( 'default' => '', 'sanitize_callback' => 'sanitize_text_field' ) );
    $wp_customize->add_control( 'ibdhh_promo_button_link', array( 'label' => 'Button Link', 'section' => 'ibdhh_promo_block', 'type' => 'text' ) );

    $wp_customize->add_setting( 'ibdhh_promo_width', array( 'default' => 'container', 'sanitize_callback' => 'sanitize_key' ) );
    $wp_customize->add_control( 'ibdhh_promo_width', array( 'label' => 'Width', 'section' => 'ibdhh_promo_block', 'type' => 'select', 'choices' => array('container' => 'Container (Narrow)', 'full' => 'Full Width') ) );

    $wp_customize->add_setting( 'ibdhh_promo_layout', array( 'default' => 'right', 'sanitize_callback' => 'sanitize_key' ) );
    $wp_customize->add_control( 'ibdhh_promo_layout', array( 'label' => 'Image Position', 'section' => 'ibdhh_promo_block', 'type' => 'select', 'choices' => array('left' => 'Left', 'right' => 'Right', 'top' => 'Top') ) );

    // 8. Join Block Settings
    $wp_customize->add_section( 'ibdhh_join_community', array(
        'title'    => __( 'Join Block', 'ibd-health-hub' ),
        'priority' => 31.6,
        'panel'    => 'ibdhh_homepage_panel',
    ) );

    // 8. Join Toggle
    $wp_customize->add_setting( 'ibdhh_join_show', array( 'default' => true, 'sanitize_callback' => 'ibdhh_sanitize_checkbox' ) );
    $wp_customize->add_control( 'ibdhh_join_show', array( 'label' => 'Show "Join the Hub" Block', 'section' => 'ibdhh_join_community', 'type' => 'checkbox' ) );

    // 6. Dynamic Knowledgebase Sections
    $wp_customize->add_section( 'ibdhh_knowledgebase_sections', array(
        'title'       => __( 'Knowledge Base', 'ibd-health-hub' ),
        'description' => __( 'Control which categories appear as content sections on the homepage.', 'ibd-health-hub' ),
        'priority'    => 35,
        'panel'       => 'ibdhh_content_panel',
    ) );

    // KB Mini-Hero Settings have been consolidated in the "Knowledge Base Mini-Hero" section above.

    $categories = get_categories( array( 'hide_empty' => false ) );
    
    foreach ( $categories as $cat ) {
        // Show/Hide Toggle
        $wp_customize->add_setting( "ibdhh_kb_show_{$cat->term_id}", array(
            'default'           => true,
            'sanitize_callback' => 'ibdhh_sanitize_checkbox',
        ) );
        $wp_customize->add_control( "ibdhh_kb_show_{$cat->term_id}", array(
            'label'   => sprintf( __( 'Show "%s" Section', 'ibd-health-hub' ), $cat->name ),
            'section' => 'ibdhh_knowledgebase_sections',
            'type'    => 'checkbox',
        ) );
        
        // Priority (Order)
        $wp_customize->add_setting( "ibdhh_kb_priority_{$cat->term_id}", array(
            'default'           => 10,
            'sanitize_callback' => 'absint',
        ) );
        $wp_customize->add_control( "ibdhh_kb_priority_{$cat->term_id}", array(
            'label'       => sprintf( __( '"%s" Priority (Order)', 'ibd-health-hub' ), $cat->name ),
            'description' => __( 'Lower numbers appear first.', 'ibd-health-hub' ),
            'section'     => 'ibdhh_knowledgebase_sections',
            'type'        => 'number',
            'input_attrs' => array( 'min' => 1, 'max' => 100 ),
        ) );
        
        // Description
        $wp_customize->add_setting( "ibdhh_kb_desc_{$cat->term_id}", array(
            'default'           => $cat->description,
            'sanitize_callback' => 'sanitize_textarea_field',
        ) );
        $wp_customize->add_control( "ibdhh_kb_desc_{$cat->term_id}", array(
            'label'   => sprintf( __( '"%s" Description', 'ibd-health-hub' ), $cat->name ),
            'section' => 'ibdhh_knowledgebase_sections',
            'type'    => 'textarea',
        ) );
        
        // Post Count
        $wp_customize->add_setting( "ibdhh_kb_count_{$cat->term_id}", array(
            'default'           => 4,
            'sanitize_callback' => 'absint',
        ) );
        $wp_customize->add_control( "ibdhh_kb_count_{$cat->term_id}", array(
            'label'       => sprintf( __( '"%s" Number of Posts', 'ibd-health-hub' ), $cat->name ),
            'section'     => 'ibdhh_knowledgebase_sections',
            'type'        => 'number',
            'input_attrs' => array( 'min' => 1, 'max' => 12, 'step' => 1 ),
        ) );
        
        $wp_customize->add_setting( "ibdhh_kb_view_all_{$cat->term_id}", array(
            'default'           => 'View All',
            'sanitize_callback' => 'sanitize_text_field',
        ) );

        $wp_customize->add_control( "ibdhh_kb_view_all_{$cat->term_id}", array(
            'label'   => sprintf( __( '"%s" View All Label', 'ibd-health-hub' ), $cat->name ),
            'section' => 'ibdhh_knowledgebase_sections',
            'type'    => 'text',
        ) );

        // Layout
        $wp_customize->add_setting( "ibdhh_kb_layout_{$cat->term_id}", array(
            'default'           => 'grid-4',
            'sanitize_callback' => 'sanitize_text_field',
        ) );
        $wp_customize->add_control( "ibdhh_kb_layout_{$cat->term_id}", array(
            'label'   => sprintf( __( '"%s" Layout', 'ibd-health-hub' ), $cat->name ),
            'section' => 'ibdhh_knowledgebase_sections',
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
    $wp_customize->add_section( 'ibdhh_scripts', array(
        'title'       => __( 'Scripts', 'ibd-health-hub' ),
        'priority'    => 40,
        'description' => __( 'Add Google Analytics (GA4), Tag Manager, or other tracking scripts.', 'ibd-health-hub' ),
        'panel'       => 'ibdhh_advanced_panel',
    ) );

    $wp_customize->add_setting( 'ibdhh_header_scripts', array(
        'default'           => '',
        'sanitize_callback' => 'ibdhh_sanitize_scripts', // We need to allow script tags
    ) );
    $wp_customize->add_control( 'ibdhh_header_scripts', array(
        'label'       => __( 'Header Scripts (Before </head>)', 'ibd-health-hub' ),
        'section'     => 'ibdhh_scripts',
        'type'        => 'textarea',
    ) );

    $wp_customize->add_setting( 'ibdhh_footer_scripts', array(
        'default'           => '',
        'sanitize_callback' => 'ibdhh_sanitize_scripts',
    ) );
    $wp_customize->add_control( 'ibdhh_footer_scripts', array(
        'label'       => __( 'Footer Scripts (Before </body>)', 'ibd-health-hub' ),
        'section'     => 'ibdhh_scripts',
        'type'        => 'textarea',
    ) );

    // Move core Site Identity section to our panel
    if ( $wp_customize->get_section( 'title_tagline' ) ) {
        $wp_customize->get_section( 'title_tagline' )->panel = 'ibdhh_brand_panel';
        $wp_customize->get_section( 'title_tagline' )->title = __( 'Site Title & Logo', 'ibd-health-hub' );
    }
}
add_action( 'customize_register', 'ibdhh_customize_register' );

/**
 * Sanitize scripts (allow HTML/Script tags)
 * WARNING: Only for trusted admin users
 */
function ibdhh_sanitize_scripts( $input ) {
    return $input; // Allow everything for admins
}

/**
 * Checkbox sanitization callback
 */
function ibdhh_sanitize_checkbox( $checked ) {
    return ( ( isset( $checked ) && true == $checked ) ? true : false );
}

/**
 * Get category choices for Customizer (all categories)
 */
function ibdhh_get_category_choices() {
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
 * registered in ibdhh_register_cpts() (news, research, oped, etc.).
 */
function ibdhh_get_cpt_category_choices() {
    // Map of CPT slugs => auto-assigned category names (mirrors ibdhh_auto_assign_category)
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
function ibdhh_add_social_share_meta_box() {
    $post_types = array_merge( array( 'post' ), array( 'news', 'research', 'oped', 'review', 'whitepaper', 'podcast', 'webinar', 'course', 'infographic' ) );
    add_meta_box(
        'ibdhh_social_share',
        __( 'Social Media Automation', 'ibd-health-hub' ),
        'ibdhh_render_social_share_meta_box',
        $post_types,
        'side',
        'high'
    );
}
add_action( 'add_meta_boxes', 'ibdhh_add_social_share_meta_box' );

function ibdhh_render_social_share_meta_box( $post ) {
    $share_on_publish = get_post_meta( $post->ID, '_ibdhh_share_on_publish', true );
    $channels = get_post_meta( $post->ID, '_ibdhh_social_channels', true ) ?: array();
    $custom_msg = get_post_meta( $post->ID, '_ibdhh_social_message', true );
    
    wp_nonce_field( 'ibdhh_social_share_save', 'ibdhh_social_share_nonce' );
    ?>
    <div style="margin-top: 10px;">
        <label style="font-weight: 600; display: block; margin-bottom: 8px;">
            <input type="checkbox" name="ibdhh_share_on_publish" value="1" <?php checked( $share_on_publish, '1' ); ?>>
            <?php _e( 'Enable Auto-Post', 'ibd-health-hub' ); ?>
        </label>
        
        <div id="ibd-social-channels" style="margin-left: 24px; margin-bottom: 12px; <?php echo $share_on_publish ? '' : 'display:none;'; ?>">
            <p style="margin-bottom: 4px; font-weight: 600; font-size: 12px; color: #64748b;">Select Channels:</p>
            <label style="display: block; margin-bottom: 4px;">
                <input type="checkbox" name="ibdhh_social_channels[]" value="linkedin" <?php checked( in_array('linkedin', $channels) ); ?>> LinkedIn
            </label>
            <label style="display: block; margin-bottom: 4px;">
                <input type="checkbox" name="ibdhh_social_channels[]" value="twitter" <?php checked( in_array('twitter', $channels) ); ?>> X (Twitter)
            </label>
            <label style="display: block; margin-bottom: 4px;">
                <input type="checkbox" name="ibdhh_social_channels[]" value="facebook" <?php checked( in_array('facebook', $channels) ); ?>> Facebook
            </label>
        </div>

        <div id="ibd-social-message" style="margin-left: 0; margin-top: 12px; <?php echo $share_on_publish ? '' : 'display:none;'; ?>">
            <label style="display: block; margin-bottom: 4px; font-weight: 600; font-size: 12px;">Custom Message (Optional)</label>
            <textarea name="ibdhh_social_message" rows="3" style="width: 100%;" placeholder="Enter custom caption here..."><?php echo esc_textarea( $custom_msg ); ?></textarea>
            <p class="description" style="font-size: 11px;">If empty, the excerpt will be used.</p>
        </div>

        <script>
        jQuery(document).ready(function($) {
            $('input[name="ibdhh_share_on_publish"]').change(function() {
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

function ibdhh_save_social_share_meta( $post_id ) {
    if ( ! isset( $_POST['ibdhh_social_share_nonce'] ) || ! wp_verify_nonce( $_POST['ibdhh_social_share_nonce'], 'ibdhh_social_share_save' ) ) {
        return;
    }
    
    $share = isset( $_POST['ibdhh_share_on_publish'] ) ? '1' : '0';
    update_post_meta( $post_id, '_ibdhh_share_on_publish', $share );
    
    $channels = isset( $_POST['ibdhh_social_channels'] ) ? (array) $_POST['ibdhh_social_channels'] : array();
    update_post_meta( $post_id, '_ibdhh_social_channels', $channels );
    
    if ( isset( $_POST['ibdhh_social_message'] ) ) {
        update_post_meta( $post_id, '_ibdhh_social_message', sanitize_textarea_field( $_POST['ibdhh_social_message'] ) );
    }
}
add_action( 'save_post', 'ibdhh_save_social_share_meta' );

/**
 * Trigger Social Share on Publish
 */
function ibdhh_trigger_social_share( $new_status, $old_status, $post ) {
    if ( 'publish' !== $new_status || 'publish' === $old_status ) {
        return;
    }

    $should_share = get_post_meta( $post->ID, '_ibdhh_share_on_publish', true );
    if ( '1' !== $should_share ) {
        return;
    }

    $webhook_url = get_theme_mod( 'ibdhh_social_webhook_url' );
    if ( empty( $webhook_url ) ) {
        return;
    }
    
    $channels = get_post_meta( $post->ID, '_ibdhh_social_channels', true ) ?: array();
    $custom_msg = get_post_meta( $post->ID, '_ibdhh_social_message', true );
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
add_action( 'transition_post_status', 'ibdhh_trigger_social_share', 10, 3 );
/**
 * Add Custom Roles
 */
function ibdhh_setup_custom_roles() {
    add_role( 'practitioner', __( 'Practitioner', 'ibd-health-hub' ), array(
        'read' => true, 
        'edit_posts' => false,
        'delete_posts' => false,
    ));
    add_role( 'patient', __( 'Patient', 'ibd-health-hub' ), array(
        'read' => true, 
        'edit_posts' => false,
        'delete_posts' => false,
    ));
}
add_action( 'init', 'ibdhh_setup_custom_roles' );

/**
 * Authentication & Redirects
 */

// 1. Custom Login Logo
function ibdhh_login_logo() { 
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
        .wp-core-ui .button-primary { background: #9F2B68; border-color: #9F2B68; }
    </style>
    <?php 
}
add_action( 'login_enqueue_scripts', 'ibdhh_login_logo' );

function ibdhh_login_logo_url() {
    return home_url();
}
add_filter( 'login_headerurl', 'ibdhh_login_logo_url' );

// 2. Login Redirect to Dashboard
function ibdhh_login_redirect( $redirect_to, $request, $user ) {
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
add_filter( 'login_redirect', 'ibdhh_login_redirect', 10, 3 );

/**
 * Default new signups to 'patient' role
 */
function ibdhh_default_user_role_on_register( $user_id ) {
    $user = new WP_User( $user_id );
    $user->set_role( 'patient' );
    
    update_user_meta( $user_id, '_ibdhh_user_type', 'patient' );
    update_user_meta( $user_id, '_ibdhh_dashboard_role', 'patient' );
}
add_action( 'user_register', 'ibdhh_default_user_role_on_register' );

/**
 * Rename 'Subscriber' role to 'Patient'
 */
function ibdhh_rename_subscriber_role() {
    $role = get_role( 'subscriber' );
    if ( $role ) {
        // Just checking if we can safely rename it without global object mutation
        // but actually, maybe it's better to NOT do this if it's causing plugin issues.
    }
}
// add_action( 'init', 'ibdhh_rename_subscriber_role' );

/**
 * Redirect default WP registration to custom registration page
 */
function ibdhh_custom_registration_url($register_url) {
    return home_url('/register/');
}
add_filter('register_url', 'ibdhh_custom_registration_url');

/**
 * Enhanced Login Page Styling
 */
function ibdhh_enhanced_login_styles() {
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
            border-color: #9F2B68;
            box-shadow: 0 0 0 3px rgba(255, 90, 0, 0.1);
        }
        
        .wp-core-ui .button-primary {
            background: #9F2B68;
            border-color: #9F2B68;
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
            color: #9F2B68;
        }
        
        .login .message,
        .login .success {
            background: #F5F0FA;
            border-left: 4px solid #9F2B68;
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
add_action('login_enqueue_scripts', 'ibdhh_enhanced_login_styles');

/**
 * Add "Create Account" link to login page
 */
function ibdhh_add_register_link_to_login() {
    echo '<p style="text-align: center; margin-top: 20px;">
        <a href="' . home_url('/register/') . '" style="color: white; font-weight: 600; text-decoration: none; background: #9F2B68; padding: 10px 24px; border-radius: 0; display: inline-block; box-shadow: 0 4px 12px rgba(255, 90, 0, 0.3);">Create New Account</a>
    </p>';
}
add_action('login_footer', 'ibdhh_add_register_link_to_login');

/**
 * Handle role-based registration redirect
 */
function ibdhh_handle_registration_redirect() {
    if (isset($_GET['role']) && !is_user_logged_in()) {
        $role = sanitize_text_field($_GET['role']);
        if (in_array($role, array('practitioner', 'patient'))) {
            setcookie('ibdhh_pending_role', $role, time() + 3600, '/');
        }
    }
}
add_action('init', 'ibdhh_handle_registration_redirect');

/**
 * Set user role from cookie on registration
 */
function ibdhh_set_role_from_cookie($user_id) {
    if (isset($_COOKIE['ibdhh_pending_role'])) {
        $role = sanitize_text_field($_COOKIE['ibdhh_pending_role']);
        $user = new WP_User($user_id);
        
        if ($role === 'practitioner') {
            $user->set_role('practitioner');
            update_user_meta($user_id, '_ibdhh_user_type', 'practitioner');
            update_user_meta($user_id, '_ibdhh_dashboard_role', 'practitioner');
        } else {
            $user->set_role('subscriber');
            update_user_meta($user_id, '_ibdhh_user_type', 'patient');
            update_user_meta($user_id, '_ibdhh_dashboard_role', 'patient');
        }
        
        // Clear cookie
        setcookie('ibdhh_pending_role', '', time() - 3600, '/');
    }
}
add_action('user_register', 'ibdhh_set_role_from_cookie', 20);

/**
 * Hide Admin Bar for non-administrators
 */
function ibdhh_hide_admin_bar() {
    if ( ! current_user_can( 'administrator' ) ) {
        show_admin_bar( false );
    }
}
add_action( 'after_setup_theme', 'ibdhh_hide_admin_bar' );

/**
 * ==========================================
 * TESTIMONIALS SYSTEM
 * ==========================================
 */

/**
 * 1. Register Testimonial Post Type
 */
function ibdhh_register_testimonial_cpt() {
    $labels = array(
        'name'                  => _x( 'Testimonials', 'Post Type General Name', 'ibd-health-hub' ),
        'singular_name'         => _x( 'Testimonial', 'Post Type Singular Name', 'ibd-health-hub' ),
        'menu_name'             => __( 'Testimonials', 'ibd-health-hub' ),
        'all_items'             => __( 'All Testimonials', 'ibd-health-hub' ),
        'add_new_item'          => __( 'Add New Testimonial', 'ibd-health-hub' ),
        'new_item'              => __( 'New Testimonial', 'ibd-health-hub' ),
    );
    $args = array(
        'label'                 => __( 'Testimonial', 'ibd-health-hub' ),
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
add_action( 'init', 'ibdhh_register_testimonial_cpt' );

/**
 * 2. Add Customizer Settings for Testimonials
 */
function ibdhh_customize_testimonials( $wp_customize ) {
    // Section
    $wp_customize->add_section( 'ibdhh_testimonials_section', array(
        'title'    => __( 'Content: Testimonials', 'ibd-health-hub' ),
        'priority' => 45,
        'panel'    => 'ibdhh_theme_panel',
        'description' => 'Manage the "What Our Community Says" section.'
    ) );

    // Toggle Display
    $wp_customize->add_setting( 'ibdhh_show_testimonials', array(
        'default'           => true,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'ibdhh_show_testimonials', array(
        'label'    => __( 'Show Section', 'ibd-health-hub' ),
        'section'  => 'ibdhh_testimonials_section',
        'type'     => 'checkbox',
    ) );

    // Heading
    $wp_customize->add_setting( 'ibdhh_testimonial_heading', array(
        'default'           => 'What Our Community Says',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_testimonial_heading', array(
        'label'   => __( 'Section Heading', 'ibd-health-hub' ),
        'section' => 'ibdhh_testimonials_section',
        'type'    => 'text',
    ) );

    // Selection Mode
    $wp_customize->add_setting( 'ibdhh_testimonial_select_type', array(
        'default'           => 'latest',
        'sanitize_callback' => 'sanitize_key',
    ) );
    $wp_customize->add_control( 'ibdhh_testimonial_select_type', array(
        'label'   => __( 'Selection Mode', 'ibd-health-hub' ),
        'section' => 'ibdhh_testimonials_section',
        'type'    => 'select',
        'choices' => array(
            'latest' => 'Latest Published',
            'manual' => 'Manual Selection (IDs)'
        )
    ) );

    // Manual IDs
    $wp_customize->add_setting( 'ibdhh_testimonial_ids', array(
        'default'           => '',
        'sanitize_callback' => 'sanitize_text_field',
    ) );
    $wp_customize->add_control( 'ibdhh_testimonial_ids', array(
        'label'       => __( 'Specific Testimonial IDs', 'ibd-health-hub' ),
        'description' => __( 'Comma-separated list (e.g. 104, 156). Ignored if mode is "Latest".', 'ibd-health-hub' ),
        'section'     => 'ibdhh_testimonials_section',
        'type'        => 'text',
    ) );

    // Count
    $wp_customize->add_setting( 'ibdhh_testimonial_count', array(
        'default'           => 3,
        'sanitize_callback' => 'absint',
    ) );
    $wp_customize->add_control( 'ibdhh_testimonial_count', array(
        'label'       => __( 'Number to Show', 'ibd-health-hub' ),
        'section'     => 'ibdhh_testimonials_section',
        'type'    => 'number',
        'input_attrs' => array( 'min' => 1, 'max' => 9 ),
    ) );
}
add_action( 'customize_register', 'ibdhh_customize_testimonials' );

/**
 * 3. Testimonials Shortcode [testimonials]
 */
function ibdhh_testimonials_shortcode( $atts ) {
    // Check toggle
    if ( ! get_theme_mod( 'ibdhh_show_testimonials', true ) ) {
        return '';
    }

    $heading = get_theme_mod( 'ibdhh_testimonial_heading', 'What Our Community Says' );
    $mode    = get_theme_mod( 'ibdhh_testimonial_select_type', 'latest' );
    $ids_str = get_theme_mod( 'ibdhh_testimonial_ids', '' );
    $count   = get_theme_mod( 'ibdhh_testimonial_count', 3 );

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
                        <div class="color-bar" style="background: #9F2B68; width: 6px; height: 24px; border-radius: 0;"></div>
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
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="#9F2B68" style="opacity: 0.1;">
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
add_shortcode( 'testimonials', 'ibdhh_testimonials_shortcode' );

/**
 * 4. Helper: Add Role Field to Testimonials in Admin
 */
function ibdhh_testimonial_meta_box() {
    add_meta_box( 'ibdhh_testimonial_meta', 'Testimonial Details', 'ibdhh_testimonial_meta_callback', 'testimonial', 'normal', 'high' );
}
add_action( 'add_meta_boxes', 'ibdhh_testimonial_meta_box' );

function ibdhh_testimonial_meta_callback( $post ) {
    $role = get_post_meta( $post->ID, '_testimonial_role', true );
    ?>
    <p>
        <label for="testimonial_role" style="font-weight: 600;">Author Role/Title:</label><br>
        <input type="text" id="testimonial_role" name="testimonial_role" value="<?php echo esc_attr( $role ); ?>" style="width: 100%; margin-top: 5px;" placeholder="e.g. Cardiologist, Patient, or CTO">
    </p>
    <?php
}

function ibdhh_save_testimonial_meta( $post_id ) {
    if ( isset( $_POST['testimonial_role'] ) ) {
        update_post_meta( $post_id, '_testimonial_role', sanitize_text_field( $_POST['testimonial_role'] ) );
    }
}
add_action( 'save_post', 'ibdhh_save_testimonial_meta' );






/**
 * HCP, Patient & About Us Pages Customizer Settings
 */
require_once get_template_directory() . '/customizer-pages.php';



/**
 * AJAX: Save Detailed Clinical Profile
 */
function ibdhh_save_clinical_profile() {
    check_ajax_referer( 'ibdhh_clinical_nonce', 'nonce' );
    if ( ! is_user_logged_in() ) wp_send_json_error( 'Not logged in' );

    $user_id = get_current_user_id();
    $data = isset($_POST['profile_data']) ? $_POST['profile_data'] : array();
    
    if ( ! is_array( $data ) && is_string( $data ) ) {
        $data = json_decode( stripslashes( $data ), true );
    }

    if ( ! empty( $data ) ) {
        update_user_meta( $user_id, '_ibdhh_clinical_profile', $data );
        wp_send_json_success( 'Clinical profile updated' );
    } else {
        wp_send_json_error( 'No data' );
    }
}
add_action( 'wp_ajax_ibdhh_save_clinical_profile', 'ibdhh_save_clinical_profile' );

/**
 * Add Quiz Modal Base Styles
 */
function ibdhh_quiz_modal_styles() {
    ?>
    <style>
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .modal-option-item {
            display: flex; align-items: center; gap: 15px; padding: 16px 20px; border: 2px solid #f1f5f9; border-radius: 0; cursor: pointer; transition: all 0.2s;
        }
        .modal-option-item:hover { border-color: #9F2B68; background: #fffcf9; }
        .modal-option-item.selected { border-color: #9F2B68; background: #F5F0FA; }
        .modal-option-item.selected .modal-option-radio { border-color: #9F2B68 !important; background: #9F2B68; box-shadow: inset 0 0 0 4px white; }
        .option-text { font-size: 15px; font-weight: 600; color: #334155; }
        .modal-btn-save { background: transparent; color: #94a3b8; border: 1px solid #e2e8f0; padding: 14px 24px; border-radius: 0; font-weight: 700; cursor: pointer; transition: all 0.2s; }
        .modal-btn-save:hover { background: #f8fafc; color: #475569; }
    </style>
    <?php
}
add_action( 'wp_footer', 'ibdhh_quiz_modal_styles' );

/**
 * AJAX: Save Healthcare Quiz Results
 * Stores quiz answers into user meta under _ibdhh_healthcare_quiz_results.
 * Called by both the standalone page and the modal version of the quiz.
 */
function ibdhh_save_quiz_results() {
    if ( ! is_user_logged_in() ) {
        wp_send_json_error( 'Not logged in' );
    }

    if ( ! isset( $_POST['nonce'] ) || ! wp_verify_nonce( $_POST['nonce'], 'ibdhh_quiz_nonce' ) ) {
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
    $existing = get_user_meta( $user_id, '_ibdhh_healthcare_quiz_results', true );
    if ( ! is_array( $existing ) ) {
        $existing = array();
    }
    
    $merged = array_merge( $existing, $data );

    update_user_meta( $user_id, '_ibdhh_healthcare_quiz_results', $merged );

    wp_send_json_success( array( 'saved' => true ) );
}
add_action( 'wp_ajax_ibdhh_save_quiz_results', 'ibdhh_save_quiz_results' );


// End of File

