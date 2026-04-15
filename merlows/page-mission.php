<?php
/**
 * Template Name: Our Mission
 */

get_header(); ?>

<main id="main-content">
    <?php
    if ( ! function_exists( 'mlws_get_style_mission' ) ) {
        function mlws_get_style_mission( $prefix, $default_bg = '' ) {
            $bg      = get_theme_mod( $prefix . '_bg', $default_bg );
            $t_color = get_theme_mod( $prefix . '_title_color' );
            $t_size  = get_theme_mod( $prefix . '_title_size' );
            $tx_color = get_theme_mod( $prefix . '_text_color' );
            $tx_size  = get_theme_mod( $prefix . '_text_size' );
            $tag_bg   = get_theme_mod( $prefix . '_tag_bg' );
            $tag_color = get_theme_mod( $prefix . '_tag_color' );

            $style = '';
            if ( $bg ) $style .= "background:$bg;";

            $inner_title_style = '';
            if ( $t_color ) $inner_title_style .= "color:$t_color !important;";
            if ( $t_size ) {
                $t_size = is_numeric( $t_size ) ? $t_size . 'px' : $t_size;
                $inner_title_style .= "font-size:$t_size !important;";
            }

            $inner_text_style = '';
            if ( $tx_color ) $inner_text_style .= "color:$tx_color !important;";
            if ( $tx_size ) {
                $tx_size = is_numeric( $tx_size ) ? $tx_size . 'px' : $tx_size;
                $inner_text_style .= "font-size:$tx_size !important;";
            }

            $inner_tag_style = '';
            if ( $tag_bg )    $inner_tag_style .= "background:$tag_bg !important;";
            if ( $tag_color ) $inner_tag_style .= "color:$tag_color !important;";

            return [
                'section' => $style,
                'title'   => $inner_title_style,
                'text'    => $inner_text_style,
                'tag'     => $inner_tag_style,
            ];
        }
    }
    ?>

    <!-- HERO SECTION -->
    <?php if ( get_theme_mod( 'mlws_mission_hero_show', true ) ) :
        $hero_img      = get_theme_mod( 'mlws_mission_hero_img', get_template_directory_uri() . '/assets/img/news_hero.png' );
        $hero_bg_color = get_theme_mod( 'mlws_mission_hero_bg_color' );
        $hero_tag      = get_theme_mod( 'mlws_mission_hero_tag', 'Our Mission' );
        $hero_title    = get_theme_mod( 'mlws_mission_hero_title', 'Championing Peace Through <span class="highlight">Informed Diplomacy</span>' );
        $hero_desc     = get_theme_mod( 'mlws_mission_hero_desc', 'Merlows exists to make the complex world of Middle East diplomacy accessible, understandable, and actionable — for citizens, policymakers, and peace-builders alike.' );

        $styles = mlws_get_style_mission( 'mlws_mission_hero' );
        $hero_bg_style = "background: linear-gradient(rgba(10,25,41,0.78), rgba(10,25,41,0.93)), url('" . esc_url( $hero_img ) . "') no-repeat center center; background-size: cover;";
        if ( $hero_bg_color ) {
            $hero_bg_style = "background: " . $hero_bg_color . ";";
        }
    ?>
    <section class="ibd-about-hero" style="padding: 95px 0 140px; display: flex; align-items: flex-start; <?php echo $hero_bg_style; ?> position: relative; overflow: hidden;">
        <div class="container" style="position:relative;z-index:1;">
            <div style="max-width: 800px;">
                <span class="tag-label" style="<?php echo $styles['tag']; ?>"><?php echo esc_html( $hero_tag ); ?></span>
                <h1 style="font-weight:900;margin:16px 0 20px;font-family:'Outfit',sans-serif;line-height:1.1; <?php if ( strpos( $styles['title'], 'font-size' ) === false ) echo 'font-size:clamp(36px,5vw,60px);'; ?> <?php if ( strpos( $styles['title'], 'color' ) === false ) echo 'color:white;'; ?> <?php echo $styles['title']; ?>">
                    <?php echo wp_kses_post( $hero_title ); ?>
                </h1>
                <p style="max-width:600px;line-height:1.7;margin:0 0 32px; <?php if ( strpos( $styles['text'], 'font-size' ) === false ) echo 'font-size:20px;'; ?> <?php if ( strpos( $styles['text'], 'color' ) === false ) echo 'color:rgba(255,255,255,.82);'; ?> <?php echo $styles['text']; ?>">
                    <?php echo esc_html( $hero_desc ); ?>
                </p>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <!-- VISION SECTION -->
    <?php if ( get_theme_mod( 'mlws_mission_vision_show', true ) ) :
        $vision_tag   = get_theme_mod( 'mlws_mission_vision_tag', 'Our Vision' );
        $vision_title = get_theme_mod( 'mlws_mission_vision_title', 'A More Peaceful Middle East' );
        $vision_desc  = get_theme_mod( 'mlws_mission_vision_desc', 'We believe that lasting peace is built on understanding. By covering the Abraham Accords, the Cyrus Accord, and the evolving landscape of Israel-Iran relations with depth and accuracy, Merlows helps audiences move beyond headlines to grasp the full human and geopolitical story.' );
        $styles = mlws_get_style_mission( 'mlws_mission_vision', '#fff' );
    ?>
    <section class="section-padding" style="<?php echo $styles['section']; ?>">
        <div class="container">
            <div style="display:flex;flex-wrap:wrap;gap:60px;align-items:center;">
                <div style="flex:1;min-width:280px;">
                    <span class="tag-label" style="<?php echo $styles['tag']; ?>"><?php echo esc_html( $vision_tag ); ?></span>
                    <h2 style="font-family:'Outfit',sans-serif;font-weight:900;margin:16px 0; <?php if ( strpos( $styles['title'], 'font-size' ) === false ) echo 'font-size:40px;'; ?> <?php if ( strpos( $styles['title'], 'color' ) === false ) echo 'color:var(--secondary-color);'; ?> <?php echo $styles['title']; ?>">
                        <?php echo esc_html( $vision_title ); ?>
                    </h2>
                    <p style="font-size:18px;line-height:1.7;color:var(--text-light); <?php echo $styles['text']; ?>">
                        <?php echo esc_html( $vision_desc ); ?>
                    </p>
                </div>
                <div style="flex:1;min-width:280px;display:grid;grid-template-columns:1fr 1fr;gap:20px;">
                    <?php
                    $stat_defaults = [
                        1 => [ '100+', 'Countries Reached' ],
                        2 => [ '5+',   'Years of Coverage' ],
                        3 => [ '300+', 'Exclusive Analyses' ],
                        4 => [ '50+',  'Expert Contributors' ],
                    ];
                    for ( $i = 1; $i <= 4; $i++ ) :
                        $s_num = get_theme_mod( "mlws_mission_stat{$i}_num",   $stat_defaults[ $i ][0] );
                        $s_lbl = get_theme_mod( "mlws_mission_stat{$i}_label", $stat_defaults[ $i ][1] );
                    ?>
                    <div style="background:#f8f9fa;padding:24px;border-radius:0;text-align:center;">
                        <div style="font-size:42px;font-weight:900;color:var(--primary-color);font-family:'Outfit',sans-serif; <?php echo $styles['title']; ?>"><?php echo esc_html( $s_num ); ?></div>
                        <div style="font-size:14px;color:var(--secondary-color);font-weight:600;margin-top:4px; <?php echo $styles['text']; ?>"><?php echo esc_html( $s_lbl ); ?></div>
                    </div>
                    <?php endfor; ?>
                </div>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <!-- CORE PILLARS SECTION -->
    <?php if ( get_theme_mod( 'mlws_mission_pillars_show', true ) ) :
        $pillars_tag   = get_theme_mod( 'mlws_mission_pillars_tag', 'What Drives Us' );
        $pillars_title = get_theme_mod( 'mlws_mission_pillars_title', 'Four Pillars of Our Mission' );
        $pillars_desc  = get_theme_mod( 'mlws_mission_pillars_desc', 'Every story we tell, every analysis we publish, and every conversation we host is guided by these core commitments.' );
        $styles = mlws_get_style_mission( 'mlws_mission_pillars', '#f8f9fa' );

        $pillar_defaults = [
            1 => [
                'Inform',
                'We report on the Abraham Accords, Cyrus Accord, and Israel-Iran relations with rigour and nuance — cutting through noise to deliver analysis that actually matters.',
                '#1B4F8A',
            ],
            2 => [
                'Connect',
                'We bridge policymakers, academics, journalists, and citizens — creating a shared platform where diverse voices shape the diplomatic conversation.',
                '#C0392B',
            ],
            3 => [
                'Advocate',
                'We believe dialogue is the foundation of peace. Merlows is unambiguously pro-diplomacy, supporting every credible effort to build sustainable regional stability.',
                '#D4A017',
            ],
            4 => [
                'Document',
                'History is made in real time. We build a permanent, searchable record of diplomatic milestones so that future generations can understand how today\'s peace was built.',
                '#1B4F8A',
            ],
        ];
    ?>
    <section class="section-padding" style="<?php echo $styles['section']; ?>">
        <div class="container">
            <div style="text-align:center;max-width:800px;margin:0 auto 60px;">
                <span class="tag-label" style="<?php echo $styles['tag']; ?>"><?php echo esc_html( $pillars_tag ); ?></span>
                <h2 style="font-family:'Outfit',sans-serif;font-weight:900;margin:16px 0; <?php if ( strpos( $styles['title'], 'font-size' ) === false ) echo 'font-size:40px;'; ?> <?php if ( strpos( $styles['title'], 'color' ) === false ) echo 'color:var(--secondary-color);'; ?> <?php echo $styles['title']; ?>">
                    <?php echo esc_html( $pillars_title ); ?>
                </h2>
                <p style="font-size:18px;color:var(--text-light); <?php echo $styles['text']; ?>"><?php echo esc_html( $pillars_desc ); ?></p>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:32px;">
                <?php for ( $i = 1; $i <= 4; $i++ ) :
                    $p_title = get_theme_mod( "mlws_mission_p{$i}_title", $pillar_defaults[ $i ][0] );
                    $p_desc  = get_theme_mod( "mlws_mission_p{$i}_desc",  $pillar_defaults[ $i ][1] );
                    $p_color = get_theme_mod( "mlws_mission_p{$i}_color", $pillar_defaults[ $i ][2] );
                ?>
                <div style="background:white;padding:32px;border-radius:0;box-shadow:0 4px 12px rgba(0,0,0,0.06);border-top:4px solid <?php echo esc_attr( $p_color ); ?>;">
                    <div style="font-size:36px;font-weight:900;font-family:'Outfit',sans-serif;color:<?php echo esc_attr( $p_color ); ?>;margin-bottom:16px;">0<?php echo $i; ?></div>
                    <h4 style="color:var(--secondary-color);font-family:'Outfit',sans-serif;font-weight:800;font-size:20px;margin-bottom:12px; <?php echo $styles['title']; ?>"><?php echo esc_html( $p_title ); ?></h4>
                    <p style="color:var(--text-light);font-size:15px;line-height:1.6;margin:0; <?php echo $styles['text']; ?>"><?php echo esc_html( $p_desc ); ?></p>
                </div>
                <?php endfor; ?>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <!-- FOCUS AREAS SECTION -->
    <?php if ( get_theme_mod( 'mlws_mission_focus_show', true ) ) :
        $focus_tag   = get_theme_mod( 'mlws_mission_focus_tag', 'Our Focus' );
        $focus_title = get_theme_mod( 'mlws_mission_focus_title', 'The Stories We Cover' );
        $focus_desc  = get_theme_mod( 'mlws_mission_focus_desc', 'Merlows provides expert-led coverage across the key diplomatic frameworks and relationships shaping the modern Middle East.' );
        $styles = mlws_get_style_mission( 'mlws_mission_focus', '#142846' );

        $focus_defaults = [
            1 => [ 'Abraham Accords',     'In-depth reporting on the normalisation agreements between Israel and Arab states, and the expanding circle of peace they represent.' ],
            2 => [ 'Cyrus Accord',         'Dedicated coverage of Merlows\' own diplomatic initiative — fostering a new framework for Israel-Iran dialogue and mutual recognition.' ],
            3 => [ 'Israel-Iran Relations', 'Analytical journalism covering the security, political, and cultural dimensions of one of the world\'s most consequential bilateral relationships.' ],
            4 => [ 'Regional Voices',      'Op-eds and commentary from regional thinkers, diplomats, and civil society leaders on the ground — perspectives rarely heard in Western media.' ],
            5 => [ 'Diplomatic Analysis',  'Expert breakdowns of treaties, negotiations, and backchannel efforts — explaining what\'s happening, why it matters, and what comes next.' ],
            6 => [ 'Breaking News',        'Fast, accurate, and context-rich reporting on developments as they unfold — with no sensationalism, no filler.' ],
        ];
    ?>
    <section class="section-padding" style="<?php echo $styles['section']; ?> color:white;">
        <div class="container">
            <div style="text-align:center;max-width:800px;margin:0 auto 60px;">
                <span class="tag-label" style="color:var(--primary-color);background:rgba(27,79,138,0.2); <?php echo $styles['tag']; ?>"><?php echo esc_html( $focus_tag ); ?></span>
                <h2 style="font-family:'Outfit',sans-serif;font-weight:900;margin:16px 0; <?php if ( strpos( $styles['title'], 'font-size' ) === false ) echo 'font-size:40px;'; ?> <?php if ( strpos( $styles['title'], 'color' ) === false ) echo 'color:white;'; ?> <?php echo $styles['title']; ?>">
                    <?php echo esc_html( $focus_title ); ?>
                </h2>
                <p style="font-size:18px;color:rgba(255,255,255,0.8); <?php echo $styles['text']; ?>"><?php echo esc_html( $focus_desc ); ?></p>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;">
                <?php for ( $i = 1; $i <= 6; $i++ ) :
                    $f_title = get_theme_mod( "mlws_mission_f{$i}_title", $focus_defaults[ $i ][0] );
                    $f_desc  = get_theme_mod( "mlws_mission_f{$i}_desc",  $focus_defaults[ $i ][1] );
                ?>
                <div style="background:rgba(255,255,255,0.05);padding:28px;border-radius:0;border:1px solid rgba(255,255,255,0.1);">
                    <h4 style="color:white;font-family:'Outfit',sans-serif;font-weight:700;font-size:18px;margin-bottom:10px; <?php echo $styles['title']; ?>"><?php echo esc_html( $f_title ); ?></h4>
                    <p style="color:rgba(255,255,255,0.7);font-size:14px;line-height:1.6;margin:0; <?php echo $styles['text']; ?>"><?php echo esc_html( $f_desc ); ?></p>
                </div>
                <?php endfor; ?>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <!-- ROADMAP / TIMELINE SECTION -->
    <?php if ( get_theme_mod( 'mlws_mission_roadmap_show', true ) ) :
        $roadmap_tag   = get_theme_mod( 'mlws_mission_roadmap_tag', 'Where We Are Heading' );
        $roadmap_title = get_theme_mod( 'mlws_mission_roadmap_title', 'Building Peace, One Story at a Time' );
        $roadmap_desc  = get_theme_mod( 'mlws_mission_roadmap_desc', 'Our roadmap reflects a long-term commitment to expanding diplomatic journalism and creating new spaces for constructive dialogue.' );
        $styles = mlws_get_style_mission( 'mlws_mission_roadmap', '#fff' );

        $milestone_defaults = [
            1 => [ 'Founding',            'Merlows launches as an independent news portal dedicated exclusively to Middle East diplomatic coverage and peace-building journalism.' ],
            2 => [ 'Cyrus Accord Launch', 'Merlows unveils the Cyrus Accord initiative — a new diplomatic framework proposing a path toward Israel-Iran normalisation.' ],
            3 => [ 'Expert Network',      'A curated network of regional analysts, former diplomats, and on-the-ground correspondents joins the Merlows contributor platform.' ],
            4 => [ 'AI-Powered Research', 'Launch of the Merlows AI assistant — giving readers instant access to deep-dive analysis and historical context on any diplomatic topic.' ],
            5 => [ 'Global Expansion',    'Merlows expands coverage and partnerships to include voices from across the Arab world, Iran, Israel, Europe, and North America.' ],
        ];
    ?>
    <section class="section-padding" style="<?php echo $styles['section']; ?>">
        <div class="container">
            <div style="text-align:center;max-width:800px;margin:0 auto 60px;">
                <span class="tag-label" style="<?php echo $styles['tag']; ?>"><?php echo esc_html( $roadmap_tag ); ?></span>
                <h2 style="font-family:'Outfit',sans-serif;font-weight:900;margin:16px 0; <?php if ( strpos( $styles['title'], 'font-size' ) === false ) echo 'font-size:40px;'; ?> <?php if ( strpos( $styles['title'], 'color' ) === false ) echo 'color:var(--secondary-color);'; ?> <?php echo $styles['title']; ?>">
                    <?php echo esc_html( $roadmap_title ); ?>
                </h2>
                <p style="font-size:18px;color:var(--text-light); <?php echo $styles['text']; ?>"><?php echo esc_html( $roadmap_desc ); ?></p>
            </div>
            <div style="position:relative;max-width:720px;margin:0 auto;">
                <!-- Vertical line -->
                <div style="position:absolute;left:28px;top:0;bottom:0;width:2px;background:linear-gradient(to bottom,var(--primary-color),#C0392B);"></div>
                <?php for ( $i = 1; $i <= 5; $i++ ) :
                    $m_title = get_theme_mod( "mlws_mission_m{$i}_title", $milestone_defaults[ $i ][0] );
                    $m_desc  = get_theme_mod( "mlws_mission_m{$i}_desc",  $milestone_defaults[ $i ][1] );
                ?>
                <div style="display:flex;gap:32px;align-items:flex-start;margin-bottom:40px;position:relative;">
                    <div style="flex-shrink:0;width:58px;height:58px;border-radius:50%;background:var(--primary-color);display:flex;align-items:center;justify-content:center;color:white;font-family:'Outfit',sans-serif;font-weight:900;font-size:20px;z-index:1;">
                        <?php echo $i; ?>
                    </div>
                    <div style="background:white;padding:24px 28px;border-radius:0;box-shadow:0 4px 12px rgba(0,0,0,0.06);flex:1;">
                        <h4 style="font-family:'Outfit',sans-serif;font-weight:800;color:var(--secondary-color);margin-bottom:8px; <?php echo $styles['title']; ?>"><?php echo esc_html( $m_title ); ?></h4>
                        <p style="color:var(--text-light);font-size:15px;line-height:1.6;margin:0; <?php echo $styles['text']; ?>"><?php echo esc_html( $m_desc ); ?></p>
                    </div>
                </div>
                <?php endfor; ?>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <!-- PROMO BLOCKS -->
    <?php for ( $p = 1; $p <= 2; $p++ ) :
        $prefix = "mlws_mission_promo$p";
        if ( get_theme_mod( $prefix . '_show', true ) ) :
            $img     = get_theme_mod( $prefix . '_img' );
            $title   = get_theme_mod( $prefix . '_title', 'Promo title' );
            $sub     = get_theme_mod( $prefix . '_sub', '' );
            $desc    = get_theme_mod( $prefix . '_desc', 'Promo description text goes here.' );
            $btn_lbl = get_theme_mod( $prefix . '_btn_lbl', 'Learn More' );
            $btn_url = get_theme_mod( $prefix . '_btn_url', '#' );
            $layout  = get_theme_mod( $prefix . '_layout', 'img-left' );
            $styles  = mlws_get_style_mission( $prefix, '#fff' );
            $flex_dir = ( $layout === 'img-right' ) ? 'flex-direction:row-reverse;' : '';
    ?>
    <section class="section-padding" style="<?php echo $styles['section']; ?>">
        <div class="container">
            <div style="display:flex;flex-wrap:wrap;gap:60px;align-items:center; <?php echo $flex_dir; ?>">
                <div style="flex:1;min-width:300px;">
                    <?php if ( $img ) : ?>
                        <img src="<?php echo esc_url( $img ); ?>" alt="<?php echo esc_attr( $title ); ?>" style="width:100%;border-radius:0;box-shadow:0 20px 40px rgba(0,0,0,0.1);">
                    <?php else : ?>
                        <div style="width:100%;aspect-ratio:16/9;background:#eee;border-radius:0;display:flex;align-items:center;justify-content:center;color:#ccc;">No Image Selected</div>
                    <?php endif; ?>
                </div>
                <div style="flex:1;min-width:300px;">
                    <?php if ( $sub ) : ?><span class="tag-label" style="<?php echo $styles['tag']; ?>"><?php echo esc_html( $sub ); ?></span><?php endif; ?>
                    <h2 style="font-family:'Outfit',sans-serif;font-weight:900;margin:16px 0; <?php if ( strpos( $styles['title'], 'font-size' ) === false ) echo 'font-size:36px;'; ?> <?php if ( strpos( $styles['title'], 'color' ) === false ) echo 'color:var(--secondary-color);'; ?> <?php echo $styles['title']; ?>"><?php echo esc_html( $title ); ?></h2>
                    <p style="font-size:18px;color:var(--text-light);line-height:1.7;margin-bottom:30px; <?php echo $styles['text']; ?>"><?php echo esc_html( $desc ); ?></p>
                    <?php if ( $btn_lbl ) : ?>
                        <a href="<?php echo esc_url( $btn_url ); ?>" class="btn btn-primary"><?php echo esc_html( $btn_lbl ); ?></a>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </section>
    <?php endif; endfor; ?>

    <!-- CTA STRIP -->
    <?php if ( get_theme_mod( 'mlws_mission_cta_show', true ) ) :
        $cta_title    = get_theme_mod( 'mlws_mission_cta_title', 'Join the Diplomacy Conversation' );
        $cta_desc     = get_theme_mod( 'mlws_mission_cta_desc', "Whether you're a policymaker, journalist, academic, or engaged citizen — Merlows is your home for the most important diplomatic story of our time." );
        $cta_btn1_lbl = get_theme_mod( 'mlws_mission_cta_btn1_label', 'Read Our Analysis' );
        $cta_btn1_url = get_theme_mod( 'mlws_mission_cta_btn1_url', '/diplomatic-analysis/' );
        $cta_btn2_lbl = get_theme_mod( 'mlws_mission_cta_btn2_label', 'About Merlows' );
        $cta_btn2_url = get_theme_mod( 'mlws_mission_cta_btn2_url', '/about/' );
        $styles = mlws_get_style_mission( 'mlws_mission_cta', '#1B4F8A' );
    ?>
    <section class="section-padding" style="<?php echo $styles['section']; ?> color:white;text-align:center;">
        <div class="container" style="max-width:800px;">
            <h2 style="font-family:'Outfit',sans-serif;font-weight:800;margin-bottom:16px; <?php if ( strpos( $styles['title'], 'font-size' ) === false ) echo 'font-size:36px;'; ?> <?php echo $styles['title']; ?>">
                <?php echo esc_html( $cta_title ); ?>
            </h2>
            <p style="opacity:0.9;margin-bottom:32px;line-height:1.6; <?php if ( strpos( $styles['text'], 'font-size' ) === false ) echo 'font-size:18px;'; ?> <?php echo $styles['text']; ?>">
                <?php echo esc_html( $cta_desc ); ?>
            </p>
            <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap;">
                <a href="<?php echo esc_url( $cta_btn1_url ); ?>" class="btn" style="background:white;color:#1B4F8A;font-weight:700;padding:12px 28px;border-radius:0;text-decoration:none;"><?php echo esc_html( $cta_btn1_lbl ); ?></a>
                <a href="<?php echo esc_url( $cta_btn2_url ); ?>" class="btn" style="background:transparent;border:2px solid white;color:white;font-weight:700;padding:10px 28px;border-radius:0;text-decoration:none;"><?php echo esc_html( $cta_btn2_lbl ); ?></a>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <!-- PAGE CONTENT SECTION -->
    <section class="section-padding content-section" style="background:#ffffff;">
        <div class="container">
            <?php while ( have_posts() ) : the_post(); ?>
            <div class="entry-content" style="line-height:1.8;">
                <?php the_content(); ?>
            </div>
            <?php endwhile; ?>
        </div>
    </section>

</main>

<?php get_footer(); ?>
