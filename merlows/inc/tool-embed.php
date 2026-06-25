<?php
/**
 * Tool Embedding Functions
 * Provides shortcode functionality for embedding React tools in WordPress posts
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly
}

/**
 * Tool Embed Shortcode
 * 
 * Usage:
 *   [tool_embed tool="ai-widget"]
 *   [tool_embed tool="ai-widget" height="900px"]
 *
 * @param array $atts Shortcode attributes
 * @return string iframe HTML
 */
function mlws_tool_embed_shortcode( $atts ) {
    // Separate standard attributes from potential query params
    $standard_atts = array(
        'tool'   => '',
        'height' => '800px',
    );
    
    // Merge defaults but keep all passed attributes
    $all_atts = shortcode_atts( $standard_atts, $atts );
    // Re-merge original atts to ensure we capture non-standard ones not in defaults
    if ( is_array( $atts ) ) {
        $all_atts = array_merge( $all_atts, $atts );
    }

    $tool = $all_atts['tool'];
    $height = $all_atts['height'];
    
    $tools = array(
        'ai-widget'               => '/assets/tools/ai-widget/index.html',
    );
    
    if ( ! isset( $tools[ $tool ] ) ) {
        return '';
    }
    
    $url = get_template_directory_uri() . $tools[ $tool ];

    // Remove 'tool' and 'height' from query params
    unset( $all_atts['tool'] );
    unset( $all_atts['height'] );

    // Append remaining attributes as query parameters
    if ( ! empty( $all_atts ) ) {
        $url = add_query_arg( $all_atts, $url );
    }
    
    return sprintf(
        '<div class="tool-embed-container" style="margin: 40px 0;">
            <iframe 
                src="%s" 
                style="width:100%%; height:%s; border:none; border-radius:0; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" 
                loading="lazy"
                title="%s"
                allow="clipboard-write"
            ></iframe>
        </div>',
        esc_url( $url ),
        esc_attr( $height ),
        esc_attr( ucwords( str_replace( '-', ' ', $tool ) ) )
    );
}
add_shortcode( 'tool_embed', 'mlws_tool_embed_shortcode' );

/**
 * Add custom CSS for tool embeds
 */
function mlws_tool_embed_styles() {
    echo '
    <style>
        .tool-embed-container {
            max-width: 100%;
            background: #f8f9fa;
            padding: 20px;
            border-radius: 0;
        }
        
        @media (max-width: 768px) {
            .tool-embed-container {
                padding: 10px;
                margin: 20px -10px;
            }
            
            .tool-embed-container iframe {
                border-radius: 0 !important;
            }
        }
    </style>
    ';
}
add_action( 'wp_head', 'mlws_tool_embed_styles' );
