    <!-- Footer -->
    <footer class="main-footer">
        <div class="container">
            <?php 
            $nl_action = get_theme_mod('mlws_newsletter_action');
            if ($nl_action): 
                $nl_head = get_theme_mod('mlws_newsletter_heading', 'Join Merlows');
                $nl_desc = get_theme_mod('mlws_newsletter_desc', 'Get diplomatic analysis and breaking news delivered.');
            ?>
            <div class="newsletter-bar" style="background: #0F172A; border-radius: 0; padding: 40px; margin-bottom: 60px; color: white; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px;">
                <div style="flex: 1; min-width: 300px;">
                    <h3 style="color: white; margin-bottom: 8px; font-size: 24px; font-weight: 700;"><?php echo esc_html($nl_head); ?></h3>
                    <p style="color: #94a3b8; margin: 0; font-size: 16px;"><?php echo esc_html($nl_desc); ?></p>
                </div>
                <!-- Generic Form action for Mailchimp/HubSpot -->
                <form action="<?php echo esc_url($nl_action); ?>" method="post" target="_blank" style="display: flex; gap: 10px; flex: 1; min-width: 300px;">
                    <input type="email" name="EMAIL" placeholder="Enter your professional email" required style="flex: 1; padding: 12px 16px; border-radius: 0; border: 1px solid #334155; background: #1e293b; color: white;">
                    <div style="position: absolute; left: -5000px;" aria-hidden="true"><input type="text" name="b_<?php echo md5($nl_action); ?>" tabindex="-1" value=""></div>
                    <button type="submit" class="btn btn-primary" style="white-space: nowrap; padding: 12px 24px;">Subscribe</button>
                </form>
            </div>
            <?php endif; ?>

            <div class="footer-grid">
                <div class="footer-brand">
                    <?php 
                    $f_logo = get_theme_mod('mlws_footer_logo');
                    $f_text = get_theme_mod('mlws_footer_brand_text', 'Your Middle East News Source. Curated independent journalism covering the Cyrus Accord, Abraham Accords, and Middle East diplomacy.');
                    ?>
                    <a href="<?php echo esc_url( home_url( '/' ) ); ?>" style="display:block; margin-bottom: 24px;">
                        <?php if($f_logo): ?>
                            <img src="<?php echo esc_url($f_logo); ?>" alt="Merlows" style="height: 40px; filter: hue-rotate(156deg) saturate(1.3) brightness(0.85);">
                        <?php else: ?>
                            <img src="<?php echo get_template_directory_uri(); ?>/assets/img/logo.png" alt="Merlows" style="height: 60px; filter: hue-rotate(156deg) saturate(1.3) brightness(0.85);">
                        <?php endif; ?>
                    </a>
                    <p><?php echo esc_html($f_text); ?></p>
                </div>
                
                <div class="footer-col">
                    <h4><?php echo esc_html(get_theme_mod('mlws_footer_heading_col1', 'Topics')); ?></h4>
                    <?php
                    wp_nav_menu( array(
                        'theme_location' => 'footer-menu-1',
                        'container'      => false,
                        'fallback_cb'    => false,
                    ) );
                    ?>
                </div>

                <div class="footer-col">
                    <h4><?php echo esc_html(get_theme_mod('mlws_footer_heading_col2', 'For Journalists')); ?></h4>
                    <?php
                    wp_nav_menu( array(
                        'theme_location' => 'footer-menu-2',
                        'container'      => false,
                        'fallback_cb'    => false,
                    ) );
                    ?>
                </div>

                <div class="footer-col">
                    <h4><?php echo esc_html(get_theme_mod('mlws_footer_heading_col3', 'For Readers')); ?></h4>
                    <?php
                    wp_nav_menu( array(
                        'theme_location' => 'footer-menu-3',
                        'container'      => false,
                        'fallback_cb'    => false,
                    ) );
                    ?>
                </div>
            </div>

            <div class="footer-bottom">
                <div class="copyright"><?php echo esc_html(get_theme_mod('mlws_footer_copyright', '© ' . date('Y') . ' Merlows. All rights reserved.')); ?></div>
                <div class="footer-links">
                    <a href="https://merlows.com/privacy-policy/">Privacy Policy</a>
                    <a href="https://merlows.com/terms-of-use/">Terms of Use</a>
                    <a href="https://merlows.com/cookie-policy/">Cookie Policy</a>
                </div>
                <div class="social-links">
                    <!-- Icons would go here -->
                </div>
            </div>
        </div>
    </footer>


    <!-- Infographic Modal -->
    <div id="infographic-modal" class="infographic-modal">
        <span class="modal-close">&times;</span>
        <div class="modal-content">
            <img id="modal-image" src="" alt="Enlarged Infographic">
        </div>
    </div>

    <!-- Guest Save Modal -->
    <div id="guest-save-modal" class="infographic-modal">
        <span class="modal-close" onclick="closeGuestModal()">&times;</span>
        <div class="modal-content" style="max-width: 450px; background: white; padding: 40px; border-radius: 0; text-align: center;">
            <div style="width: 64px; height: 64px; background: #F5F0FA; border-radius: 0; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;">
                <span style="font-size: 32px;">🔖</span>
            </div>
            <h2 style="font-size: 24px; color: #0f172a; margin-bottom: 12px; font-family: var(--font-heading);">Join Merlows</h2>
            <p style="font-size: 16px; color: #64748b; margin-bottom: 32px; line-height: 1.6;">Save your favorite articles, track your reading progress, and access exclusive professional resources by joining our community.</p>
            
            <div style="margin-bottom: 24px;">
                <?php echo do_shortcode('[google_login]'); ?>
            </div>
            
            <p style="font-size: 14px; color: #94a3b8; margin: 0;">Already have an account? <a href="<?php echo wp_login_url(); ?>" style="color: #1B4F8A; font-weight: 600; text-decoration: none;">Sign In</a></p>
        </div>
    </div>

    <?php include get_template_directory() . '/inc/quiz-modal.php'; ?>
    <?php include get_template_directory() . '/inc/clinical-info-modal.php'; ?>

    <script>
    function openGuestModal() {
        document.getElementById('guest-save-modal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
    function closeGuestModal() {
        document.getElementById('guest-save-modal').style.display = 'none';
        document.body.style.overflow = '';
    }
    </script>

    <style>
    .infographic-modal {
        display: none;
        position: fixed;
        z-index: 9999;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        overflow: auto;
        background-color: rgba(0,0,0,0.9);
        backdrop-filter: blur(5px);
        align-items: center;
        justify-content: center;
        padding: 40px;
    }
    .modal-content {
        position: relative;
        margin: auto;
        display: block;
        max-width: 90%;
        max-height: 90vh;
    }
    .modal-content img {
        width: 100%;
        height: auto;
        max-height: 90vh;
        object-fit: contain;
        border-radius: 0;
        box-shadow: 0 0 30px rgba(0,0,0,0.5);
    }
    .modal-close {
        position: absolute;
        top: 20px;
        right: 35px;
        color: #f1f1f1;
        font-size: 60px;
        font-weight: bold;
        transition: 0.3s;
        cursor: pointer;
        z-index: 10000;
        line-height: 1;
    }
    .modal-close:hover,
    .modal-close:focus {
        color: var(--primary-color);
        text-decoration: none;
    }
    @media only screen and (max-width: 700px){
        .modal-content {
            width: 100%;
        }
        .infographic-modal {
            padding: 20px;
        }
    }
    </style>

    <script>
    document.addEventListener('DOMContentLoaded', function() {
        const modal = document.getElementById('infographic-modal');
        const modalImg = document.getElementById('modal-image');
        const closeBtn = document.querySelector('.modal-close');

        // Function to open modal
        function openModal(src) {
            modal.style.display = "flex";
            modalImg.src = src;
            document.body.style.overflow = 'hidden'; // Prevent scrolling
        }

        // Close modal
        closeBtn.onclick = function() {
            modal.style.display = "none";
            document.body.style.overflow = '';
        }

        // Close on outside click
        modal.onclick = function(event) {
            if (event.target === modal) {
                modal.style.display = "none";
                document.body.style.overflow = '';
            }
        }

        // Close on ESC key
        document.addEventListener('keydown', function(event) {
            if (event.key === "Escape") {
                modal.style.display = "none";
                document.body.style.overflow = '';
            }
        });



        // Add event listeners to infographic links
        document.querySelectorAll('.infographic-popup-link').forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const largeSrc = this.getAttribute('data-large-src') || this.href;
                if (largeSrc && largeSrc !== '#') {
                    openModal(largeSrc);
                }
            });
        });


        // Flash Card Widget Logic
        document.querySelectorAll('.quiz-widget').forEach(widget => {
            const dataStr = widget.getAttribute('data-quiz');
            if (!dataStr) return;
            
            const cardData = JSON.parse(dataStr);
            const body = widget.querySelector('.quiz-widget-body');
            const progressBar = widget.querySelector('.quiz-progress-bar');
            let currentIdx = 0;

            function renderCard(idx) {
                const card = cardData[idx];

                body.innerHTML = `
                    <div class="flashcard-container active" style="perspective: 1000px; cursor: pointer;">
                        <div class="flashcard-inner" style="position: relative; width: 100%; min-height: 200px; text-align: center; transition: transform 0.6s; transform-style: preserve-3d;">
                            <!-- Front -->
                            <div class="flashcard-front" style="position: absolute; width: 100%; height: 100%; backface-visibility: hidden; display: flex; align-items: center; justify-content: center; padding: 20px; background: #f9fafb; border-radius: 0; border: 1px solid #e5e7eb;">
                                <div style="font-weight: 700; color: var(--secondary-color); font-size: 16px;">${card.question}</div>
                                <div style="position: absolute; bottom: 10px; font-size: 12px; color: var(--text-light);">Click to reveal answer</div>
                            </div>
                            <!-- Back -->
                            <div class="flashcard-back" style="position: absolute; width: 100%; height: 100%; backface-visibility: hidden; display: flex; align-items: center; justify-content: center; padding: 20px; background: #fff5f0; border-radius: 0; border: 1px solid var(--primary-color); transform: rotateY(180deg);">
                                <div style="color: var(--secondary-color); font-size: 15px; line-height: 1.5;">${card.answer}</div>
                            </div>
                        </div>
                        <button class="quiz-next-btn" style="margin-top: 20px; display: none;">Next Card</button>
                    </div>
                `;

                const inner = body.querySelector('.flashcard-inner');
                const nextBtn = body.querySelector('.quiz-next-btn');
                const container = body.querySelector('.flashcard-container');

                container.addEventListener('click', function(e) {
                    if (e.target.classList.contains('quiz-next-btn')) return;
                    inner.style.transform = inner.style.transform === 'rotateY(180deg)' ? 'rotateY(0deg)' : 'rotateY(180deg)';
                    nextBtn.style.display = 'block';
                });

                // Update Progress
                const progress = ((idx) / cardData.length) * 100;
                progressBar.style.width = `${progress}%`;

                nextBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    currentIdx++;
                    if (currentIdx < cardData.length) {
                        renderCard(currentIdx);
                    } else {
                        showResults();
                    }
                });
            }

            function showResults() {
                progressBar.style.width = '100%';
                body.innerHTML = `
                    <div class="quiz-results" style="text-align: center; animation: fadeIn 0.5s;">
                        <div style="font-size: 48px; margin-bottom: 20px;">🎉</div>
                        <h3 style="margin-bottom: 10px;">All Done!</h3>
                        <p style="font-size: 16px; color: var(--text-light);">You've reviewed all ${cardData.length} flashcards.</p>
                        <button class="btn btn-primary" style="margin-top: 20px; width: 100%;" onclick="location.reload()">Start Over</button>
                    </div>
                `;
            }

            renderCard(0);
        });
    });
    </script>

<?php wp_footer(); ?>
<?php echo get_theme_mod( 'mlws_footer_scripts' ); ?>
</body>
</html>
