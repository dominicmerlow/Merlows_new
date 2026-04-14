<?php
/**
 * Template Name: Healthcare Professionals
 */
get_header(); ?>

<main id="main-content">

    <!-- HERO SECTION -->
    <?php
    $hero_bg    = get_theme_mod( 'ibdhh_hcp_hero_bg', get_template_directory_uri() . '/assets/img/hcp_hero.png' );
    $hero_tag   = get_theme_mod( 'ibdhh_hcp_hero_tag', 'Professional Portal' );
    $hero_title = get_theme_mod( 'ibdhh_hcp_hero_title', 'Advancing <span class="highlight">Clinical Practice</span> Through Nutrition' );
    $hero_desc  = get_theme_mod( 'ibdhh_hcp_hero_desc', 'Evidence-based resources, clinical protocols, and CME opportunities designed for gastroenterologists, dietitians, GPs, and allied health professionals.' );
    ?>
    <section class="hero hcp-hero" style="padding: 80px 0 120px; display: flex; align-items: center; background: linear-gradient(rgba(10,25,41,0.75), rgba(10,25,41,0.9)), url('<?php echo esc_url( $hero_bg ); ?>') no-repeat center center; background-size: cover;">
        <div class="container">
            <div class="hero-content">
                <span class="tag-label"><?php echo esc_html( $hero_tag ); ?></span>
                <h1><?php echo wp_kses_post( $hero_title ); ?></h1>
                <p><?php echo esc_html( $hero_desc ); ?></p>
                <div class="hero-actions" style="margin-top: 24px;">
                    <a href="#resources" class="btn btn-primary">Access Resources</a>
                    <a href="#register" class="btn btn-outline">Register Free</a>
                </div>
            </div>
        </div>
    </section>

    <!-- RESOURCES SECTION -->
    <?php
    $res_tag   = get_theme_mod( 'ibdhh_hcp_res_tag',   'Join the Effort' );
    $res_title = get_theme_mod( 'ibdhh_hcp_res_title',  "What You'll Access" );
    $res_desc  = get_theme_mod( 'ibdhh_hcp_res_desc',  'We invite passionate healthcare practitioners to join us in advancing clinical nutrition. Share your expertise and help shape the future of specialized healthcare content.' );

    $res_defaults = array(
        1 => array( 'Clinical Protocols',  'Step-by-step treatment algorithms for common and complex GI conditions, including FSMP integration.' ),
        2 => array( 'Research Summaries',  'Curated abstracts and commentary on the latest Omega-3, gut microbiome, and longevity research.' ),
        3 => array( 'Webinars & CME',      'On-demand educational sessions with CPD accreditation from leading gastroenterology experts.' ),
        4 => array( 'Patient Handouts',    'Downloadable, branded resources to share with patients to reinforce dietary and treatment advice.' ),
    );
    $res_colors = array(
        1 => 'var(--primary-color), #e04f00',
        2 => '#0ea5e9, #0284c7',
        3 => '#9F2B68, #059669',
        4 => '#C75D8E, #B8447A',
    );
    $res_icons = array(
        1 => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>',
        2 => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>',
        3 => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>',
        4 => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>',
    );
    ?>
    <section id="resources" class="section-padding" style="background: var(--accent-color);">
        <div class="container">
            <div class="text-center max-600 margin-b-60">
                <span class="tag-section"><?php echo esc_html( $res_tag ); ?></span>
                <h2 style="color: var(--secondary-color);"><?php echo esc_html( $res_title ); ?></h2>
                <p style="color: var(--text-light);"><?php echo esc_html( $res_desc ); ?></p>
            </div>
            <div class="grid-2 resource-grid">
                <?php for ( $i = 1; $i <= 4; $i++ ) :
                    $card_title = get_theme_mod( "ibdhh_hcp_res{$i}_title", $res_defaults[ $i ][0] );
                    $card_desc  = get_theme_mod( "ibdhh_hcp_res{$i}_desc",  $res_defaults[ $i ][1] );
                ?>
                <div style="display: flex; gap: 20px; padding: 32px; background: white; border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
                    <div style="flex-shrink: 0; width: 56px; height: 56px; background: linear-gradient(135deg, <?php echo $res_colors[ $i ]; ?>); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                        <svg width="28" height="28" fill="none" stroke="white" viewBox="0 0 24 24"><?php echo $res_icons[ $i ]; ?></svg>
                    </div>
                    <div>
                        <h4 style="font-size: 18px; color: var(--secondary-color); margin-bottom: 8px;"><?php echo esc_html( $card_title ); ?></h4>
                        <p style="color: var(--text-light); font-size: 14px; margin: 0;"><?php echo esc_html( $card_desc ); ?></p>
                    </div>
                </div>
                <?php endfor; ?>
            </div>
        </div>
    </section>

    <!-- COLLABORATE SECTION -->
    <?php
    $collab_title = get_theme_mod( 'ibdhh_hcp_collab_title', 'Collaborate with IBD Health Hub' );
    $collab_defaults = array(
        1 => array( 'Submit Articles',  'Publish your clinical insights and case studies to our global network of peers.' ),
        2 => array( 'Co-Author Content','Partner with our medical writing team to develop robust, evidence-based clinical guides.' ),
        3 => array( 'Podcast Guest',    'Join our clinical podcast series to discuss innovations, challenges, and success stories.' ),
        4 => array( 'Clinical Trials',  'Work with us on our pipeline of clinical and in-market trials investigating novel specific treatments.' ),
    );
    $collab_colors = array(
        1 => 'var(--primary-color)',
        2 => '#9F2B68',
        3 => '#0ea5e9',
        4 => '#C75D8E',
    );
    ?>
    <section class="section-padding" style="background: white;">
        <div class="container">
            <h2 class="text-center" style="color: var(--secondary-color); margin-bottom: 40px;"><?php echo esc_html( $collab_title ); ?></h2>
            <div class="grid-4 service-grid">
                <?php for ( $i = 1; $i <= 4; $i++ ) :
                    $col_title = get_theme_mod( "ibdhh_hcp_col{$i}_title", $collab_defaults[ $i ][0] );
                    $col_desc  = get_theme_mod( "ibdhh_hcp_col{$i}_desc",  $collab_defaults[ $i ][1] );
                ?>
                <div style="padding: 32px 24px; background: var(--accent-color); border-radius: var(--radius-lg); text-align: center; border-top: 4px solid <?php echo $collab_colors[ $i ]; ?>;">
                    <h4 style="font-size: 17px; color: var(--secondary-color); margin-bottom: 12px;"><?php echo esc_html( $col_title ); ?></h4>
                    <p style="font-size: 13px; color: var(--text-light); margin: 0;"><?php echo esc_html( $col_desc ); ?></p>
                </div>
                <?php endfor; ?>
            </div>
        </div>
    </section>

    <!-- REGISTER CTA -->
    <?php
    $cta_title = get_theme_mod( 'ibdhh_hcp_cta_title', 'Join the Professional Network' );
    $cta_desc  = get_theme_mod( 'ibdhh_hcp_cta_desc',  'Free registration gives you full access to protocols, research, and CME opportunities.' );
    ?>
    <section id="register" class="section-padding" style="background: linear-gradient(135deg, var(--secondary-color), #112240);">
        <div class="container" style="text-align: center; color: white;">
            <h2 style="color: white; margin-bottom: 16px;"><?php echo esc_html( $cta_title ); ?></h2>
            <p class="max-600" style="font-size: 18px; margin-bottom: 32px; color: rgba(255,255,255,0.85);"><?php echo esc_html( $cta_desc ); ?></p>
            <form class="hcp-register-form" style="display: flex; gap: 12px; max-width: 600px; margin: 0 auto; flex-wrap: wrap; justify-content: center;">
                <input type="email" placeholder="Professional email" class="form-input" style="flex: 1; min-width: 200px; padding: 14px 20px; border: none; border-radius: var(--radius-md); font-size: 16px;">
                <select style="padding: 14px 20px; border: none; border-radius: var(--radius-md); font-size: 16px; background: white;">
                    <option>Select Role</option>
                    <option>Gastroenterologist</option>
                    <option>Dietitian</option>
                    <option>GP / PCP</option>
                    <option>Pharmacist</option>
                    <option>Nurse</option>
                    <option>Other HCP</option>
                </select>
                <button type="submit" class="btn btn-primary">Register Free</button>
            </form>
        </div>
    </section>

</main>

<?php get_footer(); ?>
