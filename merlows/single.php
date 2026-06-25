<?php
/**
 * Template for displaying all single posts
 * 
 * enhanced with digital assets support
 */

get_header();

while ( have_posts() ) :
    the_post();
    
    // Get custom field values
    $small_infographic = get_post_meta( get_the_ID(), '_oped_small_infographic', true );
    $large_infographic = get_post_meta( get_the_ID(), '_oped_large_infographic', true );
    $audio_summary = get_post_meta( get_the_ID(), '_oped_audio_summary', true );
    $video_summary = get_post_meta( get_the_ID(), '_oped_video_summary', true );
    $quiz_embed = get_post_meta( get_the_ID(), '_oped_quiz_embed', true );
    $attached_document = get_post_meta( get_the_ID(), '_mlws_attached_document', true );
    $author_bio = get_post_meta( get_the_ID(), '_oped_author_bio', true );
    $read_time = get_post_meta( get_the_ID(), '_oped_read_time', true );
    
    // Fallback for read time if not set
    if ( ! $read_time ) {
        $word_count = str_word_count( strip_tags( get_the_content() ) );
        $read_time = ceil( $word_count / 200 ); // Estimate 200 words per minute
    }

    // Determine Category/Type Label
    $post_type = get_post_type();
    $type_label = 'Article';
    $categories = get_the_category();
    if ( ! empty( $categories ) ) {
        // Prefer a sub-category as the primary, and show it as "Parent › Sub-category".
        $primary = $categories[0];
        foreach ( $categories as $c ) { if ( $c->parent ) { $primary = $c; break; } }
        if ( $primary->parent ) {
            $parent_cat = get_category( $primary->parent );
            $type_label = ( $parent_cat && ! is_wp_error( $parent_cat ) ) ? ( $parent_cat->name . ' › ' . $primary->name ) : $primary->name;
        } else {
            $type_label = $primary->name;
        }
    } elseif ( $post_type !== 'post' ) {
        $type_obj = get_post_type_object( $post_type );
        $type_label = $type_obj->labels->singular_name;
    }
?>

