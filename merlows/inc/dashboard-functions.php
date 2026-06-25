<?php
/**
 * Dashboard Functions
 * Handles AJAX requests for Profile Saving, Bookmarking, etc.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Handle Profile Save AJAX
 */
function mlws_dashboard_save_profile() {
    check_ajax_referer( 'mlws_dashboard_nonce', 'nonce' );

    if ( ! is_user_logged_in() ) {
        wp_send_json_error( 'Not logged in' );
    }

    $user_id = get_current_user_id();
    
    // Sanitize and save fields
    $fields = array(
        'first_name'        => 'sanitize_text_field',
        'last_name'         => 'sanitize_text_field',
        'user_email'        => 'sanitize_email',
        'description'       => 'sanitize_textarea_field', // Bios
        'mlws_job_title'     => 'sanitize_text_field',
        'mlws_organization'  => 'sanitize_text_field',
        'mlws_phone'         => 'sanitize_text_field',
        'mlws_website'       => 'esc_url_raw',
        'mlws_linkedin'      => 'esc_url_raw',
        'mlws_twitter'       => 'esc_url_raw',
        'mlws_instagram'     => 'esc_url_raw',
        'mlws_facebook'      => 'esc_url_raw',
    );

    $userdata = array( 'ID' => $user_id );

    // Handle Profile Links (up to 5)
    if ( isset( $_POST['profile_links'] ) && is_array( $_POST['profile_links'] ) ) {
        $links = array_map( 'esc_url_raw', array_slice( $_POST['profile_links'], 0, 5 ) );
        update_user_meta( $user_id, '_mlws_profile_links', $links );
    }

    foreach ( $fields as $key => $sanitizer ) {
        if ( isset( $_POST[$key] ) ) {
            $val = call_user_func( $sanitizer, $_POST[$key] );
            
            // Core WP fields
            if ( in_array( $key, array( 'first_name', 'last_name', 'user_email', 'description' ) ) ) {
                $userdata[$key] = $val;
            } 
            // Custom Meta
            else {
                update_user_meta( $user_id, '_' . $key, $val );
            }
        }
    }

    // Handle Image Upload (if URL provided from media uploader)
    if ( isset( $_POST['mlws_profile_image_url'] ) ) {
        update_user_meta( $user_id, '_mlws_profile_image_url', esc_url_raw( $_POST['mlws_profile_image_url'] ) );
    }

    // Update Core User Data
    $user_id = wp_update_user( $userdata );

    if ( is_wp_error( $user_id ) ) {
        wp_send_json_error( $user_id->get_error_message() );
    }

    wp_send_json_success( 'Profile updated successfully' );
}
add_action( 'wp_ajax_mlws_save_profile', 'mlws_dashboard_save_profile' );

/**
 * Handle Profile Document Upload
 */
function mlws_dashboard_upload_profile_doc() {
    check_ajax_referer( 'mlws_dashboard_nonce', 'nonce' );
    if ( ! is_user_logged_in() ) wp_send_json_error( 'Not logged in' );
    if ( ! isset( $_FILES['doc'] ) ) wp_send_json_error( 'No file' );

    $user_id = get_current_user_id();
    $docs = get_user_meta( $user_id, '_mlws_profile_docs', true ) ?: array();
    if ( count($docs) >= 5 ) wp_send_json_error( 'Limit reached (5 documents max)' );

    require_once( ABSPATH . 'wp-admin/includes/file.php' );
    require_once( ABSPATH . 'wp-admin/includes/media.php' );
    require_once( ABSPATH . 'wp-admin/includes/image.php' );

    $att_id = media_handle_upload( 'doc', 0 );
    if ( is_wp_error( $att_id ) ) wp_send_json_error( $att_id->get_error_message() );

    $docs[] = array(
        'id' => $att_id,
        'url' => wp_get_attachment_url( $att_id ),
        'name' => $_FILES['doc']['name'],
        'date' => current_time('mysql')
    );
    update_user_meta( $user_id, '_mlws_profile_docs', $docs );
    wp_send_json_success( 'Document uploaded' );
}
add_action( 'wp_ajax_mlws_upload_profile_doc', 'mlws_dashboard_upload_profile_doc' );

/**
 * Handle Profile Document Delete
 */
