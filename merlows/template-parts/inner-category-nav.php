<?php
/**
 * Inner Page Category Navigation (Mini Cards)
 */

if ( ! get_theme_mod( 'ibdhh_show_inner_nav', true ) ) {
    return;
}

// Get Uncategorized ID to exclude
$uncat = get_category_by_slug( 'uncategorized' );
$exclude_ids = array();
if ( $uncat ) {
    $exclude_ids[] = $uncat->term_id;
}

$total_items = get_theme_mod( 'ibdhh_inner_nav_total_items', 8 );
$col_count = get_theme_mod( 'ibdhh_inner_nav_cards_per_row', 8 );

$cats = get_categories( array(
    'orderby' => 'count',
    'order'   => 'DESC',
    'number'  => $total_items,
    'hide_empty' => true,
    'exclude' => $exclude_ids 
) );
?>
<style>
    .orange-icon { filter: brightness(0) saturate(100%) invert(35%) sepia(97%) saturate(2283%) hue-rotate(3deg) brightness(101%) contrast(106%); }
</style>
<div class="inner-cat-nav-wrapper" style="position: relative; z-index: 20; margin-top: -50px; margin-bottom: 40px; pointer-events: none;">
    <div class="container">
        <!-- Grid layout for desktop, Scroll for mobile -->
        <div class="inner-cat-nav" style="pointer-events: auto;">
            
            <?php foreach ( $cats as $cat ) : 
                $is_active = ( is_category() && get_queried_object_id() === $cat->term_id );
                $icon = get_theme_mod("ibdhh_cat_card_icon_{$cat->term_id}", '');
                
                $card_style = "display: flex; align-items: center; justify-content: center; gap: 6px; background: #F8FAFC; border: 1px solid #e2e8f0; border-radius: 0; padding: 12px; text-decoration: none; transition: all 0.2s; white-space: nowrap; box-shadow: 0 1px 2px rgba(0,0,0,0.05); width: 100%; overflow: hidden;";
                $text_style = "font-size: 12px; font-weight: 600; color: #334155; margin: 0; line-height: 1.2; overflow: hidden; text-overflow: ellipsis;";
                
                $icon_container_style = "width: 20px; height: 20px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: #f1f5f9; border-radius: 0;";
                $icon_img_style = "width: 12px; height: 12px; object-fit: contain;";
                
                if ( $is_active ) {
                    $card_style .= " border-color: #9F2B68; background: #F5F0FA;"; 
                    $text_style = "font-size: 12px; font-weight: 700; color: #c2410c;";
                }
            ?>
                <a href="<?php echo get_category_link( $cat->term_id ); ?>" class="cat-mini-card <?php echo $is_active ? 'active' : ''; ?>" style="<?php echo $card_style; ?>" title="<?php echo esc_attr( $cat->name ); ?>">
                    <?php 
                    $cat_icon = $icon ?: ibdhh_get_category_icon_url($cat->name);
                    ?>
                        <div style="<?php echo $icon_container_style; ?>">
                            <?php if ($cat_icon): ?>
                                <img src="<?php echo esc_url($cat_icon); ?>" alt="" class="orange-icon" style="<?php echo $icon_img_style; ?>">
                            <?php else: ?>
                                <div style="font-size: 12px;">📁</div>
                            <?php endif; ?>
                        </div>

                    <span style="<?php echo $text_style; ?>"><?php echo esc_html( $cat->name ); ?></span>
                </a>
            <?php endforeach; ?>
        </div>
    </div>
</div>

<style>
/* Mobile: Horizontal Scroll */
.inner-cat-nav {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
}
.inner-cat-nav::-webkit-scrollbar { display: none; }
.cat-mini-card { flex: 0 0 auto; width: auto !important; }

/* Desktop: Configurable Grid */
@media (min-width: 992px) {
    .inner-cat-nav {
        display: grid;
        grid-template-columns: repeat(<?php echo esc_attr($col_count); ?>, 1fr);
        gap: 10px;
        overflow-x: visible;
        justify-content: center;
    }
    .cat-mini-card { 
        width: 100% !important;
        flex: 1;
    }
}

.cat-mini-card:hover { 
    transform: translateY(-2px); 
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1) !important;
    border-color: #9F2B68 !important;
}
</style>
