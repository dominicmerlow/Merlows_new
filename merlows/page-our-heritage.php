<?php
/**
 * Template Name: Our Heritage
 */

get_header(); ?>

<main id="main-content">
    <?php
    // Helper function to get style string
    if (!function_exists('mlws_get_section_style_heritage')) {
        function mlws_get_section_style_heritage($prefix, $default_bg = '') {
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
    }
    ?>

    <!-- HERO SECTION -->
    <?php if (get_theme_mod('mlws_heritage_hero_show', true)) : 
        $hero_img    = get_theme_mod('mlws_heritage_hero_img', get_template_directory_uri() . '/assets/img/hcp_hero.png');
        $hero_bg_color = get_theme_mod('mlws_heritage_hero_bg_color');
        $hero_tag   = get_theme_mod('mlws_heritage_hero_tag', 'Our Story');
        $hero_title = get_theme_mod('mlws_heritage_hero_title', 'From Pharma to <span class="highlight">Healthcare</span>');
        $hero_sub   = get_theme_mod('mlws_heritage_hero_sub', 'A Natural Evolution in Gastrointestinal Care');
        $hero_desc  = get_theme_mod('mlws_heritage_hero_desc', 'Merlows bridges the worlds of pharmaceutical science and patient-centred nutrition, delivering evidence-based medical food solutions for life with IBD.');
        
        $styles = mlws_get_section_style_heritage('mlws_heritage_hero');
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
    <?php if (get_theme_mod('mlws_heritage_origin_show', true)) : 
        $origin_tag   = get_theme_mod('mlws_heritage_origin_tag', 'From Pharma to Healthcare');
        $origin_title = get_theme_mod('mlws_heritage_origin_title', 'The Merlows Evolution');
        $origin_sub   = get_theme_mod('mlws_heritage_origin_sub', 'A Natural Evolution in Gastrointestinal Care');
        $styles = mlws_get_section_style_heritage('mlws_heritage_origin', '#fff');
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
                    1 => ["Heritage in Pharma", "Merlows has a long record of developing specialised gastrointestinal medicines under rigorous regulatory standards."],
                    2 => ["Patient-Centric Innovation", "We found that medicines alone often fall short for chronic IBD. There is a clear need for evidence-based nutritional support."],
                    3 => ["The Birth of Merlows", "Merlows bridges pharma and nutrition, delivering \"pharma-grade\" medical food products like EPAVANCE."]
                ];
                for($i=1; $i<=3; $i++):
                    $p_title = get_theme_mod("mlws_heritage_p{$i}_title", $pillar_defaults[$i][0]);
                    $p_desc = get_theme_mod("mlws_heritage_p{$i}_desc", $pillar_defaults[$i][1]);
                ?>
                <div class="pillar" style="background:rgba(255,255,255,0.5); border:1px solid rgba(0,0,0,0.05); border-radius: 0;">
                    <h4 style="<?php echo $styles['title']; ?>"><?php echo esc_html($p_title); ?></h4>
                    <p style="<?php echo $styles['text']; ?>"><?php echo esc_html($p_desc); ?></p>
                </div>
                <?php endfor; ?>
            </div>

            <!-- Stats -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:32px;text-align:center;padding-top:40px;border-top:1px solid rgba(0,0,0,0.1);">
                <?php 
                $stat_defaults = [
                    1 => ["25+", "Years of Experience"],
                    2 => ["Global", "Regulatory Reach"],
                    3 => ["100%", "Pharma-Grade Standards"]
                ];
                for($i=1; $i<=3; $i++):
                    $s_num = get_theme_mod("mlws_heritage_stat{$i}_num", $stat_defaults[$i][0]);
                    $s_lbl = get_theme_mod("mlws_heritage_stat{$i}_label", $stat_defaults[$i][1]);
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
    <?php if (get_theme_mod('mlws_heritage_mission_show', true)) : 
        $mission_tag = get_theme_mod('mlws_heritage_mission_tag', 'Our Mission');
        $mission_title = get_theme_mod('mlws_heritage_mission_title', 'Bridging Science & <span class="highlight">Patient Wellbeing</span>');
        $mission_desc = get_theme_mod('mlws_heritage_mission_desc', 'At Merlows, our mission is to empower patients living with chronic gastrointestinal conditions by making world-class clinical nutrition science accessible, actionable, and personal.');
        $styles = mlws_get_section_style_heritage('mlws_heritage_mission', '#f8f9fa');
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
                    1 => ["Evidence-Based", "Every product and piece of content we produce meets the highest scientific and regulatory standards, rooted in peer-reviewed clinical research."],
                    2 => ["Patient-First", "We design every solution around the real-world challenges that patients face — not just clinical endpoints — because lived experience matters."],
                    3 => ["Pharma-Grade", "Our medical food products are developed with the same rigour applied to licensed medicines — providing a quality benchmark no ordinary supplement can match."],
                    4 => ["Global Reach", "With a regulatory footprint spanning multiple continents, Merlows delivers consistent, trusted solutions wherever patients and clinicians need them."]
                ];
                for($i=1; $i<=4; $i++):
                    $v_title = get_theme_mod("mlws_heritage_val{$i}_title", $val_defaults[$i][0]);
                    $v_desc = get_theme_mod("mlws_heritage_val{$i}_desc", $val_defaults[$i][1]);
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

    <!-- EPAVANCE SPOTLIGHT -->
    <?php if (get_theme_mod('mlws_heritage_product_show', true)) : 
        $prod_tag = get_theme_mod('mlws_heritage_prod_tag', 'Our Flagship Product');
        $prod_title = get_theme_mod('mlws_heritage_prod_title', 'Introducing EPAVANCE');
        $prod_desc = get_theme_mod('mlws_heritage_prod_desc', 'EPAVANCE is a pharma-grade Omega-3 medical food especially formulated for patients with Inflammatory Bowel Disease. Unlike generic supplements, EPAVANCE is developed under the same rigorous manufacturing standards applied to licensed medicines.');
        $prod_btn = get_theme_mod('mlws_heritage_prod_btn', 'Learn More About EPAVANCE');
        $prod_url = get_theme_mod('mlws_heritage_prod_url', '#');
        $styles = mlws_get_section_style_heritage('mlws_heritage_product', '#fff');
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
                        1 => ["Pharma-Grade Manufacturing", "Produced under strict pharmaceutical cGMP standards — the highest tier of quality assurance in the industry."],
                        2 => ["Clinically Researched", "Supported by clinical evidence demonstrating meaningful benefit for IBD patients managing their nutritional needs."],
                        3 => ["High-Dose EPA Omega-3", "A precisely calibrated dose of EPA matched to the needs of IBD-associated gut inflammation."],
                        4 => ["Regulatory Status", "Classified as a Medical Food (FSMP), enabling it to occupy a unique, trusted position between medication and nutrition."]
                    ];
                    for($i=1; $i<=4; $i++):
                        $f_title = get_theme_mod("mlws_heritage_feat{$i}_title", $feat_defaults[$i][0]);
                        $f_desc = get_theme_mod("mlws_heritage_feat{$i}_desc", $feat_defaults[$i][1]);
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
    <?php if (get_theme_mod('mlws_heritage_platform_show', true)) : 
        $plat_tag = get_theme_mod('mlws_heritage_plat_tag', 'The Digital Layer');
        $plat_title = get_theme_mod('mlws_heritage_plat_title', 'The Merlows Platform');
        $plat_desc = get_theme_mod('mlws_heritage_plat_desc', 'Beyond our medical food products, Merlows is building a world-class digital health hub - combining clinical-grade content, AI-powered tools, and a vibrant community for patients and healthcare professionals.');
        $styles = mlws_get_section_style_heritage('mlws_heritage_platform', '#142846');
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
                    1 => ["Clinical Content Hub", "Peer-reviewed research, expert opinions, and patient education curated by gastroenterologists and dietitians."],
                    2 => ["IBD-i AI Assistant", "A specialised AI trained on clinical gastroenterology to answer your health questions with precision and safety."],
                    3 => ["Patient Dashboard", "A secure personal portal to track health records, manage your IBD tools, and connect with your care pathway."],
                    4 => ["HCP Professional Portal", "A dedicated space for healthcare practitioners to access protocols, CME, and collaborate with Merlows experts."],
                    5 => ["Health Calculators", "Evidence-based clinical calculators for malnutrition screening, BMI, and disease activity scoring."],
                    6 => ["Education Courses", "Multi-chapter learning pathways developed by gastro specialists for both patients and clinicians."]
                ];
                for($i=1; $i<=6; $i++):
                    $pl_title = get_theme_mod("mlws_heritage_plat{$i}_title", $plat_defaults[$i][0]);
                    $pl_desc = get_theme_mod("mlws_heritage_plat{$i}_desc", $plat_defaults[$i][1]);
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
        $prefix = "mlws_heritage_promo$p";
        if (get_theme_mod($prefix . '_show', true)) :
            $img = get_theme_mod($prefix . '_img');
            $title = get_theme_mod($prefix . '_title', 'Promo title');
            $sub = get_theme_mod($prefix . '_sub', 'Promo subtitle');
            $desc = get_theme_mod($prefix . '_desc', 'Promo description text goes here.');
            $btn_lbl = get_theme_mod($prefix . '_btn_lbl', 'Learn More');
            $btn_url = get_theme_mod($prefix . '_btn_url', '#');
            $layout = get_theme_mod($prefix . '_layout', 'img-left');
            $styles = mlws_get_section_style_heritage($prefix, '#fff');
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
    <?php if (get_theme_mod('mlws_heritage_cta_show', true)) : 
        $cta_title = get_theme_mod('mlws_heritage_cta_title', 'Join the Merlows Community');
        $cta_desc = get_theme_mod('mlws_heritage_cta_desc', "Whether you're a patient managing IBD, a clinician advancing your practice, or a researcher exploring gut health - there's a place for you at Merlows.");
        $cta_btn1_lbl = get_theme_mod('mlws_heritage_cta_btn1_label', "About Merlows");
        $cta_btn1_url = get_theme_mod('mlws_heritage_cta_btn1_url', '/patients/');
        $cta_btn2_lbl = get_theme_mod('mlws_heritage_cta_btn2_label', "I'm a Healthcare Professional");
        $cta_btn2_url = get_theme_mod('mlws_heritage_cta_btn2_url', '/healthcare-professionals/');
        $styles = mlws_get_section_style_heritage('mlws_heritage_cta', '#EB5A33');
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