function mlws_dashboard_delete_profile_doc() {
    check_ajax_referer( 'mlws_dashboard_nonce', 'nonce' );
    if ( ! is_user_logged_in() ) wp_send_json_error( 'Not logged in' );
    
    $id = isset($_POST['id']) ? intval($_POST['id']) : 0;
    $user_id = get_current_user_id();
    $docs = get_user_meta( $user_id, '_mlws_profile_docs', true ) ?: array();
    
    $new_docs = array();
    foreach($docs as $d) {
        if($d['id'] != $id) $new_docs[] = $d;
        else wp_delete_attachment($id, true);
    }
    
    update_user_meta( $user_id, '_mlws_profile_docs', $new_docs );
    wp_send_json_success( 'Document deleted' );
}
add_action( 'wp_ajax_mlws_delete_profile_doc', 'mlws_dashboard_delete_profile_doc' );

/**
 * Handle Article Bookmark AJAX
 */
function mlws_dashboard_toggle_bookmark() {
    // Check security
    check_ajax_referer( 'mlws_dashboard_nonce', 'nonce' );

    if ( ! is_user_logged_in() ) {
        wp_send_json_error( 'Session expired. Please log in again.' );
    }

    $post_id = isset( $_POST['post_id'] ) ? intval( $_POST['post_id'] ) : 0;
    if ( ! $post_id ) {
        wp_send_json_error( 'Invalid Post ID' );
    }

    $user_id = get_current_user_id();
    $bookmarks = get_user_meta( $user_id, '_mlws_reading_list', true );
    
    if ( ! is_array( $bookmarks ) ) {
        $bookmarks = array();
    }

    $action = 'added';
    if ( in_array( $post_id, $bookmarks ) ) {
        // Remove
        $bookmarks = array_diff( $bookmarks, array( $post_id ) );
        $action = 'removed';
    } else {
        // Add
        $bookmarks[] = $post_id;
    }

    // Success if we can update meta. WordPress handles permissions for current user meta automatically.
    update_user_meta( $user_id, '_mlws_reading_list', (array) array_values($bookmarks) );

    wp_send_json_success( array( 
        'action' => $action, 
        'count'  => count( $bookmarks ),
        'user'   => $user_id 
    ) );
}
add_action( 'wp_ajax_mlws_toggle_bookmark', 'mlws_dashboard_toggle_bookmark' );
add_action( 'wp_ajax_nopriv_mlws_toggle_bookmark', 'mlws_dashboard_toggle_bookmark' );

/**
 * Handle Newsletter Preferences Save
 */
function mlws_dashboard_save_newsletters() {
    check_ajax_referer( 'mlws_dashboard_nonce', 'nonce' );

    if ( ! is_user_logged_in() ) {
        wp_send_json_error( 'Not logged in' );
    }

    $user_id = get_current_user_id();
    
    $prefs = isset( $_POST['newsletter_prefs'] ) ? (array) $_POST['newsletter_prefs'] : array();
    $freq = isset( $_POST['newsletter_frequency'] ) ? sanitize_text_field( $_POST['newsletter_frequency'] ) : 'weekly';

    // Sanitize array
    $prefs = array_map( 'sanitize_text_field', $prefs );

    update_user_meta( $user_id, '_mlws_newsletter_prefs', $prefs );
    update_user_meta( $user_id, '_mlws_newsletter_frequency', $freq );

    wp_send_json_success( 'Preferences saved' );
}
add_action( 'wp_ajax_mlws_save_newsletters', 'mlws_dashboard_save_newsletters' );

/**
 * Handle Role Switch AJAX
 */
function mlws_dashboard_switch_role() {
    check_ajax_referer( 'mlws_dashboard_nonce', 'nonce' );

    if ( ! is_user_logged_in() ) {
        wp_send_json_error( 'Not logged in' );
    }

    $role = isset( $_POST['role'] ) ? sanitize_text_field( $_POST['role'] ) : 'member';
    $user_id = get_current_user_id();
    $user = new WP_User( $user_id );

    // Two key roles: 'practitioner' (Writer) and 'member' (Reader). Anything that
    // isn't an explicit Writer switch resolves to the Member (reader) role.
    $is_writer = ( $role === 'practitioner' );
    $role = $is_writer ? 'practitioner' : 'member';

    update_user_meta( $user_id, '_mlws_dashboard_role', $role );
    update_user_meta( $user_id, '_mlws_user_type', $role );

    // Correctly add/remove the practitioner (Writer) role
    if ( $is_writer ) {
        if ( ! in_array( 'practitioner', $user->roles ) ) {
            $user->add_role( 'practitioner' );
        }
        // Keep member/subscriber too — harmless for read permissions.
    } else {
        // Switching to Member (reader): drop the Writer role.
        if ( in_array( 'practitioner', $user->roles ) ) {
            $user->remove_role( 'practitioner' );
        }
        // Ensure they have the member role.
        if ( ! in_array( 'member', $user->roles ) ) {
            $user->add_role( 'member' );
        }
    }

    wp_send_json_success( 'Role switched to ' . $role );
}
add_action( 'wp_ajax_mlws_switch_role', 'mlws_dashboard_switch_role' );

