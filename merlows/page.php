<?php get_header(); ?>

    <?php
    while ( have_posts() ) :
        the_post();
        
        // Hero Settings
        $title_color = get_theme_mod('mlws_hero_title_color', '#ffffff');
        $title_size = get_theme_mod('mlws_hero_title_size', 52);
        $mask_enabled = get_theme_mod('mlws_hero_mask_toggle', true);
        $mask_opacity = get_theme_mod('mlws_hero_mask_opacity', 0.5); 

        $hero_bg = '';
        if ( has_post_thumbnail() ) {
            $hero_bg = get_the_post_thumbnail_url( get_the_ID(), 'full' );
        } else {
            $hero_bg = get_theme_mod('mlws_homepage_hero_image') ?: get_template_directory_uri() . '/assets/img/news_hero.png';
        }
        
        $overlay_css = '';
        if ( $mask_enabled ) {
            $overlay_css = "background-image: linear-gradient(rgba(10, 25, 41, {$mask_opacity}), rgba(20, 40, 70, {$mask_opacity})), url('" . esc_url($hero_bg) . "');";
        } else {
            $overlay_css = "background-image: url('" . esc_url($hero_bg) . "');";
        }
        
        // Common background properties
        $bg_props = "background-position: center center; background-size: cover; background-repeat: no-repeat;";
    ?>
    
    <!-- Hero Section -->
    <section class="hero" style="padding: 95px 0 140px; <?php echo $overlay_css . ' ' . $bg_props; ?> position: relative; overflow: hidden; display: flex; align-items: center;">
        <div class="container" style="position:relative;z-index:1;">
            <div style="max-width: 800px; padding: 40px 0;">
                <h1 class="entry-title" style="font-size: <?php echo intval($title_size); ?>px; color: <?php echo esc_attr($title_color); ?>; font-weight: 700; margin: 0; line-height: 1.2;"><?php the_title(); ?></h1>
            </div>
        </div>
    </section>

    <?php get_template_part( 'template-parts/inner-category-nav' ); ?>

    <div class="container" style="padding: 60px 20px;">
        <article id="post-<?php the_ID(); ?>" <?php post_class(); ?>>
            <div class="entry-content" style="line-height: 1.8;">
                <?php the_content(); ?>
            </div>
        </article>
    </div>
    <?php endwhile; ?>

<?php get_footer(); ?>
