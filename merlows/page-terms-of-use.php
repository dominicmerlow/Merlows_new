<?php
/**
 * Template Name: Terms of Use
 * Accessible at: /terms-of-use/
 */
get_header();

$site_name = 'Merlows';
$site_url  = 'merlows.com';
$email     = 'hello@merlows.com';
$updated   = '1 April 2026';
?>

<style>
.legal-hero {
    background: #0F172A;
    padding: 60px 0;
    color: white;
}
.legal-hero h1 {
    font-family: 'Outfit', sans-serif;
    font-size: 40px;
    font-weight: 800;
    margin: 0 0 8px;
}
.legal-hero p {
    color: rgba(255,255,255,0.6);
    font-size: 14px;
    margin: 0;
}
.legal-content {
    max-width: 800px;
    margin: 0 auto;
    padding: 60px 20px 80px;
}
.legal-content h2 {
    font-family: 'Outfit', sans-serif;
    font-size: 22px;
    font-weight: 700;
    color: #0F172A;
    margin: 48px 0 16px;
    padding-bottom: 8px;
    border-bottom: 2px solid #E2E8F0;
}
.legal-content h2:first-of-type {
    margin-top: 0;
}
.legal-content p, .legal-content li {
    font-size: 15px;
    line-height: 1.8;
    color: #475569;
    margin-bottom: 16px;
}
.legal-content ul {
    padding-left: 24px;
    list-style: disc;
}
.legal-content ul li {
    margin-bottom: 8px;
}
.legal-content strong {
    color: #1E293B;
}
</style>

<section class="legal-hero">
    <div class="container">
        <h1>Terms of Use</h1>
        <p>Last updated: <?php echo esc_html($updated); ?></p>
    </div>
</section>

<div class="legal-content">

<h2>1. Acceptance of Terms</h2>
<p>By accessing and using <?php echo esc_html($site_name); ?> ("the Site"), operated at <?php echo esc_html($site_url); ?>, you accept and agree to be bound by these Terms of Use. If you do not agree to these terms, please do not use the Site.</p>

<h2>2. Medical Disclaimer</h2>
<p><strong>The content on this Site is for informational and educational purposes only.</strong> It is not intended to be a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition.</p>
<p>Never disregard professional medical advice or delay in seeking it because of something you have read on this Site. If you think you may have a medical emergency, call your doctor or emergency services immediately.</p>

<h2>3. AI-Generated Content</h2>
<p>The Site includes an AI-powered assistant ("IBDi") that provides responses based on published research and clinical guidelines. IBDi's responses:</p>
<ul>
    <li>Are generated using artificial intelligence and may contain inaccuracies</li>
    <li>Do not constitute medical advice</li>
    <li>Should not be used as a sole basis for health decisions</li>
    <li>Are not reviewed by a healthcare professional before being displayed</li>
</ul>

<h2>4. User Accounts</h2>
<p>When you create an account, you agree to:</p>
<ul>
    <li>Provide accurate, current, and complete information</li>
    <li>Maintain the security of your password and account</li>
    <li>Accept responsibility for all activities under your account</li>
    <li>Notify us immediately of any unauthorised use</li>
</ul>

<h2>5. Acceptable Use</h2>
<p>You agree not to:</p>
<ul>
    <li>Use the Site for any unlawful purpose or in violation of any applicable laws</li>
    <li>Attempt to gain unauthorised access to any part of the Site or its systems</li>
    <li>Upload or transmit viruses, malware, or other harmful code</li>
    <li>Scrape, copy, or redistribute content without written permission</li>
    <li>Impersonate any person or entity</li>
    <li>Use the Site to advertise or sell products or services</li>
</ul>

<h2>6. Intellectual Property</h2>
<p>All content on the Site, including text, graphics, logos, icons, images, audio, video, and software, is the property of <?php echo esc_html($site_name); ?> or its content suppliers and is protected by international copyright and intellectual property laws.</p>
<p>You may view, download, and print content from the Site for personal, non-commercial use only, provided you do not modify it and you retain all copyright and proprietary notices.</p>

<h2>7. Health Tools</h2>
<p>The Site provides interactive health tools including blood test trackers and nutritional calculators. These tools:</p>
<ul>
    <li>Are designed for educational and self-monitoring purposes only</li>
    <li>Do not replace laboratory analysis or clinical assessment</li>
    <li>Should be used in conjunction with guidance from your healthcare team</li>
    <li>May not account for all individual health variables</li>
</ul>

<h2>8. Third-Party Links</h2>
<p>The Site may contain links to third-party websites. We are not responsible for the content, accuracy, or practices of any third-party sites. Inclusion of a link does not imply endorsement.</p>

<h2>9. Privacy</h2>
<p>Your use of the Site is also governed by our <a href="/privacy-policy/" style="color: #1B4F8A; font-weight: 600;">Privacy Policy</a>, which is incorporated into these Terms by reference.</p>

<h2>10. Limitation of Liability</h2>
<p><?php echo esc_html($site_name); ?> and its operators, contributors, and affiliates shall not be liable for any direct, indirect, incidental, special, or consequential damages arising from your use of the Site or any content, tools, or services provided.</p>

<h2>11. Changes to Terms</h2>
<p>We reserve the right to update these Terms of Use at any time. Changes will be effective immediately upon posting. Your continued use of the Site after changes constitutes acceptance of the revised terms.</p>

<h2>12. Contact</h2>
<p>If you have questions about these Terms, please contact us at <a href="mailto:<?php echo esc_attr($email); ?>" style="color: #1B4F8A; font-weight: 600;"><?php echo esc_html($email); ?></a>.</p>

</div>

<?php get_footer(); ?>
