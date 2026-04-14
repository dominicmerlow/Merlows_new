<?php
/**
 * Template Name: Pathway Results
 * Displays filtered posts based on Control Center selections
 */

get_header();

$selected_cats = isset($_GET['pathway_cat']) ? (array) $_GET['pathway_cat'] : array();
$selected_levels = isset($_GET['reading_level']) ? (array) $_GET['reading_level'] : array();

// Combine all terms to look for (assuming they are categories)
$all_terms = array_merge($selected_cats, $selected_levels);

$args = array(
    'post_type'      => 'any',
    'posts_per_page' => 20,
    'orderby'        => 'date',
    'order'          => 'DESC',
);

if (!empty($all_terms)) {
    $args['category_name'] = implode(',', $all_terms);
}

if (isset($_GET['s']) && !empty($_GET['s'])) {
    $args['s'] = sanitize_text_field($_GET['s']);
}

$query = new WP_Query($args);
?>

<main id="primary" class="site-main" style="background: #f8fafc; min-height: 100vh; padding: 60px 0;">
    <div class="container">
        <header class="page-header" style="margin-bottom: 48px; border-bottom: 2px solid #e2e8f0; padding-bottom: 24px;">
            <h1 style="font-size: 36px; color: #0F172A; font-weight: 800; font-family: 'Outfit', sans-serif;">YOUR PERSONALIZED PATHWAY</h1>
            <p style="color: #64748b; font-size: 18px; margin-top: 12px;">Results based on your selected interests and reading level.</p>
            
            <?php if (!empty($all_terms)) : ?>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 20px;">
                <?php foreach($all_terms as $term) : ?>
                    <span style="background: #9F2B68; color: white; padding: 6px 14px; border-radius: 0; font-size: 13px; font-weight: 600;"><?php echo esc_html($term); ?></span>
                <?php endforeach; ?>
                <a href="<?php echo home_url('/#pathway-control-center'); ?>" style="color: #64748b; font-size: 13px; display: flex; align-items: center; margin-left: 10px; font-weight: 600;">Edit Filters</a>
            </div>
            <?php endif; ?>
        </header>

        <?php if ($query->have_posts()) : ?>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 30px;">
                <?php while ($query->have_posts()) : $query->the_post(); ?>
                    <article style="background: white; border-radius: 0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; display: flex; flex-direction: column; transition: transform 0.3s;" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
                        <?php if (has_post_thumbnail()) : ?>
                            <a href="<?php the_permalink(); ?>" style="height: 200px; display: block; overflow: hidden;">
                                <?php the_post_thumbnail('medium_large', array('style' => 'width:100%; height:100%; object-fit:cover;')); ?>
                            </a>
                        <?php endif; ?>
                        
                        <div style="padding: 24px; flex-grow: 1; display: flex; flex-direction: column;">
                            <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 11px; font-weight: 700; color: #9F2B68; text-transform: uppercase; letter-spacing: 0.5px;"><?php echo get_post_type(); ?></span>
                                <span style="font-size: 12px; color: #94a3b8;"><?php echo get_the_date(); ?></span>
                            </div>
                            
                            <h2 style="font-size: 18px; font-weight: 700; margin: 0 0 12px 0; line-height: 1.4;">
                                <a href="<?php the_permalink(); ?>" style="text-decoration: none; color: #0F172A;"><?php the_title(); ?></a>
                            </h2>
                            
                            <p style="font-size: 14px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                                <?php echo wp_trim_words(get_the_excerpt(), 20); ?>
                            </p>
                            
                            <div style="margin-top: auto; display: flex; justify-content: space-between; align-items: center;">
                                <a href="<?php the_permalink(); ?>" style="font-size: 14px; font-weight: 700; color: #9F2B68; text-decoration: none;">Read Article →</a>
                                <?php if (is_user_logged_in()) : 
                                    $is_saved = ibdhh_is_bookmarked(get_the_ID());
                                ?>
                                    <span style="font-size: 18px; cursor: pointer;" title="<?php echo $is_saved ? 'Saved' : 'Save Article'; ?>"><?php echo $is_saved ? '★' : '☆'; ?></span>
                                <?php endif; ?>
                            </div>
                        </div>
                    </article>
                <?php endwhile; ?>
            </div>
            
            <div style="margin-top: 60px; text-align: center;">
                <?php 
                echo paginate_links(array(
                    'total' => $query->max_num_pages,
                    'current' => max(1, get_query_var('paged')),
                    'format' => '?paged=%#%',
                    'prev_text' => '← Previous',
                    'next_text' => 'Next →',
                    'type' => 'list',
                ));
                ?>
            </div>
            
        <?php else : ?>
            <div style="background: white; border-radius: 0; padding: 60px; text-align: center; border: 1px solid #e2e8f0;">
                <img src="<?php echo get_template_directory_uri(); ?>/assets/img/icons/search.svg" style="width: 64px; margin-bottom: 24px; opacity: 0.2;">
                <h2 style="font-size: 24px; color: #0F172A; margin-bottom: 12px;">No articles found matching your criteria.</h2>
                <p style="color: #64748b; margin-bottom: 32px;">Try adjusting your filters in the Control Center.</p>
                <a href="<?php echo home_url('/#pathway-control-center'); ?>" class="btn btn-primary">Back to Control Center</a>
            </div>
        <?php endif; wp_reset_postdata(); ?>
    </div>
</main>

<?php get_footer(); ?>
