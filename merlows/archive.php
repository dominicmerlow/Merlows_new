<?php get_header(); ?>

<main>
    <!-- Hero Section -->
    <!-- Hero Section -->
    <?php
    $hero_bg = get_template_directory_uri() . '/assets/img/news_hero.png'; // Default
    if ( is_post_type_archive() ) {
        $pt = get_query_var( 'post_type' );
        if ( in_array( $pt, ['research', 'whitepaper'] ) ) {
            $hero_bg = get_template_directory_uri() . '/assets/img/research_hero.png';
        } elseif ( in_array( $pt, ['webinar', 'course', 'infographic'] ) ) {
            $hero_bg = get_template_directory_uri() . '/assets/img/education_hero.png';
        } elseif ( in_array( $pt, ['oped', 'review'] ) ) {
            $hero_bg = get_template_directory_uri() . '/assets/img/opinion_hero.png';
        }
    }
    // Handle category archives with enhanced descriptions and taglines
    $category_tagline = '';
    $category_description = '';
    if ( is_category() ) {
       $cat = get_queried_object();
       $cat_name = $cat->name;
       
       // Set hero background based on category
       if ( stripos($cat_name, 'research') !== false || stripos($cat_name, 'Clinical') !== false ) {
           $hero_bg = get_template_directory_uri() . '/assets/img/research_hero.png';
           $category_tagline = 'Evidence-Based Excellence';
           $category_description = 'Dive deep into peer-reviewed clinical research, systematic reviews, and evidence-based analysis that shapes modern healthcare practice.';
       } elseif ( stripos($cat_name, 'education') !== false || stripos($cat_name, 'Course') !== false ) {
           $hero_bg = get_template_directory_uri() . '/assets/img/education_hero.png';
           $category_tagline = 'Elevate Your Expertise';
           $category_description = 'Advance your professional development with CME-accredited courses, interactive webinars, and cutting-edge educational content designed for healthcare professionals.';
       } elseif ( stripos($cat_name, 'News') !== false || stripos($cat_name, 'Healthcare') !== false ) {
           $hero_bg = get_template_directory_uri() . '/assets/img/news_hero.png';
           $category_tagline = 'Stay Ahead of the Curve';
           $category_description = 'Breaking news, industry updates, and the latest developments in healthcare, nutrition science, and longevity medicine.';
       } elseif ( stripos($cat_name, 'Opinion') !== false || stripos($cat_name, 'Expert') !== false ) {
           $hero_bg = get_template_directory_uri() . '/assets/img/opinion_hero.png';
           $category_tagline = 'Insights That Inspire';
           $category_description = 'Thought-provoking perspectives from leading experts, thought leaders, and innovators shaping the future of healthcare and nutritional medicine.';
       } elseif ( stripos($cat_name, 'Media') !== false ) {
           $hero_bg = get_template_directory_uri() . '/assets/img/news_hero.png';
           $category_tagline = 'Learn Through Listening';
           $category_description = 'Engaging podcasts, informative webinars, and compelling video content that brings complex medical concepts to life.';
       } elseif ( stripos($cat_name, 'Infographic') !== false || stripos($cat_name, 'Gallery') !== false ) {
           $hero_bg = get_template_directory_uri() . '/assets/img/education_hero.png';
           $category_tagline = 'Visualize Knowledge';
           $category_description = 'Complex information made simple through beautifully designed infographics, visual guides, and educational graphics.';
       } elseif ( stripos($cat_name, 'Tool') !== false || stripos($cat_name, 'Resource') !== false ) {
           $hero_bg = get_template_directory_uri() . '/assets/img/education_hero.png';
           $category_tagline = 'Empower Your Practice';
           $category_description = 'Practical tools, calculators, and downloadable resources designed to enhance clinical decision-making and patient care.';
       } elseif ( stripos($cat_name, 'Living') !== false || stripos($cat_name, 'IBD') !== false ) {
           $hero_bg = content_url() . '/uploads/2026/04/ibdliving_hero.png';
           $category_tagline = 'Living Well with IBD';
           $category_description = 'Practical guidance, personal stories, and supportive resources for navigating daily life with Inflammatory Bowel Disease.';
       } else {
           $hero_bg = get_template_directory_uri() . '/assets/img/news_hero.png';
           $category_tagline = 'Explore Our Knowledge Hub';
           $category_description = $cat->description ? $cat->description : 'Discover curated content from leading experts in healthcare and nutritional medicine.';
       }
    }
    
    // Override with individual category settings if available
    if ( is_category() ) {
        $cat_id = get_queried_object_id();
        $specific_hero = get_theme_mod( "mlws_cat_hero_{$cat_id}" );
        $specific_tagline = get_theme_mod( "mlws_cat_tagline_{$cat_id}" );
        
        if ( $specific_hero ) {
            $hero_bg = $specific_hero;
        }
        if ( $specific_tagline ) {
            $category_tagline = $specific_tagline;
        }
    }
    
    // Override default hero if a global category hero is set in Customizer and no specific hero was found
    if ( ! ( is_category() && get_theme_mod( "mlws_cat_hero_" . get_queried_object_id() ) ) ) {
        $custom_category_hero = get_theme_mod('mlws_category_hero_image');
        if ($custom_category_hero) {
            $hero_bg = $custom_category_hero;
        }
    }


    // Hero Settings
    $title_color = get_theme_mod('mlws_hero_title_color', '#ffffff');
    $title_size = get_theme_mod('mlws_hero_title_size', 40);
    $mask_enabled = get_theme_mod('mlws_hero_mask_toggle', true);
    $mask_opacity = get_theme_mod('mlws_hero_mask_opacity', 0.5); 

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
    <section class="hero" style="padding: 100px 0; <?php echo $overlay_css . ' ' . $bg_props; ?> position: relative; overflow: hidden;">
        <div class="container">
            <div class="hero-content" style="max-width: 800px;">
                <?php if ( is_category() && $category_tagline ) : ?>
                    <span class="eyebrow" style="display: inline-block; background: #ffffff; color: #1B4F8A; padding: 6px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;"><?php echo esc_html( $category_tagline ); ?></span>
                <?php endif; ?>
                
                <?php
                // Check for title override
                $display_title = '';
                $quiried_object = get_queried_object();
                if ( $quiried_object instanceof WP_Term ) {
                    $override = get_theme_mod("mlws_cat_hero_title_override_{$quiried_object->term_id}");
                    if ( $override ) {
                        $display_title = $override;
                    } else {
                        $display_title = get_the_archive_title();
                    }
                } else {
                    $display_title = get_the_archive_title();
                }
                ?>
                <h1 class="entry-title" style="font-size: <?php echo intval($title_size); ?>px; color: <?php echo esc_attr($title_color); ?>; font-weight: 700; margin: 0; line-height: 1.2;"><?php echo wp_kses_post($display_title); ?></h1>
                <div class="archive-description" style="color: #e2e8f0; font-size: 20px; line-height: 1.6; max-width: 700px; margin-top: 16px;">
                    <?php 
                    if ( is_category() && $category_description ) {
                        echo esc_html( $category_description );
                    } else {
                        the_archive_description();
                    }
                    ?>
                </div>
            </div>
        </div>
    </section>

    <?php get_template_part( 'template-parts/inner-category-nav' ); ?>

    <div class="container" style="padding: 60px 20px;">
        <?php if ( have_posts() ) : ?>

            <div class="portal-grid">
                <?php
                while ( have_posts() ) :
                    the_post();
                    ?>
                    <?php
                    $card_thumb = get_the_post_thumbnail_url( get_the_ID(), 'medium' );
                    if ( ! $card_thumb ) {
                        $card_thumb = get_template_directory_uri() . '/assets/img/news_hero.png';
                        $card_cats = get_the_category();
                        if ( ! empty( $card_cats ) ) {
                            $card_hero_map = array(
                                'breaking-news'       => 'news_hero.png',
                                'diplomatic-analysis' => 'research_hero.png',
                                'op-eds-commentary'   => 'opinion_hero.png',
                                'cyrus-accord'        => 'hcp_hero.png',
                                'abraham-accords'     => 'education_hero.png',
                                'regional-voices'     => 'patient_hero.png',
                            );
                            foreach ( $card_cats as $cc ) {
                                if ( isset( $card_hero_map[ $cc->slug ] ) ) {
                                    $card_thumb = get_template_directory_uri() . '/assets/img/' . $card_hero_map[ $cc->slug ];
                                    break;
                                }
                            }
                        }
                    }
                    ?>
                    <article id="post-<?php the_ID(); ?>" <?php post_class('news-card'); ?>>
                        <div class="card-image" style="background-image: url('<?php echo esc_url( $card_thumb ); ?>'); background-color: #e2e8f0; position: relative;">
                            <img src="<?php echo content_url(); ?>/uploads/2026/04/hero_home-1.png" alt="" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 140px; height: auto; opacity: 0.5; pointer-events: none;">
                            <div style="position: absolute; bottom: 10px; left: 10px; display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.55); padding: 4px 10px; border-radius: 4px;">
                                <span style="color: #ffffff; font-size: 12px; font-weight: 600;"><?php echo get_the_date(); ?></span>
                            </div>
                        </div>

                        <div class="card-content">
                            <header class="entry-header">
                                <?php the_title( sprintf( '<h2 class="entry-title"><a href="%s" rel="bookmark" style="font-size: 20px;">', esc_url( get_permalink() ) ), '</a></h2>' ); ?>
                            </header>

                            <div class="entry-content">
                                <?php the_excerpt(); ?>
                            </div>
                        </div>
                    </article>
                <?php endwhile; ?>
            </div>

            <div class="pagination" style="margin-top: 40px;">
                <?php the_posts_pagination(); ?>
            </div>

        <?php else : ?>
            <p>No content found.</p>
        <?php endif; ?>
    </div>
</main>

<?php get_footer(); ?>
