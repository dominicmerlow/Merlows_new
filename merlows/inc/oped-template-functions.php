<?php
/**
 * Single Template Functions
 * 
 * Registers custom meta boxes for digital assets:
 * - Small Infographic
 * - Large Infographic
 * - Audio Summary
 * - Video Summary
 * - Quiz/Flashcards
 * - Attached Document (PDF, PPT, Doc, XLS)
 * 
 * @package Merlows
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly
}

/**
 * Enqueue Single template styles
 */
function mlws_enqueue_single_template_styles() {
    if ( is_singular() ) {
        wp_enqueue_style( 
            'ibd-oped-template', 
            get_template_directory_uri() . '/assets/css/oped-template.css', 
            array(), 
            '1.0.0' 
        );
    }
}
add_action( 'wp_enqueue_scripts', 'mlws_enqueue_single_template_styles' );

/**
 * Register Digital Assets Meta Boxes
 */
function mlws_register_digital_assets_meta_boxes() {
    $post_types = array( 'post', 'news', 'research', 'oped', 'review', 'whitepaper', 'podcast', 'webinar', 'course', 'infographic' );
    
    foreach ( $post_types as $post_type ) {
        add_meta_box(
            'mlws_digital_assets',
            'Digital Assets',
            'mlws_digital_assets_meta_box_callback',
            $post_type,
            'normal',
            'high'
        );
        
        add_meta_box(
            'mlws_article_settings',
            'Article Settings',
            'mlws_article_settings_meta_box_callback',
            $post_type,
            'side',
            'high'
        );
    }
}
add_action( 'add_meta_boxes', 'mlws_register_digital_assets_meta_boxes' );

/**
 * Digital Assets Meta Box Callback
 */