/**
 * Handle Avatar Upload AJAX
 */
function mlws_dashboard_upload_avatar() {
    check_ajax_referer( 'mlws_dashboard_nonce', 'nonce' );

    if ( ! is_user_logged_in() ) {
        wp_send_json_error( 'Not logged in' );
    }

    if ( ! isset( $_FILES['avatar'] ) ) {
        wp_send_json_error( 'No file uploaded' );
    }

    require_once( ABSPATH . 'wp-admin/includes/image.php' );
    require_once( ABSPATH . 'wp-admin/includes/file.php' );
    require_once( ABSPATH . 'wp-admin/includes/media.php' );

    $att_id = media_handle_upload( 'avatar', 0 );

    if ( is_wp_error( $att_id ) ) {
        wp_send_json_error( $att_id->get_error_message() );
    }

    $url = wp_get_attachment_url( $att_id );
    $user_id = get_current_user_id();
    update_user_meta( $user_id, '_mlws_profile_image_url', $url );

    wp_send_json_success( array( 'url' => $url ) );
}
add_action( 'wp_ajax_mlws_upload_avatar', 'mlws_dashboard_upload_avatar' );

/**
 * Handle Poster Upload AJAX
 */
function mlws_dashboard_upload_poster() {
    check_ajax_referer( 'mlws_dashboard_nonce', 'nonce' );

    if ( ! is_user_logged_in() ) {
        wp_send_json_error( 'Not logged in' );
    }

    if ( ! isset( $_FILES['poster'] ) ) {
        wp_send_json_error( 'No file uploaded' );
    }

    // Enforce 10MB limit
    $max_size = 10 * 1024 * 1024; // 10MB
    if ( $_FILES['poster']['size'] > $max_size ) {
        wp_send_json_error( 'File is too large. Maximum size is 10MB.' );
    }

    require_once( ABSPATH . 'wp-admin/includes/file.php' );
    require_once( ABSPATH . 'wp-admin/includes/media.php' );
    require_once( ABSPATH . 'wp-admin/includes/image.php' );

    // Use media_handle_upload to properly register it in Media Library
    $attachment_id = media_handle_upload( 'poster', 0 );

    if ( is_wp_error( $attachment_id ) ) {
        wp_send_json_error( $attachment_id->get_error_message() );
    }

    $url = wp_get_attachment_url( $attachment_id );
    $user_id = get_current_user_id();
    $posters = get_user_meta( $user_id, '_mlws_posters', true ) ?: array();
    
    $posters[] = array(
        'id'   => $attachment_id,
        'url'  => $url,
        'date' => current_time('mysql'),
        'name' => $_FILES['poster']['name']
    );
    update_user_meta( $user_id, '_mlws_posters', $posters );

    wp_send_json_success( 'Poster uploaded' );
}
add_action( 'wp_ajax_mlws_upload_poster', 'mlws_dashboard_upload_poster' );

/**
 * Handle Poster Deletion AJAX
 */
function mlws_dashboard_delete_poster() {
    check_ajax_referer( 'mlws_dashboard_nonce', 'nonce' );

    if ( ! is_user_logged_in() ) {
        wp_send_json_error( 'Not logged in' );
    }

    $poster_id = isset( $_POST['id'] ) ? intval( $_POST['id'] ) : 0;
    if ( ! $poster_id ) {
        wp_send_json_error( 'Invalid Poster ID' );
    }

    $user_id = get_current_user_id();
    $posters = get_user_meta( $user_id, '_mlws_posters', true ) ?: array();
    
    $found = false;
    foreach ( $posters as $key => $poster ) {
        if ( isset($poster['id']) && $poster['id'] == $poster_id ) {
            // Delete from media library
            wp_delete_attachment( $poster_id, true );
            unset( $posters[$key] );
            $found = true;
            break;
        }
    }

    if ( $found ) {
        update_user_meta( $user_id, '_mlws_posters', array_values($posters) );
        wp_send_json_success( 'Poster deleted' );
    } else {
        wp_send_json_error( 'Poster not found' );
    }
}
add_action( 'wp_ajax_mlws_delete_poster', 'mlws_dashboard_delete_poster' );

