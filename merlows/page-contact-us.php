<?php
/**
 * Template Name: Contact Us
 */

// ── Form processing (before headers are sent) ─────────────────────────────
$contact_sent  = false;
$contact_error = '';

if ( isset( $_POST['mlws_contact_submit'] ) && wp_verify_nonce( $_POST['mlws_contact_nonce'], 'mlws_contact_form' ) ) {
    $name    = sanitize_text_field( $_POST['contact_name'] ?? '' );
    $email   = sanitize_email( $_POST['contact_email'] ?? '' );
    $subject = sanitize_text_field( $_POST['contact_subject'] ?? '' );
    $message = sanitize_textarea_field( $_POST['contact_message'] ?? '' );

    if ( empty( $name ) || empty( $email ) || empty( $message ) ) {
        $contact_error = 'Please fill in all required fields.';
    } elseif ( ! is_email( $email ) ) {
        $contact_error = 'Please enter a valid email address.';
    } else {
        $to      = get_option( 'admin_email' );
        $subject = $subject ? "Contact: $subject" : "New Contact Form Submission – Merlows";
        $body    = "Name: $name\nEmail: $email\n\n$message";
        $headers = array( "Reply-To: $name <$email>" );

        if ( wp_mail( $to, $subject, $body, $headers ) ) {
            $contact_sent = true;
        } else {
            $contact_error = 'There was a problem sending your message. Please try again or email us directly.';
        }
    }
}

get_header(); ?>