function mlws_digital_assets_meta_box_callback( $post ) {
    wp_nonce_field( 'mlws_digital_assets_meta_box', 'mlws_digital_assets_meta_box_nonce' );
    
    // Get existing values
    $small_infographic = get_post_meta( $post->ID, '_oped_small_infographic', true );
    $large_infographic = get_post_meta( $post->ID, '_oped_large_infographic', true );
    $audio_summary = get_post_meta( $post->ID, '_oped_audio_summary', true );
    $video_summary = get_post_meta( $post->ID, '_oped_video_summary', true );
    $quiz_embed = get_post_meta( $post->ID, '_oped_quiz_embed', true );
    $attached_document = get_post_meta( $post->ID, '_mlws_attached_document', true );
    
    // Enqueue media uploader
    wp_enqueue_media();
    ?>
    
    <style>
        .oped-meta-section {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 0;
            padding: 20px;
            margin-bottom: 20px;
        }
        .oped-meta-section:last-child {
            margin-bottom: 0;
        }
        .oped-meta-section h4 {
            margin: 0 0 12px 0;
            font-size: 14px;
            color: #1f2937;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .oped-meta-section h4 .dashicons {
            color: #9F2B68;
        }
        .oped-meta-section p {
            margin: 0 0 12px 0;
            color: #6b7280;
            font-size: 13px;
        }
        .oped-media-preview {
            margin-top: 12px;
        }
        .oped-media-preview img {
            max-width: 200px;
            border-radius: 0;
            border: 1px solid #e5e7eb;
        }
        .oped-media-preview audio {
            width: 100%;
            max-width: 400px;
        }
        .oped-remove-media {
            color: #dc2626;
            cursor: pointer;
            font-size: 12px;
            margin-left: 12px;
        }
        .oped-upload-btn {
            background: #9F2B68;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 0;
            cursor: pointer;
            font-size: 13px;
        }
        .oped-upload-btn:hover {
            background: #e04f00;
        }
        .oped-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        @media (max-width: 782px) {
            .oped-row {
                grid-template-columns: 1fr;
            }
        }
    </style>
    
    <div class="oped-meta-container">
        
        <!-- Infographics Row -->
        <div class="oped-row">
            <!-- Small Infographic -->
            <div class="oped-meta-section">
                <h4><span class="dashicons dashicons-format-image"></span> Small Infographic</h4>
                <p>Upload a compact infographic for the sidebar (recommended: 340px width)</p>
                <input type="hidden" name="oped_small_infographic" id="oped_small_infographic" value="<?php echo esc_attr( $small_infographic ); ?>">
                <button type="button" class="oped-upload-btn" data-target="oped_small_infographic" data-type="image">
                    <?php echo $small_infographic ? 'Change Image' : 'Upload Image'; ?>
                </button>
                <?php if ( $small_infographic ) : ?>
                    <span class="oped-remove-media" data-target="oped_small_infographic">&times; Remove</span>
                <?php endif; ?>
                <div class="oped-media-preview" id="oped_small_infographic_preview">
                    <?php 
                    if ( $small_infographic ) {
                        $img = wp_get_attachment_image_src( $small_infographic, 'medium' );
                        if ( $img ) {
                            echo '<img src="' . esc_url( $img[0] ) . '" alt="Preview">';
                        }
                    }
                    ?>
                </div>
            </div>
            
            <!-- Large Infographic -->
            <div class="oped-meta-section">
                <h4><span class="dashicons dashicons-format-image"></span> Large Infographic</h4>
                <p>Upload a full-width infographic for the main content area</p>
                <input type="hidden" name="oped_large_infographic" id="oped_large_infographic" value="<?php echo esc_attr( $large_infographic ); ?>">
                <button type="button" class="oped-upload-btn" data-target="oped_large_infographic" data-type="image">
                    <?php echo $large_infographic ? 'Change Image' : 'Upload Image'; ?>
                </button>
                <?php if ( $large_infographic ) : ?>
                    <span class="oped-remove-media" data-target="oped_large_infographic">&times; Remove</span>
                <?php endif; ?>
                <div class="oped-media-preview" id="oped_large_infographic_preview">
                    <?php 
                    if ( $large_infographic ) {
                        $img = wp_get_attachment_image_src( $large_infographic, 'medium' );
                        if ( $img ) {
                            echo '<img src="' . esc_url( $img[0] ) . '" alt="Preview">';
                        }
                    }
                    ?>
                </div>
            </div>
        </div>
        
        <!-- Audio Summary -->
        <div class="oped-meta-section">
            <h4><span class="dashicons dashicons-format-audio"></span> Audio Summary</h4>
            <p>Upload an audio file with a spoken summary (MP3 recommended)</p>
            <input type="hidden" name="oped_audio_summary" id="oped_audio_summary" value="<?php echo esc_attr( $audio_summary ); ?>">
            <button type="button" class="oped-upload-btn" data-target="oped_audio_summary" data-type="audio">
                <?php echo $audio_summary ? 'Change Audio' : 'Upload Audio'; ?>
            </button>
            <?php if ( $audio_summary ) : ?>
                <span class="oped-remove-media" data-target="oped_audio_summary">&times; Remove</span>
            <?php endif; ?>
            <div class="oped-media-preview" id="oped_audio_summary_preview">
                <?php 
                if ( $audio_summary ) {
                    $audio_url = wp_get_attachment_url( $audio_summary );
                    if ( $audio_url ) {
                        echo '<audio controls><source src="' . esc_url( $audio_url ) . '" type="audio/mpeg"></audio>';
                    }
                }
                ?>
            </div>
        </div>
        
        <!-- Video Summary -->
        <div class="oped-meta-section">
            <h4><span class="dashicons dashicons-video-alt3"></span> Video Summary</h4>
            <p>Enter a video URL (YouTube, Vimeo) or paste embed code</p>
            <textarea name="oped_video_summary" id="oped_video_summary" rows="3" style="width: 100%; font-family: monospace; font-size: 13px; padding: 10px; border-radius: 0; border: 1px solid #d1d5db;"><?php echo esc_textarea( $video_summary ); ?></textarea>
            <p style="margin-top: 8px; font-size: 12px; color: #9ca3af;">
                <strong>Examples:</strong> https://www.youtube.com/watch?v=VIDEO_ID or https://vimeo.com/VIDEO_ID
            </p>
        </div>
        
        <!-- Flash Card App (CSV Upload) -->
        <div class="oped-meta-section" style="border: 2px solid #9F2B68; background: #F5F0FA;">
            <h4 style="color: #9F2B68;"><span class="dashicons dashicons-forms"></span> Flash Card App (CSV Upload)</h4>
            <p><strong>Option 1:</strong> Upload a CSV file to automatically generate beautiful flashcards. <a href="#" id="quiz-csv-template">Download CSV Template</a></p>
            <input type="hidden" name="oped_quiz_data" id="oped_quiz_data" value="<?php echo esc_attr( get_post_meta( $post->ID, '_oped_quiz_data', true ) ); ?>">
            <button type="button" class="oped-upload-btn" id="quiz-csv-upload-btn" style="background: #1f2937;">
                Upload Flashcards CSV
            </button>
            <div id="quiz-builder-status" style="margin-top: 10px; font-size: 13px; color: #059669; font-weight: 600; display: none;">
                <span class="dashicons dashicons-yes"></span> Flashcards data loaded successfully!
            </div>
            
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #FFD6C4;">
            
            <p><strong>Option 2:</strong> Paste embed code from external platforms (Quizlet, Typeform, etc.)</p>
            <textarea name="oped_quiz_embed" id="oped_quiz_embed" rows="4" style="width: 100%; font-family: monospace; font-size: 13px; padding: 10px; border-radius: 0; border: 1px solid #d1d5db;"><?php echo esc_textarea( $quiz_embed ); ?></textarea>
        </div>

        <!-- Attached Document -->
        <div class="oped-meta-section">
            <h4><span class="dashicons dashicons-media-document"></span> Attached Document</h4>
            <p>Upload a document (PDF, Doc, PPT, Excel) for download</p>
            <input type="hidden" name="mlws_attached_document" id="mlws_attached_document" value="<?php echo esc_attr( $attached_document ); ?>">
            <button type="button" class="oped-upload-btn" data-target="mlws_attached_document" data-type="application">
                <?php echo $attached_document ? 'Change Document' : 'Upload Document'; ?>
            </button>
            <?php if ( $attached_document ) : ?>
                <span class="oped-remove-media" data-target="mlws_attached_document">&times; Remove</span>
            <?php endif; ?>
            <div class="oped-media-preview" id="mlws_attached_document_preview">
                <?php 
                if ( $attached_document ) {
                    $doc_url = wp_get_attachment_url( $attached_document );
                    $doc_filename = basename( get_attached_file( $attached_document ) );
                    if ( $doc_url ) {
                        echo '<div style="margin-top: 10px; display: flex; align-items: center; gap: 8px; background: white; padding: 8px; border-radius: 0; border: 1px solid #eee;">
                            <span class="dashicons dashicons-media-default"></span>
                            <a href="' . esc_url( $doc_url ) . '" target="_blank">' . esc_html( $doc_filename ) . '</a>
                        </div>';
                    }
                }
                ?>
            </div>
        </div>
        
    </div>
    
    <script>
    jQuery(document).ready(function($) {
        // Media Upload Handler
        $('.oped-upload-btn').on('click', function(e) {
            e.preventDefault();
            
            var button = $(this);
            var targetId = button.data('target');
            var mediaType = button.data('type');
            
            var mediaUploader = wp.media({
                title: 'Select File',
                button: { text: 'Use This File' },
                library: { type: mediaType === 'application' ? '' : mediaType }, // Allow all types if application, specifically filtering often buggy in WP media
                multiple: false
            });
            
            mediaUploader.on('select', function() {
                var attachment = mediaUploader.state().get('selection').first().toJSON();
                $('#' + targetId).val(attachment.id);
                
                var previewDiv = $('#' + targetId + '_preview');
                
                if (mediaType === 'audio') {
                    previewDiv.html('<audio controls><source src="' + attachment.url + '" type="audio/mpeg"></audio>');
                } else if (mediaType === 'image') {
                    previewDiv.html('<img src="' + attachment.url + '" alt="Preview">');
                } else {
                     previewDiv.html('<div style="margin-top: 10px; display: flex; align-items: center; gap: 8px; background: white; padding: 8px; border-radius: 0; border: 1px solid #eee;"><span class="dashicons dashicons-media-default"></span><a href="' + attachment.url + '" target="_blank">' + attachment.filename + '</a></div>');
                }
                
                button.text('Change File');
                
                // Add remove button if not present
                if (!button.next('.oped-remove-media').length) {
                    button.after('<span class="oped-remove-media" data-target="' + targetId + '">&times; Remove</span>');
                }
            });
            
            mediaUploader.open();
        });
        
        // Remove Media Handler
        $(document).on('click', '.oped-remove-media', function(e) {
            e.preventDefault();
            
            var targetId = $(this).data('target');
            $('#' + targetId).val('');
            $('#' + targetId + '_preview').html('');
            $(this).prev('.oped-upload-btn').text('Upload File');
            $(this).remove();
        });
        // Flashcards CSV Upload Handler
        $('#quiz-csv-upload-btn').on('click', function(e) {
            e.preventDefault();
            var mediaUploader = wp.media({
                title: 'Upload Flashcards CSV',
                button: { text: 'Use This CSV' },
                library: { type: 'text/csv' },
                multiple: false
            });
            
            mediaUploader.on('select', function() {
                var attachment = mediaUploader.state().get('selection').first().toJSON();
                
                // Fetch the CSV content
                fetch(attachment.url)
                    .then(response => response.text())
                    .then(csvData => {
                        // Very basic CSV parser
                        const rows = csvData.split('\n').filter(row => row.trim() !== '');
                        const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
                        
                        const quizData = rows.slice(1).map(row => {
                            const values = row.split(',').map(v => v.trim());
                            let obj = {};
                            headers.forEach((header, i) => {
                                obj[header] = values[i];
                            });
                            return obj;
                        });
                        
                        $('#oped_quiz_data').val(JSON.stringify(quizData));
                        $('#quiz-builder-status').fadeIn();
                        alert('Flashcards imported: ' + quizData.length + ' cards found.');
                    });
            });
            mediaUploader.open();
        });

        // Template Download
        $('#quiz-csv-template').on('click', function(e) {
            e.preventDefault();
            const csvContent = "Question,Answer\n" +
                               "What is EPA?,EPA (Eicosapentaenoic acid) is a long-chain omega-3 fatty acid crucial for anti-inflammatory support.\n" +
                               "Where is EPA found?,Primarily found in cold-water fatty fish and algae.";
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", "flashcards_template.csv");
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });

        if ($('#oped_quiz_data').val()) {
            $('#quiz-builder-status').show();
        }
    });
    </script>
    
    <?php
}

