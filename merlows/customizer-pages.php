<?php
// Included in functions.php
function mlws_pages_customize_register( $wp_customize ) {
    // ---- HCP PAGE PANEL ----
    $wp_customize->add_panel( "mlws_hcp_panel", array(
        "title"    => __("HCP Page Settings", "merlows" ),
        "priority" => 46,
    ) );

    // HCP Hero
    $wp_customize->add_section( "mlws_hcp_hero", array( "title" => "Hero Section", "panel" => "mlws_hcp_panel" ) );
    $wp_customize->add_setting( "mlws_hcp_hero_tag", array( "default" => "Professional Portal", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_hcp_hero_tag", array( "label" => "Tag Label", "section" => "mlws_hcp_hero", "type" => "text" ) );
    
    $wp_customize->add_setting( "mlws_hcp_hero_title", array( "default" => "Advancing <span class=\"highlight\">Clinical Practice</span> Through Nutrition", "sanitize_callback" => "wp_kses_post" ) );
    $wp_customize->add_control( "mlws_hcp_hero_title", array( "label" => "Title", "section" => "mlws_hcp_hero", "type" => "textarea" ) );
    
    $wp_customize->add_setting( "mlws_hcp_hero_desc", array( "default" => "Evidence-based resources, clinical protocols, and CME opportunities designed for gastroenterologists, dietitians, GPs, and allied health professionals.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_hcp_hero_desc", array( "label" => "Description", "section" => "mlws_hcp_hero", "type" => "textarea" ) );
    
    $wp_customize->add_setting("mlws_hcp_hero_bg", array("default"=>"","sanitize_callback"=>"esc_url_raw"));
    $wp_customize->add_control(new WP_Customize_Image_Control($wp_customize, "mlws_hcp_hero_bg", array("label"=>"Hero Background Image","section"=>"mlws_hcp_hero")));

    // HCP Resources (replacing previous)
    $wp_customize->add_section( "mlws_hcp_resources", array( "title" => "Resources Section", "panel" => "mlws_hcp_panel" ) );
    $wp_customize->add_setting( "mlws_hcp_res_tag", array( "default" => "Join the Effort", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_hcp_res_tag", array( "label" => "Tag Label", "section" => "mlws_hcp_resources", "type" => "text" ) );
    
    $wp_customize->add_setting( "mlws_hcp_res_title", array( "default" => "What You'll Access", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_hcp_res_title", array( "label" => "Title", "section" => "mlws_hcp_resources", "type" => "text" ) );
    
    $wp_customize->add_setting( "mlws_hcp_res_desc", array( "default" => "We invite passionate healthcare practitioners to join us in advancing clinical nutrition. Share your expertise and help shape the future of specialized healthcare content.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_hcp_res_desc", array( "label" => "Description", "section" => "mlws_hcp_resources", "type" => "textarea" ) );

    $res_defaults = array(
        1 => array("Clinical Protocols", "Step-by-step treatment algorithms for common and complex GI conditions, including FSMP integration."),
        2 => array("Research Summaries", "Curated abstracts and commentary on the latest Omega-3, gut microbiome, and longevity research."),
        3 => array("Webinars & CME", "On-demand educational sessions with CPD accreditation from leading gastroenterology experts."),
        4 => array("Patient Handouts", "Downloadable, branded resources to share with patients to reinforce dietary and treatment advice.")
    );
    for($i=1; $i<=4; $i++) {
        $wp_customize->add_setting("mlws_hcp_res{$i}_title", array("default"=>$res_defaults[$i][0],"sanitize_callback"=>"sanitize_text_field"));
        $wp_customize->add_control("mlws_hcp_res{$i}_title", array("label"=>"Card $i Title", "section"=>"mlws_hcp_resources", "type"=>"text"));
        $wp_customize->add_setting("mlws_hcp_res{$i}_desc", array("default"=>$res_defaults[$i][1],"sanitize_callback"=>"sanitize_textarea_field"));
        $wp_customize->add_control("mlws_hcp_res{$i}_desc", array("label"=>"Card $i Description", "section"=>"mlws_hcp_resources", "type"=>"textarea"));
    }

    // HCP Collaborate
    $wp_customize->add_section( "mlws_hcp_collab", array( "title" => "Collaborate Section", "panel" => "mlws_hcp_panel" ) );
    $wp_customize->add_setting( "mlws_hcp_collab_title", array( "default" => "Collaborate with Merlows", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_hcp_collab_title", array( "label" => "Title", "section" => "mlws_hcp_collab", "type" => "text" ) );
    
    $collab_defaults = array(
        1 => array("Submit Articles", "Publish your clinical insights and case studies to our global network of peers."),
        2 => array("Co-Author Content", "Partner with our medical writing team to develop robust, evidence-based clinical guides."),
        3 => array("Podcast Guest", "Join our clinical podcast series to discuss innovations, challenges, and success stories."),
        4 => array("Clinical Trials", "Work with us on our pipeline of clinical and in-market trials investigating novel specific treatments.")
    );
    for($i=1; $i<=4; $i++) {
        $wp_customize->add_setting("mlws_hcp_col{$i}_title", array("default"=>$collab_defaults[$i][0],"sanitize_callback"=>"sanitize_text_field"));
        $wp_customize->add_control("mlws_hcp_col{$i}_title", array("label"=>"Card $i Title", "section"=>"mlws_hcp_collab", "type"=>"text"));
        $wp_customize->add_setting("mlws_hcp_col{$i}_desc", array("default"=>$collab_defaults[$i][1],"sanitize_callback"=>"sanitize_textarea_field"));
        $wp_customize->add_control("mlws_hcp_col{$i}_desc", array("label"=>"Card $i Description", "section"=>"mlws_hcp_collab", "type"=>"textarea"));
    }
    
    // HCP CTA
    $wp_customize->add_section( "mlws_hcp_cta", array( "title" => "CTA Section", "panel" => "mlws_hcp_panel" ) );
    $wp_customize->add_setting( "mlws_hcp_cta_title", array( "default" => "Join the Professional Network", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_hcp_cta_title", array( "label" => "Title", "section" => "mlws_hcp_cta", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_hcp_cta_desc", array( "default" => "Free registration gives you full access to protocols, research, and CME opportunities.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_hcp_cta_desc", array( "label" => "Description", "section" => "mlws_hcp_cta", "type" => "textarea" ) );


    // ---- PATIENT PAGE PANEL ----
    $wp_customize->add_panel( "mlws_pat_panel", array(
        "title"    => __("Patient Page Settings", "merlows" ),
        "priority" => 47,
    ) );

    // Patient Hero
    $wp_customize->add_section( "mlws_pat_hero", array( "title" => "Hero Section", "panel" => "mlws_pat_panel" ) );
    $wp_customize->add_setting( "mlws_pat_hero_tag", array( "default" => "Patient Portal", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_pat_hero_tag", array( "label" => "Tag Label", "section" => "mlws_pat_hero", "type" => "text" ) );
    
    $wp_customize->add_setting( "mlws_pat_hero_title", array( "default" => "Empowering Your <span class=\"highlight\">Wellness Journey</span>", "sanitize_callback" => "wp_kses_post" ) );
    $wp_customize->add_control( "mlws_pat_hero_title", array( "label" => "Title", "section" => "mlws_pat_hero", "type" => "textarea" ) );
    
    $wp_customize->add_setting( "mlws_pat_hero_desc", array( "default" => "More than just a news site—a truly useful platform providing the highest quality clinical information, innovative tools, and expert opinions to help you explore and manage your gastro healthcare concerns.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_pat_hero_desc", array( "label" => "Description", "section" => "mlws_pat_hero", "type" => "textarea" ) );
    
    $wp_customize->add_setting("mlws_pat_hero_bg", array("default"=>"","sanitize_callback"=>"esc_url_raw"));
    $wp_customize->add_control(new WP_Customize_Image_Control($wp_customize, "mlws_pat_hero_bg", array("label"=>"Hero Background Image","section"=>"mlws_pat_hero")));

    // Patient Benefits
    $wp_customize->add_section( "mlws_pat_benefits", array( "title" => "Benefits Section", "panel" => "mlws_pat_panel" ) );
    $wp_customize->add_setting( "mlws_pat_ben_tag", array( "default" => "Why Choose Merlows?", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_pat_ben_tag", array( "label" => "Tag Label", "section" => "mlws_pat_benefits", "type" => "text" ) );
    
    $wp_customize->add_setting( "mlws_pat_ben_title", array( "default" => "Not Just Another Community", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_pat_ben_title", array( "label" => "Title", "section" => "mlws_pat_benefits", "type" => "text" ) );
    
    $wp_customize->add_setting( "mlws_pat_ben_desc", array( "default" => "Merlows is a comprehensive suite of resources designed to aid your personal health journey. We bridge the gap between complex medical research and practical, daily wellness by providing clinical information in a format that is easy to understand.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_pat_ben_desc", array( "label" => "Description", "section" => "mlws_pat_benefits", "type" => "textarea" ) );

    $ben_defaults = array(
        1 => array("Clear Clinical Info", "Access cutting-edge clinical information translated into a clear, easy-to-understand format tailored for patients, without the medical jargon."),
        2 => array("Renowned Expertise", "Engage with exclusive content, insights, and guidance produced directly by Merlows specialists and world-renowned gastro healthcare experts."),
        3 => array("Actionable Solutions", "Take control with highly interactive calculators, health trackers, and personalized AI to bring the clinic directly into your home life.")
    );
    for($i=1; $i<=3; $i++) {
        $wp_customize->add_setting("mlws_pat_ben{$i}_title", array("default"=>$ben_defaults[$i][0],"sanitize_callback"=>"sanitize_text_field"));
        $wp_customize->add_control("mlws_pat_ben{$i}_title", array("label"=>"Benefit $i Title", "section"=>"mlws_pat_benefits", "type"=>"text"));
        $wp_customize->add_setting("mlws_pat_ben{$i}_desc", array("default"=>$ben_defaults[$i][1],"sanitize_callback"=>"sanitize_textarea_field"));
        $wp_customize->add_control("mlws_pat_ben{$i}_desc", array("label"=>"Benefit $i Description", "section"=>"mlws_pat_benefits", "type"=>"textarea"));
    }

    // Patient Tools
    $wp_customize->add_section( "mlws_pat_tools", array( "title" => "Tools Section", "panel" => "mlws_pat_panel" ) );
    $wp_customize->add_setting( "mlws_pat_tool_title", array( "default" => "Innovative Tools at Your Fingertips", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_pat_tool_title", array( "label" => "Title", "section" => "mlws_pat_tools", "type" => "text" ) );
    
    $tool_defaults = array(
        1 => array("Ask IBD-i Expert", "Interact with our AI intelligence trained specifically in clinical gastro conditions for instant, reliable answers to your health questions."),
        2 => array("Bookmark & Clip", "Easily save important articles, clip vital paragraphs, and create your own customized research notes directly in your portal."),
        3 => array("History & AI Tracking", "Upload your medical history documents to allow IBD-i to securely analyze data, track your ongoing wellness, and spot trends."),
        4 => array("Healthcare Calculators", "Evaluate potential malnutrition, calculate BMI, and score related healthcare symptoms to stay on top of your physical needs."),
        5 => array("Exclusive Courses", "Enroll in customized, multi-chapter curriculums developed by gastro specialists focusing on diet, recovery, and lifestyle routines."),
        6 => array("Downloadable Guides", "Save and export patient-focused literature, daily checklists, and clear instructions for managing clinical nutrition products.")
    );
    for($i=1; $i<=6; $i++) {
        $wp_customize->add_setting("mlws_pat_tool{$i}_title", array("default"=>$tool_defaults[$i][0],"sanitize_callback"=>"sanitize_text_field"));
        $wp_customize->add_control("mlws_pat_tool{$i}_title", array("label"=>"Tool $i Title", "section"=>"mlws_pat_tools", "type"=>"text"));
        $wp_customize->add_setting("mlws_pat_tool{$i}_desc", array("default"=>$tool_defaults[$i][1],"sanitize_callback"=>"sanitize_textarea_field"));
        $wp_customize->add_control("mlws_pat_tool{$i}_desc", array("label"=>"Tool $i Description", "section"=>"mlws_pat_tools", "type"=>"textarea"));
    }
    
    // Patient CTA
    $wp_customize->add_section( "mlws_pat_cta", array( "title" => "CTA Section", "panel" => "mlws_pat_panel" ) );
    $wp_customize->add_setting( "mlws_pat_cta_title", array( "default" => "Begin Your Journey", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_pat_cta_title", array( "label" => "Title", "section" => "mlws_pat_cta", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_pat_cta_desc", array( "default" => "Join thousands of patients taking control of their gut health and longevity. It's completely free to start using our clinical resources today.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_pat_cta_desc", array( "label" => "Description", "section" => "mlws_pat_cta", "type" => "textarea" ) );


    // ---- ABOUT US PAGE PANEL ----
    $wp_customize->add_panel( "mlws_about_panel", array(
        "title"    => __("About Us Page", "merlows" ),
        "priority" => 48,
    ) );

    // ── Hero ──────────────────────────────────────────────────
    $wp_customize->add_section( "mlws_about_hero", array( "title" => "Hero Section", "panel" => "mlws_about_panel" ) );
    $wp_customize->add_setting( "mlws_about_hero_tag",   array( "default" => "Our Story", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_hero_tag",   array( "label" => "Tag Label", "section" => "mlws_about_hero", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_hero_title", array( "default" => "From Pharma to <span class=\"highlight\">Healthcare</span>", "sanitize_callback" => "wp_kses_post" ) );
    $wp_customize->add_control( "mlws_about_hero_title", array( "label" => "Title (HTML allowed)", "section" => "mlws_about_hero", "type" => "textarea" ) );
    $wp_customize->add_setting( "mlws_about_hero_sub",   array( "default" => "A Natural Evolution in Gastrointestinal Care", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_hero_sub",   array( "label" => "Sub-title (italic)", "section" => "mlws_about_hero", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_hero_desc",  array( "default" => "Merlows bridges the worlds of pharmaceutical science and patient-centred nutrition, delivering evidence-based medical food solutions for life with IBD.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_about_hero_desc",  array( "label" => "Description", "section" => "mlws_about_hero", "type" => "textarea" ) );
    $wp_customize->add_setting( "mlws_about_hero_img",    array( "default" => "", "sanitize_callback" => "esc_url_raw" ) );
    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, "mlws_about_hero_img", array( "label" => "Hero Background Image", "section" => "mlws_about_hero" ) ) );
    // Styles for Hero Section
    $wp_customize->add_setting( "mlws_about_hero_show", array( "default" => true, "sanitize_callback" => "absint" ) );
    $wp_customize->add_control( "mlws_about_hero_show", array( "label" => "Show Section", "section" => "mlws_about_hero", "type" => "checkbox" ) );
    $wp_customize->add_setting( "mlws_about_hero_bg_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_hero_bg_color", array( "label" => "Hero Background Colour (overrides image)", "section" => "mlws_about_hero" ) ) );
    $wp_customize->add_setting( "mlws_about_hero_tag_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_hero_tag_bg", array( "label" => "Tag Label Background Colour", "section" => "mlws_about_hero" ) ) );
    $wp_customize->add_setting( "mlws_about_hero_tag_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_hero_tag_color", array( "label" => "Tag Label Font Colour", "section" => "mlws_about_hero" ) ) );
    $wp_customize->add_setting( "mlws_about_hero_title_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_hero_title_color", array( "label" => "Title Colour", "section" => "mlws_about_hero" ) ) );
    $wp_customize->add_setting( "mlws_about_hero_title_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_hero_title_size", array( "label" => "Title Font Size (e.g. 48px)", "section" => "mlws_about_hero", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_hero_text_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_hero_text_color", array( "label" => "Description Text Colour", "section" => "mlws_about_hero" ) ) );
    $wp_customize->add_setting( "mlws_about_hero_text_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_hero_text_size", array( "label" => "Description Font Size (e.g. 20px)", "section" => "mlws_about_hero", "type" => "text" ) );


    // ── Origin / Pillars ──────────────────────────────────────
    $wp_customize->add_section( "mlws_about_origin", array( "title" => "Origin Section", "panel" => "mlws_about_panel" ) );
    $wp_customize->add_setting( "mlws_about_origin_tag",   array( "default" => "From Pharma to Healthcare", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_origin_tag",   array( "label" => "Section Tag", "section" => "mlws_about_origin", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_origin_title", array( "default" => "From Pharma to Healthcare", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_origin_title", array( "label" => "Heading", "section" => "mlws_about_origin", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_origin_sub",   array( "default" => "A Natural Evolution in Gastrointestinal Care", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_origin_sub",   array( "label" => "Sub-heading", "section" => "mlws_about_origin", "type" => "text" ) );

    $pillar_defaults = array(
        1 => array( "Heritage in Pharma",       "Merlows has a long record of developing specialised gastrointestinal medicines under rigorous regulatory standards." ),
        2 => array( "Patient-Centric Innovation","We found that medicines alone often fall short for chronic IBD. There is a clear need for evidence-based nutritional support." ),
        3 => array( "The Birth of Merlows",  "Merlows bridges pharma and nutrition, delivering \"pharma-grade\" medical food products like EPAVANCE." ),
    );
    for ( $i = 1; $i <= 3; $i++ ) {
        $wp_customize->add_setting( "mlws_about_p{$i}_title", array( "default" => $pillar_defaults[$i][0], "sanitize_callback" => "sanitize_text_field" ) );
        $wp_customize->add_control( "mlws_about_p{$i}_title", array( "label" => "Pillar $i Title", "section" => "mlws_about_origin", "type" => "text" ) );
        $wp_customize->add_setting( "mlws_about_p{$i}_desc",  array( "default" => $pillar_defaults[$i][1], "sanitize_callback" => "sanitize_textarea_field" ) );
        $wp_customize->add_control( "mlws_about_p{$i}_desc",  array( "label" => "Pillar $i Description", "section" => "mlws_about_origin", "type" => "textarea" ) );
    }
    // Stats
    $stat_defaults = array(
        1 => array( "25+",    "Years of Experience" ),
        2 => array( "Global", "Regulatory Reach" ),
        3 => array( "100%",   "Pharma-Grade Standards" ),
    );
    for ( $i = 1; $i <= 3; $i++ ) {
        $wp_customize->add_setting( "mlws_about_stat{$i}_num",   array( "default" => $stat_defaults[$i][0], "sanitize_callback" => "sanitize_text_field" ) );
        $wp_customize->add_control( "mlws_about_stat{$i}_num",   array( "label" => "Stat $i Number", "section" => "mlws_about_origin", "type" => "text" ) );
        $wp_customize->add_setting( "mlws_about_stat{$i}_label", array( "default" => $stat_defaults[$i][1], "sanitize_callback" => "sanitize_text_field" ) );
        $wp_customize->add_control( "mlws_about_stat{$i}_label", array( "label" => "Stat $i Label", "section" => "mlws_about_origin", "type" => "text" ) );
    // Styles for Origin Section
    $wp_customize->add_setting( "mlws_about_origin_show", array( "default" => true, "sanitize_callback" => "absint" ) );
    $wp_customize->add_control( "mlws_about_origin_show", array( "label" => "Show Section", "section" => "mlws_about_origin", "type" => "checkbox" ) );
    $wp_customize->add_setting( "mlws_about_origin_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_origin_bg", array( "label" => "Background Colour", "section" => "mlws_about_origin" ) ) );
    $wp_customize->add_setting( "mlws_about_origin_tag_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_origin_tag_bg", array( "label" => "Tag Label Background Colour", "section" => "mlws_about_origin" ) ) );
    $wp_customize->add_setting( "mlws_about_origin_tag_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_origin_tag_color", array( "label" => "Tag Label Font Colour", "section" => "mlws_about_origin" ) ) );
    $wp_customize->add_setting( "mlws_about_origin_title_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_origin_title_color", array( "label" => "Title Colour", "section" => "mlws_about_origin" ) ) );
    $wp_customize->add_setting( "mlws_about_origin_title_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_origin_title_size", array( "label" => "Title Font Size (e.g. 40px)", "section" => "mlws_about_origin", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_origin_text_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_origin_text_color", array( "label" => "Text Colour", "section" => "mlws_about_origin" ) ) );
    $wp_customize->add_setting( "mlws_about_origin_text_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_origin_text_size", array( "label" => "Text Font Size (e.g. 18px)", "section" => "mlws_about_origin", "type" => "text" ) );

    }

    // ── Mission & Values ──────────────────────────────────────
    $wp_customize->add_section( "mlws_about_mission", array( "title" => "Mission & Values", "panel" => "mlws_about_panel" ) );
    $wp_customize->add_setting( "mlws_about_mission_tag",   array( "default" => "Our Mission", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_mission_tag",   array( "label" => "Section Tag", "section" => "mlws_about_mission", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_mission_title", array( "default" => "Bridging Science & <span class=\"highlight\">Patient Wellbeing</span>", "sanitize_callback" => "wp_kses_post" ) );
    $wp_customize->add_control( "mlws_about_mission_title", array( "label" => "Heading (HTML allowed)", "section" => "mlws_about_mission", "type" => "textarea" ) );
    $wp_customize->add_setting( "mlws_about_mission_desc",  array( "default" => "At Merlows, our mission is to empower patients living with chronic gastrointestinal conditions by making world-class clinical nutrition science accessible, actionable, and personal.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_about_mission_desc",  array( "label" => "Description", "section" => "mlws_about_mission", "type" => "textarea" ) );

    $val_defaults = array(
        1 => array( "Evidence-Based",  "Every product and piece of content we produce meets the highest scientific and regulatory standards, rooted in peer-reviewed clinical research." ),
        2 => array( "Patient-First",   "We design every solution around the real-world challenges that patients face — not just clinical endpoints — because lived experience matters." ),
        3 => array( "Pharma-Grade",    "Our medical food products are developed with the same rigour applied to licensed medicines — providing a quality benchmark no ordinary supplement can match." ),
        4 => array( "Global Reach",    "With a regulatory footprint spanning multiple continents, Merlows delivers consistent, trusted solutions wherever patients and clinicians need them." ),
    );
    for ( $i = 1; $i <= 4; $i++ ) {
        $wp_customize->add_setting( "mlws_about_val{$i}_title", array( "default" => $val_defaults[$i][0], "sanitize_callback" => "sanitize_text_field" ) );
        $wp_customize->add_control( "mlws_about_val{$i}_title", array( "label" => "Value $i Title", "section" => "mlws_about_mission", "type" => "text" ) );
        $wp_customize->add_setting( "mlws_about_val{$i}_desc",  array( "default" => $val_defaults[$i][1], "sanitize_callback" => "sanitize_textarea_field" ) );
        $wp_customize->add_control( "mlws_about_val{$i}_desc",  array( "label" => "Value $i Description", "section" => "mlws_about_mission", "type" => "textarea" ) );
    // Styles for Mission & Values
    $wp_customize->add_setting( "mlws_about_mission_show", array( "default" => true, "sanitize_callback" => "absint" ) );
    $wp_customize->add_control( "mlws_about_mission_show", array( "label" => "Show Section", "section" => "mlws_about_mission", "type" => "checkbox" ) );
    $wp_customize->add_setting( "mlws_about_mission_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_mission_bg", array( "label" => "Background Colour", "section" => "mlws_about_mission" ) ) );
    $wp_customize->add_setting( "mlws_about_mission_tag_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_mission_tag_bg", array( "label" => "Tag Label Background Colour", "section" => "mlws_about_mission" ) ) );
    $wp_customize->add_setting( "mlws_about_mission_tag_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_mission_tag_color", array( "label" => "Tag Label Font Colour", "section" => "mlws_about_mission" ) ) );
    $wp_customize->add_setting( "mlws_about_mission_title_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_mission_title_color", array( "label" => "Title Colour", "section" => "mlws_about_mission" ) ) );
    $wp_customize->add_setting( "mlws_about_mission_title_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_mission_title_size", array( "label" => "Title Font Size (e.g. 40px)", "section" => "mlws_about_mission", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_mission_text_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_mission_text_color", array( "label" => "Text Colour", "section" => "mlws_about_mission" ) ) );
    $wp_customize->add_setting( "mlws_about_mission_text_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_mission_text_size", array( "label" => "Text Font Size (e.g. 18px)", "section" => "mlws_about_mission", "type" => "text" ) );

    }

    // ── EPAVANCE Product Spotlight ────────────────────────────
    $wp_customize->add_section( "mlws_about_product", array( "title" => "EPAVANCE Spotlight", "panel" => "mlws_about_panel" ) );
    $wp_customize->add_setting( "mlws_about_prod_tag",       array( "default" => "Our Flagship Product", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_prod_tag",       array( "label" => "Section Tag", "section" => "mlws_about_product", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_prod_title",     array( "default" => "Introducing EPAVANCE", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_prod_title",     array( "label" => "Title", "section" => "mlws_about_product", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_prod_desc",      array( "default" => "EPAVANCE is a pharma-grade Omega-3 medical food especially formulated for patients with Inflammatory Bowel Disease. Unlike generic supplements, EPAVANCE is developed under the same rigorous manufacturing standards applied to licensed medicines.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_about_prod_desc",      array( "label" => "Description", "section" => "mlws_about_product", "type" => "textarea" ) );
    $wp_customize->add_setting( "mlws_about_prod_btn",       array( "default" => "Learn More About EPAVANCE", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_prod_btn",       array( "label" => "Button Label", "section" => "mlws_about_product", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_prod_url",       array( "default" => "#", "sanitize_callback" => "esc_url_raw" ) );
    $wp_customize->add_control( "mlws_about_prod_url",       array( "label" => "Button URL", "section" => "mlws_about_product", "type" => "url" ) );

    $feat_defaults = array(
        1 => array( "Pharma-Grade Manufacturing", "Produced under strict pharmaceutical cGMP standards — the highest tier of quality assurance in the industry." ),
        2 => array( "Clinically Researched",      "Supported by clinical evidence demonstrating meaningful benefit for IBD patients managing their nutritional needs." ),
        3 => array( "High-Dose EPA Omega-3",       "A precisely calibrated dose of EPA matched to the needs of IBD-associated gut inflammation." ),
        4 => array( "Regulatory Status",           "Classified as a Medical Food (FSMP), enabling it to occupy a unique, trusted position between medication and nutrition." ),
    );
    for ( $i = 1; $i <= 4; $i++ ) {
        $wp_customize->add_setting( "mlws_about_feat{$i}_title", array( "default" => $feat_defaults[$i][0], "sanitize_callback" => "sanitize_text_field" ) );
        $wp_customize->add_control( "mlws_about_feat{$i}_title", array( "label" => "Feature $i Title", "section" => "mlws_about_product", "type" => "text" ) );
        $wp_customize->add_setting( "mlws_about_feat{$i}_desc",  array( "default" => $feat_defaults[$i][1], "sanitize_callback" => "sanitize_textarea_field" ) );
        $wp_customize->add_control( "mlws_about_feat{$i}_desc",  array( "label" => "Feature $i Description", "section" => "mlws_about_product", "type" => "textarea" ) );
    // Styles for EPAVANCE Spotlight
    $wp_customize->add_setting( "mlws_about_product_show", array( "default" => true, "sanitize_callback" => "absint" ) );
    $wp_customize->add_control( "mlws_about_product_show", array( "label" => "Show Section", "section" => "mlws_about_product", "type" => "checkbox" ) );
    $wp_customize->add_setting( "mlws_about_product_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_product_bg", array( "label" => "Background Colour", "section" => "mlws_about_product" ) ) );
    $wp_customize->add_setting( "mlws_about_product_tag_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_product_tag_bg", array( "label" => "Tag Label Background Colour", "section" => "mlws_about_product" ) ) );
    $wp_customize->add_setting( "mlws_about_product_tag_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_product_tag_color", array( "label" => "Tag Label Font Colour", "section" => "mlws_about_product" ) ) );
    $wp_customize->add_setting( "mlws_about_product_title_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_product_title_color", array( "label" => "Title Colour", "section" => "mlws_about_product" ) ) );
    $wp_customize->add_setting( "mlws_about_product_title_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_product_title_size", array( "label" => "Title Font Size (e.g. 40px)", "section" => "mlws_about_product", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_product_text_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_product_text_color", array( "label" => "Text Colour", "section" => "mlws_about_product" ) ) );
    $wp_customize->add_setting( "mlws_about_product_text_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_product_text_size", array( "label" => "Text Font Size (e.g. 18px)", "section" => "mlws_about_product", "type" => "text" ) );

    }

    // ── Platform Section ──────────────────────────────────────
    $wp_customize->add_section( "mlws_about_platform", array( "title" => "Platform Section", "panel" => "mlws_about_panel" ) );
    $wp_customize->add_setting( "mlws_about_plat_tag",   array( "default" => "The Digital Layer", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_plat_tag",   array( "label" => "Section Tag", "section" => "mlws_about_platform", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_plat_title", array( "default" => "The Merlows Platform", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_plat_title", array( "label" => "Heading", "section" => "mlws_about_platform", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_plat_desc",  array( "default" => "Beyond our medical food products, Merlows is building a world-class digital health hub - combining clinical-grade content, AI-powered tools, and a vibrant community for patients and healthcare professionals.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_about_plat_desc",  array( "label" => "Description", "section" => "mlws_about_platform", "type" => "textarea" ) );

    $plat_defaults = array(
        1 => array( "Clinical Content Hub",    "Peer-reviewed research, expert opinions, and patient education curated by gastroenterologists and dietitians." ),
        2 => array( "IBD-i AI Assistant",      "A specialised AI trained on clinical gastroenterology to answer your health questions with precision and safety." ),
        3 => array( "Patient Dashboard",       "A secure personal portal to track health records, manage your IBD tools, and connect with your care pathway." ),
        4 => array( "HCP Professional Portal", "A dedicated space for healthcare practitioners to access protocols, CME, and collaborate with Merlows experts." ),
        5 => array( "Health Calculators",      "Evidence-based clinical calculators for malnutrition screening, BMI, and disease activity scoring." ),
        6 => array( "Education Courses",       "Multi-chapter learning pathways developed by gastro specialists for both patients and clinicians." ),
    );
    for ( $i = 1; $i <= 6; $i++ ) {
        $wp_customize->add_setting( "mlws_about_plat{$i}_title", array( "default" => $plat_defaults[$i][0], "sanitize_callback" => "sanitize_text_field" ) );
        $wp_customize->add_control( "mlws_about_plat{$i}_title", array( "label" => "Platform Item $i Title", "section" => "mlws_about_platform", "type" => "text" ) );
        $wp_customize->add_setting( "mlws_about_plat{$i}_desc",  array( "default" => $plat_defaults[$i][1], "sanitize_callback" => "sanitize_textarea_field" ) );
        $wp_customize->add_control( "mlws_about_plat{$i}_desc",  array( "label" => "Platform Item $i Description", "section" => "mlws_about_platform", "type" => "textarea" ) );
    // Styles for Platform Section
    $wp_customize->add_setting( "mlws_about_platform_show", array( "default" => true, "sanitize_callback" => "absint" ) );
    $wp_customize->add_control( "mlws_about_platform_show", array( "label" => "Show Section", "section" => "mlws_about_platform", "type" => "checkbox" ) );
    $wp_customize->add_setting( "mlws_about_platform_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_platform_bg", array( "label" => "Background Colour", "section" => "mlws_about_platform" ) ) );
    $wp_customize->add_setting( "mlws_about_platform_tag_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_platform_tag_bg", array( "label" => "Tag Label Background Colour", "section" => "mlws_about_platform" ) ) );
    $wp_customize->add_setting( "mlws_about_platform_tag_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_platform_tag_color", array( "label" => "Tag Label Font Colour", "section" => "mlws_about_platform" ) ) );
    $wp_customize->add_setting( "mlws_about_platform_title_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_platform_title_color", array( "label" => "Title Colour", "section" => "mlws_about_platform" ) ) );
    $wp_customize->add_setting( "mlws_about_platform_title_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_platform_title_size", array( "label" => "Title Font Size (e.g. 40px)", "section" => "mlws_about_platform", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_platform_text_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_platform_text_color", array( "label" => "Text Colour", "section" => "mlws_about_platform" ) ) );
    $wp_customize->add_setting( "mlws_about_platform_text_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_platform_text_size", array( "label" => "Text Font Size (e.g. 18px)", "section" => "mlws_about_platform", "type" => "text" ) );

    }

    // --- CTA Strip ---
    $wp_customize->add_section( "mlws_about_cta", array( "title" => "CTA Strip", "panel" => "mlws_about_panel" ) );
    $wp_customize->add_setting( "mlws_about_cta_title",      array( "default" => "Join the Merlows Community", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_cta_title",      array( "label" => "Heading", "section" => "mlws_about_cta", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_cta_desc",       array( "default" => "Whether you're a patient managing IBD, a clinician advancing your practice, or a researcher exploring gut health - there's a place for you at Merlows.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_about_cta_desc",       array( "label" => "Description", "section" => "mlws_about_cta", "type" => "textarea" ) );
    $wp_customize->add_setting( "mlws_about_cta_btn1_label", array( "default" => "About Merlows", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_cta_btn1_label", array( "label" => "Button 1 Label", "section" => "mlws_about_cta", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_cta_btn1_url",   array( "default" => "/patients/", "sanitize_callback" => "esc_url_raw" ) );
    $wp_customize->add_control( "mlws_about_cta_btn1_url",   array( "label" => "Button 1 URL", "section" => "mlws_about_cta", "type" => "url" ) );
    $wp_customize->add_setting( "mlws_about_cta_btn2_label", array( "default" => "I'm a Healthcare Professional", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_cta_btn2_label", array( "label" => "Button 2 Label", "section" => "mlws_about_cta", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_cta_btn2_url",   array( "default" => "/healthcare-professionals/", "sanitize_callback" => "esc_url_raw" ) );
    $wp_customize->add_control( "mlws_about_cta_btn2_url",   array( "label" => "Button 2 URL", "section" => "mlws_about_cta", "type" => "url" ) );
    // Styles for CTA Strip
    $wp_customize->add_setting( "mlws_about_cta_show", array( "default" => true, "sanitize_callback" => "absint" ) );
    $wp_customize->add_control( "mlws_about_cta_show", array( "label" => "Show Section", "section" => "mlws_about_cta", "type" => "checkbox" ) );
    $wp_customize->add_setting( "mlws_about_cta_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_cta_bg", array( "label" => "Background Colour", "section" => "mlws_about_cta" ) ) );
    $wp_customize->add_setting( "mlws_about_cta_title_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_cta_title_color", array( "label" => "Title Colour", "section" => "mlws_about_cta" ) ) );
    $wp_customize->add_setting( "mlws_about_cta_title_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_cta_title_size", array( "label" => "Title Font Size (e.g. 36px)", "section" => "mlws_about_cta", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_cta_text_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_cta_text_color", array( "label" => "Text Colour", "section" => "mlws_about_cta" ) ) );
    $wp_customize->add_setting( "mlws_about_cta_text_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_cta_text_size", array( "label" => "Text Font Size (e.g. 18px)", "section" => "mlws_about_cta", "type" => "text" ) );

    // ---- OUR HERITAGE PAGE PANEL ----
    $wp_customize->add_panel( "mlws_heritage_panel", array(
        "title"    => __("Our Heritage Page", "merlows" ),
        "priority" => 49,
    ) );

    // ── Hero ──────────────────────────────────────────────────
    $wp_customize->add_section( "mlws_heritage_hero", array( "title" => "Hero Section", "panel" => "mlws_heritage_panel" ) );
    $wp_customize->add_setting( "mlws_heritage_hero_tag",   array( "default" => "Our Story", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_hero_tag",   array( "label" => "Tag Label", "section" => "mlws_heritage_hero", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_hero_title", array( "default" => "From Pharma to <span class=\"highlight\">Healthcare</span>", "sanitize_callback" => "wp_kses_post" ) );
    $wp_customize->add_control( "mlws_heritage_hero_title", array( "label" => "Title (HTML allowed)", "section" => "mlws_heritage_hero", "type" => "textarea" ) );
    $wp_customize->add_setting( "mlws_heritage_hero_sub",   array( "default" => "A Natural Evolution in Gastrointestinal Care", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_hero_sub",   array( "label" => "Sub-title (italic)", "section" => "mlws_heritage_hero", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_hero_desc",  array( "default" => "Merlows bridges the worlds of pharmaceutical science and patient-centred nutrition, delivering evidence-based medical food solutions for life with IBD.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_heritage_hero_desc",  array( "label" => "Description", "section" => "mlws_heritage_hero", "type" => "textarea" ) );
    $wp_customize->add_setting( "mlws_heritage_hero_img",    array( "default" => "", "sanitize_callback" => "esc_url_raw" ) );
    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, "mlws_heritage_hero_img", array( "label" => "Hero Background Image", "section" => "mlws_heritage_hero" ) ) );
    // Styles for Hero Section
    $wp_customize->add_setting( "mlws_heritage_hero_show", array( "default" => true, "sanitize_callback" => "absint" ) );
    $wp_customize->add_control( "mlws_heritage_hero_show", array( "label" => "Show Section", "section" => "mlws_heritage_hero", "type" => "checkbox" ) );
    $wp_customize->add_setting( "mlws_heritage_hero_bg_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_hero_bg_color", array( "label" => "Hero Background Colour (overrides image)", "section" => "mlws_heritage_hero" ) ) );
    $wp_customize->add_setting( "mlws_heritage_hero_tag_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_hero_tag_bg", array( "label" => "Tag Label Background Colour", "section" => "mlws_heritage_hero" ) ) );
    $wp_customize->add_setting( "mlws_heritage_hero_tag_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_hero_tag_color", array( "label" => "Tag Label Font Colour", "section" => "mlws_heritage_hero" ) ) );
    $wp_customize->add_setting( "mlws_heritage_hero_title_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_hero_title_color", array( "label" => "Title Colour", "section" => "mlws_heritage_hero" ) ) );
    $wp_customize->add_setting( "mlws_heritage_hero_title_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_hero_title_size", array( "label" => "Title Font Size (e.g. 48px)", "section" => "mlws_heritage_hero", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_hero_text_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_hero_text_color", array( "label" => "Description Text Colour", "section" => "mlws_heritage_hero" ) ) );
    $wp_customize->add_setting( "mlws_heritage_hero_text_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_hero_text_size", array( "label" => "Description Font Size (e.g. 20px)", "section" => "mlws_heritage_hero", "type" => "text" ) );


    // ── Origin / Pillars ──────────────────────────────────────
    $wp_customize->add_section( "mlws_heritage_origin", array( "title" => "Origin Section", "panel" => "mlws_heritage_panel" ) );
    $wp_customize->add_setting( "mlws_heritage_origin_tag",   array( "default" => "From Pharma to Healthcare", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_origin_tag",   array( "label" => "Section Tag", "section" => "mlws_heritage_origin", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_origin_title", array( "default" => "From Pharma to Healthcare", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_origin_title", array( "label" => "Heading", "section" => "mlws_heritage_origin", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_origin_sub",   array( "default" => "A Natural Evolution in Gastrointestinal Care", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_origin_sub",   array( "label" => "Sub-heading", "section" => "mlws_heritage_origin", "type" => "text" ) );

    $pillar_defaults = array(
        1 => array( "Heritage in Pharma",       "Merlows has a long record of developing specialised gastrointestinal medicines under rigorous regulatory standards." ),
        2 => array( "Patient-Centric Innovation","We found that medicines alone often fall short for chronic IBD. There is a clear need for evidence-based nutritional support." ),
        3 => array( "The Birth of Merlows",  "Merlows bridges pharma and nutrition, delivering \"pharma-grade\" medical food products like EPAVANCE." ),
    );
    for ( $i = 1; $i <= 3; $i++ ) {
        $wp_customize->add_setting( "mlws_heritage_p{$i}_title", array( "default" => $pillar_defaults[$i][0], "sanitize_callback" => "sanitize_text_field" ) );
        $wp_customize->add_control( "mlws_heritage_p{$i}_title", array( "label" => "Pillar $i Title", "section" => "mlws_heritage_origin", "type" => "text" ) );
        $wp_customize->add_setting( "mlws_heritage_p{$i}_desc",  array( "default" => $pillar_defaults[$i][1], "sanitize_callback" => "sanitize_textarea_field" ) );
        $wp_customize->add_control( "mlws_heritage_p{$i}_desc",  array( "label" => "Pillar $i Description", "section" => "mlws_heritage_origin", "type" => "textarea" ) );
    }
    // Stats
    $stat_defaults = array(
        1 => array( "25+",    "Years of Experience" ),
        2 => array( "Global", "Regulatory Reach" ),
        3 => array( "100%",   "Pharma-Grade Standards" ),
    );
    for ( $i = 1; $i <= 3; $i++ ) {
        $wp_customize->add_setting( "mlws_heritage_stat{$i}_num",   array( "default" => $stat_defaults[$i][0], "sanitize_callback" => "sanitize_text_field" ) );
        $wp_customize->add_control( "mlws_heritage_stat{$i}_num",   array( "label" => "Stat $i Number", "section" => "mlws_heritage_origin", "type" => "text" ) );
        $wp_customize->add_setting( "mlws_heritage_stat{$i}_label", array( "default" => $stat_defaults[$i][1], "sanitize_callback" => "sanitize_text_field" ) );
        $wp_customize->add_control( "mlws_heritage_stat{$i}_label", array( "label" => "Stat $i Label", "section" => "mlws_heritage_origin", "type" => "text" ) );
    // Styles for Origin Section
    $wp_customize->add_setting( "mlws_heritage_origin_show", array( "default" => true, "sanitize_callback" => "absint" ) );
    $wp_customize->add_control( "mlws_heritage_origin_show", array( "label" => "Show Section", "section" => "mlws_heritage_origin", "type" => "checkbox" ) );
    $wp_customize->add_setting( "mlws_heritage_origin_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_origin_bg", array( "label" => "Background Colour", "section" => "mlws_heritage_origin" ) ) );
    $wp_customize->add_setting( "mlws_heritage_origin_tag_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_origin_tag_bg", array( "label" => "Tag Label Background Colour", "section" => "mlws_heritage_origin" ) ) );
    $wp_customize->add_setting( "mlws_heritage_origin_tag_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_origin_tag_color", array( "label" => "Tag Label Font Colour", "section" => "mlws_heritage_origin" ) ) );
    $wp_customize->add_setting( "mlws_heritage_origin_title_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_origin_title_color", array( "label" => "Title Colour", "section" => "mlws_heritage_origin" ) ) );
    $wp_customize->add_setting( "mlws_heritage_origin_title_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_origin_title_size", array( "label" => "Title Font Size (e.g. 40px)", "section" => "mlws_heritage_origin", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_origin_text_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_origin_text_color", array( "label" => "Text Colour", "section" => "mlws_heritage_origin" ) ) );
    $wp_customize->add_setting( "mlws_heritage_origin_text_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_origin_text_size", array( "label" => "Text Font Size (e.g. 18px)", "section" => "mlws_heritage_origin", "type" => "text" ) );

    }

    // ── Mission & Values ──────────────────────────────────────
    $wp_customize->add_section( "mlws_heritage_mission", array( "title" => "Mission & Values", "panel" => "mlws_heritage_panel" ) );
    $wp_customize->add_setting( "mlws_heritage_mission_tag",   array( "default" => "Our Mission", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_mission_tag",   array( "label" => "Section Tag", "section" => "mlws_heritage_mission", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_mission_title", array( "default" => "Bridging Science & <span class=\"highlight\">Patient Wellbeing</span>", "sanitize_callback" => "wp_kses_post" ) );
    $wp_customize->add_control( "mlws_heritage_mission_title", array( "label" => "Heading (HTML allowed)", "section" => "mlws_heritage_mission", "type" => "textarea" ) );
    $wp_customize->add_setting( "mlws_heritage_mission_desc",  array( "default" => "At Merlows, our mission is to empower patients living with chronic gastrointestinal conditions by making world-class clinical nutrition science accessible, actionable, and personal.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_heritage_mission_desc",  array( "label" => "Description", "section" => "mlws_heritage_mission", "type" => "textarea" ) );

    $val_defaults = array(
        1 => array( "Evidence-Based",  "Every product and piece of content we produce meets the highest scientific and regulatory standards, rooted in peer-reviewed clinical research." ),
        2 => array( "Patient-First",   "We design every solution around the real-world challenges that patients face — not just clinical endpoints — because lived experience matters." ),
        3 => array( "Pharma-Grade",    "Our medical food products are developed with the same rigour applied to licensed medicines — providing a quality benchmark no ordinary supplement can match." ),
        4 => array( "Global Reach",    "With a regulatory footprint spanning multiple continents, Merlows delivers consistent, trusted solutions wherever patients and clinicians need them." ),
    );
    for ( $i = 1; $i <= 4; $i++ ) {
        $wp_customize->add_setting( "mlws_heritage_val{$i}_title", array( "default" => $val_defaults[$i][0], "sanitize_callback" => "sanitize_text_field" ) );
        $wp_customize->add_control( "mlws_heritage_val{$i}_title", array( "label" => "Value $i Title", "section" => "mlws_heritage_mission", "type" => "text" ) );
        $wp_customize->add_setting( "mlws_heritage_val{$i}_desc",  array( "default" => $val_defaults[$i][1], "sanitize_callback" => "sanitize_textarea_field" ) );
        $wp_customize->add_control( "mlws_heritage_val{$i}_desc",  array( "label" => "Value $i Description", "section" => "mlws_heritage_mission", "type" => "textarea" ) );
    // Styles for Mission & Values
    $wp_customize->add_setting( "mlws_heritage_mission_show", array( "default" => true, "sanitize_callback" => "absint" ) );
    $wp_customize->add_control( "mlws_heritage_mission_show", array( "label" => "Show Section", "section" => "mlws_heritage_mission", "type" => "checkbox" ) );
    $wp_customize->add_setting( "mlws_heritage_mission_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_mission_bg", array( "label" => "Background Colour", "section" => "mlws_heritage_mission" ) ) );
    $wp_customize->add_setting( "mlws_heritage_mission_tag_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_mission_tag_bg", array( "label" => "Tag Label Background Colour", "section" => "mlws_heritage_mission" ) ) );
    $wp_customize->add_setting( "mlws_heritage_mission_tag_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_mission_tag_color", array( "label" => "Tag Label Font Colour", "section" => "mlws_heritage_mission" ) ) );
    $wp_customize->add_setting( "mlws_heritage_mission_title_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_mission_title_color", array( "label" => "Title Colour", "section" => "mlws_heritage_mission" ) ) );
    $wp_customize->add_setting( "mlws_heritage_mission_title_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_mission_title_size", array( "label" => "Title Font Size (e.g. 40px)", "section" => "mlws_heritage_mission", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_mission_text_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_mission_text_color", array( "label" => "Text Colour", "section" => "mlws_heritage_mission" ) ) );
    $wp_customize->add_setting( "mlws_heritage_mission_text_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_mission_text_size", array( "label" => "Text Font Size (e.g. 18px)", "section" => "mlws_heritage_mission", "type" => "text" ) );

    }

    // ── EPAVANCE Product Spotlight ────────────────────────────
    $wp_customize->add_section( "mlws_heritage_product", array( "title" => "EPAVANCE Spotlight", "panel" => "mlws_heritage_panel" ) );
    $wp_customize->add_setting( "mlws_heritage_prod_tag",       array( "default" => "Our Flagship Product", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_prod_tag",       array( "label" => "Section Tag", "section" => "mlws_heritage_product", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_prod_title",     array( "default" => "Introducing EPAVANCE", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_prod_title",     array( "label" => "Title", "section" => "mlws_heritage_product", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_prod_desc",      array( "default" => "EPAVANCE is a pharma-grade Omega-3 medical food especially formulated for patients with Inflammatory Bowel Disease. Unlike generic supplements, EPAVANCE is developed under the same rigorous manufacturing standards applied to licensed medicines.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_heritage_prod_desc",      array( "label" => "Description", "section" => "mlws_heritage_product", "type" => "textarea" ) );
    $wp_customize->add_setting( "mlws_heritage_prod_btn",       array( "default" => "Learn More About EPAVANCE", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_prod_btn",       array( "label" => "Button Label", "section" => "mlws_heritage_product", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_prod_url",       array( "default" => "#", "sanitize_callback" => "esc_url_raw" ) );
    $wp_customize->add_control( "mlws_heritage_prod_url",       array( "label" => "Button URL", "section" => "mlws_heritage_product", "type" => "url" ) );

    $feat_defaults = array(
        1 => array( "Pharma-Grade Manufacturing", "Produced under strict pharmaceutical cGMP standards — the highest tier of quality assurance in the industry." ),
        2 => array( "Clinically Researched",      "Supported by clinical evidence demonstrating meaningful benefit for IBD patients managing their nutritional needs." ),
        3 => array( "High-Dose EPA Omega-3",       "A precisely calibrated dose of EPA matched to the needs of IBD-associated gut inflammation." ),
        4 => array( "Regulatory Status",           "Classified as a Medical Food (FSMP), enabling it to occupy a unique, trusted position between medication and nutrition." ),
    );
    for ( $i = 1; $i <= 4; $i++ ) {
        $wp_customize->add_setting( "mlws_heritage_feat{$i}_title", array( "default" => $feat_defaults[$i][0], "sanitize_callback" => "sanitize_text_field" ) );
        $wp_customize->add_control( "mlws_heritage_feat{$i}_title", array( "label" => "Feature $i Title", "section" => "mlws_heritage_product", "type" => "text" ) );
        $wp_customize->add_setting( "mlws_heritage_feat{$i}_desc",  array( "default" => $feat_defaults[$i][1], "sanitize_callback" => "sanitize_textarea_field" ) );
        $wp_customize->add_control( "mlws_heritage_feat{$i}_desc",  array( "label" => "Feature $i Description", "section" => "mlws_heritage_product", "type" => "textarea" ) );
    // Styles for EPAVANCE Spotlight
    $wp_customize->add_setting( "mlws_heritage_product_show", array( "default" => true, "sanitize_callback" => "absint" ) );
    $wp_customize->add_control( "mlws_heritage_product_show", array( "label" => "Show Section", "section" => "mlws_heritage_product", "type" => "checkbox" ) );
    $wp_customize->add_setting( "mlws_heritage_product_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_product_bg", array( "label" => "Background Colour", "section" => "mlws_heritage_product" ) ) );
    $wp_customize->add_setting( "mlws_heritage_product_tag_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_product_tag_bg", array( "label" => "Tag Label Background Colour", "section" => "mlws_heritage_product" ) ) );
    $wp_customize->add_setting( "mlws_heritage_product_tag_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_product_tag_color", array( "label" => "Tag Label Font Colour", "section" => "mlws_heritage_product" ) ) );
    $wp_customize->add_setting( "mlws_heritage_product_title_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_product_title_color", array( "label" => "Title Colour", "section" => "mlws_heritage_product" ) ) );
    $wp_customize->add_setting( "mlws_heritage_product_title_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_product_title_size", array( "label" => "Title Font Size (e.g. 40px)", "section" => "mlws_heritage_product", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_product_text_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_product_text_color", array( "label" => "Text Colour", "section" => "mlws_heritage_product" ) ) );
    $wp_customize->add_setting( "mlws_heritage_product_text_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_product_text_size", array( "label" => "Text Font Size (e.g. 18px)", "section" => "mlws_heritage_product", "type" => "text" ) );

    }

    // ── Platform Section ──────────────────────────────────────
    $wp_customize->add_section( "mlws_heritage_platform", array( "title" => "Platform Section", "panel" => "mlws_heritage_panel" ) );
    $wp_customize->add_setting( "mlws_heritage_plat_tag",   array( "default" => "The Digital Layer", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_plat_tag",   array( "label" => "Section Tag", "section" => "mlws_heritage_platform", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_plat_title", array( "default" => "The Merlows Platform", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_plat_title", array( "label" => "Heading", "section" => "mlws_heritage_platform", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_plat_desc",  array( "default" => "Beyond our medical food products, Merlows is building a world-class digital health hub - combining clinical-grade content, AI-powered tools, and a vibrant community for patients and healthcare professionals.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_heritage_plat_desc",  array( "label" => "Description", "section" => "mlws_heritage_platform", "type" => "textarea" ) );

    $plat_defaults = array(
        1 => array( "Clinical Content Hub",    "Peer-reviewed research, expert opinions, and patient education curated by gastroenterologists and dietitians." ),
        2 => array( "IBD-i AI Assistant",      "A specialised AI trained on clinical gastroenterology to answer your health questions with precision and safety." ),
        3 => array( "Patient Dashboard",       "A secure personal portal to track health records, manage your IBD tools, and connect with your care pathway." ),
        4 => array( "HCP Professional Portal", "A dedicated space for healthcare practitioners to access protocols, CME, and collaborate with Merlows experts." ),
        5 => array( "Health Calculators",      "Evidence-based clinical calculators for malnutrition screening, BMI, and disease activity scoring." ),
        6 => array( "Education Courses",       "Multi-chapter learning pathways developed by gastro specialists for both patients and clinicians." ),
    );
    for ( $i = 1; $i <= 6; $i++ ) {
        $wp_customize->add_setting( "mlws_heritage_plat{$i}_title", array( "default" => $plat_defaults[$i][0], "sanitize_callback" => "sanitize_text_field" ) );
        $wp_customize->add_control( "mlws_heritage_plat{$i}_title", array( "label" => "Platform Item $i Title", "section" => "mlws_heritage_platform", "type" => "text" ) );
        $wp_customize->add_setting( "mlws_heritage_plat{$i}_desc",  array( "default" => $plat_defaults[$i][1], "sanitize_callback" => "sanitize_textarea_field" ) );
        $wp_customize->add_control( "mlws_heritage_plat{$i}_desc",  array( "label" => "Platform Item $i Description", "section" => "mlws_heritage_platform", "type" => "textarea" ) );
    // Styles for Platform Section
    $wp_customize->add_setting( "mlws_heritage_platform_show", array( "default" => true, "sanitize_callback" => "absint" ) );
    $wp_customize->add_control( "mlws_heritage_platform_show", array( "label" => "Show Section", "section" => "mlws_heritage_platform", "type" => "checkbox" ) );
    $wp_customize->add_setting( "mlws_heritage_platform_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_platform_bg", array( "label" => "Background Colour", "section" => "mlws_heritage_platform" ) ) );
    $wp_customize->add_setting( "mlws_heritage_platform_tag_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_platform_tag_bg", array( "label" => "Tag Label Background Colour", "section" => "mlws_heritage_platform" ) ) );
    $wp_customize->add_setting( "mlws_heritage_platform_tag_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_platform_tag_color", array( "label" => "Tag Label Font Colour", "section" => "mlws_heritage_platform" ) ) );
    $wp_customize->add_setting( "mlws_heritage_platform_title_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_platform_title_color", array( "label" => "Title Colour", "section" => "mlws_heritage_platform" ) ) );
    $wp_customize->add_setting( "mlws_heritage_platform_title_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_platform_title_size", array( "label" => "Title Font Size (e.g. 40px)", "section" => "mlws_heritage_platform", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_platform_text_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_platform_text_color", array( "label" => "Text Colour", "section" => "mlws_heritage_platform" ) ) );
    $wp_customize->add_setting( "mlws_heritage_platform_text_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_platform_text_size", array( "label" => "Text Font Size (e.g. 18px)", "section" => "mlws_heritage_platform", "type" => "text" ) );

    }

    // --- CTA Strip ---
    $wp_customize->add_section( "mlws_heritage_cta", array( "title" => "CTA Strip", "panel" => "mlws_heritage_panel" ) );
    $wp_customize->add_setting( "mlws_heritage_cta_title",      array( "default" => "Join the Merlows Community", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_cta_title",      array( "label" => "Heading", "section" => "mlws_heritage_cta", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_cta_desc",       array( "default" => "Whether you're a patient managing IBD, a clinician advancing your practice, or a researcher exploring gut health - there's a place for you at Merlows.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_heritage_cta_desc",       array( "label" => "Description", "section" => "mlws_heritage_cta", "type" => "textarea" ) );
    $wp_customize->add_setting( "mlws_heritage_cta_btn1_label", array( "default" => "About Merlows", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_cta_btn1_label", array( "label" => "Button 1 Label", "section" => "mlws_heritage_cta", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_cta_btn1_url",   array( "default" => "/patients/", "sanitize_callback" => "esc_url_raw" ) );
    $wp_customize->add_control( "mlws_heritage_cta_btn1_url",   array( "label" => "Button 1 URL", "section" => "mlws_heritage_cta", "type" => "url" ) );
    $wp_customize->add_setting( "mlws_heritage_cta_btn2_label", array( "default" => "I'm a Healthcare Professional", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_cta_btn2_label", array( "label" => "Button 2 Label", "section" => "mlws_heritage_cta", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_cta_btn2_url",   array( "default" => "/healthcare-professionals/", "sanitize_callback" => "esc_url_raw" ) );
    $wp_customize->add_control( "mlws_heritage_cta_btn2_url",   array( "label" => "Button 2 URL", "section" => "mlws_heritage_cta", "type" => "url" ) );
    // Styles for CTA Strip
    $wp_customize->add_setting( "mlws_heritage_cta_show", array( "default" => true, "sanitize_callback" => "absint" ) );
    $wp_customize->add_control( "mlws_heritage_cta_show", array( "label" => "Show Section", "section" => "mlws_heritage_cta", "type" => "checkbox" ) );
    $wp_customize->add_setting( "mlws_heritage_cta_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_cta_bg", array( "label" => "Background Colour", "section" => "mlws_heritage_cta" ) ) );
    $wp_customize->add_setting( "mlws_heritage_cta_title_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_cta_title_color", array( "label" => "Title Colour", "section" => "mlws_heritage_cta" ) ) );
    $wp_customize->add_setting( "mlws_heritage_cta_title_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_cta_title_size", array( "label" => "Title Font Size (e.g. 36px)", "section" => "mlws_heritage_cta", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_cta_text_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_cta_text_color", array( "label" => "Text Colour", "section" => "mlws_heritage_cta" ) ) );
    $wp_customize->add_setting( "mlws_heritage_cta_text_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_cta_text_size", array( "label" => "Text Font Size (e.g. 18px)", "section" => "mlws_heritage_cta", "type" => "text" ) );


    // ---- PROMO BLOCKS ----

    // ---- Promo Block 1 ----
    $wp_customize->add_section( "mlws_about_promo1", array( "title" => "Promo Block 1", "panel" => "mlws_about_panel" ) );
    $wp_customize->add_setting( "mlws_about_promo1_img", array( "default" => "", "sanitize_callback" => "esc_url_raw" ) );
    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, "mlws_about_promo1_img", array( "label" => "Image", "section" => "mlws_about_promo1" ) ) );
    $wp_customize->add_setting( "mlws_about_promo1_title", array( "default" => "Promo title", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_promo1_title", array( "label" => "Title", "section" => "mlws_about_promo1", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_promo1_sub", array( "default" => "Promo subtitle", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_promo1_sub", array( "label" => "Subtitle", "section" => "mlws_about_promo1", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_promo1_desc", array( "default" => "Promo description text goes here.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_about_promo1_desc", array( "label" => "Description", "section" => "mlws_about_promo1", "type" => "textarea" ) );
    $wp_customize->add_setting( "mlws_about_promo1_btn_lbl", array( "default" => "Learn More", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_promo1_btn_lbl", array( "label" => "Button Label", "section" => "mlws_about_promo1", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_promo1_btn_url", array( "default" => "#", "sanitize_callback" => "esc_url_raw" ) );
    $wp_customize->add_control( "mlws_about_promo1_btn_url", array( "label" => "Button URL", "section" => "mlws_about_promo1", "type" => "url" ) );
    $wp_customize->add_setting( "mlws_about_promo1_layout", array( "default" => "img-left", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_promo1_layout", array( "label" => "Layout", "section" => "mlws_about_promo1", "type" => "select", "choices" => array("img-left" => "Image Left", "img-right" => "Image Right") ) );

    // Styles for Promo Block 1
    $wp_customize->add_setting( "mlws_about_promo1_show", array( "default" => true, "sanitize_callback" => "absint" ) );
    $wp_customize->add_control( "mlws_about_promo1_show", array( "label" => "Show Section", "section" => "mlws_about_promo1", "type" => "checkbox" ) );
    $wp_customize->add_setting( "mlws_about_promo1_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_promo1_bg", array( "label" => "Background Color", "section" => "mlws_about_promo1" ) ) );
    $wp_customize->add_setting( "mlws_about_promo1_title_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_promo1_title_color", array( "label" => "Title Color", "section" => "mlws_about_promo1" ) ) );
    $wp_customize->add_setting( "mlws_about_promo1_title_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_promo1_title_size", array( "label" => "Title Font Size (px)", "section" => "mlws_about_promo1", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_promo1_text_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_promo1_text_color", array( "label" => "Text Color", "section" => "mlws_about_promo1" ) ) );
    $wp_customize->add_setting( "mlws_about_promo1_text_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_promo1_text_size", array( "label" => "Text Font Size (px)", "section" => "mlws_about_promo1", "type" => "text" ) );

    // ---- Promo Block 2 ----
    $wp_customize->add_section( "mlws_about_promo2", array( "title" => "Promo Block 2", "panel" => "mlws_about_panel" ) );
    $wp_customize->add_setting( "mlws_about_promo2_img", array( "default" => "", "sanitize_callback" => "esc_url_raw" ) );
    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, "mlws_about_promo2_img", array( "label" => "Image", "section" => "mlws_about_promo2" ) ) );
    $wp_customize->add_setting( "mlws_about_promo2_title", array( "default" => "Promo title", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_promo2_title", array( "label" => "Title", "section" => "mlws_about_promo2", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_promo2_sub", array( "default" => "Promo subtitle", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_promo2_sub", array( "label" => "Subtitle", "section" => "mlws_about_promo2", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_promo2_desc", array( "default" => "Promo description text goes here.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_about_promo2_desc", array( "label" => "Description", "section" => "mlws_about_promo2", "type" => "textarea" ) );
    $wp_customize->add_setting( "mlws_about_promo2_btn_lbl", array( "default" => "Learn More", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_promo2_btn_lbl", array( "label" => "Button Label", "section" => "mlws_about_promo2", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_promo2_btn_url", array( "default" => "#", "sanitize_callback" => "esc_url_raw" ) );
    $wp_customize->add_control( "mlws_about_promo2_btn_url", array( "label" => "Button URL", "section" => "mlws_about_promo2", "type" => "url" ) );
    $wp_customize->add_setting( "mlws_about_promo2_layout", array( "default" => "img-left", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_promo2_layout", array( "label" => "Layout", "section" => "mlws_about_promo2", "type" => "select", "choices" => array("img-left" => "Image Left", "img-right" => "Image Right") ) );

    // Styles for Promo Block 2
    $wp_customize->add_setting( "mlws_about_promo2_show", array( "default" => true, "sanitize_callback" => "absint" ) );
    $wp_customize->add_control( "mlws_about_promo2_show", array( "label" => "Show Section", "section" => "mlws_about_promo2", "type" => "checkbox" ) );
    $wp_customize->add_setting( "mlws_about_promo2_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_promo2_bg", array( "label" => "Background Color", "section" => "mlws_about_promo2" ) ) );
    $wp_customize->add_setting( "mlws_about_promo2_title_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_promo2_title_color", array( "label" => "Title Color", "section" => "mlws_about_promo2" ) ) );
    $wp_customize->add_setting( "mlws_about_promo2_title_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_promo2_title_size", array( "label" => "Title Font Size (px)", "section" => "mlws_about_promo2", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_about_promo2_text_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_about_promo2_text_color", array( "label" => "Text Color", "section" => "mlws_about_promo2" ) ) );
    $wp_customize->add_setting( "mlws_about_promo2_text_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_about_promo2_text_size", array( "label" => "Text Font Size (px)", "section" => "mlws_about_promo2", "type" => "text" ) );

    // ---- Promo Block 1 ----
    $wp_customize->add_section( "mlws_heritage_promo1", array( "title" => "Promo Block 1", "panel" => "mlws_heritage_panel" ) );
    $wp_customize->add_setting( "mlws_heritage_promo1_img", array( "default" => "", "sanitize_callback" => "esc_url_raw" ) );
    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, "mlws_heritage_promo1_img", array( "label" => "Image", "section" => "mlws_heritage_promo1" ) ) );
    $wp_customize->add_setting( "mlws_heritage_promo1_title", array( "default" => "Promo title", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_promo1_title", array( "label" => "Title", "section" => "mlws_heritage_promo1", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_promo1_sub", array( "default" => "Promo subtitle", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_promo1_sub", array( "label" => "Subtitle", "section" => "mlws_heritage_promo1", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_promo1_desc", array( "default" => "Promo description text goes here.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_heritage_promo1_desc", array( "label" => "Description", "section" => "mlws_heritage_promo1", "type" => "textarea" ) );
    $wp_customize->add_setting( "mlws_heritage_promo1_btn_lbl", array( "default" => "Learn More", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_promo1_btn_lbl", array( "label" => "Button Label", "section" => "mlws_heritage_promo1", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_promo1_btn_url", array( "default" => "#", "sanitize_callback" => "esc_url_raw" ) );
    $wp_customize->add_control( "mlws_heritage_promo1_btn_url", array( "label" => "Button URL", "section" => "mlws_heritage_promo1", "type" => "url" ) );
    $wp_customize->add_setting( "mlws_heritage_promo1_layout", array( "default" => "img-left", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_promo1_layout", array( "label" => "Layout", "section" => "mlws_heritage_promo1", "type" => "select", "choices" => array("img-left" => "Image Left", "img-right" => "Image Right") ) );

    // Styles for Promo Block 1
    $wp_customize->add_setting( "mlws_heritage_promo1_show", array( "default" => true, "sanitize_callback" => "absint" ) );
    $wp_customize->add_control( "mlws_heritage_promo1_show", array( "label" => "Show Section", "section" => "mlws_heritage_promo1", "type" => "checkbox" ) );
    $wp_customize->add_setting( "mlws_heritage_promo1_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_promo1_bg", array( "label" => "Background Color", "section" => "mlws_heritage_promo1" ) ) );
    $wp_customize->add_setting( "mlws_heritage_promo1_title_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_promo1_title_color", array( "label" => "Title Color", "section" => "mlws_heritage_promo1" ) ) );
    $wp_customize->add_setting( "mlws_heritage_promo1_title_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_promo1_title_size", array( "label" => "Title Font Size (px)", "section" => "mlws_heritage_promo1", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_promo1_text_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_promo1_text_color", array( "label" => "Text Color", "section" => "mlws_heritage_promo1" ) ) );
    $wp_customize->add_setting( "mlws_heritage_promo1_text_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_promo1_text_size", array( "label" => "Text Font Size (px)", "section" => "mlws_heritage_promo1", "type" => "text" ) );

    // ---- Promo Block 2 ----
    $wp_customize->add_section( "mlws_heritage_promo2", array( "title" => "Promo Block 2", "panel" => "mlws_heritage_panel" ) );
    $wp_customize->add_setting( "mlws_heritage_promo2_img", array( "default" => "", "sanitize_callback" => "esc_url_raw" ) );
    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, "mlws_heritage_promo2_img", array( "label" => "Image", "section" => "mlws_heritage_promo2" ) ) );
    $wp_customize->add_setting( "mlws_heritage_promo2_title", array( "default" => "Promo title", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_promo2_title", array( "label" => "Title", "section" => "mlws_heritage_promo2", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_promo2_sub", array( "default" => "Promo subtitle", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_promo2_sub", array( "label" => "Subtitle", "section" => "mlws_heritage_promo2", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_promo2_desc", array( "default" => "Promo description text goes here.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_heritage_promo2_desc", array( "label" => "Description", "section" => "mlws_heritage_promo2", "type" => "textarea" ) );
    $wp_customize->add_setting( "mlws_heritage_promo2_btn_lbl", array( "default" => "Learn More", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_promo2_btn_lbl", array( "label" => "Button Label", "section" => "mlws_heritage_promo2", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_promo2_btn_url", array( "default" => "#", "sanitize_callback" => "esc_url_raw" ) );
    $wp_customize->add_control( "mlws_heritage_promo2_btn_url", array( "label" => "Button URL", "section" => "mlws_heritage_promo2", "type" => "url" ) );
    $wp_customize->add_setting( "mlws_heritage_promo2_layout", array( "default" => "img-left", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_promo2_layout", array( "label" => "Layout", "section" => "mlws_heritage_promo2", "type" => "select", "choices" => array("img-left" => "Image Left", "img-right" => "Image Right") ) );

    // Styles for Promo Block 2
    $wp_customize->add_setting( "mlws_heritage_promo2_show", array( "default" => true, "sanitize_callback" => "absint" ) );
    $wp_customize->add_control( "mlws_heritage_promo2_show", array( "label" => "Show Section", "section" => "mlws_heritage_promo2", "type" => "checkbox" ) );
    $wp_customize->add_setting( "mlws_heritage_promo2_bg", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_promo2_bg", array( "label" => "Background Color", "section" => "mlws_heritage_promo2" ) ) );
    $wp_customize->add_setting( "mlws_heritage_promo2_title_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_promo2_title_color", array( "label" => "Title Color", "section" => "mlws_heritage_promo2" ) ) );
    $wp_customize->add_setting( "mlws_heritage_promo2_title_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_promo2_title_size", array( "label" => "Title Font Size (px)", "section" => "mlws_heritage_promo2", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_heritage_promo2_text_color", array( "default" => "", "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_heritage_promo2_text_color", array( "label" => "Text Color", "section" => "mlws_heritage_promo2" ) ) );
    $wp_customize->add_setting( "mlws_heritage_promo2_text_size", array( "default" => "", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_heritage_promo2_text_size", array( "label" => "Text Font Size (px)", "section" => "mlws_heritage_promo2", "type" => "text" ) );

    // ---- CONTACT US PAGE PANEL ----
    $wp_customize->add_panel( "mlws_contact_panel", array(
        "title"    => __("Contact Us Page", "merlows" ),
        "priority" => 51,
    ) );

    // ── Hero ──────────────────────────────────────────────────
    $wp_customize->add_section( "mlws_contact_hero", array( "title" => "Hero Section", "panel" => "mlws_contact_panel" ) );
    $wp_customize->add_setting( "mlws_contact_hero_tag",      array( "default" => "Get in Touch",             "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_contact_hero_tag",      array( "label" => "Tag Label",                  "section" => "mlws_contact_hero", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_contact_hero_title",    array( "default" => "We'd Love to Hear From You", "sanitize_callback" => "wp_kses_post" ) );
    $wp_customize->add_control( "mlws_contact_hero_title",    array( "label" => "Heading (HTML allowed)",     "section" => "mlws_contact_hero", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_contact_hero_desc",     array( "default" => "Whether you're a patient, healthcare professional, researcher, or media contact — our team is here to help.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_contact_hero_desc",     array( "label" => "Description",                "section" => "mlws_contact_hero", "type" => "textarea" ) );
    $wp_customize->add_setting( "mlws_contact_hero_img",      array( "default" => "",                         "sanitize_callback" => "esc_url_raw" ) );
    $wp_customize->add_control( new WP_Customize_Image_Control( $wp_customize, "mlws_contact_hero_img", array( "label" => "Background Image", "section" => "mlws_contact_hero" ) ) );
    $wp_customize->add_setting( "mlws_contact_hero_bg_color", array( "default" => "",                         "sanitize_callback" => "sanitize_hex_color" ) );
    $wp_customize->add_control( new WP_Customize_Color_Control( $wp_customize, "mlws_contact_hero_bg_color", array( "label" => "Solid Background Color (overrides image)", "section" => "mlws_contact_hero" ) ) );

    // ── Contact Info ──────────────────────────────────────────
    $wp_customize->add_section( "mlws_contact_info", array( "title" => "Contact Information", "panel" => "mlws_contact_panel" ) );
    $wp_customize->add_setting( "mlws_contact_intro_title", array( "default" => "How Can We Help?",         "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_contact_intro_title", array( "label" => "Section Heading",            "section" => "mlws_contact_info", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_contact_intro_text",  array( "default" => "Merlows is committed to providing exceptional support to every member of our community.", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_contact_intro_text",  array( "label" => "Intro Paragraph",            "section" => "mlws_contact_info", "type" => "textarea" ) );
    $wp_customize->add_setting( "mlws_contact_email",       array( "default" => "info@merlows.com",     "sanitize_callback" => "sanitize_email" ) );
    $wp_customize->add_control( "mlws_contact_email",       array( "label" => "Email Address",              "section" => "mlws_contact_info", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_contact_phone",       array( "default" => "+44 (0)1628 526 005",      "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_contact_phone",       array( "label" => "Phone Number",               "section" => "mlws_contact_info", "type" => "text" ) );
    $wp_customize->add_setting( "mlws_contact_address",     array( "default" => "Merlows UK Ltd, 4 Renaissance Way, Wooburn Green, HP10 0DF, United Kingdom", "sanitize_callback" => "sanitize_textarea_field" ) );
    $wp_customize->add_control( "mlws_contact_address",     array( "label" => "Office Address",             "section" => "mlws_contact_info", "type" => "textarea" ) );
    $wp_customize->add_setting( "mlws_contact_hours",       array( "default" => "Monday – Friday, 9:00 am – 5:00 pm GMT", "sanitize_callback" => "sanitize_text_field" ) );
    $wp_customize->add_control( "mlws_contact_hours",       array( "label" => "Office Hours",               "section" => "mlws_contact_info", "type" => "text" ) );

}
add_action( 'customize_register', 'mlws_pages_customize_register', 20 );
