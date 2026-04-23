<?php
/**
 * Template Name: How to Use
 */

get_header(); ?>

<main id="main-content">
    <?php
    if ( ! function_exists( 'mlws_get_style_howto' ) ) {
        function mlws_get_style_howto( $prefix, $default_bg = '' ) {
            $bg       = get_theme_mod( $prefix . '_bg', $default_bg );
            $t_color  = get_theme_mod( $prefix . '_title_color' );
            $t_size   = get_theme_mod( $prefix . '_title_size' );
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
    <?php if ( get_theme_mod( 'mlws_howto_hero_show', true ) ) :
        $hero_img      = get_theme_mod( 'mlws_howto_hero_img', get_template_directory_uri() . '/assets/img/news_hero.png' );
        $hero_bg_color = get_theme_mod( 'mlws_howto_hero_bg_color' );
        $hero_tag      = get_theme_mod( 'mlws_howto_hero_tag', 'Get Started' );
        $hero_title    = get_theme_mod( 'mlws_howto_hero_title', 'How to Use <span class="highlight">Merlows</span>' );
        $hero_desc     = get_theme_mod( 'mlws_howto_hero_desc', 'Everything you need to navigate the platform, find the analysis that matters, and get the most out of our AI research assistant.' );

        $styles = mlws_get_style_howto( 'mlws_howto_hero' );
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

    <!-- QUICK START SECTION -->
    <?php if ( get_theme_mod( 'mlws_howto_quickstart_show', true ) ) :
        $qs_tag   = get_theme_mod( 'mlws_howto_qs_tag', 'Quick Start' );
        $qs_title = get_theme_mod( 'mlws_howto_qs_title', 'Up and Running in 3 Steps' );
        $qs_desc  = get_theme_mod( 'mlws_howto_qs_desc', 'No account required to read. Just land on the site and start exploring — here\'s the fastest path to the content you need.' );
        $styles   = mlws_get_style_howto( 'mlws_howto_quickstart', '#fff' );

        $qs_defaults = [
            1 => [ 'Pick a Topic',        'Use the top navigation to choose your area of interest — Breaking News, Diplomatic Analysis, Op-Eds, Abraham Accords, Cyrus Accord, or Regional Voices.',  '/diplomatic-analysis/' ],
            2 => [ 'Read or Ask',          'Browse the latest articles, or jump straight to the AI assistant and ask any question about Middle East diplomacy in plain language.',                       '/ask-ai/'              ],
            3 => [ 'Go Deeper',           'Every article links to related analyses, source documents, and expert commentary. Follow the threads to build a complete picture.',                          '/about/'               ],
        ];
    ?>
    <section class="section-padding" style="<?php echo $styles['section']; ?>">
        <div class="container">
            <div style="text-align:center;max-width:800px;margin:0 auto 60px;">
                <span class="tag-label" style="<?php echo $styles['tag']; ?>"><?php echo esc_html( $qs_tag ); ?></span>
                <h2 style="font-family:'Outfit',sans-serif;font-weight:900;margin:16px 0; <?php if ( strpos( $styles['title'], 'font-size' ) === false ) echo 'font-size:40px;'; ?> <?php if ( strpos( $styles['title'], 'color' ) === false ) echo 'color:var(--secondary-color);'; ?> <?php echo $styles['title']; ?>">
                    <?php echo esc_html( $qs_title ); ?>
                </h2>
                <p style="font-size:18px;color:var(--text-light); <?php echo $styles['text']; ?>"><?php echo esc_html( $qs_desc ); ?></p>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:32px;">
                <?php for ( $i = 1; $i <= 3; $i++ ) :
                    $s_title = get_theme_mod( "mlws_howto_qs{$i}_title", $qs_defaults[$i][0] );
                    $s_desc  = get_theme_mod( "mlws_howto_qs{$i}_desc",  $qs_defaults[$i][1] );
                    $s_url   = get_theme_mod( "mlws_howto_qs{$i}_url",   $qs_defaults[$i][2] );
                ?>
                <div style="background:#f8f9fa;padding:36px 32px;border-radius:0;border-top:4px solid var(--primary-color);position:relative;">
                    <div style="font-size:48px;font-weight:900;font-family:'Outfit',sans-serif;color:rgba(27,79,138,0.12);position:absolute;top:16px;right:20px;line-height:1;"><?php echo $i; ?></div>
                    <h3 style="font-family:'Outfit',sans-serif;font-weight:800;font-size:22px;color:var(--secondary-color);margin-bottom:12px; <?php echo $styles['title']; ?>"><?php echo esc_html( $s_title ); ?></h3>
                    <p style="color:var(--text-light);font-size:15px;line-height:1.6;margin:0 0 20px; <?php echo $styles['text']; ?>"><?php echo esc_html( $s_desc ); ?></p>
                    <?php if ( $s_url && $s_url !== '#' ) : ?>
                    <a href="<?php echo esc_url( $s_url ); ?>" style="color:var(--primary-color);font-weight:700;font-size:14px;text-decoration:none;">Explore →</a>
                    <?php endif; ?>
                </div>
                <?php endfor; ?>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <!-- STEP-BY-STEP GUIDE -->
    <?php if ( get_theme_mod( 'mlws_howto_guide_show', true ) ) :
        $guide_tag   = get_theme_mod( 'mlws_howto_guide_tag', 'The Full Guide' );
        $guide_title = get_theme_mod( 'mlws_howto_guide_title', 'Making the Most of Merlows' );
        $guide_desc  = get_theme_mod( 'mlws_howto_guide_desc', 'A walkthrough of every major feature on the platform.' );
        $styles      = mlws_get_style_howto( 'mlws_howto_guide', '#f8f9fa' );

        $step_defaults = [
            1 => [
                'Navigate the Categories',
                'The main menu organises all content into six sections: Breaking News for fast-moving developments; Diplomatic Analysis for expert-written deep dives; Op-Eds & Commentary for regional perspectives; Abraham Accords for normalisation coverage; Cyrus Accord for Merlows\' own peace initiative; and Regional Voices for on-the-ground reporting.',
                'Navigation',
            ],
            2 => [
                'Read an Article',
                'Every article opens with a summary panel so you can assess relevance before reading. Below the body you\'ll find related articles, source links, and a tag cloud to continue your research. Use the share buttons to send analysis to colleagues.',
                'Reading',
            ],
            3 => [
                'Use the AI Assistant',
                'Click "Ask AI" in the navigation to open the research assistant. Type any question in plain language — "What are the key barriers to Israel-Iran normalisation?" or "Summarise the Abraham Accords" — and receive a sourced, structured response drawing on the Merlows editorial archive.',
                'AI Research',
            ],
            4 => [
                'Search and Filter',
                'Use the search bar to find articles by keyword, author, or topic. On category archive pages, use the filter controls to narrow by date range. Bookmark articles using your browser or save them to the Merlows reading list if you\'re registered.',
                'Search',
            ],
            5 => [
                'Join the Community',
                'Register for a free account to unlock comment threads, save your reading list, receive the weekly diplomatic briefing by email, and submit your own commentary for editorial consideration.',
                'Community',
            ],
        ];
    ?>
    <section class="section-padding" style="<?php echo $styles['section']; ?>">
        <div class="container">
            <div style="text-align:center;max-width:800px;margin:0 auto 60px;">
                <span class="tag-label" style="<?php echo $styles['tag']; ?>"><?php echo esc_html( $guide_tag ); ?></span>
                <h2 style="font-family:'Outfit',sans-serif;font-weight:900;margin:16px 0; <?php if ( strpos( $styles['title'], 'font-size' ) === false ) echo 'font-size:40px;'; ?> <?php if ( strpos( $styles['title'], 'color' ) === false ) echo 'color:var(--secondary-color);'; ?> <?php echo $styles['title']; ?>">
                    <?php echo esc_html( $guide_title ); ?>
                </h2>
                <p style="font-size:18px;color:var(--text-light); <?php echo $styles['text']; ?>"><?php echo esc_html( $guide_desc ); ?></p>
            </div>
            <div style="display:flex;flex-direction:column;gap:0;max-width:860px;margin:0 auto;">
                <?php for ( $i = 1; $i <= 5; $i++ ) :
                    $st_title = get_theme_mod( "mlws_howto_step{$i}_title", $step_defaults[$i][0] );
                    $st_desc  = get_theme_mod( "mlws_howto_step{$i}_desc",  $step_defaults[$i][1] );
                    $st_label = get_theme_mod( "mlws_howto_step{$i}_label", $step_defaults[$i][2] );
                ?>
                <div style="display:flex;gap:0;background:white;border-bottom:1px solid #e2e8f0; <?php if ($i===1) echo 'border-top:1px solid #e2e8f0;'; ?>">
                    <div style="width:80px;flex-shrink:0;background:var(--primary-color);display:flex;align-items:center;justify-content:center;color:white;font-family:'Outfit',sans-serif;font-weight:900;font-size:24px;">
                        <?php echo str_pad($i, 2, '0', STR_PAD_LEFT); ?>
                    </div>
                    <div style="padding:28px 32px;flex:1;">
                        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
                            <h3 style="font-family:'Outfit',sans-serif;font-weight:800;font-size:20px;color:var(--secondary-color);margin:0; <?php echo $styles['title']; ?>"><?php echo esc_html( $st_title ); ?></h3>
                            <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--primary-color);background:rgba(27,79,138,0.08);padding:3px 10px;border-radius:20px;"><?php echo esc_html( $st_label ); ?></span>
                        </div>
                        <p style="color:var(--text-light);font-size:15px;line-height:1.7;margin:0; <?php echo $styles['text']; ?>"><?php echo esc_html( $st_desc ); ?></p>
                    </div>
                </div>
                <?php endfor; ?>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <!-- USE CASES -->
    <?php if ( get_theme_mod( 'mlws_howto_usecases_show', true ) ) :
        $uc_tag   = get_theme_mod( 'mlws_howto_uc_tag', 'Who Uses Merlows' );
        $uc_title = get_theme_mod( 'mlws_howto_uc_title', 'Built for Every Audience' );
        $uc_desc  = get_theme_mod( 'mlws_howto_uc_desc', 'Whether you follow the news casually or work at the heart of diplomacy, Merlows has something for you.' );
        $styles   = mlws_get_style_howto( 'mlws_howto_usecases', '#142846' );

        $uc_defaults = [
            1 => [ 'Policymakers & Diplomats',  'Track the latest developments, access expert analysis, and use the AI assistant to research treaty precedents or regional dynamics in seconds.'       ],
            2 => [ 'Journalists & Researchers',  'Use Merlows as a primary and secondary source — our editorial archive, expert contributors, and AI research tool are built for serious inquiry.'        ],
            3 => [ 'Students & Academics',       'Explore the full diplomatic history of the Abraham Accords and Cyrus Accord with cited analysis, timeline tools, and a growing research library.'     ],
            4 => [ 'Engaged Citizens',            'Cut through the noise. Merlows explains the context behind every headline so you understand not just what happened, but why it matters.'                ],
            5 => [ 'NGOs & Civil Society',        'Monitor developments relevant to peace-building, human rights, and regional stability — and connect your work to the broader diplomatic conversation.' ],
            6 => [ 'Business & Investors',        'Understand the geopolitical risk and opportunity landscape shaped by normalisation deals and shifting regional alliances.'                               ],
        ];
    ?>
    <section class="section-padding" style="<?php echo $styles['section']; ?> color:white;">
        <div class="container">
            <div style="text-align:center;max-width:800px;margin:0 auto 60px;">
                <span class="tag-label" style="color:var(--primary-color);background:rgba(27,79,138,0.2); <?php echo $styles['tag']; ?>"><?php echo esc_html( $uc_tag ); ?></span>
                <h2 style="font-family:'Outfit',sans-serif;font-weight:900;margin:16px 0; <?php if ( strpos( $styles['title'], 'font-size' ) === false ) echo 'font-size:40px;'; ?> <?php if ( strpos( $styles['title'], 'color' ) === false ) echo 'color:white;'; ?> <?php echo $styles['title']; ?>">
                    <?php echo esc_html( $uc_title ); ?>
                </h2>
                <p style="font-size:18px;color:rgba(255,255,255,0.8); <?php echo $styles['text']; ?>"><?php echo esc_html( $uc_desc ); ?></p>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;">
                <?php for ( $i = 1; $i <= 6; $i++ ) :
                    $uc_title_i = get_theme_mod( "mlws_howto_uc{$i}_title", $uc_defaults[$i][0] );
                    $uc_desc_i  = get_theme_mod( "mlws_howto_uc{$i}_desc",  $uc_defaults[$i][1] );
                ?>
                <div style="background:rgba(255,255,255,0.05);padding:28px;border-radius:0;border:1px solid rgba(255,255,255,0.1);">
                    <h4 style="color:white;font-family:'Outfit',sans-serif;font-weight:700;font-size:17px;margin-bottom:10px; <?php echo $styles['title']; ?>"><?php echo esc_html( $uc_title_i ); ?></h4>
                    <p style="color:rgba(255,255,255,0.7);font-size:14px;line-height:1.6;margin:0; <?php echo $styles['text']; ?>"><?php echo esc_html( $uc_desc_i ); ?></p>
                </div>
                <?php endfor; ?>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <!-- FAQ SECTION -->
    <?php if ( get_theme_mod( 'mlws_howto_faq_show', true ) ) :
        $faq_tag   = get_theme_mod( 'mlws_howto_faq_tag', 'FAQ' );
        $faq_title = get_theme_mod( 'mlws_howto_faq_title', 'Frequently Asked Questions' );
        $styles    = mlws_get_style_howto( 'mlws_howto_faq', '#fff' );

        $faq_defaults = [
            1 => [ 'Is Merlows free to use?',             'Yes. All articles, analyses, and the AI assistant are free to access. Registration is optional and unlocks additional features like a saved reading list and the weekly briefing email.' ],
            2 => [ 'Is the AI assistant reliable?',        'The Merlows AI draws on our curated editorial archive and is designed specifically for diplomatic and geopolitical topics. As with any AI tool, we recommend cross-referencing important claims with the linked source articles.' ],
            3 => [ 'How often is content published?',      'Breaking news is published as events develop. Diplomatic analysis and op-eds are published several times per week. The weekly briefing email goes out every Monday morning.' ],
            4 => [ 'Can I submit an article or op-ed?',    'Yes. We welcome contributions from regional experts, academics, and practitioners. Visit our Contact page and select "Submit a Contribution" to send us a pitch.' ],
            5 => [ 'What is the Cyrus Accord?',            'The Cyrus Accord is Merlows\' own diplomatic initiative — a proposed framework for Israel-Iran normalisation inspired by the legacy of Cyrus the Great. Visit our dedicated Cyrus Accord section to learn more.' ],
            6 => [ 'How do I report an error in an article?', 'Click the "Report an Error" link at the bottom of any article, or use the Contact page. We take accuracy seriously and publish corrections promptly.' ],
        ];
    ?>
    <section class="section-padding" style="<?php echo $styles['section']; ?>">
        <div class="container" style="max-width:800px;">
            <div style="text-align:center;margin-bottom:60px;">
                <span class="tag-label" style="<?php echo $styles['tag']; ?>"><?php echo esc_html( $faq_tag ); ?></span>
                <h2 style="font-family:'Outfit',sans-serif;font-weight:900;margin:16px 0; <?php if ( strpos( $styles['title'], 'font-size' ) === false ) echo 'font-size:40px;'; ?> <?php if ( strpos( $styles['title'], 'color' ) === false ) echo 'color:var(--secondary-color);'; ?> <?php echo $styles['title']; ?>">
                    <?php echo esc_html( $faq_title ); ?>
                </h2>
            </div>
            <div style="display:flex;flex-direction:column;gap:0;">
                <?php for ( $i = 1; $i <= 6; $i++ ) :
                    $fq = get_theme_mod( "mlws_howto_faq{$i}_q", $faq_defaults[$i][0] );
                    $fa = get_theme_mod( "mlws_howto_faq{$i}_a", $faq_defaults[$i][1] );
                ?>
                <div style="padding:24px 0;border-bottom:1px solid #e2e8f0; <?php if ($i===1) echo 'border-top:1px solid #e2e8f0;'; ?>">
                    <h4 style="font-family:'Outfit',sans-serif;font-weight:700;font-size:17px;color:var(--secondary-color);margin:0 0 10px; <?php echo $styles['title']; ?>"><?php echo esc_html( $fq ); ?></h4>
                    <p style="color:var(--text-light);font-size:15px;line-height:1.7;margin:0; <?php echo $styles['text']; ?>"><?php echo esc_html( $fa ); ?></p>
                </div>
                <?php endfor; ?>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <!-- CTA STRIP -->
    <?php if ( get_theme_mod( 'mlws_howto_cta_show', true ) ) :
        $cta_title    = get_theme_mod( 'mlws_howto_cta_title', 'Ready to Explore?' );
        $cta_desc     = get_theme_mod( 'mlws_howto_cta_desc', "Dive into the latest diplomatic analysis, ask the AI your first question, or read about the peace initiative we're championing." );
        $cta_btn1_lbl = get_theme_mod( 'mlws_howto_cta_btn1_label', 'Read Latest Analysis' );
        $cta_btn1_url = get_theme_mod( 'mlws_howto_cta_btn1_url', '/diplomatic-analysis/' );
        $cta_btn2_lbl = get_theme_mod( 'mlws_howto_cta_btn2_label', 'Ask the AI' );
        $cta_btn2_url = get_theme_mod( 'mlws_howto_cta_btn2_url', '/ask-ai/' );
        $styles = mlws_get_style_howto( 'mlws_howto_cta', '#1B4F8A' );
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