/**
 * Article Settings Meta Box Callback
 */
function mlws_article_settings_meta_box_callback( $post ) {
    $read_time = get_post_meta( $post->ID, '_oped_read_time', true );
    $author_bio = get_post_meta( $post->ID, '_oped_author_bio', true );
    ?>
    
    <style>
        .oped-setting-field {
            margin-bottom: 16px;
        }
        .oped-setting-field:last-child {
            margin-bottom: 0;
        }
        .oped-setting-field label {
            display: block;
            font-weight: 600;
            margin-bottom: 6px;
            font-size: 13px;
        }
        .oped-setting-field input,
        .oped-setting-field textarea {
            width: 100%;
            padding: 8px;
            border-radius: 0;
            border: 1px solid #d1d5db;
        }
        .oped-setting-field .description {
            margin-top: 4px;
            font-size: 12px;
            color: #6b7280;
        }
    </style>
    
    <div class="oped-setting-field">
        <label for="oped_read_time">Estimated Read Time (minutes)</label>
        <input type="number" name="oped_read_time" id="oped_read_time" value="<?php echo esc_attr( $read_time ); ?>" min="1" max="30">
        <p class="description">For ~600 words, typically 2-3 minutes</p>
    </div>
    
    <div class="oped-setting-field">
        <label for="oped_author_bio">Custom Author Bio</label>
        <textarea name="oped_author_bio" id="oped_author_bio" rows="4"><?php echo esc_textarea( $author_bio ); ?></textarea>
        <p class="description">Override the default author bio for this article</p>
    </div>
    
    <?php
}