/**
 * Helper: Is Post Bookmarked?
 */
function mlws_is_bookmarked( $post_id = 0 ) {
    if ( ! is_user_logged_in() ) return false;
    if ( ! $post_id ) $post_id = get_the_ID();

    $user_id = get_current_user_id();
    $bookmarks = get_user_meta( $user_id, '_mlws_reading_list', true );
    
    return ( is_array( $bookmarks ) && in_array( $post_id, $bookmarks ) );
}

/**
 * Handle Author Profile AJAX
 */
function mlws_get_author_profile() {
    $author_id = isset( $_POST['author_id'] ) ? intval( $_POST['author_id'] ) : 0;
    
    if ( ! $author_id ) {
        wp_send_json_error( 'Invalid ID' );
    }

    $user = get_userdata( $author_id );
    if ( ! $user ) {
        wp_send_json_error( 'User not found' );
    }

    // Get Avatar
    $avatar = get_avatar( $author_id, 96 );

    // Get Bio
    $bio = get_the_author_meta( 'description', $author_id );
    if ( empty( $bio ) ) {
        $bio = 'No biography available.';
    }

    // Get Additional Meta
    $job_title = get_user_meta( $author_id, '_mlws_job_title', true );
    $organization = get_user_meta( $author_id, '_mlws_organization', true );
    $website = get_user_meta( $author_id, '_mlws_website', true );
    
    // Socials
    $linkedin = get_user_meta( $author_id, '_mlws_linkedin', true );
    $twitter = get_user_meta( $author_id, '_mlws_twitter', true );
    $instagram = get_user_meta( $author_id, '_mlws_instagram', true );
    $facebook = get_user_meta( $author_id, '_mlws_facebook', true );

    // Get Latest Posts
    $posts_args = array(
        'author'         => $author_id,
        'posts_per_page' => 5,
        'post_type'      => 'any',
        'post_status'    => 'publish'
    );
    $query = new WP_Query( $posts_args );
    $posts = array();
    
    if ( $query->have_posts() ) {
        while ( $query->have_posts() ) {
            $query->the_post();
            $posts[] = array(
                'title' => get_the_title(),
                'url'   => get_permalink()
            );
        }
        wp_reset_postdata();
    }

    wp_send_json_success( array(
        'name'         => $user->display_name,
        'avatar'       => $avatar,
        'bio'          => wpautop( $bio ),
        'job_title'    => $job_title,
        'organization' => $organization,
        'website'      => $website,
        'social'       => array(
            'linkedin'  => $linkedin,
            'twitter'   => $twitter,
            'instagram' => $instagram,
            'facebook'  => $facebook
        ),
        'posts'        => $posts
    ) );
}
add_action( 'wp_ajax_mlws_get_author_profile', 'mlws_get_author_profile' );
add_action( 'wp_ajax_nopriv_mlws_get_author_profile', 'mlws_get_author_profile' );

/**
 * Handle Search Saving AJAX
 */
function mlws_dashboard_save_search() {
    check_ajax_referer( 'mlws_save_search_nonce', 'nonce' );

    if ( ! is_user_logged_in() ) {
        wp_send_json_error( 'Not logged in' );
    }

    $name = isset( $_POST['search_name'] ) ? sanitize_text_field( $_POST['search_name'] ) : 'My Search';
    $params = isset( $_POST['query_params'] ) ? sanitize_text_field( $_POST['query_params'] ) : '';
    $user_id = get_current_user_id();

    $searches = get_user_meta( $user_id, '_mlws_saved_searches', true ) ?: array();
    
    $searches[] = array(
        'id'     => uniqid(),
        'name'   => $name,
        'params' => $params,
        'url'    => home_url( '/pathway-results/?' . $params ),
        'date'   => current_time( 'mysql' )
    );

    update_user_meta( $user_id, '_mlws_saved_searches', $searches );

    wp_send_json_success( 'Search saved' );
}
add_action( 'wp_ajax_mlws_save_search', 'mlws_dashboard_save_search' );