<main id="main-content" class="cnt-page">

    <!-- ══════════════════════════════════════════════════════════════════
         MASTHEAD
    ══════════════════════════════════════════════════════════════════ -->
    <section class="cnt-masthead">
        <div class="cnt-masthead__grid">

            <div class="cnt-masthead__left">
                <div class="cnt-eyebrow">
                    <span class="cnt-eyebrow__line"></span>
                    <span class="cnt-eyebrow__text">CONTACT</span>
                    <span class="cnt-eyebrow__line"></span>
                </div>
                <h1 class="cnt-masthead__title">Get in<br><em>Touch</em></h1>
                <p class="cnt-masthead__sub">Whether you have a story tip, want to submit an article, or simply have a question — we read every message and respond within one business day.</p>
                <div class="cnt-masthead__rule"></div>
            </div>

            <div class="cnt-masthead__right">
                <div class="cnt-stamp">
                    <div class="cnt-stamp__inner">
                        <span class="cnt-stamp__top">MERLOWS</span>
                        <span class="cnt-stamp__mid">CONTACT</span>
                        <span class="cnt-stamp__bot">US</span>
                    </div>
                </div>
                <div class="cnt-masthead__stat-block">
                    <div class="cnt-stat">
                        <span class="cnt-stat__num">24h</span>
                        <span class="cnt-stat__label">Response<br>Time</span>
                    </div>
                    <div class="cnt-stat">
                        <span class="cnt-stat__num">6</span>
                        <span class="cnt-stat__label">Enquiry<br>Types</span>
                    </div>
                    <div class="cnt-stat">
                        <span class="cnt-stat__num">&#10022;</span>
                        <span class="cnt-stat__label">Open<br>Door</span>
                    </div>
                </div>
            </div>

        </div>

        <div class="cnt-masthead__ticker" aria-hidden="true">
            <span>Article Submissions &nbsp;&middot;&nbsp; Media Enquiries &nbsp;&middot;&nbsp; Editorial Tips &nbsp;&middot;&nbsp; Partnership &nbsp;&middot;&nbsp; Reader Feedback &nbsp;&middot;&nbsp; General Enquiries &nbsp;&middot;&nbsp;</span>
            <span aria-hidden="true">Article Submissions &nbsp;&middot;&nbsp; Media Enquiries &nbsp;&middot;&nbsp; Editorial Tips &nbsp;&middot;&nbsp; Partnership &nbsp;&middot;&nbsp; Reader Feedback &nbsp;&middot;&nbsp; General Enquiries &nbsp;&middot;&nbsp;</span>
        </div>
    </section>

    <!-- ══════════════════════════════════════════════════════════════════
         SECTION 01 — HOW TO REACH US
    ══════════════════════════════════════════════════════════════════ -->
    <section class="cnt-section cnt-section--white" data-reveal>
        <div class="cnt-container">

            <div class="cnt-section__header">
                <span class="cnt-section__num">01</span>
                <div>
                    <h2 class="cnt-section__title">How to Reach Us</h2>
                    <p class="cnt-section__lead">The Merlows editorial team is a small, dedicated group. Here's how to get to the right person.</p>
                </div>
            </div>

            <div class="cnt-reach-grid">

                <!-- Left column: contact details -->
                <div class="cnt-details-col">

                    <div class="cnt-detail-card">
                        <div class="cnt-detail-card__icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="0"/><polyline points="2,4 12,13 22,4"/></svg>
                        </div>
                        <div class="cnt-detail-card__body">
                            <span class="cnt-detail-card__label">EMAIL</span>
                            <span class="cnt-detail-card__value"><a href="mailto:info@merlows.com">info@merlows.com</a></span>
                        </div>
                    </div>

                    <div class="cnt-detail-card">
                        <div class="cnt-detail-card__icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
                        </div>
                        <div class="cnt-detail-card__body">
                            <span class="cnt-detail-card__label">RESPONSE</span>
                            <span class="cnt-detail-card__value">Within one business day, Monday&ndash;Friday</span>
                        </div>
                    </div>

                    <div class="cnt-detail-card">
                        <div class="cnt-detail-card__icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        </div>
                        <div class="cnt-detail-card__body">
                            <span class="cnt-detail-card__label">LOCATION</span>
                            <span class="cnt-detail-card__value">United Kingdom</span>
                        </div>
                    </div>

                    <?php
                    $social_linkedin  = get_theme_mod( 'mlws_social_linkedin' );
                    $social_twitter   = get_theme_mod( 'mlws_social_twitter' );
                    $social_instagram = get_theme_mod( 'mlws_social_instagram' );

                    if ( $social_linkedin || $social_twitter || $social_instagram ) : ?>
                    <div class="cnt-detail-card">
                        <div class="cnt-detail-card__icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                        </div>
                        <div class="cnt-detail-card__body">
                            <span class="cnt-detail-card__label">SOCIAL</span>
                            <div class="cnt-social-links">
                                <?php if ( $social_linkedin ) : ?>
                                <a href="<?php echo esc_url( $social_linkedin ); ?>" class="cnt-social-btn" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
                                </a>
                                <?php endif; ?>
                                <?php if ( $social_twitter ) : ?>
                                <a href="<?php echo esc_url( $social_twitter ); ?>" class="cnt-social-btn" target="_blank" rel="noopener noreferrer" aria-label="X / Twitter">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                                </a>
                                <?php endif; ?>
                                <?php if ( $social_instagram ) : ?>
                                <a href="<?php echo esc_url( $social_instagram ); ?>" class="cnt-social-btn" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="0"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                                </a>
                                <?php endif; ?>
                            </div>
                        </div>
                    </div>
                    <?php endif; ?>

                </div><!-- /.cnt-details-col -->

                <!-- Right column: contact form -->
                <div class="cnt-form-col">
                    <div class="cnt-form-card" id="contact-form">

                        <?php if ( $contact_sent ) : ?>
                        <div class="cnt-success">
                            <div class="cnt-success__icon">&#10003;</div>
                            <h3>Message Received</h3>
                            <p>Thank you for reaching out. A member of the editorial team will reply within one business day.</p>
                        </div>
                        <?php else : ?>

                        <?php if ( $contact_error ) : ?>
                        <div class="cnt-error"><?php echo esc_html( $contact_error ); ?></div>
                        <?php endif; ?>

                        <form method="post" action="<?php echo esc_url( get_permalink() ); ?>#contact-form" id="contact-form-inner" novalidate>
                            <?php wp_nonce_field( 'mlws_contact_form', 'mlws_contact_nonce' ); ?>

                            <div class="cnt-form-row cnt-form-row--2col">
                                <div class="cnt-form-group">
                                    <label class="cnt-form-label" for="contact_name">Full Name <span class="cnt-required" aria-hidden="true">*</span></label>
                                    <input
                                        type="text"
                                        id="contact_name"
                                        name="contact_name"
                                        class="cnt-form-input"
                                        value="<?php echo esc_attr( $_POST['contact_name'] ?? '' ); ?>"
                                        placeholder="Your full name"
                                        required
                                        autocomplete="name"
                                    >
                                </div>
                                <div class="cnt-form-group">
                                    <label class="cnt-form-label" for="contact_email">Email Address <span class="cnt-required" aria-hidden="true">*</span></label>
                                    <input
                                        type="email"
                                        id="contact_email"
                                        name="contact_email"
                                        class="cnt-form-input"
                                        value="<?php echo esc_attr( $_POST['contact_email'] ?? '' ); ?>"
                                        placeholder="your@email.com"
                                        required
                                        autocomplete="email"
                                    >
                                </div>
                            </div>

                            <div class="cnt-form-row">
                                <div class="cnt-form-group">
                                    <label class="cnt-form-label" for="contact_subject">Subject</label>
                                    <select id="contact_subject" name="contact_subject" class="cnt-form-select">
                                        <option value="">Select a topic&hellip;</option>
                                        <option value="Article Submission" <?php selected( ( $_POST['contact_subject'] ?? '' ), 'Article Submission' ); ?>>Article Submission</option>
                                        <option value="Editorial Tip" <?php selected( ( $_POST['contact_subject'] ?? '' ), 'Editorial Tip' ); ?>>Editorial Tip or Source</option>
                                        <option value="Media Enquiry" <?php selected( ( $_POST['contact_subject'] ?? '' ), 'Media Enquiry' ); ?>>Media Enquiry</option>
                                        <option value="Partnership" <?php selected( ( $_POST['contact_subject'] ?? '' ), 'Partnership' ); ?>>Partnership or Collaboration</option>
                                        <option value="Reader Feedback" <?php selected( ( $_POST['contact_subject'] ?? '' ), 'Reader Feedback' ); ?>>Reader Feedback</option>
                                        <option value="Other" <?php selected( ( $_POST['contact_subject'] ?? '' ), 'Other' ); ?>>Other</option>
                                    </select>
                                </div>
                            </div>

                            <div class="cnt-form-row">
                                <div class="cnt-form-group">
                                    <label class="cnt-form-label" for="contact_message">Message <span class="cnt-required" aria-hidden="true">*</span></label>
                                    <textarea
                                        id="contact_message"
                                        name="contact_message"
                                        class="cnt-form-textarea"
                                        rows="6"
                                        placeholder="How can we help you?"
                                        required
                                    ><?php echo esc_textarea( $_POST['contact_message'] ?? '' ); ?></textarea>
                                </div>
                            </div>

                            <button
                                type="submit"
                                name="mlws_contact_submit"
                                value="1"
                                class="btn btn-primary cnt-form-submit"
                                style="width:100%; font-size:16px; border-radius:0;"
                            >Send Message</button>

                            <p class="cnt-form-privacy">By submitting this form you agree to our <a href="/privacy-policy">Privacy Policy</a>. We never share your data.</p>

                        </form>

                        <?php endif; ?>

                    </div><!-- /.cnt-form-card -->
                </div><!-- /.cnt-form-col -->

            </div><!-- /.cnt-reach-grid -->

        </div>
    </section>

    <!-- ══════════════════════════════════════════════════════════════════
         SECTION 02 — ENQUIRY TYPES
    ══════════════════════════════════════════════════════════════════ -->
    <section class="cnt-section cnt-section--alt" data-reveal>
        <div class="cnt-container">

            <div class="cnt-section__header">
                <span class="cnt-section__num">02</span>
                <div>
                    <h2 class="cnt-section__title">Enquiry Types</h2>
                    <p class="cnt-section__lead">Not sure what to write? Here's a guide to what goes to whom.</p>
                </div>
            </div>

            <div class="cnt-enquiry-grid">

                <div class="cnt-enquiry-card">
                    <div class="cnt-enquiry-card__icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    </div>
                    <h3 class="cnt-enquiry-card__title">Article Submission</h3>
                    <p class="cnt-enquiry-card__desc">Send your pitch or completed draft. Include your category choice, word count, and a brief bio. We respond to all submissions.</p>
                </div>

                <div class="cnt-enquiry-card">
                    <div class="cnt-enquiry-card__icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    </div>
                    <h3 class="cnt-enquiry-card__title">Editorial Tip</h3>
                    <p class="cnt-enquiry-card__desc">Have information on a diplomatic development we should cover? Tips can be anonymous. We protect source identity as standard.</p>
                </div>

                <div class="cnt-enquiry-card">
                    <div class="cnt-enquiry-card__icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.13 6.13l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    </div>
                    <h3 class="cnt-enquiry-card__title">Media Enquiry</h3>
                    <p class="cnt-enquiry-card__desc">Journalists and producers seeking comment, data, or editorial perspective on our coverage. We respond within four hours during working hours.</p>
                </div>

                <div class="cnt-enquiry-card">
                    <div class="cnt-enquiry-card__icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    </div>
                    <h3 class="cnt-enquiry-card__title">Partnership</h3>
                    <p class="cnt-enquiry-card__desc">Academic institutions, NGOs, and diplomatic organisations interested in collaborative coverage or content licensing.</p>
                </div>

                <div class="cnt-enquiry-card">
                    <div class="cnt-enquiry-card__icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </div>
                    <h3 class="cnt-enquiry-card__title">Reader Feedback</h3>
                    <p class="cnt-enquiry-card__desc">Corrections, questions about our editorial process, or comments on our coverage. We read everything.</p>
                </div>

                <div class="cnt-enquiry-card">
                    <div class="cnt-enquiry-card__icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    </div>
                    <h3 class="cnt-enquiry-card__title">General</h3>
                    <p class="cnt-enquiry-card__desc">Anything else &mdash; including technical questions about the site, account help, or newsletter enquiries.</p>
                </div>

            </div><!-- /.cnt-enquiry-grid -->

        </div>
    </section>

    <!-- ══════════════════════════════════════════════════════════════════
         FOOTER CTA
    ══════════════════════════════════════════════════════════════════ -->
    <section class="cnt-footer-cta" data-reveal>
        <div class="cnt-container cnt-footer-cta__inner">
            <p class="cnt-footer-cta__kicker">BEFORE YOU WRITE</p>
            <h2 class="cnt-footer-cta__title">Read a Few Articles First.</h2>
            <p class="cnt-footer-cta__body">Understanding our editorial voice helps us both. Browse a few pieces in your area of interest, then get in touch.</p>
            <a href="<?php echo esc_url( home_url( '/' ) ); ?>" class="btn btn-primary cnt-footer-cta__btn" style="border-radius:0;">Browse the Archive</a>
            <p class="cnt-footer-cta__sub-link">
                <a href="<?php echo esc_url( home_url( '/how-to-use/' ) ); ?>">How to submit an article &rarr;</a>
            </p>
        </div>
    </section>