/**
 * Save Digital Assets Meta Box Data
 */
function mlws_save_digital_assets_meta_boxes( $post_id ) {
    // Verify nonce
    if ( ! isset( $_POST['mlws_digital_assets_meta_box_nonce'] ) ) {
        return;
    }
    
    if ( ! wp_verify_nonce( $_POST['mlws_digital_assets_meta_box_nonce'], 'mlws_digital_assets_meta_box' ) ) {
        return;
    }
    
    // Check autosave
    if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
        return;
    }
    
    // Check permissions
    if ( ! current_user_can( 'edit_post', $post_id ) ) {
        return;
    }
    
    // Save fields
    $fields = array(
        'oped_small_infographic' => '_oped_small_infographic',
        'oped_large_infographic' => '_oped_large_infographic',
        'oped_audio_summary' => '_oped_audio_summary',
        'oped_video_summary' => '_oped_video_summary',
        'oped_quiz_embed' => '_oped_quiz_embed',
        'oped_quiz_data' => '_oped_quiz_data',
        'oped_read_time' => '_oped_read_time',
        'oped_author_bio' => '_oped_author_bio',
        'mlws_attached_document' => '_mlws_attached_document',
    );
    
    foreach ( $fields as $field_name => $meta_key ) {
        if ( isset( $_POST[ $field_name ] ) ) {
            $value = $_POST[ $field_name ];
            
            // Sanitize based on field type
            if ( in_array( $field_name, array( 'oped_small_infographic', 'oped_large_infographic', 'oped_audio_summary', 'oped_read_time', 'mlws_attached_document' ) ) ) {
                $value = absint( $value );
            } elseif ( $field_name === 'oped_video_summary' || $field_name === 'oped_quiz_embed' ) {
                // Allow iframes and embeds
                $value = wp_kses( $value, array(
                    'iframe' => array(
                        'src' => true,
                        'width' => true,
                        'height' => true,
                        'frameborder' => true,
                        'allow' => true,
                        'allowfullscreen' => true,
                        'style' => true,
                        'title' => true,
                    ),
                    'div' => array(
                        'class' => true,
                        'style' => true,
                        'data-tf-live' => true,
                    ),
                    'script' => array(
                        'src' => true,
                    ),
                ) );
                // Also allow plain URLs
                if ( filter_var( $value, FILTER_VALIDATE_URL ) ) {
                    $value = esc_url_raw( $value );
                }
            } else {
                $value = sanitize_textarea_field( $value );
            }
            
            update_post_meta( $post_id, $meta_key, $value );
        }
    }
}
add_action( 'save_post', 'mlws_save_digital_assets_meta_boxes' );

