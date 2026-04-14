<?php
/**
 * Template Name: Patients
 */
get_header(); ?>

<main id="main-content">

    <!-- HERO SECTION -->
    <?php
    $hero_bg    = get_theme_mod( 'mlws_pat_hero_bg', get_template_directory_uri() . '/assets/img/patient_hero.png' );
    $hero_tag   = get_theme_mod( 'mlws_pat_hero_tag',   'Patient Portal' );
    $hero_title = get_theme_mod( 'mlws_pat_hero_title', 'Empowering Your <span class="highlight">Wellness Journey</span>' );
    $hero_desc  = get_theme_mod( 'mlws_pat_hero_desc',  'More than just a news site—a truly useful platform providing the highest quality clinical information, innovative tools, and expert opinions to help you explore and manage your gastro healthcare concerns.' );
    ?>
    <section class="hero patient-hero" style="padding: 80px 0 120px; display: flex; align-items: center; background: linear-gradient(rgba(10,25,41,0.7), rgba(10,25,41,0.85)), url('<?php echo esc_url( $hero_bg ); ?>') no-repeat center center; background-size: cover;">
        <div class="container">
            <div class="hero-content">
                <span class="tag-label"><?php echo esc_html( $hero_tag ); ?></span>
                <h1><?php echo wp_kses_post( $hero_title ); ?></h1>
                <p><?php echo esc_html( $hero_desc ); ?></p>
                <div class="hero-actions" style="margin-top: 24px;">
                    <a href="#benefits" class="btn btn-primary">Explore Resources</a>
                    <a href="#subscribe" class="btn btn-outline">Subscribe Free</a>
                </div>
            </div>
        </div>
    </section>

    <!-- BENEFITS SECTION -->
    <?php
    $ben_tag   = get_theme_mod( 'mlws_pat_ben_tag',   'Why Choose Merlows?' );
    $ben_title = get_theme_mod( 'mlws_pat_ben_title',  'Not Just Another Community' );
    $ben_desc  = get_theme_mod( 'mlws_pat_ben_desc',  'Merlows is a comprehensive suite of resources designed to aid your personal health journey. We bridge the gap between complex medical research and practical, daily wellness by providing clinical information in a format that is easy to understand.' );

    $ben_defaults = array(
        1 => array( 'Clear Clinical Info',   'Access cutting-edge clinical information translated into a clear, easy-to-understand format tailored for patients, without the medical jargon.' ),
        2 => array( 'Renowned Expertise',    'Engage with exclusive content, insights, and guidance produced directly by Merlows specialists and world-renowned gastro healthcare experts.' ),
        3 => array( 'Actionable Solutions',  'Take control with highly interactive calculators, health trackers, and personalized AI to bring the clinic directly into your home life.' ),
    );
    $ben_colors = array( 1 => 'var(--primary-color)', 2 => '#1B4F8A', 3 => '#C75D8E' );
    $ben_icons  = array(
        1 => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>',
        2 => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>',
        3 => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>',
    );
    ?>
    <section id="benefits" class="section-padding" style="background: white;">
        <div class="container">
            <div class="text-center max-600 margin-b-60">
                <span class="tag-section"><?php echo esc_html( $ben_tag ); ?></span>
                <h2 style="color: var(--secondary-color);"><?php echo esc_html( $ben_title ); ?></h2>
                <p style="color: var(--text-light);"><?php echo esc_html( $ben_desc ); ?></p>
            </div>
            <div class="grid-3 benefit-grid margin-b-60">
                <?php for ( $i = 1; $i <= 3; $i++ ) :
                    $ben_t = get_theme_mod( "mlws_pat_ben{$i}_title", $ben_defaults[ $i ][0] );
                    $ben_d = get_theme_mod( "mlws_pat_ben{$i}_desc",  $ben_defaults[ $i ][1] );
                ?>
                <div style="text-align: center; padding: 40px 24px; background: var(--accent-color); border-radius: var(--radius-lg);">
                    <div style="width: 64px; height: 64px; background: <?php echo $ben_colors[ $i ]; ?>; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                        <svg width="32" height="32" fill="none" stroke="white" viewBox="0 0 24 24"><?php echo $ben_icons[ $i ]; ?></svg>
                    </div>
                    <h3 style="font-size: 20px; margin-bottom: 12px; color: var(--secondary-color);"><?php echo esc_html( $ben_t ); ?></h3>
                    <p style="color: var(--text-light); font-size: 15px;"><?php echo esc_html( $ben_d ); ?></p>
                </div>
                <?php endfor; ?>
            </div>
        </div>
    </section>

    <!-- TOOLS SECTION -->
    <?php
    $tool_title = get_theme_mod( 'mlws_pat_tool_title', 'Innovative Tools at Your Fingertips' );
    $tool_defaults = array(
        1 => array( 'Ask IBD-i Expert',      'Interact with our AI intelligence trained specifically in clinical gastro conditions for instant, reliable answers to your health questions.' ),
        2 => array( 'Bookmark & Clip',        'Easily save important articles, clip vital paragraphs, and create your own customized research notes directly in your portal.' ),
        3 => array( 'History & AI Tracking',  'Upload your medical history documents to allow IBD-i to securely analyze data, track your ongoing wellness, and spot trends.' ),
        4 => array( 'Healthcare Calculators', 'Evaluate potential malnutrition, calculate BMI, and score related healthcare symptoms to stay on top of your physical needs.' ),
        5 => array( 'Exclusive Courses',      'Enroll in customized, multi-chapter curriculums developed by gastro specialists focusing on diet, recovery, and lifestyle routines.' ),
        6 => array( 'Downloadable Guides',    'Save and export patient-focused literature, daily checklists, and clear instructions for managing clinical nutrition products.' ),
    );
    $tool_colors = array(
        1 => 'var(--primary-color), #e04f00',
        2 => '#0ea5e9, #0284c7',
        3 => '#1B4F8A, #059669',
        4 => '#C75D8E, #B8447A',
        5 => '#f59e0b, #d97706',
        6 => '#ec4899, #db2777',
    );
    $tool_icons = array(
        1 => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>',
        2 => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>',
        3 => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>',
        4 => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>',
        5 => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>',
        6 => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>',
    );
    ?>
    <section class="section-padding" style="background: var(--accent-color);">
        <div class="container">
            <h2 class="text-center" style="color: var(--secondary-color); margin-bottom: 40px;"><?php echo esc_html( $tool_title ); ?></h2>
            <div class="grid-3">
                <?php for ( $i = 1; $i <= 6; $i++ ) :
                    $t_title = get_theme_mod( "mlws_pat_tool{$i}_title", $tool_defaults[ $i ][0] );
                    $t_desc  = get_theme_mod( "mlws_pat_tool{$i}_desc",  $tool_defaults[ $i ][1] );
                ?>
                <div style="display: flex; gap: 16px; padding: 28px; background: white; border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
                    <div style="flex-shrink: 0; width: 48px; height: 48px; background: linear-gradient(135deg, <?php echo $tool_colors[ $i ]; ?>); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                        <svg width="24" height="24" fill="none" stroke="white" viewBox="0 0 24 24"><?php echo $tool_icons[ $i ]; ?></svg>
                    </div>
                    <div>
                        <h4 style="font-size: 16px; color: var(--secondary-color); margin-bottom: 6px;"><?php echo esc_html( $t_title ); ?></h4>
                        <p style="color: var(--text-light); font-size: 13px; margin: 0;"><?php echo esc_html( $t_desc ); ?></p>
                    </div>
                </div>
                <?php endfor; ?>
            </div>
        </div>
    </section>

    <!-- CTA SECTION -->
    <?php
    $cta_title = get_theme_mod( 'mlws_pat_cta_title', 'Begin Your Journey' );
    $cta_desc  = get_theme_mod( 'mlws_pat_cta_desc',  "Join thousands of patients taking control of their gut health and longevity. It's completely free to start using our clinical resources today." );
    ?>
    <section id="subscribe" class="section-padding" style="background: linear-gradient(135deg, var(--secondary-color), #112240);">
        <div class="container" style="text-align: center; color: white;">
            <h2 style="color: white; margin-bottom: 16px;"><?php echo esc_html( $cta_title ); ?></h2>
            <p class="max-600" style="font-size: 18px; margin-bottom: 32px; color: rgba(255,255,255,0.85);"><?php echo esc_html( $cta_desc ); ?></p>
            <form class="patient-subscribe-form" style="display: flex; gap: 12px; max-width: 500px; margin: 0 auto;">
                <input type="email" placeholder="Enter your email" class="form-input" style="flex: 1; min-width: 250px; padding: 14px 20px; border: none; border-radius: var(--radius-md); font-size: 16px;">
                <button type="submit" class="btn btn-primary">Subscribe Free</button>
            </form>
            <p style="font-size: 13px; color: rgba(255,255,255,0.7); margin-top: 16px;">Free forever. Unsubscribe anytime.</p>
        </div>
    </section>

</main>

<?php get_footer(); ?>
