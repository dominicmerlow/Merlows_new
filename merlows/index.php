<?php get_header(); ?>

<div class="container" style="padding: 60px 20px;">
    <?php if ( have_posts() ) : ?>
        <header class="page-header">
            <h1 class="page-title" style="margin-bottom: 40px; color: var(--secondary-color);"><?php single_post_title(); ?></h1>
        </header>

        <div class="portal-grid">
            <?php
            while ( have_posts() ) :
                the_post();
                ?>
                <article id="post-<?php the_ID(); ?>" <?php post_class('news-card'); ?>>
                    <?php if ( has_post_thumbnail() ) : ?>
                        <div class="card-image" style="background-image: url('<?php echo get_the_post_thumbnail_url(); ?>');"></div>
                    <?php endif; ?>
                    
                    <div class="card-content">
                        <header class="entry-header">
                            <?php the_title( sprintf( '<h2 class="entry-title"><a href="%s" rel="bookmark" style="font-size: 20px;">', esc_url( get_permalink() ) ), '</a></h2>' ); ?>
                        </header>

                        <div class="entry-content">
                            <?php the_excerpt(); ?>
                        </div>
                    </div>
                </article>
            <?php endwhile; ?>
        </div>

        <div class="pagination" style="margin-top: 40px;">
            <?php the_posts_pagination(); ?>
        </div>

    <?php else : ?>
        <p>No content found.</p>
    <?php endif; ?>
</div>

<?php get_footer(); ?>