</main><!-- /#main-content -->

<style>
/* ══════════════════════════════════════════════════════════════════════════
   CNT- PAGE STYLES  |  Contact Us
══════════════════════════════════════════════════════════════════════════ */

/* ─── Reset / base ──────────────────────────────────────────────────────── */
.cnt-page *,
.cnt-page *::before,
.cnt-page *::after {
    box-sizing: border-box;
}

.cnt-page {
    font-family: var(--font-main);
    color: var(--text-main);
}

.cnt-container {
    max-width: var(--container-width, 1200px);
    margin: 0 auto;
    padding: 0 40px;
}

/* ─── Masthead ──────────────────────────────────────────────────────────── */
.cnt-masthead {
    background: var(--primary-color);
    color: #ffffff;
    overflow: hidden;
    position: relative;
}

.cnt-masthead__grid {
    max-width: var(--container-width, 1200px);
    margin: 0 auto;
    padding: 80px 40px 60px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 60px;
    align-items: center;
}

/* Eyebrow */
.cnt-eyebrow {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 28px;
}

.cnt-eyebrow__line {
    display: block;
    height: 1px;
    width: 40px;
    background: var(--accent-color);
}

.cnt-eyebrow__text {
    font-family: var(--font-heading);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.25em;
    color: var(--accent-color);
    text-transform: uppercase;
}

