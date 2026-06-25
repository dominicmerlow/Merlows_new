<?php
/**
 * Template Name: User Dashboard
 */

// 1. Session & Auth Check
$current_user = wp_get_current_user();
$is_logged_in = is_user_logged_in();

// Redirect if not logged in? (User requested inline login previously, preserving that logic)
// But for the "Admin" design, it usually requires full screen. Refactoring to show Login Hero if not logged in.

// 2. Handle PDF Print Request
if ( isset($_GET['print_note']) && is_user_logged_in() ) {
    $note_id = sanitize_text_field($_GET['print_note']);
    $my_notes = get_user_meta(get_current_user_id(), '_mlws_user_notes', true) ?: array();
    $target_note = null;
    foreach($my_notes as $n) { if(isset($n['id']) && $n['id'] === $note_id) { $target_note = $n; break; } }
    
    if($target_note) {
        $u = wp_get_current_user();
        $fullname = trim($u->first_name . ' ' . $u->last_name) ?: $u->display_name;
        ?>
        <!DOCTYPE html>
        <html>
        <head>
            <title><?php echo esc_html($target_note['title']); ?> - PDF</title>
            <style>
                body { font-family: sans-serif; padding: 40px; color: #333; line-height: 1.6; max-width: 800px; margin: 0 auto; }
                .header { border-bottom: 2px solid #1B4F8A; padding-bottom: 20px; margin-bottom: 40px; }
                .logo-area { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
                .logo { font-size: 24px; font-weight: 800; color: #0F172A; }
                .badge { background: #1B4F8A; color: white; padding: 4px 12px; border-radius: 0; font-size: 12px; font-weight: 700; }
                .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px; color: #64748B; background: #F8FAFC; padding: 15px; border-radius: 0; }
                h1 { font-size: 28px; margin: 0 0 20px 0; color: #0F172A; }
                .content { font-size: 14px; white-space: pre-wrap; }
            </style>
        </head>
        <body onload="window.print()">
            <div class="header">
                <div class="logo-area">
                    <div class="logo">Merlows Hub</div>
                    <div class="badge">IBD RESEARCH CENTRE NOTE</div>
                </div>
                <div class="meta">
                    <div><strong>Note Name:</strong> <?php echo esc_html($target_note['title']); ?></div>
                    <div><strong>User:</strong> <?php echo esc_html($fullname); ?></div>
                    <div><strong>Created:</strong> <?php echo date('M j, Y H:i', strtotime($target_note['date'])); ?></div>
                    <div><strong>Downloaded:</strong> <?php echo date('M j, Y H:i'); ?></div>
                </div>
            </div>
            <h1><?php echo esc_html($target_note['title']); ?></h1>
            <div class="content"><?php echo wp_kses_post($target_note['content']); ?></div>
        </body>
        </html>
        <?php
        exit;
    }
}

get_header(); 
?>

<!-- HIDE GLOBAL HEADER FOR DASHBOARD -->
<style>
    .site-header { display: none !important; }
    /* Reset margins for dashboard */
    body { margin: 0; padding: 0; overflow-x: hidden; background-color: #F8FAFC; }
</style>

<?php if ( ! $is_logged_in ) : ?>
    <!-- LOGIN VIEW (Retained from previous version) -->
    <div class="container" style="padding-top: 100px;">
        <div class="login-hero" style="max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 0; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center;">
            <div style="width: 64px; height: 64px; background: #1B4F8A; border-radius: 0; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center;">
                <svg width="32" height="32" fill="white" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
            </div>
            <h1 style="margin-bottom: 12px; color: #0f172a;">Welcome to Your Hub</h1>
            <p style="color: #64748b; margin-bottom: 32px;">Access your personalised reading list, notes, and saved content.</p>
            
            <?php echo do_shortcode('[google_login]'); ?>
            
            <div style="margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 24px;">
                <p style="font-size: 14px; color: #94a3b8;">Don't have an account? <a href="<?php echo esc_url( home_url( '/register/' ) ); ?>" style="color: #1B4F8A; font-weight: 600;">Register Now</a></p>
            </div>
        </div>
    </div>

<?php else : 
    // DATA PREP
    $first_name = get_user_meta( $current_user->ID, 'first_name', true ) ?: $current_user->display_name;
    $job_title = get_user_meta( $current_user->ID, '_mlws_job_title', true ) ?: 'Add Job Title';
    $org = get_user_meta( $current_user->ID, '_mlws_organization', true ) ?: 'Add Organization';
    $bookmarks = get_user_meta( $current_user->ID, '_mlws_reading_list', true ) ?: array();
    $profile_img = get_avatar_url( $current_user->ID, array('size' => 128) );
    
    // Role Logic
    $user_roles = (array) $current_user->roles;
    $is_practitioner = in_array( 'practitioner', $user_roles );
    
    // Theme Vars based on Role
    $theme_primary = $is_practitioner ? '#0F172A' : '#1B4F8A'; // Navy vs Orange
    $theme_sidebar = $is_practitioner ? '#0F172A' : '#FFFFFF';
    $theme_sidebar_text = $is_practitioner ? '#94a3b8' : '#64748B';
    $sidebar_logo_color = $is_practitioner ? '#FFFFFF' : '#0F172A';
    $nav_hover_bg = $is_practitioner ? 'rgba(255,255,255,0.1)' : '#F1F5F9';
    $nav_active_color = $is_practitioner ? '#1B4F8A' : '#1B4F8A';
    $nav_active_bg = $is_practitioner ? 'rgba(255,90,0,0.1)' : '#F5F0FA';

    // Navigation Configuration (Global) - Using inline SVGs for reliable cross-platform rendering
    $current_tab = isset($_GET['tab']) ? sanitize_text_field($_GET['tab']) : 'home';

    // SVG icon helper - all icons use currentColor so they inherit the nav text color
    $nav_icons = [
        'home'             => '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
        'calculators'      =>'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
        'reading-list'     => '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
        'searches'         => '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
        'notes'            => '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        'ai-chats'         => '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
        'profile'          => '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        'switch'           => '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
        'logout'           => '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    ];

    $nav_items = [
        'main' => [
            'home'        => ['label' => 'Dashboard', 'icon' => $nav_icons['home']],
        ],
        'Tools' => [
            'calculators' => ['label' => 'My Tools', 'icon' => $nav_icons['calculators']],
        ],
        'learning' => [
            'reading-list' => ['label' => 'My Reading List', 'icon' => $nav_icons['reading-list']],
            'searches'     => ['label' => 'My Searches', 'icon' => $nav_icons['searches']],
        ],
        'communication' => [
            'notes'    => ['label' => 'My Notes', 'icon' => $nav_icons['notes']],
            'ai-chats' => ['label' => 'My AI Chats', 'icon' => $nav_icons['ai-chats']],
        ],
        'account' => [
            'profile'     => ['label' => 'My Profile', 'icon' => $nav_icons['profile']],
        ],
    ];
?>

<!-- DASHBOARD STYLES (Scoped) -->
<style>
:root {
    --dash-primary: <?php echo $theme_primary; ?>;
    --dash-sidebar: <?php echo $theme_sidebar; ?>;
    --dash-text: #1F2937;
    --dash-border: #E2E8F0;
}
.dashboard-wrap { display: flex; min-height: 100vh; font-family: 'Inter', sans-serif; }
.dash-sidebar { width: 260px; background: var(--dash-sidebar); border-right: 1px solid var(--dash-border); position: fixed; height: 100vh; z-index: 999; display: flex; flex-direction: column; overflow-y: auto; }
.dash-main { margin-left: 260px; flex: 1; background: #F0F4F8; display: flex; flex-direction: column; width: calc(100% - 260px); }

/* Sidebar */
.sidebar-header { height: 64px; display: flex; align-items: center; padding: 0 24px; border-bottom: 1px solid rgba(0,0,0,0.05); }
.dash-logo { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 20px; color: <?php echo $sidebar_logo_color; ?>; display: flex; align-items: center; gap: 8px; text-decoration: none; }
.dash-nav { padding: 20px 12px; flex: 1; }
.nav-section { margin-bottom: 24px; }
.nav-label { font-size: 11px; font-weight: 700; color: <?php echo $theme_sidebar_text; ?>; text-transform: uppercase; margin: 0 0 8px 12px; letter-spacing: 0.5px; opacity: 0.8; }
.nav-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; color: <?php echo $theme_sidebar_text; ?>; text-decoration: none; border-radius: 0; font-size: 14px; font-weight: 500; transition: all 0.2s; margin-bottom: 2px; }
.nav-item:hover { background: <?php echo $nav_hover_bg; ?>; color: <?php echo $is_practitioner ? 'white' : 'var(--dash-primary)'; ?>; }
.nav-item.active { background: <?php echo $nav_active_bg; ?>; color: <?php echo $nav_active_color; ?>; }

/* Header */
.dash-header { height: 64px; background: white; border-bottom: 1px solid var(--dash-border); display: flex; align-items: center; justify-content: space-between; padding: 0 32px; position: sticky; top: 0; z-index: 998; }
.page-title { font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 600; color: #0F172A; display: flex; align-items: center; gap: 8px; }
.role-badge { background: <?php echo $is_practitioner ? '#E0F2FE' : '#E8DDF0'; ?>; color: <?php echo $is_practitioner ? '#0369A1' : '#9A3412'; ?>; font-size: 11px; padding: 2px 8px; border-radius: 0; text-transform: uppercase; font-weight: 700; border: 1px solid <?php echo $is_practitioner ? '#BAE6FD' : '#FED7AA'; ?>; }
.user-profile { display: flex; align-items: center; gap: 12px; cursor: pointer; }
.profile-avatar { width: 32px; height: 32px; border-radius: 0; object-fit: cover; border: 1px solid #E2E8F0; }

/* Content */
.dash-content { padding: 32px; max-width: 1400px; margin: 0 auto; width: 100%; }
.dash-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; }
.card-wide { grid-column: 1 / -1; }
@media (min-width: 1100px) { .card-wide { grid-column: span 2; } }

.dash-card { background: white; border-radius: 0; padding: 24px; border: 1px solid #E2E8F0; transition: all 0.2s; display: flex; flex-direction: column; }
.dash-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.05); transform: translateY(-2px); }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.card-title { font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 10px; margin: 0; }
.card-icon { width: 36px; height: 36px; background: #F8FAFC; border-radius: 0; display: flex; align-items: center; justify-content: center; font-size: 18px; color: var(--dash-primary); }
.card-link { font-size: 13px; font-weight: 600; color: <?php echo $is_practitioner ? '#0369A1' : '#1B4F8A'; ?>; text-decoration: none; cursor: pointer; border: none; background: none; }

/* List Items */
.dash-list { display: flex; flex-direction: column; gap: 0; }
.list-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #F1F5F9; }
.list-item:last-child { border-bottom: none; }
.item-title { font-size: 14px; font-weight: 600; color: #0F172A; margin-bottom: 2px; }
.item-meta { font-size: 12px; color: #64748B; }

/* Mobile */
@media (max-width: 768px) {
    .dash-sidebar { transform: translateX(-100%); transition: transform 0.3s; }
    .dash-sidebar.active { transform: translateX(0); }
    .dash-main { margin-left: 0; width: 100%; }
    .mobile-toggle { display: block !important; margin-right: 16px; font-size: 24px; cursor: pointer; }
}
.mobile-toggle { display: none; }
</style>

<div class="dashboard-wrap">
    
    <!-- SIDEBAR -->
    <aside class="dash-sidebar" id="sidebar">
        <div class="sidebar-header">
            <a href="/" class="dash-logo" style="display: flex; align-items: center; gap: 0; text-decoration: none;">
                <img src="<?php echo get_template_directory_uri(); ?>/assets/img/logo.png" alt="Merlows" style="height: 40px; width: auto; object-fit: contain;">
            </a>
            <button class="mobile-toggle" style="margin-left: auto; color: <?php echo $is_practitioner ? 'white' : '#0F172A'; ?>;" onclick="toggleSidebar()">✕</button>
        </div>

        <!-- Nav Items Loop -->

        <nav class="dash-nav">
            <?php foreach($nav_items as $section => $items): ?>
                <div class="nav-section">
                    <?php if($section !== 'main' && $section !== 'account'): ?>
                        <div class="nav-label"><?php echo ucfirst($section); ?></div>
                    <?php endif; ?>
                    <?php foreach($items as $slug => $data): ?>
                        <a href="?tab=<?php echo $slug; ?>" class="nav-item <?php echo $current_tab === $slug ? 'active' : ''; ?>">
                            <span style="width:20px;display:inline-flex;justify-content:center;flex-shrink:0;"><?php echo $data['icon']; ?></span> <?php echo $data['label']; ?>
                        </a>
                    <?php endforeach; ?>
                </div>
            <?php endforeach; ?>

            <div class="nav-section" style="margin-top: auto; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 20px;">
                <div class="nav-item" style="cursor: pointer;" onclick="switchRole('<?php echo $is_practitioner ? 'member' : 'practitioner'; ?>')">
                    <span style="width:20px;text-align:center;display:inline-flex;justify-content:center;"><?php echo $nav_icons['switch']; ?></span> Switch to <?php echo $is_practitioner ? 'Reader' : 'Writer'; ?>
                </div>
                <a href="<?php echo wp_logout_url(home_url()); ?>" class="nav-item"><span style="width:20px;text-align:center;display:inline-flex;justify-content:center;"><?php echo $nav_icons['logout']; ?></span> Log Out</a>
            </div>
        </nav>
    </aside>

    <!-- MAIN -->
    <main class="dash-main">
        <header class="dash-header">
            <div style="display:flex; align-items:center;">
                <span class="mobile-toggle" onclick="toggleSidebar()" style="color:#0f172a;">☰</span>
                <div class="page-title">
                    <?php 
                    $tab_label = 'Overview';
                    foreach($nav_items as $sec => $its) {
                        if(isset($its[$current_tab])) {
                            $tab_label = $its[$current_tab]['label'];
                            break;
                        }
                    }
                    echo $tab_label; 
                    ?> 
                    <span class="role-badge"><?php echo $is_practitioner ? 'Writer' : 'Reader'; ?></span>
                </div>
            </div>
            
            <div style="display: flex; align-items: center; gap: 20px;">
                 <!-- Toggle in Header as backup/quick access -->
                 <button onclick="switchRole('<?php echo $is_practitioner ? 'member' : 'practitioner'; ?>')" style="font-size:12px; border:1px solid #E2E8F0; background:white; padding:4px 10px; border-radius:0; cursor:pointer; color:#64748B;">
                    View as <?php echo $is_practitioner ? 'Reader' : 'Writer'; ?>
                 </button>
                
                <div class="user-profile">
                    <div style="text-align: right; display: none; @media(min-width:768px){display:block;}">
                        <div style="font-size: 14px; font-weight: 600; color: #0F172A;"><?php echo esc_html($first_name); ?></div>
                        <div style="font-size: 11px; color: #64748B;"><?php echo esc_html($is_practitioner ? ( $org ? 'Writer, ' . $org : 'Writer' ) : 'Member'); ?></div>
                    </div>
                    <img src="<?php echo esc_url($profile_img); ?>" class="profile-avatar">
                </div>
            </div>
        </header>

        <div class="dash-content">
            <?php 
            $tab_label = 'Overview';
            foreach($nav_items as $sec => $its) {
                if(isset($its[$current_tab])) {
                    $tab_label = $its[$current_tab]['label'];
                    break;
                }
            }
            ?>
            <div style="margin-bottom: 32px; display: flex; justify-content: space-between; align-items: flex-end;">
                <div>
                    <h1 style="font-family:'Outfit'; font-size:28px; color:#0F172A; margin:0 0 8px 0;"><?php echo $tab_label; ?></h1>
                    <p style="color:#64748B; margin:0;">
                        <?php 
                        switch($current_tab) {
                            case 'home': echo $is_practitioner ? 'You have 3 writer updates pending review.' : "Hi {$first_name}, welcome back to Merlows."; break;
                            case 'notes': echo 'Your private personal notes.'; break;
                            case 'ai-chats': echo 'History of your consultations with Merlows AI.'; break;
                            default: echo 'Manage your personalized hub content.';
                        }
                        ?>
                    </p>
                </div>
                <?php if($current_tab === 'notes'): ?>
                    <a href="/my-notes/?new=1" class="btn-primary" style="background:<?php echo $theme_primary; ?>; color:white; text-decoration:none; padding:10px 20px; border-radius:0; font-weight:600; font-size:14px;">+ New Note</a>
                <?php endif; ?>
            </div>

            <?php switch($current_tab) : 
                case 'home': ?>
                    <style>
                        .dash-grid-v2 { display: grid; grid-template-columns: repeat(12, 1fr); gap: 24px; }
                        .d-card { background: white; border-radius: 0; padding: 24px; border: 1px solid #E2E8F0; display: flex; flex-direction: column; transition: transform 0.2s, box-shadow 0.2s; }
                        .d-card:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
                        .d-col-4 { grid-column: span 4; }
                        .d-col-6 { grid-column: span 6; }
                        .d-col-8 { grid-column: span 8; }
                        .d-col-12 { grid-column: span 12; }
                        
                        @media (max-width: 1024px) { .d-col-4, .d-col-8 { grid-column: span 6; } }
                        @media (max-width: 768px) { .d-col-4, .d-col-6, .d-col-8 { grid-column: span 12; } }

                        .d-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
                        .d-card-title { font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 700; color: #0F172A; display: flex; align-items: center; gap: 10px; }
                        .d-icon-box { width: 32px; height: 32px; border-radius: 0; background: #F1F5F9; display: flex; align-items: center; justify-content: center; font-size: 16px; }
                        
                        .msg-empty-state { text-align: center; padding: 32px 0; color: #94A3B8; font-size: 14px; background: #F8FAFC; border-radius: 0; border: 1px dashed #E2E8F0; }
                    </style>

                    <div class="dash-grid-v2">
                        <!-- 1. NOTES -->
                        <div class="d-card d-col-6">
                            <div class="d-card-header">
                                <div class="d-card-title"><span class="d-icon-box"><?php echo $nav_icons['notes']; ?></span> My Notes</div>
                                <a href="?tab=notes" class="card-link">All Notes</a>
                            </div>
                            <div class="dash-list">
                                <?php 
                                $my_notes = get_user_meta($current_user->ID, '_mlws_user_notes', true) ?: array();
                                if(empty($my_notes)): ?>
                                    <div class="msg-empty-state">No notes found.</div>
                                <?php else: 
                                    $recent_notes = is_array($my_notes) ? array_slice($my_notes, -3) : array();
                                    foreach(array_reverse($recent_notes) as $note): ?>
                                    <div class="list-item">
                                        <div>
                                            <div class="item-title"><?php echo esc_html($note['title'] ?: 'Untitled'); ?></div>
                                            <div class="item-meta"><?php echo date('M j', strtotime($note['date'])); ?></div>
                                        </div>
                                        <a href="/my-notes/?id=<?php echo $note['id']; ?>" style="text-decoration:none; color:#64748B;display:inline-flex;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></a>
                                    </div>
                                <?php endforeach; endif; ?>
                            </div>
                        </div>

                        <!-- 4. SAVED ARTICLES -->
                        <div class="d-card d-col-6">
                            <div class="d-card-header">
                                <div class="d-card-title"><span class="d-icon-box"><?php echo $nav_icons['reading-list']; ?></span> Reading List</div>
                                <a href="?tab=reading-list" class="card-link">Library</a>
                            </div>
                            <?php if(empty($bookmarks)): ?>
                                <div class="msg-empty-state">No saved articles.</div>
                            <?php else: ?>
                                <div class="dash-list">
                                    <?php
                                    $b_query = new WP_Query(array('post__in' => $bookmarks, 'post_type' => 'any', 'posts_per_page' => 3));
                                    while($b_query->have_posts()): $b_query->the_post();
                                    ?>
                                    <div class="list-item">
                                        <div style="flex:1; overflow:hidden;">
                                            <div class="item-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></div>
                                            <div class="item-meta"><?php echo get_the_date('M j'); ?></div>
                                        </div>
                                    </div>
                                    <?php endwhile; wp_reset_postdata(); ?>
                                </div>
                            <?php endif; ?>
                        </div>

                        <!-- 5. MY SEARCHES -->
                        <div class="d-card d-col-6">
                            <div class="d-card-header">
                                <div class="d-card-title"><span class="d-icon-box"><?php echo $nav_icons['searches']; ?></span> My Searches</div>
                                <a href="?tab=searches" class="card-link">All Searches</a>
                            </div>
                            <?php
                            $searches = get_user_meta($current_user->ID, '_mlws_saved_searches', true) ?: array();
                            if(empty($searches)): ?>
                                <div class="msg-empty-state">No saved searches.</div>
                            <?php else: ?>
                                <div class="dash-list">
                                    <?php
                                    $recent_searches = is_array($searches) ? array_slice($searches, -3) : array();
                                    foreach(array_reverse($recent_searches) as $s): ?>
                                    <div class="list-item">
                                        <div style="flex:1; overflow:hidden;">
                                            <div class="item-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><a href="<?php echo esc_url($s['url']); ?>" style="text-decoration:none; color:inherit;"><?php echo esc_html($s['name']); ?></a></div>
                                            <div class="item-meta"><?php echo date('M j', strtotime($s['date'])); ?></div>
                                        </div>
                                        <a href="<?php echo esc_url($s['url']); ?>" class="card-link" style="font-size:12px; white-space:nowrap;">Run</a>
                                    </div>
                                    <?php endforeach; ?>
                                </div>
                            <?php endif; ?>
                        </div>

                        <!-- 6. MY AI CHATS -->
                        <div class="d-card d-col-6">
                            <div class="d-card-header">
                                <div class="d-card-title"><span class="d-icon-box"><?php echo $nav_icons['ai-chats']; ?></span> My AI Chats</div>
                                <a href="?tab=ai-chats" class="card-link">All Chats</a>
                            </div>
                            <?php
                            $ai_chats = get_user_meta($current_user->ID, '_mlws_saved_chats', true);
                            if (!is_array($ai_chats)) $ai_chats = array();
                            if(empty($ai_chats)): ?>
                                <div class="msg-empty-state">No AI chats yet.</div>
                            <?php else: ?>
                                <div class="dash-list">
                                    <?php
                                    $recent_chats = array_slice($ai_chats, -3);
                                    foreach(array_reverse($recent_chats) as $chat):
                                        $display_title = !empty($chat['title']) ? wp_trim_words($chat['title'], 6, '...') : 'AI Consultation';
                                    ?>
                                    <div class="list-item">
                                        <div style="flex:1; overflow:hidden;">
                                            <div class="item-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><?php echo esc_html($display_title); ?></div>
                                            <div class="item-meta"><?php echo date('M j', strtotime($chat['date'])); ?></div>
                                        </div>
                                        <a href="/ask-ai/" class="card-link" style="font-size:12px; white-space:nowrap;">New Chat</a>
                                    </div>
                                    <?php endforeach; ?>
                                </div>
                            <?php endif; ?>
                        </div>

                    </div>
                <?php break;

                case 'profile': 
                    // Prepare data
                    $socials = array(
                        'website' => get_user_meta($current_user->ID, '_mlws_website', true),
                        'twitter' => get_user_meta($current_user->ID, '_mlws_twitter', true), // X
                        'linkedin' => get_user_meta($current_user->ID, '_mlws_linkedin', true),
                        'instagram' => get_user_meta($current_user->ID, '_mlws_instagram', true),
                        'facebook' => get_user_meta($current_user->ID, '_mlws_facebook', true),
                    );
                    $profile_docs = get_user_meta($current_user->ID, '_mlws_profile_docs', true) ?: array();
                    $profile_links = get_user_meta($current_user->ID, '_mlws_profile_links', true) ?: array();
                    // Pad links to 5
                    while(count($profile_links) < 5) $profile_links[] = '';
                    ?>
                    <div class="dash-card" style="max-width: 900px;">
                        <form id="profile-form-main">
                            <?php wp_nonce_field( 'mlws_dashboard_nonce', 'profile_nonce' ); ?>
                            <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 40px;">
                                <!-- Left Col: Avatar & Media -->
                                <div>
                                    <div style="position: relative; width: 120px; height: 120px; margin-bottom: 20px;">
                                        <img src="<?php echo esc_url($profile_img); ?>" id="profile-preview" style="width: 100%; height: 100%; border-radius: 0; object-fit: cover; border: 4px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                                        <button type="button" onclick="triggerAvatarUpload()" style="position: absolute; bottom: 0; right: 0; background: white; border: 1px solid #E2E8F0; width: 32px; height: 32px; border-radius: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">📸</button>
                                        <input type="file" id="avatar-input" style="display: none;" accept="image/*" onchange="uploadAvatar(this)">
                                    </div>
                                    
                                    <!-- Documents Section -->
                                    <div style="margin-top: 30px; border-top: 1px solid #E2E8F0; padding-top: 20px;">
                                        <label style="display:block; font-size:13px; font-weight:600; margin-bottom:10px;">My Documents (Max 5)</label>
                                        <div id="doc-list" style="margin-bottom: 12px;">
                                            <?php foreach($profile_docs as $doc): ?>
                                                <div class="doc-item" style="display:flex; justify-content:space-between; font-size:12px; background:#F8FAFC; padding:8px; border-radius:0; margin-bottom:4px;">
                                                    <a href="<?php echo esc_url($doc['url']); ?>" target="_blank" style="text-decoration:none; color:#334155; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;"><?php echo esc_html($doc['name']); ?></a>
                                                    <span onclick="deleteProfileDoc(<?php echo $doc['id']; ?>)" style="color:#EF4444; cursor:pointer; font-weight:700;">×</span>
                                                </div>
                                            <?php endforeach; ?>
                                        </div>
                                        <?php if(count($profile_docs) < 5): ?>
                                            <button type="button" onclick="document.getElementById('profile-doc-up').click()" style="font-size:12px; width:100%; padding:8px; border:1px dashed #CBD5E1; background:white; color:#64748B; border-radius:0; cursor:pointer;">+ Upload Document</button>
                                            <input type="file" id="profile-doc-up" style="display:none;" onchange="uploadProfileDoc(this)">
                                        <?php endif; ?>
                                    </div>
                                </div>

                                <!-- Right Col: Info & Links -->
                                <div>
                                    <h3 style="margin:0 0 20px 0; font-size:18px; color:#0F172A;">Personal Information</h3>
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
                                        <div>
                                            <label style="display:block; margin-bottom:8px; font-size:13px; font-weight:600;">First Name</label>
                                            <input type="text" name="first_name" value="<?php echo esc_attr($first_name); ?>" style="width:100%; padding:10px; border:1px solid #E2E8F0; border-radius:0;">
                                        </div>
                                        <div>
                                            <label style="display:block; margin-bottom:8px; font-size:13px; font-weight:600;">Last Name</label>
                                            <input type="text" name="last_name" value="<?php echo esc_attr($current_user->last_name); ?>" style="width:100%; padding:10px; border:1px solid #E2E8F0; border-radius:0;">
                                        </div>
                                    </div>

                                    <div style="margin-bottom: 24px;">
                                        <label style="display:block; margin-bottom:8px; font-size:13px; font-weight:600;">Email Address</label>
                                        <input type="email" name="user_email" value="<?php echo esc_attr($current_user->user_email); ?>" style="width:100%; padding:10px; border:1px solid #E2E8F0; border-radius:0;">
                                    </div>

                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
                                        <div>
                                            <label style="display:block; margin-bottom:8px; font-size:13px; font-weight:600;">Job Title</label>
                                            <input type="text" name="mlws_job_title" value="<?php echo esc_attr($job_title); ?>" style="width:100%; padding:10px; border:1px solid #E2E8F0; border-radius:0;">
                                        </div>
                                        <div>
                                            <label style="display:block; margin-bottom:8px; font-size:13px; font-weight:600;">Organization</label>
                                            <input type="text" name="mlws_organization" value="<?php echo esc_attr($org); ?>" style="width:100%; padding:10px; border:1px solid #E2E8F0; border-radius:0;">
                                        </div>
                                    </div>

                                    <div style="margin-bottom: 24px;">
                                        <label style="display:block; margin-bottom:8px; font-size:13px; font-weight:600;">Biography</label>
                                        <textarea name="description" rows="4" style="width:100%; padding:10px; border:1px solid #E2E8F0; border-radius:0; font-family:inherit; resize:none;"><?php echo esc_textarea($current_user->description); ?></textarea>
                                    </div>

                                    <!-- Social Links -->
                                    <h3 style="margin:30px 0 20px 0; font-size:16px; color:#0F172A; border-top:1px solid #E2E8F0; padding-top:20px;">Social Profiles</h3>
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                                        <div><input type="url" name="mlws_website" placeholder="Website URL" value="<?php echo esc_attr($socials['website']); ?>" style="width:100%; padding:8px; border:1px solid #E2E8F0; border-radius:0; font-size:13px;"></div>
                                        <div><input type="url" name="mlws_twitter" placeholder="X (Twitter) URL" value="<?php echo esc_attr($socials['twitter']); ?>" style="width:100%; padding:8px; border:1px solid #E2E8F0; border-radius:0; font-size:13px;"></div>
                                        <div><input type="url" name="mlws_linkedin" placeholder="LinkedIn URL" value="<?php echo esc_attr($socials['linkedin']); ?>" style="width:100%; padding:8px; border:1px solid #E2E8F0; border-radius:0; font-size:13px;"></div>
                                        <div><input type="url" name="mlws_instagram" placeholder="Instagram URL" value="<?php echo esc_attr($socials['instagram']); ?>" style="width:100%; padding:8px; border:1px solid #E2E8F0; border-radius:0; font-size:13px;"></div>
                                        <div><input type="url" name="mlws_facebook" placeholder="Facebook URL" value="<?php echo esc_attr($socials['facebook']); ?>" style="width:100%; padding:8px; border:1px solid #E2E8F0; border-radius:0; font-size:13px;"></div>
                                    </div>

                                    <!-- External Links -->
                                    <h3 style="margin:30px 0 20px 0; font-size:16px; color:#0F172A; border-top:1px solid #E2E8F0; padding-top:20px;">My Links (Up to 5)</h3>
                                    <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 30px;">
                                        <?php foreach($profile_links as $i => $link): ?>
                                            <input type="url" name="profile_links[]" placeholder="https://" value="<?php echo esc_attr($link); ?>" style="width:100%; padding:8px; border:1px solid #E2E8F0; border-radius:0; font-size:13px;">
                                        <?php endforeach; ?>
                                    </div>

                                    <div style="display: flex; justify-content: flex-end;">
                                        <button type="submit" class="btn-primary" style="background:<?php echo $theme_primary; ?>; color:white; border:none; padding:12px 32px; border-radius:0; font-weight:600; cursor:pointer;">Update Profile</button>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>
                    <!-- Upload Scripts -->
                    <script>
                    function uploadProfileDoc(input) {
                        if (input.files[0]) {
                            var fd = new FormData();
                            fd.append('action', 'mlws_upload_profile_doc');
                            fd.append('doc', input.files[0]);
                            fd.append('nonce', '<?php echo wp_create_nonce("mlws_dashboard_nonce"); ?>');
                            jQuery.ajax({
                                url: '<?php echo admin_url('admin-ajax.php'); ?>', type: 'POST', data: fd, processData: false, contentType: false,
                                success: function(res) { if(res.success) location.reload(); else alert(res.data); }
                            });
                        }
                    }
                    function deleteProfileDoc(id) {
                        if(!confirm('Delete this document?')) return;
                        jQuery.post('<?php echo admin_url('admin-ajax.php'); ?>', {
                            action: 'mlws_delete_profile_doc', id: id, nonce: '<?php echo wp_create_nonce("mlws_dashboard_nonce"); ?>'
                        }, function(res) { if(res.success) location.reload(); else alert(res.data); });
                    }
                    </script>
                <?php break;

                case 'calculators': ?>
                    <style>
                        .tool-idea-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; }
                        .tool-idea-card { background: white; border: 1px solid #e2e8f0; border-radius: 0; padding: 28px; display: flex; flex-direction: column; min-height: 220px; position: relative; transition: box-shadow 0.25s, transform 0.25s; }
                        .tool-idea-card:hover { box-shadow: 0 12px 40px rgba(10,25,41,0.08); transform: translateY(-3px); }
                        .tool-idea-card .tool-idea-icon { width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; background: #F1F5F9; color: var(--dash-primary); margin-bottom: 18px; }
                        .tool-idea-card h3 { font-size: 18px; font-weight: 700; color: #0F172A; margin: 0 0 8px; }
                        .tool-idea-card p { font-size: 14px; color: #64748B; line-height: 1.6; margin: 0; }
                        .tool-idea-badge { position: absolute; top: 18px; right: 18px; background: #E8DDF0; color: #6D28D9; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; padding: 4px 9px; }
                        .tool-idea-cta { margin-top: auto; padding-top: 18px; font-size: 13px; font-weight: 700; color: var(--dash-primary); }
                    </style>
                    <div class="dash-card" style="margin-bottom: 24px;">
                        <h3 class="card-title">My Tools</h3>
                        <p style="color:#64748B; margin:8px 0 0; font-size:14px; line-height:1.6;">
                            We're building a fresh set of tools for Merlows readers. Here's a preview of what's coming &mdash; tell us which you'd use most.
                        </p>
                    </div>
                    <div class="tool-idea-grid">
                        <?php
                        $tool_ideas = array(
                            array(
                                'title' => 'Accords Timeline Explorer',
                                'desc'  => 'An interactive timeline of the Abraham Accords and Cyrus Accord &mdash; scrub through the milestones, signings and turning points that shaped the region.',
                                'cta'   => 'Coming soon',
                                'icon'  => '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><circle cx="7" cy="12" r="2"/><circle cx="17" cy="12" r="2"/><line x1="12" y1="5" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="19"/></svg>',
                            ),
                            array(
                                'title' => 'Middle East Map Room',
                                'desc'  => 'A clickable regional map that surfaces the latest Merlows reporting by country &mdash; explore signatories, hotspots and diplomatic ties at a glance.',
                                'cta'   => 'Coming soon',
                                'icon'  => '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
                            ),
                            array(
                                'title' => 'Test Your Knowledge Quiz',
                                'desc'  => 'A quick, fun current-affairs quiz on regional history and the Blitz Spirit &mdash; rack up a streak and see how your knowledge stacks up against other readers.',
                                'cta'   => 'Coming soon',
                                'icon'  => '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
                            ),
                        );
                        foreach ( $tool_ideas as $idea ) : ?>
                            <div class="tool-idea-card">
                                <span class="tool-idea-badge"><?php echo esc_html( $idea['cta'] ); ?></span>
                                <span class="tool-idea-icon"><?php echo $idea['icon']; ?></span>
                                <h3><?php echo esc_html( $idea['title'] ); ?></h3>
                                <p><?php echo wp_kses_post( $idea['desc'] ); ?></p>
                                <div class="tool-idea-cta">In development &rarr;</div>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php break;

                case 'reading-list': ?>
                    <div class="dash-card">
                         <?php if(empty($bookmarks)): ?>
                            <div style="text-align:center; padding:48px; background:#F8FAFC; border:1px dashed #E2E8F0; border-radius:0;">
                                <p style="color:#64748B;">Your reading list is currently empty.</p>
                                <a href="/" style="color:<?php echo $theme_primary; ?>; font-weight:600;">Browse Articles</a>
                            </div>
                         <?php else: ?>
                            <div class="dash-list">
                                <?php 
                                $b_query = new WP_Query(array('post__in' => $bookmarks, 'post_type' => 'any', 'posts_per_page' => -1));
                                while($b_query->have_posts()): $b_query->the_post();
                                $p_link = get_permalink();
                                $p_title = get_the_title();
                                ?>
                                <div class="list-item" style="padding:16px 0;">
                                    <div style="display:flex; gap:16px; align-items:center; flex:1;">
                                        <div style="width:64px; height:64px; background:#F1F5F9; border-radius:0; overflow:hidden; flex-shrink:0;">
                                            <?php echo get_the_post_thumbnail(get_the_ID(), 'medium', array('style'=>'width:100%;height:100%;object-fit:cover;')); ?>
                                        </div>
                                        <div>
                                            <div class="item-title"><a href="<?php the_permalink(); ?>" style="text-decoration:none; color:inherit;"><?php the_title(); ?></a></div>
                                            <div class="item-meta"><?php echo get_the_date('M j, Y'); ?> • <?php echo get_post_type(); ?></div>
                                        </div>
                                    </div>
                                    <div style="display:flex; gap:8px;">
                                        <a href="<?php echo $p_link; ?>" class="card-link" style="border:1px solid #e2e8f0; padding:6px 12px; border-radius:0; color:#475569; font-weight:500;">View</a>
                                        <a href="mailto:?subject=<?php echo rawurlencode($p_title); ?>&body=<?php echo rawurlencode($p_link); ?>" class="card-link" style="border:1px solid #e2e8f0; padding:6px 12px; border-radius:0; color:#475569; font-weight:500;">Share</a>
                                        <button onclick="navigator.clipboard.writeText('<?php echo esc_js($p_link); ?>'); alert('Link copied!');" style="background:white; border:1px solid #e2e8f0; padding:6px 12px; border-radius:0; color:#475569; font-weight:500; cursor:pointer;">Copy Link</button>
                                        
                                        <button onclick="deleteBookmark(<?php echo get_the_ID(); ?>)" style="color:#EF4444; border:none; background:none; cursor:pointer; font-size:13px; font-weight:600; margin-left:8px;">Remove</button>
                                    </div>
                                </div>
                                <?php endwhile; wp_reset_postdata(); ?>
                            </div>
                         <?php endif; ?>
                    </div>
                <?php break;

                case 'searches': ?>
                    <div class="dash-card">
                        <?php 
                        $searches = get_user_meta($current_user->ID, '_mlws_saved_searches', true) ?: array();
                        if(empty($searches)): ?>
                             <div style="text-align:center; padding:48px; background:#F8FAFC; border:1px dashed #E2E8F0; border-radius:0;">
                                <p style="color:#64748B;">You haven't saved any searches yet.</p>
                            </div>
                        <?php else: ?>
                            <div class="dash-list">
                                <?php 
                                $searches_safe = is_array($searches) ? $searches : array();
                                foreach(array_reverse($searches_safe) as $s): ?>
                                <div class="list-item" style="padding:16px 0;">
                                    <div style="flex:1;">
                                        <div class="item-title"><a href="<?php echo esc_url($s['url']); ?>" style="text-decoration:none; color:inherit;"><?php echo esc_html($s['name']); ?></a></div>
                                        <div class="item-meta">Saved on <?php echo date('M j, Y', strtotime($s['date'])); ?></div>
                                    </div>
                                    <div style="display:flex; gap:12px;">
                                        <a href="<?php echo esc_url($s['url']); ?>" class="card-link">Run Search</a>
                                        <button onclick="deleteSearch('<?php echo $s['id']; ?>')" style="color:#EF4444; border:none; background:none; cursor:pointer; font-size:13px; font-weight:600;">Delete</button>
                                    </div>
                                </div>
                                <?php endforeach; ?>
                            </div>
                        <?php endif; ?>
                    </div>
                <?php break;

                case 'notes': ?>
                    <div class="dash-card">
                         <?php 
                         $my_notes = get_user_meta($current_user->ID, '_mlws_user_notes', true) ?: array();
                         if(empty($my_notes)): ?>
                             <div style="text-align:center; padding:48px; background:#F8FAFC; border:1px dashed #E2E8F0; border-radius:0;">
                                <p style="color:#64748B; margin-bottom:16px;">You don't have any notes yet.</p>
                                <a href="/my-notes/?new=1" class="btn-primary" style="background:<?php echo $theme_primary; ?>; color:white; text-decoration:none; padding:10px 20px; border-radius:0; font-weight:600;">Create First Note</a>
                            </div>
                         <?php else: ?>
                            <div class="dash-list">
                                <?php 
                                $notes_safe = is_array($my_notes) ? $my_notes : array();
                                foreach(array_reverse($notes_safe) as $note): ?>
                                <div class="list-item" style="padding:16px 0;">
                                    <div style="flex:1;">
                                        <div class="item-title"><?php echo esc_html($note['title'] ?: 'Untitled Note'); ?></div>
                                        <div class="item-meta">Last edited on <?php echo date('M j, Y', strtotime($note['date'])); ?></div>
                                    </div>
                                    <div style="display:flex; gap:12px;">
                                        <a href="?print_note=<?php echo $note['id']; ?>" target="_blank" class="card-link" style="color:#0EA5E9;">PDF/Print</a>
                                        <a href="/my-notes/?id=<?php echo $note['id']; ?>" class="card-link">Edit</a>
                                        <button onclick="deleteNote('<?php echo $note['id']; ?>')" style="color:#EF4444; border:none; background:none; cursor:pointer; font-size:13px; font-weight:600;">Delete</button>
                                    </div>
                                </div>
                                <?php endforeach; ?>
                            </div>
                         <?php endif; ?>
                    </div>
                <?php break;

                case 'ai-chats': ?>
                    <div class="dash-card">
                         <?php 
                         $ai_chats = get_user_meta($current_user->ID, '_mlws_saved_chats', true);
                         if (!is_array($ai_chats)) $ai_chats = array();
                         if(empty($ai_chats)): ?>
                             <div style="text-align:center; padding:48px; background:#F8FAFC; border:1px dashed #E2E8F0; border-radius:0;">
                                <p style="color:#64748B; margin-bottom:16px;">No AI chat history found.</p>
                                <a href="/ask-ai/" class="btn-primary" style="background:<?php echo $theme_primary; ?>; color:white; text-decoration:none; padding:10px 20px; border-radius:0; font-weight:600;">Start New Consultation</a>
                            </div>
                         <?php else: ?>
                             <div class="dash-list">
                                <?php foreach(array_reverse($ai_chats) as $chat): 
                                    $chat_json = wp_json_encode($chat);
                                    // Make sure title doesn't overflow incredibly long if it was saved improperly
                                    $display_title = !empty($chat['title']) ? wp_trim_words($chat['title'], 8, '...') : 'AI Consultation';
                                ?>
                                <div class="list-item" style="padding:16px 0;">
                                    <div style="flex:1;">
                                        <div class="item-title"><?php echo esc_html($display_title); ?></div>
                                        <div class="item-meta">Saved on <?php echo date('M j, Y', strtotime($chat['date'])); ?></div>
                                    </div>
                                    <div style="display:flex; gap:12px;">
                                        <button class="card-link btn-view-ai-chat" data-chat="<?php echo esc_attr($chat_json); ?>" style="background:none; border:none; font-family:inherit; cursor:pointer; font-weight:600; color:<?php echo $theme_primary; ?>;">View Conversation</button>
                                        <button onclick="renameChat('<?php echo esc_js($chat['id']); ?>', '<?php echo esc_js($display_title); ?>')" style="color:#0EA5E9; border:none; background:none; cursor:pointer; font-size:13px; font-weight:600;">Rename</button>
                                        <button onclick="deleteChat('<?php echo esc_js($chat['id']); ?>')" style="color:#EF4444; border:none; background:none; cursor:pointer; font-size:13px; font-weight:600;">Delete</button>
                                    </div>
                                </div>
                                <?php endforeach; ?>
                             </div>
                             <script>
                                document.addEventListener('DOMContentLoaded', function() {
                                    jQuery('.btn-view-ai-chat').on('click', function() {
                                        var chatData = JSON.parse(jQuery(this).attr('data-chat'));
                                        viewChat(chatData);
                                    });
                                });

                                function renameChat(id, currentTitle) {
                                    var newTitle = prompt("Enter a new name for this chat:", currentTitle);
                                    if (newTitle === null || newTitle.trim() === '' || newTitle.trim() === currentTitle) return;
                                    
                                    jQuery.post('<?php echo admin_url('admin-ajax.php'); ?>', {
                                        action: 'mlws_rename_chat',
                                        id: id,
                                        title: newTitle.trim(),
                                        nonce: '<?php echo wp_create_nonce("mlws_dashboard_nonce"); ?>'
                                    }, function(res) {
                                        if(res.success) {
                                            location.reload();
                                        } else {
                                            alert(res.data);
                                        }
                                    });
                                }
                             </script>
                         <?php endif; ?>
                    </div>

                    <!-- Chat Viewer Modal -->
                    <div id="chat-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:10001; align-items:center; justify-content:center; padding:20px;">
                        <div style="background:white; width:100%; max-width:800px; max-height:90vh; border-radius:0; display:flex; flex-direction:column; overflow:hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.2);">
                            <div style="padding:24px; border-bottom:1px solid #E2E8F0; display:flex; justify-content:space-between; align-items:center; background:white;">
                                <div>
                                    <h3 id="modal-chat-title" style="margin:0; font-family:'Outfit'; font-size:20px; color:#0F172A;">AI Chat Transcript</h3>
                                    <p id="modal-chat-date" style="margin:4px 0 0 0; font-size:12px; color:#64748B;"></p>
                                </div>
                                <button onclick="closeChatModal()" style="font-size:32px; border:none; background:none; cursor:pointer; color:#64748B; line-height:1;">×</button>
                            </div>
                            <div id="modal-chat-content" style="flex:1; overflow-y:auto; padding:32px; background:#F8FAFC; display:flex; flex-direction:column; gap:24px;">
                                <!-- Messages will go here -->
                            </div>
                            <div style="padding:20px; border-top:1px solid #E2E8F0; background:white; display:flex; justify-content:flex-end;">
                                <button onclick="closeChatModal()" class="btn-primary" style="background:#0F172A; color:white; border:none; padding:10px 24px; border-radius:0; cursor:pointer; font-weight:600;">Close</button>
                            </div>
                        </div>
                    </div>
                <?php break;

            endswitch; ?>
        </div>
    </main>
</div>

<script>
    function toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('active');
    }
    
    // Role Switching
    function switchRole(role) {
        jQuery.post('<?php echo admin_url('admin-ajax.php'); ?>', {
            action: 'mlws_switch_role', role: role, nonce: '<?php echo wp_create_nonce("mlws_dashboard_nonce"); ?>'
        }, function(res) {
            if(res.success) location.reload(); else alert('Error: ' + res.data);
        });
    }

    // Bookmarks
    function deleteBookmark(pid) {
        if(!confirm('Remove bookmark?')) return;
        jQuery.post('<?php echo admin_url('admin-ajax.php'); ?>', {
            action: 'mlws_toggle_bookmark', post_id: pid, nonce: '<?php echo wp_create_nonce("mlws_dashboard_nonce"); ?>'
        }, function(res) { if(res.success) location.reload(); });
    }

    // Notes
    function deleteNote(id) {
        if(!confirm('Delete this note permanently?')) return;
        // Re-using mlws_save_note with empty content or similar? 
        // Better to add a proper delete action in functions.php if not exists.
        // For now, let's assume mlws_delete_note exists or use mlws_save_note with a flag.
        jQuery.post('<?php echo admin_url('admin-ajax.php'); ?>', {
            action: 'mlws_delete_note', id: id, nonce: '<?php echo wp_create_nonce("mlws_dashboard_nonce"); ?>'
        }, function(res) { if(res.success) location.reload(); else alert(res.data); });
    }

    // Searches
    function deleteSearch(id) {
        if(!confirm('Delete this saved search?')) return;
        jQuery.post('<?php echo admin_url('admin-ajax.php'); ?>', {
            action: 'mlws_delete_search', id: id, nonce: '<?php echo wp_create_nonce("mlws_dashboard_nonce"); ?>'
        }, function(res) { if(res.success) location.reload(); else alert(res.data); });
    }

    // Avatar
    function triggerAvatarUpload() { document.getElementById('avatar-input').click(); }
    function uploadAvatar(input) {
        if (input.files[0]) {
            var fd = new FormData();
            fd.append('action', 'mlws_upload_avatar');
            fd.append('avatar', input.files[0]);
            fd.append('nonce', '<?php echo wp_create_nonce("mlws_dashboard_nonce"); ?>');
            jQuery.ajax({
                url: '<?php echo admin_url('admin-ajax.php'); ?>', type: 'POST', data: fd, processData: false, contentType: false,
                success: function(res) { if(res.success) location.reload(); else alert(res.data); }
            });
        }
    }

    // Profile Form
    jQuery(document).on('submit', '#profile-form-main', function(e) {
        e.preventDefault();
        var data = jQuery(this).serialize() + '&action=mlws_save_profile&nonce=<?php echo wp_create_nonce("mlws_dashboard_nonce"); ?>';
        var btn = jQuery(this).find('button[type="submit"]');
        btn.text('Saving...').prop('disabled', true);
        
        jQuery.post('<?php echo admin_url('admin-ajax.php'); ?>', data, function(res) {
            btn.text('Update Profile').prop('disabled', false);
            if(res.success) { alert('Profile saved successfully!'); } else alert(res.data);
        });
    });

    // Markdown Formatter Helper
    function parseMarkdown(text) {
        if (!text) return '';
        let html = text;
        
        // Bold
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:inherit;">$1</strong>');
        // Italic
        html = html.replace(/\*([^*]+)\*/g, '<em style="color:inherit;">$1</em>');
        
        // Lists (asterisk or dash)
        html = html.replace(/(?:\r?\n|^)\s*[\*-]\s+(.*?)(?=\n|$)/g, '<li style="margin-left: 20px; padding-bottom: 6px;">$1</li>');
        
        // Wrap contiguous list items in a <ul>
        html = html.replace(/(<li[^>]*>.*?<\/li>\s*)+/g, '<ul style="margin: 10px 0; padding: 0;">$&</ul>');
        
        // Newlines to breaks
        html = html.replace(/\n/g, '<br>');
        
        return html;
    }

    // AI Chat History
    function viewChat(chat) {
        const modal = document.getElementById('chat-modal');
        const title = document.getElementById('modal-chat-title');
        const date = document.getElementById('modal-chat-date');
        const content = document.getElementById('modal-chat-content');
        
        title.innerText = chat.title || 'AI Consultation';
        date.innerText = 'Consultation date: ' + new Date(chat.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        content.innerHTML = '';
        
        if (chat.transcript && Array.isArray(chat.transcript)) {
            chat.transcript.forEach(msg => {
                const isUser = msg.role === 'user';
                const msgEl = document.createElement('div');
                msgEl.style.display = 'flex';
                msgEl.style.flexDirection = isUser ? 'row-reverse' : 'row';
                msgEl.style.gap = '12px';
                msgEl.style.alignItems = 'flex-start';
                msgEl.style.marginBottom = '20px';
                
                const avatar = document.createElement('div');
                avatar.style.width = '32px';
                avatar.style.height = '32px';
                avatar.style.borderRadius = '50%';
                avatar.style.display = 'flex';
                avatar.style.alignItems = 'center';
                avatar.style.justifyContent = 'center';
                avatar.style.fontSize = '12px';
                avatar.style.fontWeight = '700';
                avatar.style.flexShrink = '0';
                
                if (isUser) {
                    avatar.style.background = '#F1F5F9';
                    avatar.style.color = '#64748B';
                    avatar.innerText = 'USR';
                } else {
                    avatar.style.background = 'white';
                    avatar.style.color = '#fd4f00';
                    avatar.style.border = '1px solid #fd4f00';
                    avatar.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
                }
                
                const bubble = document.createElement('div');
                bubble.style.padding = '16px 20px';
                bubble.style.borderRadius = '12px';
                bubble.style.fontSize = '14.5px';
                bubble.style.lineHeight = '1.65';
                bubble.style.maxWidth = '85%';
                bubble.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
                
                if (isUser) {
                    bubble.style.background = '#0F172A';
                    bubble.style.color = 'white';
                    bubble.style.borderTopRightRadius = '0';
                } else {
                    bubble.style.background = 'white';
                    bubble.style.color = '#1F2937';
                    bubble.style.border = '1px solid #E2E8F0';
                    bubble.style.borderTopLeftRadius = '0';
                }
                
                bubble.innerHTML = parseMarkdown(msg.content);
                
                msgEl.appendChild(avatar);
                msgEl.appendChild(bubble);
                content.appendChild(msgEl);
            });
        } else if (chat.transcript) {
            // Handle legacy string format
            const wrapper = document.createElement('div');
            wrapper.style.padding = '24px 32px';
            wrapper.style.fontSize = '15px';
            wrapper.style.lineHeight = '1.7';
            wrapper.style.color = '#1F2937';
            wrapper.style.background = 'white';
            wrapper.style.border = '1px solid #E2E8F0';
            wrapper.style.borderRadius = '6px';
            
            let rawContent = chat.transcript;
            
            // Format legacy You: / IBDi: speakers into styled pills
            rawContent = rawContent.replace(/<strong>You:<\/strong>|You:/gi, '<br><div style="background:#F1F5F9; color:#64748B; padding:4px 12px; border-radius:12px; display:inline-block; font-size:11px; font-weight:700; margin-bottom:8px; margin-top:20px; line-height:1;">USER</div><br>');
            rawContent = rawContent.replace(/<strong>IBDi:<\/strong>|IBDi:/gi, '<br><div style="background:#F5F0FA; color:#1B4F8A; border:1px solid #E8DDF0; padding:4px 12px; border-radius:12px; display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; margin-bottom:8px; margin-top:20px; line-height:1;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> IBDi</div><br>');
            
            // Remove lingering empty paragraphs if any
            rawContent = rawContent.replace(/<p>\s*<\/p>/gi, '');

            wrapper.innerHTML = parseMarkdown(rawContent);
            content.appendChild(wrapper);
        }
        
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    function closeChatModal() {
        document.getElementById('chat-modal').style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    function deleteChat(id) {
        if(!confirm('Delete this chat history permanently?')) return;
        jQuery.post('<?php echo admin_url('admin-ajax.php'); ?>', {
            action: 'mlws_delete_chat', id: id, nonce: '<?php echo wp_create_nonce("mlws_dashboard_nonce"); ?>'
        }, function(res) { if(res.success) location.reload(); else alert(res.data); });
    }
</script>

<?php endif; ?>
<?php get_footer('dashboard'); ?>
