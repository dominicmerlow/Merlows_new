<?php
/**
 * AI Visibility System v2.0.0
 *
 * Drop-in WordPress theme include that makes Merlows discoverable,
 * citable, and accessible to AI systems — ChatGPT, Claude, Perplexity, and agents.
 *
 * Features:
 *  - Markdown REST API  (/wp-json/theme/v1/posts-markdown)
 *  - API key auth       (X-Markdown-API-Key header)
 *  - llms.txt           (auto-served, no physical file needed)
 *  - Schema.org JSON-LD (NewsArticle on every post)
 *  - AI Crawler control (robots.txt filter)
 *  - Settings dashboard (Merlows Newsroom → AI Visibility, 8 tabs)
 *  - AI Summaries       (Claude or OpenAI, on-publish / nightly / manual)
 *  - API Analytics      (logged to wp_aiv_api_log)
 *  - Citation Tracking  (logs AI-referral page views to wp_aiv_citations)
 *  - Post meta box      (per-post summary status + regenerate button)
 *
 * @package Merlows
 * @version 2.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
add_action( 'plugins_loaded', [ 'AIV_System', 'get_instance' ], 5 );
add_action( 'after_setup_theme', [ 'AIV_System', 'get_instance' ], 5 );

// ─── Main Class ──────────────────────────────────────────────────────────────

class AIV_System {

    const VERSION    = '2.0.0';
    const DB_VERSION = '1';
    const OPTION_KEY = 'aiv_settings';

    private static ?AIV_System $instance = null;
    private string $page_hook = '';

    public static function get_instance(): self {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        // Core hooks
        add_action( 'init',                    [ $this, 'bootstrap' ] );
        add_action( 'rest_api_init',           [ $this, 'register_rest_routes' ] );
        add_action( 'template_redirect',       [ $this, 'serve_llms_txt' ], 1 );
        add_action( 'wp_head',                 [ $this, 'output_schema' ], 5 );
        add_action( 'wp_head',                 [ $this, 'track_citation' ] );
        add_filter( 'robots_txt',              [ $this, 'filter_robots_txt' ], 10, 2 );

        // Admin
        add_action( 'admin_menu',              [ $this, 'add_admin_menu' ], 1000 );
        add_action( 'admin_enqueue_scripts',   [ $this, 'admin_scripts' ] );
        add_action( 'add_meta_boxes',          [ $this, 'add_meta_box' ] );

        // Summaries
        add_action( 'save_post',               [ $this, 'on_save_post' ], 20, 2 );
        add_action( 'aiv_generate_summary',    [ $this, 'generate_summary_for_post' ] );
        add_action( 'aiv_nightly_batch',       [ $this, 'run_nightly_batch' ] );

        // AJAX
        add_action( 'wp_ajax_aiv_regen_key',     [ $this, 'ajax_regen_key' ] );
        add_action( 'wp_ajax_aiv_regen_summary', [ $this, 'ajax_regen_summary' ] );
        add_action( 'wp_ajax_aiv_bulk_generate', [ $this, 'ajax_bulk_generate' ] );
        add_action( 'wp_ajax_aiv_save_settings', [ $this, 'ajax_save_settings' ] );
    }

    // ─── BOOTSTRAP ───────────────────────────────────────────────────────────

    public function bootstrap(): void {
        $this->maybe_create_tables();
        $this->maybe_schedule_cron();
        $this->maybe_init_settings();
    }

    private function maybe_create_tables(): void {
        if ( get_option( 'aiv_db_version', '0' ) >= self::DB_VERSION ) {
            return;
        }

        global $wpdb;
        $charset = $wpdb->get_charset_collate();

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        dbDelta( "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}aiv_api_log (
            id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ip           VARCHAR(45)     NOT NULL DEFAULT '',
            user_agent   VARCHAR(255)    NOT NULL DEFAULT '',
            endpoint     VARCHAR(255)    NOT NULL DEFAULT '',
            post_count   SMALLINT        NOT NULL DEFAULT 0,
            status       SMALLINT        NOT NULL DEFAULT 200,
            PRIMARY KEY (id),
            KEY created_at (created_at)
        ) $charset;" );

        dbDelta( "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}aiv_citations (
            id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
            post_id      BIGINT UNSIGNED NOT NULL DEFAULT 0,
            referrer     VARCHAR(500)    NOT NULL DEFAULT '',
            ai_tool      VARCHAR(100)    NOT NULL DEFAULT '',
            PRIMARY KEY (id),
            KEY post_id (post_id),
            KEY created_at (created_at)
        ) $charset;" );

        update_option( 'aiv_db_version', self::DB_VERSION );
    }

    private function maybe_schedule_cron(): void {
        if ( ! wp_next_scheduled( 'aiv_nightly_batch' ) ) {
            wp_schedule_event( strtotime( 'tomorrow midnight' ), 'daily', 'aiv_nightly_batch' );
        }
    }

    private function maybe_init_settings(): void {
        if ( ! get_option( self::OPTION_KEY ) ) {
            update_option( self::OPTION_KEY, $this->default_settings() );
        }
        if ( ! get_option( 'aiv_api_key' ) ) {
            update_option( 'aiv_api_key', $this->generate_api_key() );
        }
    }

    // ─── SETTINGS ────────────────────────────────────────────────────────────

    private function default_settings(): array {
        return [
            'publication_name'        => get_bloginfo( 'name' ),
            'publication_description' => get_bloginfo( 'description' ),
            'key_topics'              => 'Israel-Iran Relations, Cyrus Accord, Abraham Accords, Middle East Diplomacy, Geopolitics, Foreign Policy, International Relations',
            'logo_url'                => '',
            'post_types'              => [ 'post' ],
            'excluded_categories'     => [],
            'llms_description'        => '',
            'llms_topics'             => '',
            'llms_max_articles'       => 30,
            'schema_enabled'          => true,
            'crawlers'                => [
                'GPTBot'          => true,
                'ClaudeBot'       => true,
                'PerplexityBot'   => true,
                'Google-Extended' => true,
                'FacebookBot'     => false,
                'AppleBot'        => true,
            ],
            'summaries_enabled'  => false,
            'summaries_provider' => 'claude',
            'summaries_api_key'  => '',
            'summaries_trigger'  => 'on_publish',
        ];
    }

    private function get_setting( string $key, mixed $default = null ): mixed {
        $settings = get_option( self::OPTION_KEY, [] );
        return $settings[ $key ] ?? $default;
    }

    private function generate_api_key(): string {
        return 'aiv_' . bin2hex( random_bytes( 24 ) );
    }

    // ─── REST API ─────────────────────────────────────────────────────────────

    public function register_rest_routes(): void {

        // Bulk feed — all posts as markdown, paginated, authenticated
        register_rest_route( 'theme/v1', '/posts-markdown', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'rest_posts_markdown' ],
            'permission_callback' => [ $this, 'rest_permission_check' ],
            'args'                => [
                'after'      => [ 'type' => 'string',  'sanitize_callback' => 'sanitize_text_field' ],
                'per_page'   => [ 'type' => 'integer', 'default' => 20, 'minimum' => 1, 'maximum' => 100 ],
                'page'       => [ 'type' => 'integer', 'default' => 1,  'minimum' => 1 ],
                'categories' => [ 'type' => 'string',  'sanitize_callback' => 'sanitize_text_field' ],
            ],
        ] );

        // Per-post — single post as a standalone markdown file, public
        // URL: /wp-json/theme/v1/post-markdown/{slug}
        register_rest_route( 'theme/v1', '/post-markdown/(?P<slug>[a-z0-9\-]+)', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'rest_single_post_markdown' ],
            'permission_callback' => '__return_true', // Public — post is already public
            'args'                => [
                'slug' => [
                    'type'              => 'string',
                    'required'          => true,
                    'sanitize_callback' => 'sanitize_title',
                ],
            ],
        ] );
    }

    public function rest_permission_check( WP_REST_Request $request ): bool|WP_Error {
        $key = $request->get_header( 'X-Markdown-API-Key' );
        if ( ! $key || ! hash_equals( (string) get_option( 'aiv_api_key', '' ), $key ) ) {
            return new WP_Error( 'aiv_forbidden', 'Invalid or missing API key.', [ 'status' => 403 ] );
        }
        return true;
    }

    public function rest_posts_markdown( WP_REST_Request $request ): WP_REST_Response {
        $query_args = [
            'post_type'      => $this->get_setting( 'post_types', [ 'post' ] ),
            'post_status'    => 'publish',
            'posts_per_page' => (int) $request->get_param( 'per_page' ),
            'paged'          => (int) $request->get_param( 'page' ),
            'orderby'        => 'date',
            'order'          => 'DESC',
        ];

        $after = $request->get_param( 'after' );
        if ( $after ) {
            $query_args['date_query'] = [ [ 'after' => $after, 'inclusive' => false ] ];
        }

        $cats_param = $request->get_param( 'categories' );
        if ( $cats_param ) {
            $query_args['category_name'] = implode( ',', array_map( 'trim', explode( ',', $cats_param ) ) );
        }

        $excluded = $this->get_setting( 'excluded_categories', [] );
        if ( $excluded ) {
            $query_args['category__not_in'] = array_map( 'intval', $excluded );
        }

        $query = new WP_Query( $query_args );
        $posts = array_map( [ $this, 'post_to_markdown' ], $query->posts );

        $this->log_api_request( $request, count( $posts ) );

        $response = rest_ensure_response( $posts );
        $response->header( 'X-AIV-Total', (int) $query->found_posts );
        $response->header( 'X-AIV-Pages', (int) $query->max_num_pages );
        return $response;
    }

    private function post_to_markdown( WP_Post $post ): array {
        $categories = wp_get_post_categories( $post->ID, [ 'fields' => 'names' ] );
        $author     = get_the_author_meta( 'display_name', $post->post_author );
        $summary    = get_post_meta( $post->ID, '_aiv_summary', true );

        // Strip HTML and normalise whitespace
        $content = wp_strip_all_tags( apply_filters( 'the_content', $post->post_content ) );
        $content = preg_replace( '/[ \t]+/', ' ', $content );
        $content = preg_replace( '/\n{3,}/', "\n\n", trim( $content ) );

        // Build YAML frontmatter
        $fm_lines = [
            'title'      => '"' . str_replace( '"', '\\"', $post->post_title ) . '"',
            'date'       => get_post_time( 'c', true, $post ),
            'slug'       => $post->post_name,
            'url'        => '"' . get_permalink( $post ) . '"',
            'author'     => '"' . str_replace( '"', '\\"', $author ) . '"',
            'categories' => '[' . implode( ', ', array_map( fn( $c ) => '"' . esc_attr( $c ) . '"', $categories ) ) . ']',
        ];
        if ( $summary ) {
            $fm_lines['summary'] = '"' . str_replace( '"', '\\"', $summary ) . '"';
        }

        $yaml = "---\n";
        foreach ( $fm_lines as $k => $v ) {
            $yaml .= "{$k}: {$v}\n";
        }
        $yaml .= "---\n\n" . $content;

        return [
            'id'       => $post->ID,
            'slug'     => $post->post_name,
            'date'     => get_post_time( 'c', true, $post ),
            'markdown' => $yaml,
        ];
    }

    public function rest_single_post_markdown( WP_REST_Request $request ): WP_REST_Response|WP_Error {
        $slug = $request->get_param( 'slug' );

        // Find the post by slug across all exposed post types
        $post = get_page_by_path(
            $slug,
            OBJECT,
            $this->get_setting( 'post_types', [ 'post', 'page' ] )
        );

        if ( ! $post || $post->post_status !== 'publish' ) {
            return new WP_Error(
                'aiv_not_found',
                "No published post found with slug: {$slug}",
                [ 'status' => 404 ]
            );
        }

        $markdown = $this->post_to_markdown( $post );

        // Return as plain text markdown, not JSON — so AI tools can fetch it directly
        $response = new WP_REST_Response();
        $response->set_status( 200 );
        $response->header( 'Content-Type', 'text/markdown; charset=utf-8' );
        $response->header( 'Cache-Control', 'public, max-age=3600' );
        $response->header( 'X-AIV-Post-ID', (string) $post->ID );
        $response->header( 'X-AIV-Slug', $post->post_name );
        $response->set_data( $markdown['markdown'] );

        return $response;
    }

    private function log_api_request( WP_REST_Request $request, int $count ): void {
        global $wpdb;
        $wpdb->insert(
            $wpdb->prefix . 'aiv_api_log',
            [
                'created_at' => current_time( 'mysql' ),
                'ip'         => sanitize_text_field( $_SERVER['REMOTE_ADDR'] ?? '' ),
                'user_agent' => substr( sanitize_text_field( $request->get_header( 'user_agent' ) ?? '' ), 0, 255 ),
                'endpoint'   => '/wp-json/theme/v1/posts-markdown',
                'post_count' => $count,
                'status'     => 200,
            ],
            [ '%s', '%s', '%s', '%s', '%d', '%d' ]
        );
    }

    // ─── llms.txt ─────────────────────────────────────────────────────────────

    public function serve_llms_txt(): void {
        // Match /llms.txt at site root, regardless of subdirectory installs
        $uri = parse_url( $_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH );
        $expected = rtrim( parse_url( home_url(), PHP_URL_PATH ) ?? '', '/' ) . '/llms.txt';

        if ( $uri !== $expected && $uri !== '/llms.txt' ) {
            return;
        }

        $name        = $this->get_setting( 'publication_name', get_bloginfo( 'name' ) );
        $description = $this->get_setting( 'llms_description' ) ?: $this->get_setting( 'publication_description', '' );
        $topics      = $this->get_setting( 'llms_topics' ) ?: $this->get_setting( 'key_topics', '' );

        status_header( 200 );
        header( 'Content-Type: text/plain; charset=utf-8' );
        header( 'Cache-Control: public, max-age=3600' );
        header( 'X-Robots-Tag: noindex' );

        echo $this->render_llms_document( $name, $description, $topics );

        exit;
    }

    /**
     * Build the llms.txt document body from resolved settings.
     * Shared by serve_llms_txt() (live) and build_llms_preview() (admin) so the
     * two can never drift apart.
     */
    private function render_llms_document( string $name, string $description, string $topics ): string {
        $home         = home_url();
        $api_url      = rest_url( 'theme/v1/posts-markdown' );
        $per_post_url = rest_url( 'theme/v1/post-markdown/{slug}' );
        $date         = current_time( 'Y-m-d' );

        $topic_list  = array_filter( array_map( 'trim', explode( ',', $topics ) ) );
        $topic_lines = $topic_list
            ? implode( "\n", array_map( fn( $t ) => "- {$t}", $topic_list ) )
            : '- (none configured)';

        $out  = "# {$name}\n\n";
        $out .= "> {$description}\n\n";
        $out .= "## About\n\n{$description}\n\n";
        $out .= "## Topics\n\n{$topic_lines}\n\n";

        $articles = $this->get_llms_article_lines();
        if ( $articles ) {
            $out .= "## Recent Articles\n\n";
            $out .= "Each link returns clean Markdown (no authentication) suitable for direct LLM ingestion.\n\n";
            $out .= "{$articles}\n\n";
        }

        $out .= "## Key URLs\n\n";
        $out .= "- Homepage: {$home}\n";
        $out .= "- Articles: {$home}/news/\n";
        $out .= "- Bulk Markdown API: {$api_url}\n";
        $out .= "- Per-Post Markdown: {$per_post_url}\n\n";

        $out .= "## API Access\n\n";
        $out .= "### Bulk Feed (authenticated)\n";
        $out .= "Endpoint: {$api_url}\n";
        $out .= "Authentication: X-Markdown-API-Key header (contact publisher for key)\n";
        $out .= "Supports ?after=ISO8601 for daily incremental fetches, ?per_page=, ?page=, ?categories=\n\n";
        $out .= "### Per-Post Markdown (public)\n";
        $out .= "Endpoint: {$per_post_url}\n";
        $out .= "No authentication required. Replace {slug} with any post slug.\n";
        $out .= "Returns text/markdown directly — suitable for direct LLM ingestion.\n\n";

        $out .= "## Freshness\n\n";
        $out .= "Last updated: {$date}\n";

        return $out;
    }

    /**
     * Markdown link lines for the most recent published posts, each pointing at
     * the public per-post markdown endpoint. Respects configured post types and
     * excluded categories (same rules as the bulk feed).
     */
    private function get_llms_article_lines(): string {
        $limit = (int) $this->get_setting( 'llms_max_articles', 30 );
        if ( $limit < 1 ) {
            return '';
        }

        $args = [
            'post_type'        => $this->get_setting( 'post_types', [ 'post' ] ),
            'post_status'      => 'publish',
            'posts_per_page'   => $limit,
            'orderby'          => 'date',
            'order'            => 'DESC',
            'no_found_rows'    => true,
            'ignore_sticky_posts' => true,
        ];

        $excluded = $this->get_setting( 'excluded_categories', [] );
        if ( $excluded ) {
            $args['category__not_in'] = array_map( 'intval', (array) $excluded );
        }

        $query = new WP_Query( $args );
        $lines = [];
        foreach ( $query->posts as $post ) {
            $md    = rest_url( 'theme/v1/post-markdown/' . $post->post_name );
            $when  = get_the_date( 'Y-m-d', $post );
            $title = html_entity_decode( get_the_title( $post ), ENT_QUOTES, 'UTF-8' );
            $lines[] = "- [{$title}]({$md}) ({$when})";
        }
        wp_reset_postdata();

        return implode( "\n", $lines );
    }

    // ─── SCHEMA.ORG ───────────────────────────────────────────────────────────

    public function output_schema(): void {
        if ( ! $this->get_setting( 'schema_enabled', true ) ) {
            return;
        }
        if ( ! is_singular() ) {
            return;
        }

        global $post;
        if ( ! $post instanceof WP_Post ) {
            return;
        }

        $pub_name  = $this->get_setting( 'publication_name', get_bloginfo( 'name' ) );
        $logo_url  = $this->get_setting( 'logo_url', '' );
        $thumbnail = get_the_post_thumbnail_url( $post, 'large' );
        $author    = get_the_author_meta( 'display_name', $post->post_author );
        $summary   = get_post_meta( $post->ID, '_aiv_summary', true );
        $excerpt   = wp_strip_all_tags( get_the_excerpt( $post ) );

        $schema = [
            '@context'            => 'https://schema.org',
            '@type'               => 'NewsArticle',
            'headline'            => get_the_title( $post ),
            'datePublished'       => get_post_time( 'c', true, $post ),
            'dateModified'        => get_post_modified_time( 'c', true, $post ),
            'url'                 => get_permalink( $post ),
            'isAccessibleForFree' => true,
            'author'              => [ '@type' => 'Person', 'name' => $author ],
            'publisher'           => [ '@type' => 'Organization', 'name' => $pub_name ],
        ];

        if ( $excerpt ) {
            $schema['description'] = $excerpt;
        }
        if ( $thumbnail ) {
            $schema['image'] = $thumbnail;
        }
        if ( $logo_url ) {
            $schema['publisher']['logo'] = [ '@type' => 'ImageObject', 'url' => $logo_url ];
        }
        if ( $summary ) {
            $schema['abstract'] = $summary;
        }

        echo '<script type="application/ld+json">'
            . wp_json_encode( $schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT )
            . "</script>\n";
    }

    // ─── ROBOTS.TXT ───────────────────────────────────────────────────────────

    public function filter_robots_txt( string $output, bool $public ): string {
        $crawlers = $this->get_setting( 'crawlers', [] );
        $lines    = [ "\n# AI Crawler Permissions — Merlows AI Visibility v" . self::VERSION ];

        foreach ( $crawlers as $bot => $allowed ) {
            $rule    = $allowed ? 'Allow: /' : 'Disallow: /';
            $lines[] = "\nUser-agent: {$bot}\n{$rule}";
        }

        return $output . implode( "\n", $lines ) . "\n";
    }

    // ─── CITATION TRACKING ────────────────────────────────────────────────────

    public function track_citation(): void {
        if ( ! is_singular() ) {
            return;
        }

        $referer = wp_get_raw_referer();
        if ( ! $referer ) {
            return;
        }

        $ai_domains = [
            'perplexity.ai'   => 'Perplexity',
            'chat.openai.com' => 'ChatGPT',
            'chatgpt.com'     => 'ChatGPT',
            'claude.ai'       => 'Claude',
            'you.com'         => 'You.com',
            'phind.com'       => 'Phind',
            'bing.com'        => 'Bing AI',
            'copilot.microsoft.com' => 'Copilot',
        ];

        $matched_tool = null;
        foreach ( $ai_domains as $domain => $tool ) {
            if ( str_contains( $referer, $domain ) ) {
                $matched_tool = $tool;
                break;
            }
        }

        if ( ! $matched_tool ) {
            return;
        }

        global $post, $wpdb;

        // Deduplicate: only log once per session per post
        $session_key = 'aiv_cited_' . $post->ID;
        if ( isset( $_SESSION[ $session_key ] ) ) {
            return;
        }

        $wpdb->insert(
            $wpdb->prefix . 'aiv_citations',
            [
                'created_at' => current_time( 'mysql' ),
                'post_id'    => (int) $post->ID,
                'referrer'   => esc_url_raw( $referer ),
                'ai_tool'    => $matched_tool,
            ],
            [ '%s', '%d', '%s', '%s' ]
        );
    }

    // ─── AI SUMMARIES ─────────────────────────────────────────────────────────

    public function on_save_post( int $post_id, WP_Post $post ): void {
        if ( wp_is_post_autosave( $post_id ) || wp_is_post_revision( $post_id ) ) {
            return;
        }
        if ( $post->post_status !== 'publish' ) {
            return;
        }
        if ( ! $this->get_setting( 'summaries_enabled' ) ) {
            return;
        }
        if ( $this->get_setting( 'summaries_trigger' ) !== 'on_publish' ) {
            return;
        }
        // Fire async so we don't block the post save response
        wp_schedule_single_event( time() + 5, 'aiv_generate_summary', [ $post_id ] );
    }

    public function generate_summary_for_post( int $post_id ): ?string {
        $post = get_post( $post_id );
        if ( ! $post ) {
            return null;
        }

        $provider = $this->get_setting( 'summaries_provider', 'claude' );
        $api_key  = $this->get_setting( 'summaries_api_key', '' );

        if ( ! $api_key ) {
            return null;
        }

        // Clean content, cap at ~6k chars to stay within token budget
        $content = wp_strip_all_tags( apply_filters( 'the_content', $post->post_content ) );
        $content = preg_replace( '/\s+/', ' ', trim( $content ) );
        $content = substr( $content, 0, 6000 );

        $prompt = "Write a concise 2-3 sentence factual summary of this article, optimised for AI citation. "
                . "Include: the key finding or topic, who it is relevant to (readers/analysts/researchers), "
                . "and attribute it to Merlows. Be precise, neutral, and avoid marketing language.\n\n"
                . "Article title: {$post->post_title}\n\nContent:\n{$content}";

        $summary = $provider === 'claude'
            ? $this->call_claude( $prompt, $api_key )
            : $this->call_openai( $prompt, $api_key );

        if ( $summary ) {
            update_post_meta( $post_id, '_aiv_summary', sanitize_textarea_field( $summary ) );
        }

        return $summary;
    }

    private function call_claude( string $prompt, string $api_key ): ?string {
        $response = wp_remote_post( 'https://api.anthropic.com/v1/messages', [
            'timeout' => 30,
            'headers' => [
                'x-api-key'         => $api_key,
                'anthropic-version' => '2023-06-01',
                'content-type'      => 'application/json',
            ],
            'body' => wp_json_encode( [
                'model'      => 'claude-haiku-4-5-20251001',
                'max_tokens' => 250,
                'messages'   => [ [ 'role' => 'user', 'content' => $prompt ] ],
            ] ),
        ] );

        if ( is_wp_error( $response ) ) {
            return null;
        }

        $body = json_decode( wp_remote_retrieve_body( $response ), true );
        return $body['content'][0]['text'] ?? null;
    }

    private function call_openai( string $prompt, string $api_key ): ?string {
        $response = wp_remote_post( 'https://api.openai.com/v1/chat/completions', [
            'timeout' => 30,
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
                'Content-Type'  => 'application/json',
            ],
            'body' => wp_json_encode( [
                'model'      => 'gpt-4o-mini',
                'max_tokens' => 250,
                'messages'   => [ [ 'role' => 'user', 'content' => $prompt ] ],
            ] ),
        ] );

        if ( is_wp_error( $response ) ) {
            return null;
        }

        $body = json_decode( wp_remote_retrieve_body( $response ), true );
        return $body['choices'][0]['message']['content'] ?? null;
    }

    public function run_nightly_batch(): void {
        if ( $this->get_setting( 'summaries_trigger' ) !== 'nightly' ) {
            return;
        }

        $posts = get_posts( [
            'post_type'      => $this->get_setting( 'post_types', [ 'post' ] ),
            'post_status'    => 'publish',
            'posts_per_page' => 50,
            'meta_query'     => [ [ 'key' => '_aiv_summary', 'compare' => 'NOT EXISTS' ] ],
        ] );

        foreach ( $posts as $post ) {
            $this->generate_summary_for_post( $post->ID );
            sleep( 1 ); // Respect API rate limits
        }
    }

    // ─── POST META BOX ────────────────────────────────────────────────────────

    public function add_meta_box(): void {
        foreach ( (array) $this->get_setting( 'post_types', [ 'post' ] ) as $type ) {
            add_meta_box(
                'aiv_meta_box',
                'AI Visibility',
                [ $this, 'render_meta_box' ],
                $type,
                'side',
                'default'
            );
        }
    }

    public function render_meta_box( WP_Post $post ): void {
        $summary = get_post_meta( $post->ID, '_aiv_summary', true );
        $enabled = $this->get_setting( 'summaries_enabled', false );
        $nonce   = wp_create_nonce( 'aiv_meta_box' );
        ?>
        <div class="aiv-meta-box"
             data-post-id="<?php echo esc_attr( $post->ID ); ?>"
             data-nonce="<?php echo esc_attr( $nonce ); ?>">

            <p class="aiv-mb-status">
                <span class="dashicons dashicons-<?php echo $summary ? 'yes-alt' : 'minus'; ?>"
                      style="color:<?php echo $summary ? '#00a32a' : '#999'; ?>;"></span>
                <?php echo $summary ? 'AI Summary: Ready' : 'AI Summary: Not generated'; ?>
            </p>

            <?php if ( $summary ) : ?>
            <blockquote class="aiv-mb-summary"
                        style="font-size:11px;color:#555;margin:6px 0;padding:6px 8px;
                               background:#f8fafc;border-left:3px solid #7c3aed;font-style:italic;">
                <?php echo esc_html( $summary ); ?>
            </blockquote>
            <?php endif; ?>

            <?php if ( $enabled ) : ?>
            <button type="button" class="button button-secondary aiv-regen-btn"
                    style="width:100%;margin-top:8px;text-align:center;">
                <?php echo $summary ? 'Regenerate Summary' : 'Generate Summary'; ?>
            </button>
            <p class="aiv-regen-status"
               style="display:none;font-size:11px;color:#2271b1;margin-top:5px;"></p>
            <?php else : ?>
            <p style="font-size:11px;color:#999;margin-top:8px;">
                Enable AI Summaries in
                <a href="<?php echo esc_url( admin_url( 'admin.php?page=ai-visibility#summaries' ) ); ?>">
                    AI Visibility settings</a>.
            </p>
            <?php endif; ?>

        </div>
        <?php
    }

    // ─── ADMIN MENU ───────────────────────────────────────────────────────────

    public function add_admin_menu(): void {
        // Store the exact hook suffix WordPress generates — used in admin_scripts
        $this->page_hook = add_submenu_page(
            'merlows-newsroom',      // Parent: Merlows Newsroom menu
            'AI Visibility',         // Page title
            'AI Visibility',         // Menu label
            'manage_options',
            'ai-visibility',
            [ $this, 'render_admin_page' ]
        );
    }

    public function admin_scripts( string $hook ): void {
        $screen = get_current_screen();
        if ( $hook !== $this->page_hook
             && ( ! $screen || $screen->base !== 'post' ) ) {
            return;
        }

        // Register a dummy handle so inline style/script always has a guaranteed anchor
        wp_register_style( 'aiv-admin', false, [], self::VERSION );
        wp_enqueue_style( 'aiv-admin' );
        wp_add_inline_style( 'aiv-admin', $this->admin_css() );

        wp_enqueue_script( 'jquery' );
        wp_register_script( 'aiv-admin', false, [ 'jquery' ], self::VERSION, true );
        wp_enqueue_script( 'aiv-admin' );
        wp_add_inline_script( 'aiv-admin', $this->admin_js() );
    }

    // ─── ADMIN CSS ────────────────────────────────────────────────────────────

    private function admin_css(): string {
        return '
/* ── AIV Admin ─────────────────────────────────── */
.aiv-wrap { max-width: 960px; }
.aiv-header {
    background: linear-gradient(135deg, #1e1b4b 0%, #4c1d95 100%);
    color: #fff; padding: 24px 28px; border-radius: 8px;
    margin-bottom: 24px; display: flex; align-items: center; gap: 16px;
}
.aiv-header h1 { margin: 0; font-size: 22px; color: #fff; font-weight: 700; }
.aiv-header p  { margin: 4px 0 0; color: #c4b5fd; font-size: 14px; }
.aiv-badge { background: #7c3aed; color: #fff; font-size: 11px;
    padding: 3px 10px; border-radius: 20px; font-weight: 600; letter-spacing: .5px; }

/* Tabs */
.aiv-tabs { display: flex; gap: 0; border-bottom: 2px solid #e5e7eb;
    margin-bottom: 24px; overflow-x: auto; }
.aiv-tab {
    padding: 10px 16px; cursor: pointer; border: none; background: none;
    font-size: 13px; color: #6b7280; font-weight: 500;
    border-bottom: 2px solid transparent; margin-bottom: -2px;
    white-space: nowrap; transition: color .15s, border-color .15s;
}
.aiv-tab:hover { color: #4c1d95; }
.aiv-tab.active { color: #4c1d95; border-bottom-color: #4c1d95; font-weight: 600; }
.aiv-panel { display: none; }
.aiv-panel.active { display: block; }

/* Cards */
.aiv-card {
    background: #fff; border: 1px solid #e5e7eb;
    border-radius: 8px; padding: 22px 24px; margin-bottom: 18px;
}
.aiv-card h3 {
    margin: 0 0 14px; font-size: 14px; color: #111827;
    display: flex; align-items: center; gap: 8px;
}
.aiv-field { margin-bottom: 14px; }
.aiv-field label {
    display: block; font-weight: 600; font-size: 13px;
    color: #374151; margin-bottom: 5px;
}
.aiv-field input[type=text],
.aiv-field input[type=password],
.aiv-field textarea,
.aiv-field select { width: 100%; max-width: 580px; }
.aiv-field .description { color: #6b7280; font-size: 12px; margin-top: 4px; }

/* Code / Key boxes */
.aiv-key-box {
    font-family: monospace; font-size: 13px; background: #f3f4f6;
    padding: 10px 14px; border-radius: 6px; border: 1px solid #d1d5db;
    word-break: break-all; max-width: 580px;
}
.aiv-endpoint-box {
    font-family: monospace; font-size: 12px; background: #1e1b4b;
    color: #a5f3fc; padding: 12px 16px; border-radius: 6px;
    word-break: break-all; max-width: 580px;
}
.aiv-curl-box {
    background: #1e293b; color: #94a3b8; padding: 16px;
    border-radius: 6px; font-family: monospace; font-size: 12px;
    overflow-x: auto; white-space: pre; line-height: 1.7; max-width: 680px;
}
.aiv-curl-box .hl { color: #38bdf8; }

/* Toggles */
.aiv-toggle-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 0; border-bottom: 1px solid #f3f4f6;
}
.aiv-toggle-row:last-child { border-bottom: none; }
.aiv-toggle { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
.aiv-toggle input { opacity: 0; width: 0; height: 0; }
.aiv-slider {
    position: absolute; inset: 0; background: #d1d5db;
    border-radius: 24px; cursor: pointer; transition: background .2s;
}
.aiv-slider:before {
    content: ""; position: absolute;
    height: 18px; width: 18px; left: 3px; bottom: 3px;
    background: #fff; border-radius: 50%; transition: transform .2s;
}
.aiv-toggle input:checked + .aiv-slider { background: #7c3aed; }
.aiv-toggle input:checked + .aiv-slider:before { transform: translateX(20px); }

/* llms.txt preview */
.aiv-llms-preview {
    background: #0f172a; color: #e2e8f0; padding: 20px; border-radius: 8px;
    font-family: monospace; font-size: 12px; white-space: pre-wrap;
    max-height: 400px; overflow-y: auto; line-height: 1.6;
}

/* Stats */
.aiv-stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 14px; margin-bottom: 18px;
}
.aiv-stat {
    background: #f8fafc; border: 1px solid #e5e7eb;
    border-radius: 8px; padding: 16px; text-align: center;
}
.aiv-stat-value { font-size: 28px; font-weight: 700; color: #4c1d95; }
.aiv-stat-label { font-size: 12px; color: #6b7280; margin-top: 4px; }

/* Table */
.aiv-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.aiv-table th {
    text-align: left; padding: 8px 12px; background: #f8fafc;
    border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #374151;
}
.aiv-table td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; color: #374151; }
.aiv-table tr:hover td { background: #f8fafc; }

/* Save bar */
.aiv-save-bar {
    position: sticky; bottom: 0; background: #fff;
    border-top: 1px solid #e5e7eb; padding: 14px 0;
    display: flex; align-items: center; gap: 12px; margin-top: 8px;
    z-index: 100;
}
.aiv-notice {
    padding: 10px 14px; border-radius: 6px;
    font-size: 13px; margin-bottom: 14px;
}
.aiv-notice-success {
    background: #d1fae5; color: #065f46; border-left: 4px solid #10b981;
}
.aiv-notice-error {
    background: #fee2e2; color: #991b1b; border-left: 4px solid #ef4444;
}
/* ────────────────────────────────────────────────── */
        ';
    }

    // ─── ADMIN JS ─────────────────────────────────────────────────────────────

    private function admin_js(): string {
        $ajax_url = esc_url( admin_url( 'admin-ajax.php' ) );
        return <<<JS
jQuery(function($) {

    // ── Tab switching ─────────────────────────────
    $(document).on('click', '.aiv-tab', function() {
        var tab = $(this).data('tab');
        $('.aiv-tab').removeClass('active');
        $('.aiv-panel').removeClass('active');
        $(this).addClass('active');
        $('#aiv-panel-' + tab).addClass('active');
        if (history.replaceState) {
            history.replaceState(null, null, '#' + tab);
        }
    });

    // Restore tab from URL hash
    var hash = window.location.hash.replace('#', '');
    if (hash && $('.aiv-tab[data-tab="' + hash + '"]').length) {
        $('.aiv-tab[data-tab="' + hash + '"]').trigger('click');
    } else {
        $('.aiv-tab:first').trigger('click');
    }

    // ── Save settings ─────────────────────────────
    $(document).on('click', '.aiv-save-btn', function() {
        var btn = $(this);
        btn.prop('disabled', true).text('Saving…');
        $.post('{$ajax_url}', {
            action: 'aiv_save_settings',
            nonce:  $('#aiv_nonce').val(),
            data:   $('#aiv-settings-form').serializeArray()
        }, function(resp) {
            btn.prop('disabled', false).text('Save Settings');
            var msg = resp.success
                ? '<div class="aiv-notice aiv-notice-success">Settings saved successfully.</div>'
                : '<div class="aiv-notice aiv-notice-error">Save failed — please try again.</div>';
            $('.aiv-save-notice').html(msg).show();
            setTimeout(function() { $('.aiv-save-notice').fadeOut(); }, 3500);
        });
    });

    // ── Regenerate API key ────────────────────────
    $(document).on('click', '#aiv-regen-key', function() {
        if (!confirm('Regenerate API key? All existing integrations will need to be updated with the new key.')) return;
        $.post('{$ajax_url}', {
            action: 'aiv_regen_key',
            nonce:  $('#aiv_nonce').val()
        }, function(resp) {
            if (resp.success) {
                $('#aiv-api-key-display').text(resp.data.key);
                $('.aiv-key-placeholder').text(resp.data.key);
            }
        });
    });

    // ── Meta box — regenerate summary ────────────
    $(document).on('click', '.aiv-regen-btn', function() {
        var box    = $(this).closest('.aiv-meta-box');
        var postId = box.data('post-id');
        var nonce  = box.data('nonce');
        var btn    = $(this);
        var status = box.find('.aiv-regen-status');
        btn.prop('disabled', true).text('Generating…');
        status.show().text('Contacting AI provider…');
        $.post('{$ajax_url}', {
            action:  'aiv_regen_summary',
            post_id: postId,
            nonce:   nonce
        }, function(resp) {
            btn.prop('disabled', false).text('Regenerate Summary');
            if (resp.success) {
                status.text('Done. Reload to see the updated summary.');
                box.find('.aiv-mb-status')
                   .html('<span class="dashicons dashicons-yes-alt" style="color:#00a32a;"></span> AI Summary: Ready');
            } else {
                status.css('color','#c0392b').text('Error: ' + (resp.data || 'unknown error'));
            }
        }).fail(function() {
            btn.prop('disabled', false).text('Regenerate Summary');
            status.css('color','#c0392b').text('Request failed — check your API key.');
        });
    });

    // ── Bulk generate ─────────────────────────────
    $(document).on('click', '#aiv-bulk-generate', function() {
        var btn = $(this);
        btn.prop('disabled', true).text('Generating…');
        $('#aiv-bulk-status').show().text('Running bulk generation — this may take several minutes…');
        $.post('{$ajax_url}', {
            action: 'aiv_bulk_generate',
            nonce:  $('#aiv_nonce').val()
        }, function(resp) {
            btn.prop('disabled', false).text('Generate All Summaries');
            if (resp.success) {
                $('#aiv-bulk-status').text(
                    'Done! ' + resp.data.count + ' summaries generated. '
                    + (resp.data.remaining > 0 ? resp.data.remaining + ' remaining — click again to continue.' : 'All posts now have summaries.')
                );
            }
        });
    });

});
JS;
    }

    // ─── ADMIN PAGE ───────────────────────────────────────────────────────────

    public function render_admin_page(): void {
        if ( ! current_user_can( 'manage_options' ) ) {
            return;
        }

        $settings = get_option( self::OPTION_KEY, $this->default_settings() );
        $api_key  = (string) get_option( 'aiv_api_key', '' );
        $home_url = home_url();
        $api_url  = rest_url( 'theme/v1/posts-markdown' );
        $llms_url = $home_url . '/llms.txt';
        $nonce    = wp_create_nonce( 'aiv_admin' );

        global $wpdb;
        $total_requests  = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}aiv_api_log" );
        $today_requests  = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}aiv_api_log WHERE DATE(created_at) = %s",
            current_time( 'Y-m-d' )
        ) );
        $total_citations = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}aiv_citations" );
        $recent_logs     = $wpdb->get_results( "SELECT * FROM {$wpdb->prefix}aiv_api_log ORDER BY created_at DESC LIMIT 25" );
        $recent_cits     = $wpdb->get_results(
            "SELECT c.*, p.post_title FROM {$wpdb->prefix}aiv_citations c
             LEFT JOIN {$wpdb->posts} p ON p.ID = c.post_id
             ORDER BY c.created_at DESC LIMIT 25"
        );

        $missing_summaries = (int) ( new WP_Query( [
            'post_type'      => (array) ( $settings['post_types'] ?? [ 'post' ] ),
            'post_status'    => 'publish',
            'posts_per_page' => -1,
            'fields'         => 'ids',
            'meta_query'     => [ [ 'key' => '_aiv_summary', 'compare' => 'NOT EXISTS' ] ],
        ] ) )->found_posts;

        $all_bots = [
            'GPTBot'          => [ 'ChatGPT / OpenAI',   'Powers ChatGPT responses and OpenAI training data.' ],
            'ClaudeBot'       => [ 'Claude / Anthropic',  'Powers Claude AI responses and citation lookups.' ],
            'PerplexityBot'   => [ 'Perplexity AI',       'Powers Perplexity search answers and source citations.' ],
            'Google-Extended' => [ 'Google AI Overviews', 'Powers Google SGE, AI Overviews, and Gemini.' ],
            'FacebookBot'     => [ 'Meta AI',             'Powers Meta AI across Facebook, Instagram, WhatsApp.' ],
            'AppleBot'        => [ 'Apple Intelligence',  'Powers Siri, Apple Intelligence, and Spotlight.' ],
        ];

        $yesterday = date( 'Y-m-d', strtotime( '-1 day' ) );

        ?>
        <div class="wrap aiv-wrap">
            <input type="hidden" id="aiv_nonce" value="<?php echo esc_attr( $nonce ); ?>">

            <div class="aiv-header">
                <div>
                    <h1>AI Visibility <span class="aiv-badge">v<?php echo esc_html( self::VERSION ); ?></span></h1>
                    <p>Make Merlows discoverable, citable, and accessible to AI systems — ChatGPT, Claude, Perplexity, and agents.</p>
                </div>
            </div>

            <div class="aiv-save-notice" style="display:none;"></div>

            <nav class="aiv-tabs">
                <?php
                $tabs = [
                    'general'   => '<span class="dashicons dashicons-admin-settings"></span> General',
                    'api'       => '<span class="dashicons dashicons-rest-api"></span> Markdown API',
                    'llms'      => '<span class="dashicons dashicons-text-page"></span> llms.txt',
                    'crawlers'  => '<span class="dashicons dashicons-search"></span> Crawlers',
                    'schema'    => '<span class="dashicons dashicons-chart-pie"></span> Schema.org',
                    'summaries' => '<span class="dashicons dashicons-format-chat"></span> AI Summaries',
                    'analytics' => '<span class="dashicons dashicons-chart-area"></span> Analytics',
                    'citations' => '<span class="dashicons dashicons-external"></span> Citations',
                ];
                foreach ( $tabs as $key => $label ) {
                    echo '<button class="aiv-tab" data-tab="' . esc_attr( $key ) . '">'
                        . wp_kses( $label, [ 'span' => [ 'class' => [] ] ] )
                        . '</button>';
                }
                ?>
            </nav>

            <form id="aiv-settings-form">

                <!-- ── GENERAL ────────────────────────────────────────────── -->
                <div id="aiv-panel-general" class="aiv-panel">
                    <div class="aiv-card">
                        <h3><span class="dashicons dashicons-admin-home"></span> Publication Information</h3>
                        <div class="aiv-field">
                            <label for="aiv-pub-name">Publication Name</label>
                            <input type="text" id="aiv-pub-name" name="publication_name"
                                   value="<?php echo esc_attr( $settings['publication_name'] ?? '' ); ?>">
                        </div>
                        <div class="aiv-field">
                            <label for="aiv-pub-desc">Description</label>
                            <textarea id="aiv-pub-desc" name="publication_description" rows="3"><?php
                                echo esc_textarea( $settings['publication_description'] ?? '' );
                            ?></textarea>
                            <p class="description">Used in llms.txt and Schema.org publisher markup. Keep it factual and concise.</p>
                        </div>
                        <div class="aiv-field">
                            <label for="aiv-topics">Key Topics <span style="font-weight:400;color:#6b7280;">(comma-separated)</span></label>
                            <input type="text" id="aiv-topics" name="key_topics"
                                   value="<?php echo esc_attr( $settings['key_topics'] ?? '' ); ?>">
                            <p class="description">Signals to AI tools what subject areas your publication covers.</p>
                        </div>
                        <div class="aiv-field">
                            <label for="aiv-logo">Logo URL</label>
                            <input type="text" id="aiv-logo" name="logo_url"
                                   placeholder="https://ibdhealthhub.com/wp-content/themes/..."
                                   value="<?php echo esc_attr( $settings['logo_url'] ?? '' ); ?>">
                            <p class="description">Full URL to your publisher logo image. Used in Schema.org markup for proper AI attribution.</p>
                        </div>
                    </div>
                    <div class="aiv-card">
                        <h3><span class="dashicons dashicons-admin-post"></span> Content Exposure</h3>
                        <div class="aiv-field">
                            <label>Post Types to Expose via Markdown API</label>
                            <?php
                            $active_types = (array) ( $settings['post_types'] ?? [ 'post' ] );
                            foreach ( get_post_types( [ 'public' => true ], 'objects' ) as $type ) {
                                $checked = in_array( $type->name, $active_types, true ) ? 'checked' : '';
                                printf(
                                    '<label style="display:inline-flex;align-items:center;gap:6px;margin-right:16px;font-weight:400;margin-bottom:6px;">
                                        <input type="checkbox" name="post_types[]" value="%s" %s>%s</label>',
                                    esc_attr( $type->name ),
                                    $checked,
                                    esc_html( $type->labels->name )
                                );
                            }
                            ?>
                        </div>
                        <div class="aiv-field">
                            <label>Excluded Categories <span style="font-weight:400;color:#6b7280;">(posts in these will not appear in the API)</span></label>
                            <?php
                            $excluded_cats = array_map( 'intval', (array) ( $settings['excluded_categories'] ?? [] ) );
                            foreach ( get_categories( [ 'hide_empty' => false ] ) as $cat ) {
                                $checked = in_array( $cat->term_id, $excluded_cats, true ) ? 'checked' : '';
                                printf(
                                    '<label style="display:inline-flex;align-items:center;gap:6px;margin-right:16px;font-weight:400;margin-bottom:6px;">
                                        <input type="checkbox" name="excluded_categories[]" value="%d" %s>%s</label>',
                                    $cat->term_id,
                                    $checked,
                                    esc_html( $cat->name )
                                );
                            }
                            ?>
                        </div>
                    </div>
                </div>

                <!-- ── MARKDOWN API ────────────────────────────────────────── -->
                <div id="aiv-panel-api" class="aiv-panel">
                    <div class="aiv-card">
                        <h3><span class="dashicons dashicons-rest-api"></span> Endpoint</h3>
                        <p class="aiv-endpoint-box"><?php echo esc_html( $api_url ); ?></p>
                        <p style="margin-top:10px;font-size:13px;color:#6b7280;">
                            Returns an array of posts as YAML-frontmatter Markdown with optional AI summaries.
                            Paginated via <code>X-AIV-Total</code> and <code>X-AIV-Pages</code> response headers.
                        </p>
                    </div>
                    <div class="aiv-card">
                        <h3><span class="dashicons dashicons-admin-network"></span> API Key</h3>
                        <p style="font-size:13px;color:#374151;margin-bottom:10px;">
                            Include this key in every request as the <code>X-Markdown-API-Key</code> header.
                        </p>
                        <div class="aiv-key-box" id="aiv-api-key-display"><?php echo esc_html( $api_key ); ?></div>
                        <button type="button" id="aiv-regen-key" class="button" style="margin-top:10px;">
                            Regenerate Key
                        </button>
                        <p class="description" style="margin-top:6px;">
                            Regenerating invalidates the current key immediately — update all integrations before clicking.
                        </p>
                    </div>
                    <div class="aiv-card">
                        <h3><span class="dashicons dashicons-admin-page"></span> Per-Post Endpoint <span class="aiv-badge" style="font-size:10px;">Public</span></h3>
                        <p style="font-size:13px;color:#374151;margin-bottom:10px;">
                            Each post has its own standalone markdown URL — no API key required.
                            AI agents can link directly to any individual article.
                        </p>
                        <p class="aiv-endpoint-box"><?php echo esc_html( rest_url( 'theme/v1/post-markdown/{slug}' ) ); ?></p>
                        <p style="margin-top:10px;font-size:13px;color:#6b7280;">
                            Replace <code>{slug}</code> with the post slug. Returns <code>text/markdown</code> directly — not JSON.
                        </p>
                    </div>
                    <div class="aiv-card">
                        <h3><span class="dashicons dashicons-editor-code"></span> curl Examples</h3>
                        <div class="aiv-curl-box"># ── Single post (public, no key needed) ──────────────────
curl "<?php echo esc_html( rest_url( 'theme/v1/post-markdown/my-article-slug' ) ); ?>"

# ── Bulk feed (authenticated) ─────────────────────────────
curl -H "<span class="hl">X-Markdown-API-Key: <span class="aiv-key-placeholder"><?php echo esc_html( $api_key ); ?></span></span>" \
  "<?php echo esc_url( $api_url ); ?>"

# Daily incremental fetch (posts since yesterday)
curl -H "<span class="hl">X-Markdown-API-Key: <span class="aiv-key-placeholder"><?php echo esc_html( $api_key ); ?></span></span>" \
  "<?php echo esc_url( $api_url ); ?>?after=<?php echo esc_html( $yesterday ); ?>"

# Paginated bulk export (page 2, 50 per page)
curl -H "<span class="hl">X-Markdown-API-Key: <span class="aiv-key-placeholder"><?php echo esc_html( $api_key ); ?></span></span>" \
  "<?php echo esc_url( $api_url ); ?>?per_page=50&page=2"</div>
                    </div>
                    <div class="aiv-card">
                        <h3><span class="dashicons dashicons-book"></span> Bulk Feed Query Parameters</h3>
                        <table class="aiv-table">
                            <thead><tr><th>Parameter</th><th>Example</th><th>Notes</th></tr></thead>
                            <tbody>
                                <tr><td><code>?after=</code></td><td><code>?after=2026-04-01</code></td>
                                    <td>ISO 8601 date — fetch posts published after this date. Ideal for daily incremental updates.</td></tr>
                                <tr><td><code>?per_page=</code></td><td><code>?per_page=50</code></td>
                                    <td>Posts per page. Default 20, max 100.</td></tr>
                                <tr><td><code>?page=</code></td><td><code>?page=2</code></td>
                                    <td>Pagination. Use with <code>X-AIV-Pages</code> header to iterate all posts.</td></tr>
                                <tr><td><code>?categories=</code></td><td><code>?categories=news,ibd</code></td>
                                    <td>Comma-separated category slugs to filter by topic.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- ── llms.txt ────────────────────────────────────────────── -->
                <div id="aiv-panel-llms" class="aiv-panel">
                    <div class="aiv-card">
                        <h3><span class="dashicons dashicons-text-page"></span> llms.txt Configuration</h3>
                        <p style="font-size:13px;color:#374151;margin-bottom:12px;">
                            The <code>/llms.txt</code> file describes your publication to AI tools — topics covered, key URLs, and how to access the Markdown API. Auto-served by WordPress with no physical file needed.
                        </p>
                        <p>
                            <a href="<?php echo esc_url( $llms_url ); ?>" target="_blank" class="button button-secondary">
                                View live /llms.txt &rarr;
                            </a>
                        </p>
                        <div class="aiv-field" style="margin-top:16px;">
                            <label for="aiv-llms-desc">Custom Description
                                <span style="font-weight:400;color:#6b7280;">(leave blank to use General description)</span>
                            </label>
                            <textarea id="aiv-llms-desc" name="llms_description" rows="4"><?php
                                echo esc_textarea( $settings['llms_description'] ?? '' );
                            ?></textarea>
                        </div>
                        <div class="aiv-field">
                            <label for="aiv-llms-topics">Custom Topics
                                <span style="font-weight:400;color:#6b7280;">(comma-separated, leave blank to use General topics)</span>
                            </label>
                            <input type="text" id="aiv-llms-topics" name="llms_topics"
                                   value="<?php echo esc_attr( $settings['llms_topics'] ?? '' ); ?>">
                        </div>
                        <div class="aiv-field">
                            <label for="aiv-llms-max">Recent Articles in llms.txt
                                <span style="font-weight:400;color:#6b7280;">(0–200; how many recent posts to list as Markdown links. Set 0 to hide the section.)</span>
                            </label>
                            <input type="number" id="aiv-llms-max" name="llms_max_articles" min="0" max="200" step="1"
                                   value="<?php echo esc_attr( (string) ( $settings['llms_max_articles'] ?? 30 ) ); ?>"
                                   style="max-width:120px;">
                        </div>
                    </div>
                    <div class="aiv-card">
                        <h3><span class="dashicons dashicons-visibility"></span> Live Preview</h3>
                        <div class="aiv-llms-preview"><?php
                            echo esc_html( $this->build_llms_preview( $settings ) );
                        ?></div>
                    </div>
                </div>

                <!-- ── CRAWLERS ────────────────────────────────────────────── -->
                <div id="aiv-panel-crawlers" class="aiv-panel">
                    <div class="aiv-card">
                        <h3><span class="dashicons dashicons-search"></span> AI Crawler Permissions</h3>
                        <p style="font-size:13px;color:#374151;margin-bottom:14px;">
                            Controls the <code>/robots.txt</code> entries for each AI crawler.
                            Enable crawlers for maximum AI visibility.
                            <a href="<?php echo esc_url( home_url( '/robots.txt' ) ); ?>" target="_blank">View robots.txt &rarr;</a>
                        </p>
                        <?php
                        $saved_crawlers = (array) ( $settings['crawlers'] ?? [] );
                        foreach ( $all_bots as $bot => [ $label, $desc ] ) {
                            $checked = ! empty( $saved_crawlers[ $bot ] ) ? 'checked' : '';
                            ?>
                            <div class="aiv-toggle-row">
                                <div>
                                    <strong><?php echo esc_html( $bot ); ?></strong>
                                    — <?php echo esc_html( $label ); ?>
                                    <p style="margin:2px 0 0;font-size:12px;color:#6b7280;"><?php echo esc_html( $desc ); ?></p>
                                </div>
                                <label class="aiv-toggle">
                                    <input type="checkbox"
                                           name="crawlers[<?php echo esc_attr( $bot ); ?>]"
                                           value="1" <?php echo $checked; ?>>
                                    <span class="aiv-slider"></span>
                                </label>
                            </div>
                            <?php
                        }
                        ?>
                    </div>
                </div>

                <!-- ── SCHEMA.ORG ──────────────────────────────────────────── -->
                <div id="aiv-panel-schema" class="aiv-panel">
                    <div class="aiv-card">
                        <h3><span class="dashicons dashicons-chart-pie"></span> Schema.org NewsArticle Markup</h3>
                        <p style="font-size:13px;color:#374151;margin-bottom:14px;">
                            Injects <code>NewsArticle</code> JSON-LD structured data into every post page so AI tools can cite IBDHealthHub accurately — with proper headline, dates, author, and publisher attribution.
                        </p>
                        <div class="aiv-toggle-row" style="padding:0;border:none;">
                            <div>
                                <strong>Enable Schema.org Markup</strong>
                                <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">
                                    Adds NewsArticle JSON-LD to every post — required for Google rich results and AI citation accuracy.
                                </p>
                            </div>
                            <label class="aiv-toggle">
                                <input type="checkbox" name="schema_enabled" value="1"
                                    <?php checked( ! empty( $settings['schema_enabled'] ) ); ?>>
                                <span class="aiv-slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="aiv-card">
                        <h3><span class="dashicons dashicons-editor-table"></span> Fields Injected</h3>
                        <table class="aiv-table">
                            <thead><tr><th>Schema Field</th><th>Source</th></tr></thead>
                            <tbody>
                                <tr><td><code>headline</code></td><td>Post title</td></tr>
                                <tr><td><code>datePublished</code></td><td>Post publish date (ISO 8601)</td></tr>
                                <tr><td><code>dateModified</code></td><td>Post last-modified date</td></tr>
                                <tr><td><code>url</code></td><td>Canonical post permalink</td></tr>
                                <tr><td><code>author.name</code></td><td>Post author display name</td></tr>
                                <tr><td><code>publisher.name</code></td><td>Publication Name (General settings)</td></tr>
                                <tr><td><code>publisher.logo</code></td><td>Logo URL (General settings)</td></tr>
                                <tr><td><code>image</code></td><td>Featured image (large size)</td></tr>
                                <tr><td><code>description</code></td><td>Post excerpt</td></tr>
                                <tr><td><code>abstract</code></td><td>AI summary (if enabled &amp; generated)</td></tr>
                            </tbody>
                        </table>
                        <p style="margin-top:12px;font-size:13px;">
                            <a href="https://validator.schema.org/" target="_blank" rel="noopener">
                                Validate at validator.schema.org &rarr;
                            </a>
                        </p>
                    </div>
                </div>

                <!-- ── AI SUMMARIES ────────────────────────────────────────── -->
                <div id="aiv-panel-summaries" class="aiv-panel">
                    <div class="aiv-card">
                        <h3><span class="dashicons dashicons-format-chat"></span> AI Summary Generation</h3>
                        <p style="font-size:13px;color:#374151;margin-bottom:16px;">
                            Auto-generates a 2-3 sentence summary per post, optimised for AI citation. Summaries appear in the Markdown API output (<code>summary</code> frontmatter field) and Schema.org <code>abstract</code> field.
                        </p>
                        <div class="aiv-toggle-row" style="padding:0 0 14px;border-bottom:1px solid #f3f4f6;margin-bottom:14px;">
                            <div>
                                <strong>Enable AI Summaries</strong>
                                <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">
                                    Adds AI-generated summaries to API output and Schema markup.
                                </p>
                            </div>
                            <label class="aiv-toggle">
                                <input type="checkbox" name="summaries_enabled" value="1"
                                    <?php checked( ! empty( $settings['summaries_enabled'] ) ); ?>>
                                <span class="aiv-slider"></span>
                            </label>
                        </div>
                        <div class="aiv-field">
                            <label for="aiv-sum-provider">AI Provider</label>
                            <select id="aiv-sum-provider" name="summaries_provider">
                                <option value="claude" <?php selected( $settings['summaries_provider'] ?? 'claude', 'claude' ); ?>>
                                    Claude Haiku (Anthropic) — Recommended
                                </option>
                                <option value="openai" <?php selected( $settings['summaries_provider'] ?? 'claude', 'openai' ); ?>>
                                    GPT-4o mini (OpenAI)
                                </option>
                            </select>
                        </div>
                        <div class="aiv-field">
                            <label for="aiv-sum-key">API Key</label>
                            <input type="password" id="aiv-sum-key" name="summaries_api_key"
                                   value="<?php echo esc_attr( $settings['summaries_api_key'] ?? '' ); ?>"
                                   placeholder="sk-ant-... (Claude) or sk-... (OpenAI)">
                            <p class="description">Stored in WordPress options. Leave blank to keep the existing key.</p>
                        </div>
                        <div class="aiv-field">
                            <label for="aiv-sum-trigger">Generation Trigger</label>
                            <select id="aiv-sum-trigger" name="summaries_trigger">
                                <option value="on_publish" <?php selected( $settings['summaries_trigger'] ?? 'on_publish', 'on_publish' ); ?>>
                                    On Publish — generate when a post is published
                                </option>
                                <option value="nightly" <?php selected( $settings['summaries_trigger'] ?? 'on_publish', 'nightly' ); ?>>
                                    Nightly Batch — process unsummarised posts each night via WP-Cron
                                </option>
                                <option value="manual" <?php selected( $settings['summaries_trigger'] ?? 'on_publish', 'manual' ); ?>>
                                    Manual only — use the post editor button or bulk generate below
                                </option>
                            </select>
                        </div>
                    </div>
                    <div class="aiv-card">
                        <h3><span class="dashicons dashicons-update"></span> Bulk Backfill</h3>
                        <p style="font-size:13px;color:#374151;">
                            <strong><?php echo number_format( $missing_summaries ); ?></strong> published posts are missing AI summaries.
                        </p>
                        <button type="button" id="aiv-bulk-generate" class="button button-primary">
                            Generate All Summaries
                        </button>
                        <p id="aiv-bulk-status" style="display:none;margin-top:10px;font-size:13px;color:#2271b1;"></p>
                        <p class="description" style="margin-top:8px;">
                            Processes up to 50 posts per run at ~1 second per post. Re-click to continue for large backlogs.
                        </p>
                    </div>
                </div>

                <!-- ── ANALYTICS ───────────────────────────────────────────── -->
                <div id="aiv-panel-analytics" class="aiv-panel">
                    <div class="aiv-stat-grid">
                        <div class="aiv-stat">
                            <div class="aiv-stat-value"><?php echo number_format( $total_requests ); ?></div>
                            <div class="aiv-stat-label">Total API Requests</div>
                        </div>
                        <div class="aiv-stat">
                            <div class="aiv-stat-value"><?php echo number_format( $today_requests ); ?></div>
                            <div class="aiv-stat-label">Requests Today</div>
                        </div>
                        <div class="aiv-stat">
                            <div class="aiv-stat-value"><?php echo number_format( $total_citations ); ?></div>
                            <div class="aiv-stat-label">AI Citations</div>
                        </div>
                    </div>
                    <div class="aiv-card">
                        <h3><span class="dashicons dashicons-chart-area"></span> Recent API Requests</h3>
                        <?php if ( $recent_logs ) : ?>
                        <table class="aiv-table">
                            <thead>
                                <tr><th>Time</th><th>IP</th><th>Posts Returned</th><th>User Agent</th></tr>
                            </thead>
                            <tbody>
                                <?php foreach ( $recent_logs as $log ) : ?>
                                <tr>
                                    <td><?php echo esc_html( human_time_diff( strtotime( $log->created_at ) ) . ' ago' ); ?></td>
                                    <td><code><?php echo esc_html( $log->ip ); ?></code></td>
                                    <td><?php echo (int) $log->post_count; ?></td>
                                    <td style="font-size:11px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                        <?php echo esc_html( $log->user_agent ); ?>
                                    </td>
                                </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                        <?php else : ?>
                        <p style="color:#6b7280;font-style:italic;">
                            No API requests logged yet. Make your first authenticated request to see data here.
                        </p>
                        <?php endif; ?>
                    </div>
                </div>

                <!-- ── CITATIONS ───────────────────────────────────────────── -->
                <div id="aiv-panel-citations" class="aiv-panel">
                    <div class="aiv-card">
                        <h3><span class="dashicons dashicons-external"></span> AI Tool Citations Detected</h3>
                        <p style="font-size:13px;color:#374151;margin-bottom:14px;">
                            Logged when visitors arrive from an AI tool (ChatGPT, Perplexity, Claude, etc.) with a matching referrer. Each entry represents a real visit driven by an AI citation.
                        </p>
                        <?php if ( $recent_cits ) : ?>
                        <table class="aiv-table">
                            <thead>
                                <tr><th>Time</th><th>AI Tool</th><th>Post</th><th>Referrer</th></tr>
                            </thead>
                            <tbody>
                                <?php foreach ( $recent_cits as $cit ) : ?>
                                <tr>
                                    <td><?php echo esc_html( human_time_diff( strtotime( $cit->created_at ) ) . ' ago' ); ?></td>
                                    <td><strong><?php echo esc_html( $cit->ai_tool ); ?></strong></td>
                                    <td>
                                        <a href="<?php echo esc_url( get_permalink( $cit->post_id ) ); ?>" target="_blank">
                                            <?php echo esc_html( $cit->post_title ?: '#' . $cit->post_id ); ?>
                                        </a>
                                    </td>
                                    <td style="font-size:11px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                        <a href="<?php echo esc_url( $cit->referrer ); ?>" target="_blank" rel="noopener">
                                            <?php echo esc_html( $cit->referrer ); ?>
                                        </a>
                                    </td>
                                </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                        <?php else : ?>
                        <p style="color:#6b7280;font-style:italic;">
                            No AI citations detected yet. Once AI tools reference your content and users follow those links,
                            the visits will appear here automatically.
                        </p>
                        <?php endif; ?>
                    </div>
                </div>

            </form><!-- #aiv-settings-form -->

            <div class="aiv-save-bar">
                <button type="button" class="button button-primary aiv-save-btn">Save Settings</button>
                <span style="font-size:13px;color:#6b7280;">Changes apply immediately across all AI visibility features.</span>
            </div>

        </div><!-- .aiv-wrap -->
        <?php
    }

    // ─── HELPERS ──────────────────────────────────────────────────────────────

    private function build_llms_preview( array $settings ): string {
        $name        = $settings['publication_name'] ?? get_bloginfo( 'name' );
        $description = ( $settings['llms_description'] ?? '' ) ?: ( $settings['publication_description'] ?? '' );
        $topics      = ( $settings['llms_topics'] ?? '' ) ?: ( $settings['key_topics'] ?? '' );

        return $this->render_llms_document( $name, $description, $topics );
    }

    // ─── AJAX HANDLERS ────────────────────────────────────────────────────────

    public function ajax_regen_key(): void {
        check_ajax_referer( 'aiv_admin', 'nonce' );
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( 'Unauthorized.' );
        }
        $key = $this->generate_api_key();
        update_option( 'aiv_api_key', $key );
        wp_send_json_success( [ 'key' => $key ] );
    }

    public function ajax_regen_summary(): void {
        check_ajax_referer( 'aiv_meta_box', 'nonce' );
        if ( ! current_user_can( 'edit_posts' ) ) {
            wp_send_json_error( 'Unauthorized.' );
        }
        $post_id = absint( $_POST['post_id'] ?? 0 );
        if ( ! $post_id ) {
            wp_send_json_error( 'Invalid post ID.' );
        }
        $summary = $this->generate_summary_for_post( $post_id );
        if ( $summary ) {
            wp_send_json_success( [ 'summary' => $summary ] );
        } else {
            wp_send_json_error( 'Failed to generate. Verify your API key in AI Summaries settings.' );
        }
    }

    public function ajax_bulk_generate(): void {
        check_ajax_referer( 'aiv_admin', 'nonce' );
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( 'Unauthorized.' );
        }

        $posts = get_posts( [
            'post_type'      => (array) $this->get_setting( 'post_types', [ 'post' ] ),
            'post_status'    => 'publish',
            'posts_per_page' => 50,
            'meta_query'     => [ [ 'key' => '_aiv_summary', 'compare' => 'NOT EXISTS' ] ],
        ] );

        $count = 0;
        foreach ( $posts as $post ) {
            if ( $this->generate_summary_for_post( $post->ID ) ) {
                $count++;
                sleep( 1 );
            }
        }

        $remaining = (int) ( new WP_Query( [
            'post_type'      => (array) $this->get_setting( 'post_types', [ 'post' ] ),
            'post_status'    => 'publish',
            'posts_per_page' => -1,
            'fields'         => 'ids',
            'meta_query'     => [ [ 'key' => '_aiv_summary', 'compare' => 'NOT EXISTS' ] ],
        ] ) )->found_posts;

        wp_send_json_success( [ 'count' => $count, 'remaining' => $remaining ] );
    }

    public function ajax_save_settings(): void {
        check_ajax_referer( 'aiv_admin', 'nonce' );
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( 'Unauthorized.' );
        }

        // Parse jQuery serializeArray format into a usable structure
        $raw = [];
        foreach ( (array) ( $_POST['data'] ?? [] ) as $item ) {
            $name  = $item['name']  ?? '';
            $value = wp_unslash( $item['value'] ?? '' );

            if ( preg_match( '/^crawlers\[(.+)\]$/', $name, $m ) ) {
                $raw['crawlers'][ $m[1] ] = true;
            } elseif ( str_ends_with( $name, '[]' ) ) {
                $key          = substr( $name, 0, -2 );
                $raw[ $key ][] = sanitize_text_field( $value );
            } else {
                $raw[ $name ] = $value;
            }
        }

        $existing = get_option( self::OPTION_KEY, $this->default_settings() );

        // Sanitise and build final settings
        $settings = [
            'publication_name'        => sanitize_text_field( $raw['publication_name'] ?? '' ),
            'publication_description' => sanitize_textarea_field( $raw['publication_description'] ?? '' ),
            'key_topics'              => sanitize_text_field( $raw['key_topics'] ?? '' ),
            'logo_url'                => esc_url_raw( $raw['logo_url'] ?? '' ),
            'post_types'              => array_map( 'sanitize_key', (array) ( $raw['post_types'] ?? [ 'post' ] ) ),
            'excluded_categories'     => array_map( 'absint', (array) ( $raw['excluded_categories'] ?? [] ) ),
            'llms_description'        => sanitize_textarea_field( $raw['llms_description'] ?? '' ),
            'llms_topics'             => sanitize_text_field( $raw['llms_topics'] ?? '' ),
            'llms_max_articles'       => min( 200, max( 0, absint( $raw['llms_max_articles'] ?? 30 ) ) ),
            'schema_enabled'          => isset( $raw['schema_enabled'] ),
            'summaries_enabled'       => isset( $raw['summaries_enabled'] ),
            'summaries_provider'      => in_array( $raw['summaries_provider'] ?? '', [ 'claude', 'openai' ], true )
                                            ? $raw['summaries_provider']
                                            : 'claude',
            'summaries_api_key'       => ! empty( $raw['summaries_api_key'] )
                                            ? sanitize_text_field( $raw['summaries_api_key'] )
                                            : ( $existing['summaries_api_key'] ?? '' ),
            'summaries_trigger'       => in_array( $raw['summaries_trigger'] ?? '', [ 'on_publish', 'nightly', 'manual' ], true )
                                            ? $raw['summaries_trigger']
                                            : 'on_publish',
            'crawlers'                => [],
        ];

        // All 6 bots default to false if not submitted (unchecked checkboxes are absent)
        $known_bots = [ 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'FacebookBot', 'AppleBot' ];
        foreach ( $known_bots as $bot ) {
            $settings['crawlers'][ $bot ] = (bool) ( $raw['crawlers'][ $bot ] ?? false );
        }

        update_option( self::OPTION_KEY, $settings );
        wp_send_json_success();
    }

}// end class AIV_System