<article id="post-<?php the_ID(); ?>" <?php post_class('oped-article'); ?>>
    <!-- Hero Section with Featured Image -->
    <!-- Hero Section with Featured Image -->
    <?php
    // Hero Settings
    $title_color = get_theme_mod('mlws_hero_title_color', '#ffffff');
    $title_size = get_theme_mod('mlws_hero_title_size', 40);
    $mask_enabled = get_theme_mod('mlws_hero_mask_toggle', true);
    $mask_opacity = get_theme_mod('mlws_hero_mask_opacity', 0.5); 

    $hero_bg = '';
    if ( has_post_thumbnail() ) {
        $hero_bg = get_the_post_thumbnail_url( get_the_ID(), 'full' );
    } else {
        // Category-based default hero images
        $hero_map = array(
            'breaking-news'       => 'news_hero.png',
            'diplomatic-analysis' => 'research_hero.png',
            'blitzspirit'         => 'opinion_hero.png',
            'cyrus-accord'        => 'hcp_hero.png',
            'abraham-accords'     => 'education_hero.png',
            'regional-voices'     => 'patient_hero.png',
        );
        $hero_file = 'news_hero.png'; // default fallback
        $post_cats = get_the_category();
        if ( ! empty( $post_cats ) ) {
            foreach ( $post_cats as $cat ) {
                if ( isset( $hero_map[ $cat->slug ] ) ) {
                    $hero_file = $hero_map[ $cat->slug ];
                    break;
                }
            }
        }
        $hero_bg = get_template_directory_uri() . '/assets/img/' . $hero_file;
    }
    
    $overlay_css = '';
    if ( $mask_enabled ) {
        // Use rgba for opacity (using the brand dark blue/navy colors)
        $overlay_css = "background-image: linear-gradient(rgba(10, 25, 41, {$mask_opacity}), rgba(20, 40, 70, {$mask_opacity})), url('" . esc_url($hero_bg) . "');";
    } else {
        $overlay_css = "background-image: url('" . esc_url($hero_bg) . "');";
    }
    
    // Common background properties
    $bg_props = "background-position: center center; background-size: cover; background-repeat: no-repeat;";
    ?>
    <section class="oped-hero" style="height: 450px; min-height: 450px; display: flex; align-items: flex-end; position: relative; padding: 80px 0 60px; overflow: hidden;">
        <div class="oped-hero-image" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; <?php echo $overlay_css . ' ' . $bg_props; ?> z-index: 1;"></div>

        <div class="container" style="position: relative; z-index: 2;">
            <div class="oped-hero-content">
                <div class="oped-meta-tags">
                <span class="oped-category-tag"><?php echo esc_html( $type_label ); ?></span>
                    <span class="oped-read-time" style="color: #cbd5e1;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <?php echo esc_html( $read_time ); ?> min read
                    </span>
                    
                    </span>
                </div>

                <h1 class="oped-title" style="color: <?php echo esc_attr($title_color); ?>; font-size: <?php echo intval($title_size); ?>px; text-shadow: none;"><?php the_title(); ?></h1>

                <!-- Author info moved to sidebar -->
            </div>
        </div>
    </section>

    <?php get_template_part( 'template-parts/inner-category-nav' ); ?>

    <!-- Main Content Area -->
    <section class="oped-content-section">
        <div class="container">
            <div class="oped-layout">

                <!-- Primary Content Column -->
                <div class="oped-main-content">

                    <!-- Article Body -->
                    <div class="oped-article-body">
                        <?php the_content(); ?>
                    </div>

                    <!-- Tags (from the content generator's per-row Tags column) -->
                    <?php $mlws_post_tags = get_the_tags(); if ( $mlws_post_tags ) : ?>
                        <div class="oped-tags" style="margin-top:28px; padding-top:20px; border-top:1px solid #e2e8f0; display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                            <span style="font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#64748b; margin-right:4px;">Tags</span>
                            <?php foreach ( $mlws_post_tags as $mlws_tag ) : ?>
                                <a href="<?php echo esc_url( get_tag_link( $mlws_tag->term_id ) ); ?>" style="display:inline-block; padding:4px 12px; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:999px; font-size:13px; color:#334155; text-decoration:none;"><?php echo esc_html( $mlws_tag->name ); ?></a>
                            <?php endforeach; ?>
                        </div>
                    <?php endif; ?>

                    <!-- Large Infographic Section -->
                    <?php if ( $large_infographic ) : ?>
                        <div class="oped-asset oped-infographic-large">
                            <div class="oped-asset-header">
                                <span class="oped-asset-icon">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                        <polyline points="21 15 16 10 5 21"></polyline>
                                    </svg>
                                </span>
                                <h3>Infographic</h3>
                            </div>
                            <div class="oped-asset-content">
                                <?php 
                                $large_img = wp_get_attachment_image_src( $large_infographic, 'full' );
                                if ( $large_img ) : ?>
                                    <a href="<?php echo esc_url( $large_img[0] ); ?>" class="oped-infographic-link infographic-popup-link" data-large-src="<?php echo esc_url( $large_img[0] ); ?>">
                                        <img src="<?php echo esc_url( $large_img[0] ); ?>" alt="Infographic" class="oped-infographic-img">
                                        <span class="oped-expand-hint">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <polyline points="15 3 21 3 21 9"></polyline>
                                                <polyline points="9 21 3 21 3 15"></polyline>
                                                <line x1="21" y1="3" x2="14" y2="10"></line>
                                                <line x1="3" y1="21" x2="10" y2="14"></line>
                                            </svg>
                                            Click to enlarge
                                        </span>
                                    </a>
                                <?php endif; ?>
                            </div>
                        </div>
                    <?php endif; ?>

                    <!-- Video Summary Section -->
                    <?php if ( $video_summary ) : ?>
                        <div class="oped-asset oped-video-summary">
                            <div class="oped-asset-header">
                                <span class="oped-asset-icon oped-icon-video">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polygon points="23 7 16 12 23 17 23 7"></polygon>
                                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                                    </svg>
                                </span>
                                <h3>Video Summary</h3>
                            </div>
                            <div class="oped-asset-content">
                                <div class="oped-video-wrapper">
                                    <?php 
                                    // Check if it's a URL or embed code
                                    if ( filter_var( $video_summary, FILTER_VALIDATE_URL ) ) {
                                        echo wp_oembed_get( $video_summary );
                                    } else {
                                        echo wp_kses_post( $video_summary );
                                    }
                                    ?>
                                </div>
                            </div>
                        </div>
                    <?php endif; ?>

                     <!-- Quiz moved to sidebar -->

                    <!-- Author Bio -->
                    <?php if ( $author_bio || get_the_author_meta('description') ) : ?>
                        <div class="oped-author-bio-section">
                            <div class="oped-bio-header">
                                <div class="oped-bio-avatar">
                                    <?php echo get_avatar( get_the_author_meta('ID'), 80 ); ?>
                                </div>
                                <div class="oped-bio-info">
                                    <span class="oped-bio-label">About the Author</span>
                                    <h4><?php the_author(); ?></h4>
                                </div>
                            </div>
                            <p class="oped-bio-text">
                                <?php echo $author_bio ? esc_html( $author_bio ) : esc_html( get_the_author_meta('description') ); ?>
                            </p>
                        </div>
                    <?php endif; ?>

                </div>

                <!-- Sidebar Column -->
                <aside class="oped-sidebar">

                    <!-- Redesigned Save Button -->
                    <?php 
                        $is_logged_in = is_user_logged_in();
                        $is_saved = $is_logged_in ? mlws_is_bookmarked() : false;
                        $saved_bg = $is_saved ? '#1B4F8A' : '#1B4F8A'; // Green if saved, Orange if not
                    ?>
                    <div class="oped-sidebar-block" style="padding: 0; background: transparent; border: none; margin-bottom: 24px;">
                        <button id="ibd-bookmark-sidebar-btn" style="width: 100%; padding: 16px; background: <?php echo $saved_bg; ?>; border: none; border-radius: 12px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 12px; transition: all 0.3s; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" data-post-id="<?php the_ID(); ?>" data-nonce="<?php echo wp_create_nonce('mlws_dashboard_nonce'); ?>" data-logged-in="<?php echo $is_logged_in ? '1' : '0'; ?>">
                            <span class="icon" style="font-size: 20px;"><?php echo $is_saved ? '★' : '☆'; ?></span>
                            <span class="text" style="font-weight: 700; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;"><?php echo $is_saved ? 'Article Saved' : 'Save This Article'; ?></span>
                        </button>
                    </div>

                    <script>
                    jQuery(document).ready(function($) {
                        $('#ibd-bookmark-sidebar-btn').on('click', function(e) {
                            e.preventDefault();
                            var btn = $(this);
                            var isLoggedIn = btn.data('logged-in') == '1';
                            
                            if (!isLoggedIn) {
                                if (typeof openGuestModal === 'function') {
                                    openGuestModal();
                                } else {
                                    alert('Please log in to save articles.');
                                }
                                return;
                            }

                            var pid = btn.data('post-id');
                            var nonce = btn.data('nonce');
                            var icon = btn.find('.icon');
                            var text = btn.find('.text');
                            
                            btn.css('opacity', '0.7');
                            
                            $.post('<?php echo admin_url('admin-ajax.php'); ?>', {
                                action: 'mlws_toggle_bookmark',
                                post_id: pid,
                                nonce: nonce
                            }, function(res) {
                                btn.css('opacity', '1');
                                if(res.success) {
                                    if(res.data.action === 'added') {
                                        btn.css('background', '#1B4F8A');
                                        icon.html('★');
                                        text.text('Article Saved');
                                    } else {
                                        btn.css('background', '#1B4F8A');
                                        icon.html('☆');
                                        text.text('Save This Article');
                                    }
                                } else {
                                    alert('Error: ' + res.data);
                                }
                            });
                        });
                    });
                    </script>

                     <!-- Attached Document -->
                    <?php if ( $attached_document ) : ?>
                        <div class="oped-sidebar-block oped-document-download">
                            <h4>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="7 10 12 15 17 10"></polyline>
                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                                Download Source Material
                            </h4>
                            <div class="oped-sidebar-content">
                                <?php 
                                $doc_url = wp_get_attachment_url( $attached_document );
                                $doc_filename = basename( get_attached_file( $attached_document ) );
                                if ( $doc_url ) : ?>
                                    <div class="download-placeholder-card" style="margin-bottom: 12px; height: 120px; background: #f3f4f6; border-radius: 8px; display: flex; align-items: center; justify-content: center; border: 1px dashed #cbd5e1;">
                                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5">
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                            <polyline points="14 2 14 8 20 8"></polyline>
                                        </svg>
                                    </div>
                                    <a href="<?php echo esc_url( $doc_url ); ?>" target="_blank" class="download-button" style="display: flex; align-items: center; gap: 10px; padding: 12px; background: var(--primary-color); border-radius: 8px; text-decoration: none; color: white; font-weight: 500;">
                                        <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><?php echo esc_html( $doc_filename ); ?></span>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                            <polyline points="7 10 12 15 17 10"></polyline>
                                            <line x1="12" y1="15" x2="12" y2="3"></line>
                                        </svg>
                                    </a>
                                <?php endif; ?>
                            </div>
                        </div>
                    <?php endif; ?>

                    <!-- Small Infographic -->
                    <?php if ( $small_infographic ) : ?>
                        <div class="oped-sidebar-block oped-infographic-small">
                            <h4>Quick Infographic</h4>
                            <div class="oped-sidebar-content">
                                <?php 
                                $small_img = wp_get_attachment_image_src( $small_infographic, 'medium' );
                                if ( $small_img ) : 
                                    $large_url = '';
                                    if ( $large_infographic ) {
                                        $large_url = wp_get_attachment_url( $large_infographic );
                                    }
                                    $link_url = $large_url ? esc_url( $large_url ) : '#';
                                ?>
                                    <a href="<?php echo $link_url; ?>" class="infographic-popup-link" data-large-src="<?php echo $link_url; ?>">
                                        <img src="<?php echo esc_url( $small_img[0] ); ?>" alt="Quick Infographic" style="width: 100%; border-radius: 8px;">
                                    </a>
                                <?php endif; ?>
                            </div>
                        </div>
                    <?php endif; ?>

                     <!-- Quiz Section (now in sidebar) -->
                     <?php 
                     $quiz_data = get_post_meta( get_the_ID(), '_oped_quiz_data', true );
                     if ( $quiz_data || $quiz_embed ) : ?>
                        <div class="oped-sidebar-block oped-quiz-sidebar">
                            <h4>
                                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                     <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                                     <line x1="8" y1="21" x2="16" y2="21"></line>
                                     <line x1="12" y1="17" x2="12" y2="21"></line>
                                 </svg>
                                 Flash Card App
                             </h4>
                             <div class="oped-sidebar-content">
                                 <?php if ( $quiz_data ) : ?>
                                     <div class="quiz-widget" data-quiz='<?php echo esc_attr( $quiz_data ); ?>'>
                                         <div class="quiz-widget-header">
                                             <h4><span class="dashicons dashicons-welcome-learn-more"></span> Review Cards</h4>
                                         </div>
                                        <div class="quiz-progress">
                                            <div class="quiz-progress-bar"></div>
                                        </div>
                                        <div class="quiz-widget-body">
                                            <!-- Quiz injected by JS -->
                                        </div>
                                    </div>
                                <?php elseif ( $quiz_embed ) : ?>
                                    <div class="oped-quiz-wrapper-sidebar">
                                        <?php echo $quiz_embed; // Removed wp_kses_post to allow Quizlet iframes ?>
                                    </div>
                                <?php endif; ?>
                            </div>
                        </div>
                    <?php endif; ?>

                    <!-- Audio Summary -->
                    <?php if ( $audio_summary ) : ?>
                        <div class="oped-sidebar-block oped-audio-summary">
                            <h4>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M3 18v-6a9 9 0 0 1 18 0v6"></path>
                                    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path>
                                </svg>
                                Listen to Summary
                            </h4>
                            <div class="oped-sidebar-content">
                                <div class="oped-audio-player">
                                    <?php 
                                    $audio_url = wp_get_attachment_url( $audio_summary );
                                    if ( $audio_url ) : ?>
                                        <audio controls style="width: 100%;">
                                            <source src="<?php echo esc_url( $audio_url ); ?>" type="audio/mpeg">
                                            Your browser does not support the audio element.
                                        </audio>
                                    <?php endif; ?>
                                </div>
                            </div>
                        </div>
                    <?php endif; ?>
                    

                    <!-- Author & Date -->
                    <div class="oped-sidebar-block oped-sidebar-author">
                        <div class="oped-sidebar-author-info">
                            <div class="oped-sidebar-author-avatar">
                                <?php echo get_avatar( get_the_author_meta('ID'), 48 ); ?>
                            </div>
                            <div class="oped-sidebar-author-details">
                                <span class="oped-sidebar-author-name"><?php the_author(); ?></span>
                                <span class="oped-sidebar-author-date"><?php echo get_the_date('F j, Y'); ?></span>
                            </div>
                        </div>
                    </div>

                    <!-- Share Section -->
                    <div class="oped-sidebar-block oped-share-section">
                        <h4>Share This Article</h4>
                        <div class="oped-share-buttons">
                            <a href="https://twitter.com/intent/tweet?url=<?php echo urlencode( get_permalink() ); ?>&text=<?php echo urlencode( get_the_title() ); ?>" 
                               target="_blank" class="oped-share-btn oped-share-twitter" aria-label="Share on Twitter">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                            </a>
                            <a href="https://www.linkedin.com/shareArticle?mini=true&url=<?php echo urlencode( get_permalink() ); ?>&title=<?php echo urlencode( get_the_title() ); ?>" 
                               target="_blank" class="oped-share-btn oped-share-linkedin" aria-label="Share on LinkedIn">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                                </svg>
                            </a>
                            <a href="mailto:?subject=<?php echo rawurlencode( get_the_title() ); ?>&body=<?php echo rawurlencode( get_permalink() ); ?>" 
                               class="oped-share-btn oped-share-email" aria-label="Share via Email">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                    <polyline points="22,6 12,13 2,6"></polyline>
                                </svg>
                            </a>
                            <button class="oped-share-btn oped-share-copy" 
                                onclick="navigator.clipboard.writeText('<?php echo esc_js( get_permalink() ); ?>'); this.classList.add('copied'); setTimeout(() => this.classList.remove('copied'), 2000);" 
                                aria-label="Copy link">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                            </button>
                        </div>
                    </div>

                    <!-- Related Articles -->
                    <div class="oped-sidebar-block oped-related-articles">
                        <h4>Related Articles</h4>
                        <div class="oped-sidebar-content">
                            <?php
                            $related = new WP_Query( array(
                                'post_type' => $post_type,
                                'posts_per_page' => 3,
                                'post__not_in' => array( get_the_ID() ),
                                'orderby' => 'rand',
                            ) );
                            
                            if ( $related->have_posts() ) :
                                while ( $related->have_posts() ) : $related->the_post();
                            ?>
                                <a href="<?php the_permalink(); ?>" class="oped-related-item">
                                    <div class="oped-related-thumb" style="background-image: url('<?php echo get_the_post_thumbnail_url(get_the_ID(), 'thumbnail'); ?>'); background-size: cover;"></div>
                                    <div class="oped-related-info">
                                        <span class="oped-related-title"><?php the_title(); ?></span>
                                        <span class="oped-related-date"><?php echo get_the_date('M j'); ?><?php if ( function_exists( 'mlws_get_reading_time' ) ) { echo ' &middot; ' . esc_html( mlws_get_reading_time() ) . ' min'; } ?></span>
                                    </div>
                                </a>
                            <?php 
                                endwhile;
                                wp_reset_postdata();
                            else :
                            ?>
                                <a href="#" class="oped-related-item">
                                    <div class="oped-related-thumb"></div>
                                    <div class="oped-related-info">
                                        <span class="oped-related-title">More coming soon</span>
                                    </div>
                                </a>
                            <?php endif; ?>
                        </div>
                    </div>

                </aside>
            </div>
        </div>
    </section>

    <!-- Related Content Engine (Read Next) -->
    <section class="related-content-engine" style="padding: 60px 0; background: #f8fafc; border-top: 1px solid #e2e8f0;">
        <div class="container">
            <h3 style="margin-bottom: 30px; font-weight: 700; color: #0f172a; font-size: 24px;">Read Next</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px;">
                <?php
                $related_query = new WP_Query( array(
                    'post_type' => $post_type,
                    'posts_per_page' => 3,
                    'post__not_in' => array( get_the_ID() ),
                    'orderby' => 'rand',
                ) );
                
                if ( $related_query->have_posts() ) :
                    while ( $related_query->have_posts() ) : $related_query->the_post();
                        $thumb = get_the_post_thumbnail_url(get_the_ID(), 'medium');
                ?>
                    <a href="<?php the_permalink(); ?>" style="text-decoration: none; display: flex; flex-direction: column; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); transition: transform 0.2s; border: 1px solid #e2e8f0;" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
                        <div style="position: relative; height: 200px; background-color: #cbd5e1; background-image: url('<?php echo $thumb; ?>'); background-size: cover; background-position: center;">
                            <?php if ( function_exists( 'mlws_thumb_overlay' ) ) { mlws_thumb_overlay(); } ?>
                        </div>
                        <div style="padding: 24px; flex: 1; display: flex; flex-direction: column;">
                            <span style="font-size: 12px; font-weight: 600; color: var(--primary-color); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;"><?php echo get_the_date(); ?></span>
                            <h4 style="font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 12px; line-height: 1.4;"><?php the_title(); ?></h4>
                            <span style="margin-top: auto; font-size: 14px; font-weight: 600; color: var(--secondary-color);">Read Article →</span>
                        </div>
                    </a>
                <?php 
                    endwhile;
                    wp_reset_postdata();
                endif; 
                ?>
            </div>
        </div>
    </section>

    <!-- Post Navigation -->
    <section class="oped-navigation">
        <div class="container">
            <div class="oped-nav-wrapper">
                <?php
                $prev_post = get_previous_post( false, '', 'category' );
                $next_post = get_next_post( false, '', 'category' );
                ?>
                
                <?php if ( $prev_post ) : ?>
                    <a href="<?php echo get_permalink( $prev_post ); ?>" class="oped-nav-link oped-nav-prev">
                        <span class="oped-nav-label">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="19" y1="12" x2="5" y2="12"></line>
                                <polyline points="12 19 5 12 12 5"></polyline>
                            </svg>
                            Previous Article
                        </span>
                        <span class="oped-nav-title"><?php echo get_the_title( $prev_post ); ?></span>
                    </a>
                <?php else : ?>
                    <div></div>
                <?php endif; ?>
                
                <?php if ( $next_post ) : ?>
                    <a href="<?php echo get_permalink( $next_post ); ?>" class="oped-nav-link oped-nav-next">
                        <span class="oped-nav-label">
                            Next Article
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                                <polyline points="12 5 19 12 12 19"></polyline>
                            </svg>
                        </span>
                        <span class="oped-nav-title"><?php echo get_the_title( $next_post ); ?></span>
                    </a>
                <?php endif; ?>
            </div>
        </div>
    </section>
    <!-- Premium Subscribe Section -->
    <section class="premium-subscribe-section">
        <div class="container">
            <div class="premium-subscribe">
                <h2>Join the Future of Health</h2>
                <p>Get the latest evidence-based research on gut health, longevity, and clinical nutrition delivered to your inbox weekly.</p>
                <div class="subscribe-form">
                    <input type="email" placeholder="Enter your email address...">
                    <button class="btn btn-primary">Join Merlows</button>
                </div>
                <div style="margin-top: 16px; font-size: 13px; color: #cbd5e1; opacity: 0.8;">
                    No spam. Just science. Unsubscribe any time.
                </div>
            </div>
        </div>
    </section>
</article>

<?php
endwhile;

get_footer();
?>