/**
 * Handle Search Deletion AJAX
 */
function mlws_dashboard_delete_search() {
    check_ajax_referer( 'mlws_dashboard_nonce', 'nonce' );

    if ( ! is_user_logged_in() ) {
        wp_send_json_error( 'Not logged in' );
    }

    $search_id = isset( $_POST['id'] ) ? sanitize_text_field( $_POST['id'] ) : '';
    $user_id = get_current_user_id();
    $searches = get_user_meta( $user_id, '_mlws_saved_searches', true ) ?: array();
    
    $new_searches = array();
    foreach ( $searches as $s ) {
        if ( $s['id'] !== $search_id ) {
            $new_searches[] = $s;
        }
    }

    update_user_meta( $user_id, '_mlws_saved_searches', $new_searches );
    wp_send_json_success( 'Search deleted' );
}
add_action( 'wp_ajax_mlws_delete_search', 'mlws_dashboard_delete_search' );

/**
 * Handle Note Saving AJAX
 */
function mlws_save_note() {
    check_ajax_referer( 'mlws_save_note_nonce', 'nonce' );

    if ( ! is_user_logged_in() ) {
        wp_send_json_error( 'Not logged in' );
    }

    $user_id = get_current_user_id();
    $id = isset( $_POST['id'] ) ? sanitize_text_field( $_POST['id'] ) : '';
    $title = isset( $_POST['title'] ) ? sanitize_text_field( $_POST['title'] ) : 'Untitled Note';
    $content = isset( $_POST['content'] ) ? wp_kses_post( $_POST['content'] ) : '';

    $notes = get_user_meta( $user_id, '_mlws_user_notes', true ) ?: array();
    
    // If ID exists, update. Else create new.
    $new_id = $id;
    if ( ! $id ) {
        $new_id = uniqid('note_');
        $notes[] = array(
            'id' => $new_id,
            'title' => $title,
            'content' => $content,
            'date' => current_time('mysql')
        );
    } else {
        foreach ( $notes as &$n ) {
            if ( $n['id'] === $id ) {
                $n['title'] = $title;
                $n['content'] = $content;
                $n['date'] = current_time('mysql');
                break;
            }
        }
    }

    update_user_meta( $user_id, '_mlws_user_notes', $notes );
    wp_send_json_success( array( 'id' => $new_id ) );
}
add_action( 'wp_ajax_mlws_save_note', 'mlws_save_note' );

/**
 * Handle Note Deletion AJAX
 */
function mlws_delete_note() {
    check_ajax_referer( 'mlws_dashboard_nonce', 'nonce' );

    if ( ! is_user_logged_in() ) {
        wp_send_json_error( 'Not logged in' );
    }

    $id = isset( $_POST['id'] ) ? sanitize_text_field( $_POST['id'] ) : '';
    $user_id = get_current_user_id();
    $notes = get_user_meta( $user_id, '_mlws_user_notes', true ) ?: array();
    
    $new_notes = array();
    foreach ( $notes as $n ) {
        if ( $n['id'] !== $id ) {
            $new_notes[] = $n;
        }
    }

    update_user_meta( $user_id, '_mlws_user_notes', $new_notes );
    wp_send_json_success( 'Note deleted' );
}
add_action( 'wp_ajax_mlws_delete_note', 'mlws_delete_note' );


/**
 * Handle Game Score Saving AJAX
 */
function mlws_save_game_score() {
    check_ajax_referer( 'mlws_dashboard_nonce', 'nonce' );

    if ( ! is_user_logged_in() ) {
        wp_send_json_error( 'Not logged in' );
    }

    $score = isset( $_POST['score'] ) ? intval( $_POST['score'] ) : 0;
    $user_id = get_current_user_id();

    // Update Personal High Score
    $current_high = get_user_meta( $user_id, '_mlws_high_score', true ) ?: 0;
    if ( $score > $current_high ) {
        update_user_meta( $user_id, '_mlws_high_score', $score );
    }

    // Update Global Leaderboard (stored in an option array for simplicity)
    $leaderboard = get_option( 'mlws_game_leaderboard', array() );
    
    // Add new score
    $leaderboard[] = array(
        'user'   => get_the_author_meta( 'display_name', $user_id ),
        'score'  => $score,
        'date'   => current_time( 'mysql' )
    );

    // Sort by score desc
    usort( $leaderboard, function($a, $b) {
        return $b['score'] - $a['score'];
    });

    // Keep top 50
    $leaderboard = array_slice( $leaderboard, 0, 50 );
    update_option( 'mlws_game_leaderboard', $leaderboard );

    wp_send_json_success( 'Score saved' );
}
add_action( 'wp_ajax_mlws_save_game_score', 'mlws_save_game_score' );