/* Title */
.cnt-masthead__title {
    font-family: var(--font-heading);
    font-size: clamp(48px, 6vw, 80px);
    font-weight: 800;
    line-height: 1.05;
    color: #ffffff;
    margin: 0 0 24px;
}

.cnt-masthead__title em {
    font-style: italic;
    color: var(--accent-color);
}

/* Subtitle */
.cnt-masthead__sub {
    font-size: 16px;
    line-height: 1.65;
    color: rgba(255,255,255,0.78);
    margin: 0 0 32px;
    max-width: 440px;
}

/* Gold rule */
.cnt-masthead__rule {
    width: 80px;
    height: 3px;
    background: linear-gradient(90deg, var(--accent-color), transparent);
}

/* Right column */
.cnt-masthead__right {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 40px;
}

/* Stamp */
.cnt-stamp {
    width: 160px;
    height: 160px;
    border: 2px solid var(--accent-color);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: cnt-spin 30s linear infinite;
}

.cnt-stamp__inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    animation: cnt-counter-spin 30s linear infinite;
}

.cnt-stamp__top,
.cnt-stamp__bot {
    font-family: var(--font-heading);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.2em;
    color: var(--accent-color);
    text-transform: uppercase;
}

.cnt-stamp__mid {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.15em;
    color: #ffffff;
    text-transform: uppercase;
    margin: 4px 0;
}