/**
 * Add Meta Box Instructions
 */
function mlws_single_meta_box_instructions() {
    global $post_type;
    
    $cpts = array( 'news', 'research', 'oped', 'review', 'whitepaper', 'podcast', 'webinar', 'course', 'infographic', 'post' );
    if ( ! in_array( $post_type, $cpts ) ) {
        return;
    }
    ?>
    <style>
        .oped-template-guide {
            background: linear-gradient(135deg, #FFF5F0 0%, #FFECE3 100%);
            border: 1px solid #FFD6C4;
            border-radius: 0;
            padding: 20px;
            margin-bottom: 20px;
        }
        .oped-template-guide h3 {
            margin: 0 0 12px 0;
            color: #0F172A;
            font-size: 16px;
        }
        .oped-template-guide ul {
            margin: 0;
            padding-left: 20px;
        }
        .oped-template-guide li {
            margin-bottom: 6px;
            color: #4B5563;
            font-size: 13px;
        }
        .oped-template-guide li strong {
            color: #0F172A;
        }
    </style>
    
    <div class="oped-template-guide">
        <h3>📝 Asset Guide</h3>
        <ul>
            <li><strong>Featured Image:</strong> Set in the right sidebar (appears as hero image)</li>
            <li><strong>Small Infographic:</strong> Displayed in sidebar (340px width recommended)</li>
            <li><strong>Large Infographic:</strong> Full-width in main content area</li>
            <li><strong>Audio Summary:</strong> MP3 player in sidebar</li>
            <li><strong>Video Summary:</strong> YouTube/Vimeo URL or embed code</li>
            <li><strong>Quiz/Flashcards:</strong> Embed code from Typeform, Quizlet, etc.</li>
            <li><strong>Document:</strong> Upload PDFs, etc. for download button in sidebar</li>
        </ul>
    </div>
    <?php
}
add_action( 'edit_form_top', 'mlws_single_meta_box_instructions' );

/**
 * Customize Featured Image Meta Box Title for Op-Ed / Expert Opinions
 */
function mlws_custom_featured_image_title( $content, $post_id, $thumbnail_id ) {
    $post = get_post( $post_id );
    // Show on all our types for consistency
    return $content . '<p style="margin-top: 10px; font-size: 12px; color: #6b7280;">This image will appear as the full-width hero image at the top of your article.</p>';
}
add_filter( 'admin_post_thumbnail_html', 'mlws_custom_featured_image_title', 10, 3 );

/**
 * Add custom image size for hero
 */
function mlws_add_custom_image_sizes() {
    add_image_size( 'ibd-hero', 1920, 800, true );
    add_image_size( 'ibd-infographic-small', 340, 9999, false );
}
add_action( 'after_setup_theme', 'mlws_add_custom_image_sizes' );