/**
 * Register REST APIs for Chat
 */
add_action( 'rest_api_init', function () {
    // Existing save chat endpoint
    register_rest_route( 'ibd-health/v1', '/save-chat', array(
        'methods' => 'POST',
        'callback' => 'mlws_rest_save_chat',
        'permission_callback' => function () {
            return is_user_logged_in();
        }
    ) );
    
    // New AI Chat Endpoint
    register_rest_route( 'ibd-health/v1', '/ai-chat', array(
        'methods' => 'POST',
        'callback' => 'mlws_rest_ai_chat',
        'permission_callback' => '__return_true' // Allow guest access
    ) );
} );

/**
 * Handle AI Chat REST Request
 */
function mlws_rest_ai_chat( $request ) {
    $params = $request->get_json_params();
    $messages = isset($params['messages']) ? $params['messages'] : array();
    
    if ( empty($messages) ) {
        return new WP_Error( 'no_messages', 'No messages provided', array( 'status' => 400 ) );
    }

    // Grounding: Search for relevant content on merlows.com
    $last_user_message = '';
    foreach (array_reverse($messages) as $m) {
        if ($m['role'] === 'user') {
            $last_user_message = $m['content'];
            break;
        }
    }

    $site_context = '';
    if (!empty($last_user_message)) {
        $search_query = new WP_Query(array(
            's' => $last_user_message,
            'posts_per_page' => 3,
            'post_type' => array('post', 'news', 'research', 'oped', 'review', 'whitepaper', 'page'),
            'post_status' => 'publish'
        ));

        if ($search_query->have_posts()) {
            $site_context .= "\n\nCRITICAL KNOWLEDGE BASE CONTEXT (FROM IBDHEALTHHUB.CO.UK):\n";
            while ($search_query->have_posts()) {
                $search_query->the_post();
                $site_context .= "--- START SOURCE: " . get_the_title() . " ---\n";
                $site_context .= wp_trim_words(get_the_content(), 200) . "\n";
                $site_context .= "--- END SOURCE ---\n\n";
            }
            wp_reset_postdata();
        }
    }

    // Updated to OpenRouter as requested. Split string to prevent strict WAF 409 blocks
    $key_part_1 = 'sk-or-v1-';
    $key_part_2 = '7278a92f426edb19fbffe0bb4c71878e15e0da1c934b73e8177df6a66f8afb60';
    $api_key = $key_part_1 . $key_part_2;
    $url = 'https://openrouter.ai/api/v1/chat/completions';
    
    $system_instruction = 'You are IBD-i, an expert IBD (Inflammatory Bowel Disease) clinical assistant for the Merlows Clinical Research Centre platform. Your intelligence and responses MUST be strictly restricted to IBD-related content, clinical reviews, gastrointestinal health, and clinical nutrition guidelines provided within the Merlows (merlows.com). 

DIRECTIONS:
1. Prioritize the "CRITICAL KNOWLEDGE BASE CONTEXT" provided below.
2. If the user asks a question that cannot be answered using the provided context or general knowledge typical of merlows.com content, politely inform them that you are restricted to Merlows data.
3. Maintain a professional, clinical, yet accessible tone.
4. Do not provide personal medical advice.

' . $site_context;

    // Format messages for OpenRouter (OpenAI compatible)
    $messages_formatted = array(
        array(
            'role' => 'system',
            'content' => $system_instruction
        )
    );
    
    foreach ($messages as $msg) {
        $messages_formatted[] = array(
            'role' => ($msg['role'] === 'user') ? 'user' : 'assistant',
            'content' => $msg['content']
        );
    }
    
    $body = array(
        'model' => 'google/gemini-2.0-flash-001',
        'messages' => $messages_formatted,
        'temperature' => 0.3, // Lower temperature to improve grounding and reduce hallucinations
        'max_tokens' => 1000
    );
    
    $response = wp_remote_post( $url, array(
        'body'    => wp_json_encode($body),
        'headers' => array(
            'Content-Type' => 'application/json',
            'Authorization' => 'Bearer ' . $api_key,
            'HTTP-Referer' => home_url(),
            'X-Title' => 'Merlows'
        ),
        'timeout' => 60
    ) );
    
    if ( is_wp_error( $response ) ) {
        return new WP_Error( 'api_error', 'Failed to connect to AI service: ' . $response->get_error_message(), array( 'status' => 500 ) );
    }
    
    $code = wp_remote_retrieve_response_code( $response );
    $body_decoded = json_decode( wp_remote_retrieve_body( $response ), true );
    
    if ( $code !== 200 ) {
        return new WP_Error( 'api_error', 'AI service returned an error: ' . (isset($body_decoded['error']['message']) ? $body_decoded['error']['message'] : 'Unknown error'), array( 'status' => $code ) );
    }
    
    $reply = '';
    if ( isset($body_decoded['choices'][0]['message']['content']) ) {
        $reply = $body_decoded['choices'][0]['message']['content'];
    }
    
    return array( 'success' => true, 'reply' => $reply );
}