@keyframes cnt-spin {
    to { transform: rotate(360deg); }
}

@keyframes cnt-counter-spin {
    to { transform: rotate(-360deg); }
}

/* Stats */
.cnt-masthead__stat-block {
    display: flex;
    gap: 32px;
}

.cnt-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
}

.cnt-stat__num {
    font-family: var(--font-heading);
    font-size: 28px;
    font-weight: 800;
    color: var(--accent-color);
    line-height: 1;
}

.cnt-stat__label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    color: rgba(255,255,255,0.6);
    text-transform: uppercase;
    text-align: center;
    line-height: 1.4;
}

/* Ticker */
.cnt-masthead__ticker {
    background: var(--accent-color);
    padding: 10px 0;
    overflow: hidden;
    white-space: nowrap;
    display: flex;
}

.cnt-masthead__ticker span {
    display: inline-block;
    font-family: var(--font-heading);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: var(--primary-color);
    text-transform: uppercase;
    animation: cnt-ticker 28s linear infinite;
}

.cnt-masthead__ticker span:last-child {
    animation-delay: -14s;
}

@keyframes cnt-ticker {
    from { transform: translateX(0); }
    to   { transform: translateX(-100%); }
}

/* ─── Sections ──────────────────────────────────────────────────────────── */
.cnt-section {
    padding: 80px 0;
}

.cnt-section--white {
    background: #ffffff;
}

.cnt-section--alt {
    background: #F8FAFD;
}

/* Section header with outlined number */
.cnt-section__header {
    display: flex;
    align-items: flex-start;
    gap: 28px;
    margin-bottom: 56px;
}

.cnt-section__num {
    font-family: var(--font-heading);
    font-size: 64px;
    font-weight: 900;
    line-height: 1;
    color: transparent;
    -webkit-text-stroke: 2px var(--primary-color);
    opacity: 0.18;
    flex-shrink: 0;
    margin-top: -8px;
}

.cnt-section__title {
    font-family: var(--font-heading);
    font-size: clamp(28px, 3.5vw, 40px);
    font-weight: 800;
    color: var(--text-main);
    margin: 0 0 10px;
    line-height: 1.1;
}

.cnt-section__lead {
    font-size: 16px;
    color: var(--text-light);
    margin: 0;
    line-height: 1.6;
    max-width: 560px;
}

/* ─── Reach grid ────────────────────────────────────────────────────────── */
.cnt-reach-grid {
    display: grid;
    grid-template-columns: 1fr 1.4fr;
    gap: 56px;
    align-items: start;
}

/* ─── Contact detail cards ──────────────────────────────────────────────── */
.cnt-details-col {
    display: flex;
    flex-direction: column;
    gap: 0;
}

.cnt-detail-card {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 20px 0;
    border-bottom: 1px solid #E8EEF5;
}

.cnt-detail-card:last-child {
    border-bottom: none;
}

.cnt-detail-card__icon {
    width: 40px;
    height: 40px;
    background: rgba(27, 79, 138, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--primary-color);
    border-radius: 0;
}

.cnt-detail-card__body {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.cnt-detail-card__label {
    font-family: var(--font-heading);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: var(--text-light);
    text-transform: uppercase;
}

.cnt-detail-card__value {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-main);
    line-height: 1.5;
}

.cnt-detail-card__value a {
    color: var(--primary-color);
    text-decoration: none;
    border-bottom: 1px solid transparent;
    transition: border-color 0.2s;
}

.cnt-detail-card__value a:hover {
    border-bottom-color: var(--primary-color);
}

/* Social buttons */
.cnt-social-links {
    display: flex;
    gap: 10px;
    margin-top: 4px;
}

