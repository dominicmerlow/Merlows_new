<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo( 'charset' ); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Merlows provides independent journalism and analysis covering Israel-Iran relations, the Cyrus Accord, and the Abraham Accords.">
    <title>Merlows — Bridging Nations, Building Peace.</title>
    <link rel="profile" href="https://gmpg.org/xfn/11">
    <?php wp_head(); ?>
    <?php // Favicon is output by mlws_output_favicon() in functions.php at priority 9999 ?>
    <?php echo get_theme_mod( 'mlws_header_scripts' ); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>

    <!-- Header -->
    <header class="site-header">
        <div class="container header-content">
            <div class="logo-area">
                <a href="<?php echo esc_url( home_url( '/' ) ); ?>">
                    <img src="<?php echo get_template_directory_uri(); ?>/assets/img/logo.png" alt="Merlows" class="site-logo">
                </a>
            </div>

            <button class="mobile-menu-toggle" aria-label="Toggle Menu">
                <span></span>
                <span></span>
                <span></span>
            </button>

            
            <nav class="main-nav">
                <?php
                wp_nav_menu( array(
                    'theme_location' => 'primary-menu',
                    'container'      => false,
                    'menu_class'     => 'nav-menu',
                    'fallback_cb'    => false,
                ) );
                ?>
                <?php if ( ! has_nav_menu( 'primary-menu' ) ) : ?>
                <ul>
                    <li><a href="#">Breaking News</a></li>
                    <li><a href="#">Diplomatic Analysis</a></li>
                    <li><a href="#">Cyrus Accord</a></li>
                    <li><a href="#">Abraham Accords</a></li>
                </ul>
                <?php endif; ?>
            </nav>

            <!-- Social Media and Login/Register -->
            <div class="header-actions">
                <div class="header-social-links" style="display: flex; gap: 12px; margin-right: 20px; align-items: center;">
                    <?php
                    $socials = array(
                        'linkedin'  => '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>',
                        'facebook'  => '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M22.675 0h-21.35c-.732 0-1.325.593-1.325 1.325v21.351c0 .731.593 1.324 1.325 1.324h11.495v-9.294h-3.128v-3.622h3.128v-2.671c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.312h3.587l-.467 3.622h-3.12v9.293h6.116c.73 0 1.323-.593 1.323-1.325v-21.35c0-.732-.593-1.325-1.325-1.325z"/></svg>',
                        'twitter'   => '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
                        'instagram' => '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>',
                    );

                    foreach ( $socials as $key => $svg ) {
                        $link = get_theme_mod( 'mlws_social_' . $key );
                        if ( $link ) {
                            echo '<a href="' . esc_url( $link ) . '" class="social-link" target="_blank" style="color: var(--secondary-color); opacity: 0.7; transition: opacity 0.3s;">' . $svg . '</a>';
                        }
                    }
                    ?>
                </div>


                <?php 
                // Always show My Dashboard button - redirect based on login status
                $dashboard_url = is_user_logged_in() ? home_url('/dashboard/') : wp_login_url(home_url('/dashboard/'));
                ?>
                <a href="<?php echo esc_url($dashboard_url); ?>" class="btn btn-primary">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                        <rect x="3" y="3" width="7" height="7"></rect>
                        <rect x="14" y="3" width="7" height="7"></rect>
                        <rect x="14" y="14" width="7" height="7"></rect>
                        <rect x="3" y="14" width="7" height="7"></rect>
                    </svg>
                    My Dashboard
                </a>
            </div>
        </div>
    </header>



    <script>
    document.addEventListener('DOMContentLoaded', function() {
        const toggle = document.querySelector('.mobile-menu-toggle');
        const nav = document.querySelector('.main-nav');
        const actions = document.querySelector('.header-actions');
        const menuIcon = document.querySelector('.menu-icon');
        const closeIcon = document.querySelector('.close-icon');

        if (toggle) {
            toggle.addEventListener('click', function() {
                nav.classList.toggle('active');
                actions.classList.toggle('active');
                menuIcon && menuIcon.classList.toggle('hidden');
                closeIcon && closeIcon.classList.toggle('hidden');
                document.body.style.overflow = nav.classList.contains('active') ? 'hidden' : '';
            });
        }

        // Mobile submenu toggle - inject a separate chevron button so the
        // link text navigates to the page and the button toggles the dropdown
        if (window.innerWidth <= 768) {
            document.querySelectorAll('.main-nav .menu-item-has-children').forEach(function(li) {
                var btn = document.createElement('button');
                btn.className = 'submenu-toggle-btn';
                btn.setAttribute('aria-label', 'Toggle submenu');
                btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    li.classList.toggle('submenu-open');
                });
                // Insert button after the <a> link
                var link = li.querySelector(':scope > a');
                if (link) link.after(btn);
            });
        }
    });
    </script>