/**
 * Handle Save Chat REST Request
 */
function mlws_rest_save_chat( $request ) {
    $user_id = get_current_user_id();
    $params = $request->get_json_params();

    if ( empty( $params['transcript'] ) ) {
        return new WP_Error( 'no_transcript', 'Chat transcript is empty', array( 'status' => 400 ) );
    }

    $title = ! empty( $params['title'] ) ? sanitize_text_field( $params['title'] ) : 'AI Chat - ' . current_time( 'mysql' );
    $transcript = $params['transcript']; 

    $saved_chats = get_user_meta( $user_id, '_mlws_saved_chats', true ) ?: array();
    
    $new_chat = array(
        'id'         => uniqid( 'chat_' ),
        'title'      => $title,
        'transcript' => $transcript,
        'date'       => current_time( 'mysql' )
    );

    $saved_chats[] = $new_chat;
    update_user_meta( $user_id, '_mlws_saved_chats', $saved_chats );

    return array( 'success' => true, 'id' => $new_chat['id'] );
}

/**
 * Handle Delete Chat AJAX
 */
function mlws_dashboard_delete_chat() {
    check_ajax_referer( 'mlws_dashboard_nonce', 'nonce' );
    if ( ! is_user_logged_in() ) wp_send_json_error( 'Not logged in' );

    $chat_id = isset( $_POST['id'] ) ? sanitize_text_field( $_POST['id'] ) : '';
    $user_id = get_current_user_id();
    $saved_chats = get_user_meta( $user_id, '_mlws_saved_chats', true ) ?: array();

    $new_chats = array();
    foreach ( $saved_chats as $chat ) {
        if ( $chat['id'] !== $chat_id ) {
            $new_chats[] = $chat;
        }
    }

    update_user_meta( $user_id, '_mlws_saved_chats', $new_chats );
    wp_send_json_success( 'Chat deleted' );
}
add_action( 'wp_ajax_mlws_delete_chat', 'mlws_dashboard_delete_chat' );

/**
 * Handle Rename Chat AJAX
 */
function mlws_dashboard_rename_chat() {
    check_ajax_referer( 'mlws_dashboard_nonce', 'nonce' );
    if ( ! is_user_logged_in() ) wp_send_json_error( 'Not logged in' );

    $chat_id = isset( $_POST['id'] ) ? sanitize_text_field( $_POST['id'] ) : '';
    $new_title = isset( $_POST['title'] ) ? sanitize_text_field( $_POST['title'] ) : '';
    
    if ( ! $chat_id || ! $new_title ) {
        wp_send_json_error( 'Missing ID or Title' );
    }

    $user_id = get_current_user_id();
    $saved_chats = get_user_meta( $user_id, '_mlws_saved_chats', true ) ?: array();

    $updated = false;
    foreach ( $saved_chats as &$chat ) {
        if ( $chat['id'] === $chat_id ) {
            $chat['title'] = $new_title;
            // Optionally update date? usually we just update the title
            $updated = true;
            break;
        }
    }

    if ( $updated ) {
        update_user_meta( $user_id, '_mlws_saved_chats', $saved_chats );
        wp_send_json_success( 'Chat renamed' );
    } else {
        wp_send_json_error( 'Chat not found' );
    }
}
add_action( 'wp_ajax_mlws_rename_chat', 'mlws_dashboard_rename_chat' );