.cnt-social-btn {
    width: 36px;
    height: 36px;
    background: #ffffff;
    border: 1px solid #E8EEF5;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-main);
    text-decoration: none;
    border-radius: 0;
    transition: background 0.2s, color 0.2s, box-shadow 0.2s;
}

.cnt-social-btn:hover {
    background: var(--primary-color);
    color: #ffffff;
    box-shadow: 0 2px 8px rgba(27,79,138,0.25);
}

/* ─── Form card ─────────────────────────────────────────────────────────── */
.cnt-form-card {
    background: #ffffff;
    border: 1px solid #E8EEF5;
    padding: 48px;
    border-radius: 0;
}

/* Form rows */
.cnt-form-row {
    margin-bottom: 24px;
}

.cnt-form-row--2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}

.cnt-form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.cnt-form-label {
    font-family: var(--font-heading);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--text-main);
    text-transform: uppercase;
}

.cnt-required {
    color: var(--secondary-color);
}

.cnt-form-input,
.cnt-form-select,
.cnt-form-textarea {
    border-radius: 0;
    border: 1.5px solid #E8EEF5;
    padding: 12px 14px;
    font-family: var(--font-main);
    font-size: 15px;
    color: var(--text-main);
    background: #ffffff;
    width: 100%;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    appearance: none;
    -webkit-appearance: none;
}

.cnt-form-select {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%231B4F8A' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 14px center;
    padding-right: 40px;
    cursor: pointer;
}

.cnt-form-textarea {
    resize: vertical;
    min-height: 140px;
    line-height: 1.6;
}

.cnt-form-input:hover,
.cnt-form-select:hover,
.cnt-form-textarea:hover {
    border-color: var(--primary-color);
}

.cnt-form-input:focus,
.cnt-form-select:focus,
.cnt-form-textarea:focus {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 3px rgba(27,79,138,0.1);
}

.cnt-form-input::placeholder,
.cnt-form-textarea::placeholder {
    color: #b0bac6;
}

/* Submit button */
.cnt-form-submit {
    margin-top: 8px;
    padding: 16px 24px;
    font-family: var(--font-heading);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    transition: opacity 0.2s;
}

.cnt-form-submit:hover {
    opacity: 0.88;
}

/* Privacy note */
.cnt-form-privacy {
    font-size: 12px;
    color: var(--text-light);
    text-align: center;
    margin: 16px 0 0;
    line-height: 1.5;
}

.cnt-form-privacy a {
    color: var(--primary-color);
    text-decoration: none;
}

.cnt-form-privacy a:hover {
    text-decoration: underline;
}

/* ─── Success state ─────────────────────────────────────────────────────── */
.cnt-success {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 40px 20px;
}

.cnt-success__icon {
    width: 72px;
    height: 72px;
    background: rgba(27,79,138,0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    font-weight: 700;
    color: var(--primary-color);
    border-radius: 0;
    margin-bottom: 24px;
}

.cnt-success h3 {
    font-family: var(--font-heading);
    font-size: 24px;
    font-weight: 800;
    color: var(--text-main);
    margin: 0 0 12px;
}

.cnt-success p {
    font-size: 15px;
    color: var(--text-light);
    line-height: 1.65;
    margin: 0;
    max-width: 340px;
}

/* ─── Error state ───────────────────────────────────────────────────────── */
.cnt-error {
    background: rgba(139,26,26,0.07);
    border-left: 3px solid var(--secondary-color);
    color: var(--secondary-color);
    padding: 14px 18px;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 28px;
    border-radius: 0;
}

/* ─── Enquiry cards grid ────────────────────────────────────────────────── */
.cnt-enquiry-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 28px;
}

.cnt-enquiry-card {
    background: #ffffff;
    border: 1px solid #E8EEF5;
    padding: 32px 28px;
    border-radius: 0;
    transition: box-shadow 0.2s, transform 0.2s;
}

.cnt-enquiry-card:hover {
    box-shadow: 0 6px 24px rgba(27,79,138,0.1);
    transform: translateY(-2px);
}

.cnt-enquiry-card__icon {
    width: 48px;
    height: 48px;
    background: rgba(27,79,138,0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--primary-color);
    margin-bottom: 20px;
    border-radius: 0;
}

.cnt-enquiry-card__title {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 800;
    color: var(--text-main);
    margin: 0 0 10px;
    letter-spacing: 0.01em;
}

