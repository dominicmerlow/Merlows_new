<?php
/**
 * Template Name: About Us
 */

get_header(); ?>

<main id="main-content">
    <?php
    // Helper function to get style string
    function mlws_get_style_string($prefix, $default_bg = '') {
        $bg = get_theme_mod($prefix . '_bg', $default_bg);
        $t_color = get_theme_mod($prefix . '_title_color');
        $t_size = get_theme_mod($prefix . '_title_size');
        $tx_color = get_theme_mod($prefix . '_text_color');
        $tx_size = get_theme_mod($prefix . '_text_size');
        $tag_bg = get_theme_mod($prefix . '_tag_bg');
        $tag_color = get_theme_mod($prefix . '_tag_color');

        $style = '';
        if ($bg) $style .= "background:$bg;";
        
        $inner_title_style = '';
        if ($t_color) $inner_title_style .= "color:$t_color !important;";
        if ($t_size) {
            $t_size = is_numeric($t_size) ? $t_size . 'px' : $t_size;
            $inner_title_style .= "font-size:$t_size !important;";
        }

        $inner_text_style = '';
        if ($tx_color) $inner_text_style .= "color:$tx_color !important;";
        if ($tx_size) {
            $tx_size = is_numeric($tx_size) ? $tx_size . 'px' : $tx_size;
            $inner_text_style .= "font-size:$tx_size !important;";
        }
        
        $inner_tag_style = '';
        if ($tag_bg) $inner_tag_style .= "background:$tag_bg !important;";
        if ($tag_color) $inner_tag_style .= "color:$tag_color !important;";

        return [
            'section' => $style,
            'title' => $inner_title_style,
            'text' => $inner_text_style,
            'tag' => $inner_tag_style
        ];
    }
    ?>

    <!-- HERO SECTION -->
    <?php if (get_theme_mod('mlws_about_hero_show', true)) : 
        $hero_img    = get_theme_mod('mlws_about_hero_img', get_template_directory_uri() . '/assets/img/news_hero.png');
        $hero_bg_color = get_theme_mod('mlws_about_hero_bg_color');
        $hero_tag   = get_theme_mod('mlws_about_hero_tag', 'About Merlows');
        $hero_title = get_theme_mod('mlws_about_hero_title', 'The People Behind the <span class="highlight">Diplomacy</span>');
        $hero_sub   = get_theme_mod('mlws_about_hero_sub', 'Independent Journalism for a More Peaceful Middle East');
        $hero_desc  = get_theme_mod('mlws_about_hero_desc', 'Merlows is an independent news and diplomacy platform dedicated to covering the Abraham Accords, the Cyrus Accord, and the evolving landscape of Israel-Iran relations with depth, accuracy, and a commitment to peace.');
        
        $styles = mlws_get_style_string('mlws_about_hero');
        // Custom background logic for hero because it has a gradient and image
        $hero_bg_style = "background: linear-gradient(rgba(10,25,41,0.78), rgba(10,25,41,0.93)), url('" . esc_url($hero_img) . "') no-repeat center center; background-size: cover;";
        if ($hero_bg_color) {
            $hero_bg_style = "background: " . $hero_bg_color . ";";
        }
    ?>
    <section class="ibd-about-hero" style="padding: 95px 0 140px; display: flex; align-items: flex-start; <?php echo $hero_bg_style; ?> position: relative; overflow: hidden;">
        <div class="container" style="position:relative;z-index:1;">
            <div style="max-width: 800px;">
                <span class="tag-label" style="<?php echo $styles['tag']; ?>"><?php echo esc_html($hero_tag); ?></span>
                <h1 style="font-weight:900;margin:16px 0 20px;font-family:'Outfit',sans-serif;line-height:1.1; <?php if(strpos($styles['title'],'font-size')===false) echo 'font-size:clamp(36px,5vw,60px);'; ?> <?php if(strpos($styles['title'],'color')===false) echo 'color:white;'; ?> <?php echo $styles['title']; ?>">
                    <?php echo wp_kses_post($hero_title); ?>
                </h1>
                <p style="max-width:600px;line-height:1.7;margin:0 0 32px; <?php if(strpos($styles['text'],'font-size')===false) echo 'font-size:20px;'; ?> <?php if(strpos($styles['text'],'color')===false) echo 'color:rgba(255,255,255,.82);'; ?> <?php echo $styles['text']; ?>">
                    <?php echo esc_html($hero_desc); ?>
                </p>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <!-- ORIGIN SECTION -->
    <?php if (get_theme_mod('mlws_about_origin_show', true)) : 
        $origin_tag   = get_theme_mod('mlws_about_origin_tag', 'Our Founding Story');
        $origin_title = get_theme_mod('mlws_about_origin_title', 'Born From a Belief in Dialogue');
        $origin_sub   = get_theme_mod('mlws_about_origin_sub', 'Merlows was built on one conviction: that lasting peace in the Middle East requires better information.');
        $styles = mlws_get_style_string('mlws_about_origin', '#fff');
    ?>
    <section id="our-story" class="section-padding" style="<?php echo $styles['section']; ?>">
        <div class="container">
            <div style="text-align:center; max-width:800px; margin:0 auto 60px;">
                <span class="tag-label" style="<?php echo $styles['tag']; ?>"><?php echo esc_html($origin_tag); ?></span>
                <h2 style="font-family:'Outfit',sans-serif; font-weight:900; margin: 16px 0; <?php if(strpos($styles['title'],'font-size')===false) echo 'font-size:40px;'; ?> <?php if(strpos($styles['title'],'color')===false) echo 'color:var(--secondary-color);'; ?> <?php echo $styles['title']; ?>"><?php echo esc_html($origin_title); ?></h2>
                <?php if ($origin_sub): ?>
                <p style="font-size:18px;color:var(--text-light); <?php echo $styles['text']; ?>"><?php echo esc_html($origin_sub); ?></p>
                <?php endif; ?>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:32px;margin-bottom:60px;">
                <?php 
                $pillar_defaults = [
                    1 => ["The Founding Vision", "Merlows was founded by journalists and diplomacy scholars who saw a gap: the world's most consequential peace process lacked a dedicated, credible media home."],
                    2 => ["The Cyrus Accord Initiative", "We became the primary platform championing the Cyrus Accord — a diplomatic framework proposing a new path toward Israel-Iran normalisation."],
                    3 => ["Building the Platform", "Today Merlows combines breaking news, expert analysis, an AI research assistant, and a community of engaged readers shaping the diplomatic conversation."]
                ];
                for($i=1; $i<=3; $i++):
                    $p_title = get_theme_mod("mlws_about_p{$i}_title", $pillar_defaults[$i][0]);
                    $p_desc = get_theme_mod("mlws_about_p{$i}_desc", $pillar_defaults[$i][1]);
                ?>
                <div class="pillar" style="background:rgba(255,255,255,0.5); border:1px solid rgba(0,0,0,0.05);">
                    <h4 style="<?php echo $styles['title']; ?>"><?php echo esc_html($p_title); ?></h4>
                    <p style="<?php echo $styles['text']; ?>"><?php echo esc_html($p_desc); ?></p>
                </div>
                <?php endfor; ?>
            </div>

            <!-- Stats -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:32px;text-align:center;padding-top:40px;border-top:1px solid rgba(0,0,0,0.1);">
                <?php 
                $stat_defaults = [
                    1 => ["100+", "Countries Reached"],
                    2 => ["300+", "Exclusive Analyses"],
                    3 => ["50+", "Expert Contributors"]
                ];
                for($i=1; $i<=3; $i++):
                    $s_num = get_theme_mod("mlws_about_stat{$i}_num", $stat_defaults[$i][0]);
                    $s_lbl = get_theme_mod("mlws_about_stat{$i}_label", $stat_defaults[$i][1]);
                ?>
                <div>
                    <div style="font-size:48px;font-weight:900;color:var(--primary-color);font-family:'Outfit',sans-serif; <?php echo $styles['title']; ?>"><?php echo esc_html($s_num); ?></div>
                    <div style="font-size:16px;color:var(--secondary-color);font-weight:600; <?php echo $styles['text']; ?>"><?php echo esc_html($s_lbl); ?></div>
                </div>
                <?php endfor; ?>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <!-- MISSION & VALUES -->
    <?php if (get_theme_mod('mlws_about_mission_show', true)) : 
        $mission_tag = get_theme_mod('mlws_about_mission_tag', 'What We Stand For');
        $mission_title = get_theme_mod('mlws_about_mission_title', 'Journalism That <span class="highlight">Builds Peace</span>');
        $mission_desc = get_theme_mod('mlws_about_mission_desc', 'At Merlows, we believe that well-informed citizens and policymakers are the foundation of any durable peace. Every article, analysis, and conversation we publish is guided by that conviction.');
        $styles = mlws_get_style_string('mlws_about_mission', '#f8f9fa');
    ?>
    <section id="mission" class="section-padding" style="<?php echo $styles['section']; ?>">
        <div class="container">
             <div style="text-align:center; max-width:800px; margin:0 auto 60px;">
                <span class="tag-label" style="<?php echo $styles['tag']; ?>"><?php echo esc_html($mission_tag); ?></span>
                <h2 style="font-family:'Outfit',sans-serif; font-weight:900; margin: 16px 0; <?php if(strpos($styles['title'],'font-size')===false) echo 'font-size:40px;'; ?> <?php if(strpos($styles['title'],'color')===false) echo 'color:var(--secondary-color);'; ?> <?php echo $styles['title']; ?>"><?php echo wp_kses_post($mission_title); ?></h2>
                <p style="font-size:18px;color:var(--text-light); <?php echo $styles['text']; ?>"><?php echo esc_html($mission_desc); ?></p>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:32px;">
                <?php 
                $val_defaults = [
                    1 => ["Editorial Independence", "Merlows is editorially independent. Our reporting is guided by facts and expert analysis alone — not by the interests of governments, donors, or advertisers."],
                    2 => ["Pro-Diplomacy", "We are unambiguously pro-dialogue. We believe every credible effort to build peace between peoples deserves to be heard, documented, and supported."],
                    3 => ["Accuracy First", "We hold ourselves to the highest journalistic standards. Every claim is verified, every expert is vetted, and every correction is published openly."],
                    4 => ["Global Perspective", "The Middle East is not a monolith. We amplify voices from across Israel, Iran, the Arab world, and the international community to give our readers the full picture."]
                ];
                for($i=1; $i<=4; $i++):
                    $v_title = get_theme_mod("mlws_about_val{$i}_title", $val_defaults[$i][0]);
                    $v_desc = get_theme_mod("mlws_about_val{$i}_desc", $val_defaults[$i][1]);
                ?>
                <div style="background:white;padding:32px;border-radius:0;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
                    <h4 style="color:var(--secondary-color);font-family:'Outfit',sans-serif;font-weight:700;margin-bottom:12px; <?php echo $styles['title']; ?>"><?php echo esc_html($v_title); ?></h4>
                    <p style="color:var(--text-light);font-size:15px;line-height:1.6;margin:0; <?php echo $styles['text']; ?>"><?php echo esc_html($v_desc); ?></p>
                </div>
                <?php endfor; ?>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <!-- CYRUS ACCORD SPOTLIGHT -->
    <?php if (get_theme_mod('mlws_about_product_show', true)) :
        $prod_tag = get_theme_mod('mlws_about_prod_tag', 'Our Flagship Initiative');
        $prod_title = get_theme_mod('mlws_about_prod_title', 'The Cyrus Accord');
        $prod_desc = get_theme_mod('mlws_about_prod_desc', 'The Cyrus Accord is Merlows\' own diplomatic initiative — a proposed framework for Israel-Iran normalisation inspired by the legacy of Cyrus the Great, whose Cylinder established one of history\'s first declarations of religious tolerance and human rights. It represents our belief that journalism can be a catalyst for real peace.');
        $prod_btn = get_theme_mod('mlws_about_prod_btn', 'Learn About the Cyrus Accord');
        $prod_url = get_theme_mod('mlws_about_prod_url', '/cyrus-accord/');
        $styles = mlws_get_style_string('mlws_about_product', '#fff');
    ?>
    <section class="section-padding" style="<?php echo $styles['section']; ?>">
        <div class="container">
            <div style="display:flex;flex-wrap:wrap;gap:40px;align-items:center;">
                <div style="flex:1;min-width:300px;">
                    <span class="tag-label" style="<?php echo $styles['tag']; ?>"><?php echo esc_html($prod_tag); ?></span>
                    <h2 style="font-family:'Outfit',sans-serif; font-weight:900; margin: 16px 0; <?php if(strpos($styles['title'],'font-size')===false) echo 'font-size:40px;'; ?> <?php if(strpos($styles['title'],'color')===false) echo 'color:var(--secondary-color);'; ?> <?php echo $styles['title']; ?>"><?php echo esc_html($prod_title); ?></h2>
                    <p style="font-size:18px;color:var(--text-light);max-width:100%;margin-bottom:24px; <?php echo $styles['text']; ?>"><?php echo esc_html($prod_desc); ?></p>
                    <a href="<?php echo esc_url($prod_url); ?>" class="btn btn-primary"><?php echo esc_html($prod_btn); ?></a>
                </div>
                <div style="flex:1;min-width:300px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;">
                    <?php 
                    $feat_defaults = [
                        1 => ["Historical Foundation", "Inspired by Cyrus the Great's Cylinder — widely regarded as one of the earliest declarations of human rights and religious freedom in recorded history."],
                        2 => ["Diplomatic Framework", "A proposed path to Israel-Iran normalisation built on shared heritage, economic cooperation, and mutual security guarantees."],
                        3 => ["Broad Coalition", "Supported by voices across civil society, academia, and the diaspora communities of both nations who believe a different future is possible."],
                        4 => ["Media-Driven Peace", "Merlows uses its platform to build public support, document progress, and create the conditions for political will to emerge."]
                    ];
                    for($i=1; $i<=4; $i++):
                        $f_title = get_theme_mod("mlws_about_feat{$i}_title", $feat_defaults[$i][0]);
                        $f_desc = get_theme_mod("mlws_about_feat{$i}_desc", $feat_defaults[$i][1]);
                    ?>
                    <div style="background:#f8f9fa;padding:24px;border-radius:0;">
                        <h4 style="font-size:16px;color:var(--secondary-color);font-family:'Outfit',sans-serif;font-weight:700;margin-bottom:8px; <?php echo $styles['title']; ?>"><?php echo esc_html($f_title); ?></h4>
                        <p style="font-size:14px;color:var(--text-light);margin:0;line-height:1.5; <?php echo $styles['text']; ?>"><?php echo esc_html($f_desc); ?></p>
                    </div>
                    <?php endfor; ?>
                </div>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <!-- PLATFORM SECTION -->
    <?php if (get_theme_mod('mlws_about_platform_show', true)) : 
        $plat_tag = get_theme_mod('mlws_about_plat_tag', 'What We Offer');
        $plat_title = get_theme_mod('mlws_about_plat_title', 'The Merlows Platform');
        $plat_desc = get_theme_mod('mlws_about_plat_desc', 'Merlows combines world-class diplomatic journalism with AI-powered research tools and a vibrant community — all in one platform built for people who take the Middle East seriously.');
        $styles = mlws_get_style_string('mlws_about_platform', '#142846');
    ?>
    <section class="section-padding" style="<?php echo $styles['section']; ?> color:white;">
        <div class="container">
            <div style="text-align:center; max-width:800px; margin:0 auto 60px;">
                <span class="tag-label" style="color:var(--primary-color);background:rgba(235,90,51,0.1); <?php echo $styles['tag']; ?>"><?php echo esc_html($plat_tag); ?></span>
                <h2 style="font-family:'Outfit',sans-serif; font-weight:900; margin: 16px 0; <?php if(strpos($styles['title'],'font-size')===false) echo 'font-size:40px;'; ?> <?php if(strpos($styles['title'],'color')===false) echo 'color:white;'; ?> <?php echo $styles['title']; ?>"><?php echo esc_html($plat_title); ?></h2>
                <p style="font-size:18px;color:rgba(255,255,255,0.8); <?php echo $styles['text']; ?>"><?php echo esc_html($plat_desc); ?></p>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px;">
                <?php 
                $plat_defaults = [
                    1 => ["Breaking News", "Fast, accurate, and context-rich reporting on diplomatic developments as they happen — no filler, no sensationalism."],
                    2 => ["Diplomatic Analysis", "Expert-led deep dives into the Abraham Accords, Cyrus Accord, and Israel-Iran relations written by former diplomats and regional scholars."],
                    3 => ["AI Research Assistant", "Ask our AI any question about Middle East diplomacy and receive instant, sourced analysis drawing on our entire editorial archive."],
                    4 => ["Op-Eds & Commentary", "A curated forum for diverse regional voices — from Israeli and Iranian thinkers to Arab diplomats and international observers."],
                    5 => ["Community Hub", "Connect with other engaged readers, share analysis, and join the conversation shaping diplomatic thinking in real time."],
                    6 => ["Archive & Research", "A fully searchable archive of every key diplomatic event, agreement, and analysis — an essential resource for journalists and researchers."]
                ];
                for($i=1; $i<=6; $i++):
                    $pl_title = get_theme_mod("mlws_about_plat{$i}_title", $plat_defaults[$i][0]);
                    $pl_desc = get_theme_mod("mlws_about_plat{$i}_desc", $plat_defaults[$i][1]);
                ?>
                <div style="background:rgba(255,255,255,0.05);padding:24px;border-radius:0;border:1px solid rgba(255,255,255,0.1);">
                    <h4 style="color:white;font-family:'Outfit',sans-serif;font-weight:600;margin-bottom:10px;font-size:18px; <?php echo $styles['title']; ?>"><?php echo esc_html($pl_title); ?></h4>
                    <p style="color:rgba(255,255,255,0.7);font-size:14px;margin:0;line-height:1.6; <?php echo $styles['text']; ?>"><?php echo esc_html($pl_desc); ?></p>
                </div>
                <?php endfor; ?>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <!-- PROMO BLOCKS -->
    <?php for ($p=1; $p<=2; $p++) : 
        $prefix = "mlws_about_promo$p";
        if (get_theme_mod($prefix . '_show', true)) :
            $img = get_theme_mod($prefix . '_img');
            $title = get_theme_mod($prefix . '_title', 'Promo title');
            $sub = get_theme_mod($prefix . '_sub', 'Promo subtitle');
            $desc = get_theme_mod($prefix . '_desc', 'Promo description text goes here.');
            $btn_lbl = get_theme_mod($prefix . '_btn_lbl', 'Learn More');
            $btn_url = get_theme_mod($prefix . '_btn_url', '#');
            $layout = get_theme_mod($prefix . '_layout', 'img-left');
            $styles = mlws_get_style_string($prefix, '#fff');
            $flex_dir = ($layout == 'img-right') ? 'flex-direction:row-reverse;' : '';
    ?>
    <section class="section-padding" style="<?php echo $styles['section']; ?>">
        <div class="container">
            <div style="display:flex; flex-wrap:wrap; gap:60px; align-items:center; <?php echo $flex_dir; ?>">
                <div style="flex:1; min-width:300px;">
                    <?php if ($img) : ?>
                        <img src="<?php echo esc_url($img); ?>" alt="<?php echo esc_attr($title); ?>" style="width:100%; border-radius:0; box-shadow:0 20px 40px rgba(0,0,0,0.1);">
                    <?php else: ?>
                        <div style="width:100%; aspect-ratio:16/9; background:#eee; border-radius:0; display:flex; align-items:center; justify-content:center; color:#ccc;">No Image Selected</div>
                    <?php endif; ?>
                </div>
                <div style="flex:1; min-width:300px;">
                    <?php if ($sub) : ?><span class="tag-label" style="<?php echo $styles['tag']; ?>"><?php echo esc_html($sub); ?></span><?php endif; ?>
                    <h2 style="font-family:'Outfit',sans-serif; font-weight:900; margin:16px 0; <?php if(strpos($styles['title'],'font-size')===false) echo 'font-size:36px;'; ?> <?php if(strpos($styles['title'],'color')===false) echo 'color:var(--secondary-color);'; ?> <?php echo $styles['title']; ?>"><?php echo esc_html($title); ?></h2>
                    <p style="font-size:18px; color:var(--text-light); line-height:1.7; margin-bottom:30px; <?php echo $styles['text']; ?>"><?php echo esc_html($desc); ?></p>
                    <?php if ($btn_lbl) : ?>
                        <a href="<?php echo esc_url($btn_url); ?>" class="btn btn-primary"><?php echo esc_html($btn_lbl); ?></a>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </section>
    <?php endif; endfor; ?>

    <!-- CTA STRIP -->
    <?php if (get_theme_mod('mlws_about_cta_show', true)) : 
        $cta_title = get_theme_mod('mlws_about_cta_title', 'Join the Diplomacy Conversation');
        $cta_desc = get_theme_mod('mlws_about_cta_desc', "Whether you're a policymaker, journalist, academic, or engaged citizen — Merlows is your home for the most important diplomatic story of our time.");
        $cta_btn1_lbl = get_theme_mod('mlws_about_cta_btn1_label', "Read Our Analysis");
        $cta_btn1_url = get_theme_mod('mlws_about_cta_btn1_url', '/diplomatic-analysis/');
        $cta_btn2_lbl = get_theme_mod('mlws_about_cta_btn2_label', "Our Mission");
        $cta_btn2_url = get_theme_mod('mlws_about_cta_btn2_url', '/mission/');
        $styles = mlws_get_style_string('mlws_about_cta', '#EB5A33');
    ?>
    <section class="section-padding" style="<?php echo $styles['section']; ?> color:white; text-align:center;">
        <div class="container" style="max-width:800px;">
            <h2 style="font-family:'Outfit',sans-serif; font-weight:800; margin-bottom:16px; <?php if(strpos($styles['title'],'font-size')===false) echo 'font-size:36px;'; ?> <?php echo $styles['title']; ?>"><?php echo esc_html($cta_title); ?></h2>
            <p style="opacity:0.9; margin-bottom:32px; line-height:1.6; <?php if(strpos($styles['text'],'font-size')===false) echo 'font-size:18px;'; ?> <?php echo $styles['text']; ?>"><?php echo esc_html($cta_desc); ?></p>
            <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap;">
                <a href="<?php echo esc_url($cta_btn1_url); ?>" class="btn" style="background:white;color:#EB5A33;font-weight:700;padding:12px 28px;border-radius:0;text-decoration:none;"><?php echo esc_html($cta_btn1_lbl); ?></a>
                <a href="<?php echo esc_url($cta_btn2_url); ?>" class="btn" style="background:transparent;border:2px solid white;color:white;font-weight:700;padding:10px 28px;border-radius:0;text-decoration:none;"><?php echo esc_html($cta_btn2_lbl); ?></a>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <!-- PAGE CONTENT SECTION -->
    <section class="section-padding content-section" style="background: #ffffff;">
        <div class="container">
            <?php
            while ( have_posts() ) :
                the_post();
                ?>
                <div class="entry-content" style="line-height: 1.8;">
                    <?php the_content(); ?>
                </div>
                <?php
            endwhile;
            ?>
        </div>
    </section>
</main>

<style>
.pillar { background:white; padding:32px; border-radius:0; border:1px solid #e2e8f0; text-align:center; }
.pillar h4 { font-family:'Outfit',sans-serif; color:var(--secondary-color); margin-bottom:12px; font-weight:800; }
.pillar p { font-size:14px; color:var(--text-light); }
</style>

<?php get_footer(); ?>