.cnt-enquiry-card__desc {
    font-size: 14px;
    color: var(--text-light);
    line-height: 1.65;
    margin: 0;
}

/* ─── Footer CTA ────────────────────────────────────────────────────────── */
.cnt-footer-cta {
    background: #ffffff;
    padding: 96px 0;
    border-top: 1px solid #E8EEF5;
}

.cnt-footer-cta__inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
}

.cnt-footer-cta__kicker {
    font-family: var(--font-heading);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.25em;
    color: var(--accent-color);
    text-transform: uppercase;
    margin: 0 0 16px;
}

.cnt-footer-cta__title {
    font-family: var(--font-heading);
    font-size: clamp(32px, 4vw, 52px);
    font-weight: 900;
    color: var(--text-main);
    margin: 0 0 20px;
    line-height: 1.1;
}

.cnt-footer-cta__body {
    font-size: 17px;
    color: var(--text-light);
    line-height: 1.65;
    margin: 0 0 40px;
    max-width: 520px;
}

.cnt-footer-cta__btn {
    display: inline-block;
    padding: 16px 40px;
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-decoration: none;
    border-radius: 0;
    margin-bottom: 24px;
    transition: opacity 0.2s;
}

.cnt-footer-cta__btn:hover {
    opacity: 0.88;
}

.cnt-footer-cta__sub-link {
    margin: 0;
}

.cnt-footer-cta__sub-link a {
    font-size: 14px;
    font-weight: 600;
    color: var(--primary-color);
    text-decoration: none;
    border-bottom: 1px solid transparent;
    transition: border-color 0.2s;
}

.cnt-footer-cta__sub-link a:hover {
    border-bottom-color: var(--primary-color);
}

/* ─── Scroll reveal ─────────────────────────────────────────────────────── */
[data-reveal] {
    opacity: 0;
    transform: translateY(28px);
    transition: opacity 0.65s ease, transform 0.65s ease;
}

[data-reveal].is-visible {
    opacity: 1;
    transform: translateY(0);
}

/* ─── Responsive: 900px ─────────────────────────────────────────────────── */
@media (max-width: 900px) {
    .cnt-masthead__grid {
        grid-template-columns: 1fr;
        padding: 60px 24px 48px;
        gap: 40px;
    }

    .cnt-masthead__right {
        flex-direction: row;
        justify-content: center;
        flex-wrap: wrap;
        gap: 32px;
    }

    .cnt-reach-grid {
        grid-template-columns: 1fr;
        gap: 40px;
    }

    .cnt-enquiry-grid {
        grid-template-columns: repeat(2, 1fr);
    }

    .cnt-container {
        padding: 0 24px;
    }

    .cnt-section {
        padding: 60px 0;
    }

    .cnt-form-card {
        padding: 32px 24px;
    }

    .cnt-footer-cta {
        padding: 64px 0;
    }
}

/* ─── Responsive: 600px ─────────────────────────────────────────────────── */
@media (max-width: 600px) {
    .cnt-masthead__grid {
        padding: 48px 16px 36px;
    }

    .cnt-masthead__right {
        flex-direction: column;
        align-items: center;
    }

    .cnt-masthead__stat-block {
        gap: 20px;
    }

    .cnt-container {
        padding: 0 16px;
    }

    .cnt-section {
        padding: 48px 0;
    }

    .cnt-section__header {
        flex-direction: column;
        gap: 12px;
    }

    .cnt-section__num {
        font-size: 40px;
    }

    .cnt-form-row--2col {
        grid-template-columns: 1fr;
    }

    .cnt-enquiry-grid {
        grid-template-columns: 1fr;
    }

    .cnt-form-card {
        padding: 24px 16px;
    }

    .cnt-footer-cta {
        padding: 48px 0;
    }

    .cnt-footer-cta__btn {
        width: 100%;
        text-align: center;
    }
}
</style>

<script>
(function () {
    'use strict';

    var revealEls = document.querySelectorAll('[data-reveal]');
    if (!revealEls.length) return;

    if (!('IntersectionObserver' in window)) {
        revealEls.forEach(function (el) {
            el.classList.add('is-visible');
        });
        return;
    }

    var observer = new IntersectionObserver(
        function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        },
        {
            threshold: 0.12,
            rootMargin: '0px 0px -40px 0px'
        }
    );

    revealEls.forEach(function (el) {
        observer.observe(el);
    });
}());
</script>

<?php get_footer(); ?>
