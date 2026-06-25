<?php
/**
 * Template Name: Custom Registration
 * Custom registration page with role selection and password field
 */

// Redirect if already logged in
if (is_user_logged_in()) {
    wp_redirect(home_url('/dashboard/'));
    exit;
}

// Handle registration form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['mlws_register_submit'])) {
    $errors = array();
    
    // Verify nonce
    if (!isset($_POST['mlws_register_nonce']) || !wp_verify_nonce($_POST['mlws_register_nonce'], 'mlws_register_action')) {
        $errors[] = 'Security check failed. Please try again.';
    }
    
    // Get form data
    $email = sanitize_email($_POST['user_email']);
    $password = $_POST['user_password'];
    $password_confirm = $_POST['user_password_confirm'];
    $role = sanitize_text_field($_POST['user_role']);
    $first_name = sanitize_text_field($_POST['first_name']);
    $last_name = sanitize_text_field($_POST['last_name']);
    
    // Validation
    if (empty($email) || !is_email($email)) {
        $errors[] = 'Please enter a valid email address.';
    }
    
    if (email_exists($email)) {
        $errors[] = 'This email is already registered.';
    }
    
    if (empty($password) || strlen($password) < 8) {
        $errors[] = 'Password must be at least 8 characters long.';
    }
    
    if ($password !== $password_confirm) {
        $errors[] = 'Passwords do not match.';
    }
    
    if (empty($role) || !in_array($role, array('member', 'subscriber', 'practitioner'))) {
        $errors[] = 'Please select a valid role.';
    }
    
    // If no errors, create user
    if (empty($errors)) {
        $username = sanitize_user(strstr($email, '@', true));
        $username = str_replace('.', '_', $username);
        
        // Make username unique
        $base_username = $username;
        $i = 1;
        while (username_exists($username)) {
            $username = $base_username . $i;
            $i++;
        }
        
        $user_id = wp_create_user($username, $password, $email);
        
        if (!is_wp_error($user_id)) {
            // Update user data
            wp_update_user(array(
                'ID' => $user_id,
                'first_name' => $first_name,
                'last_name' => $last_name,
                'display_name' => $first_name . ' ' . $last_name,
            ));
            
            // Set role (normalise legacy 'subscriber' selection to 'member')
            $role = ( $role === 'subscriber' ) ? 'member' : $role;
            $user = new WP_User($user_id);
            $user->set_role($role);
            update_user_meta($user_id, '_mlws_user_type', $role);
            update_user_meta($user_id, '_mlws_dashboard_role', $role);
            
            // Log user in
            wp_set_current_user($user_id);
            wp_set_auth_cookie($user_id, true);
            
            // Redirect to dashboard
            wp_redirect(home_url('/dashboard/'));
            exit;
        } else {
            $errors[] = $user_id->get_error_message();
        }
    }
}

get_header();
?>

<style>
.ibd-register-page {
    min-height: 100vh;
    background: linear-gradient(135deg, #0F172A 0%, #112240 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
}

.register-container {
    background: white;
    border-radius: 0;
    padding: 48px;
    max-width: 500px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}

.register-header {
    text-align: center;
    margin-bottom: 32px;
}

.register-logo {
    width: 60px;
    height: 60px;
    background: var(--primary-color);
    border-radius: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
    font-size: 28px;
    color: white;
    font-weight: 800;
}

.register-title {
    font-family: 'Outfit', sans-serif;
    font-size: 28px;
    font-weight: 800;
    color: #0F172A;
    margin: 0 0 8px 0;
}

.register-subtitle {
    color: #64748B;
    font-size: 14px;
    margin: 0;
}

.form-group {
    margin-bottom: 20px;
}

.form-label {
    display: block;
    font-weight: 600;
    font-size: 14px;
    color: #334155;
    margin-bottom: 8px;
}

.form-input {
    width: 100%;
    padding: 12px 16px;
    border: 2px solid #E2E8F0;
    border-radius: 0;
    font-size: 14px;
    transition: all 0.2s;
    font-family: inherit;
}

.form-input:focus {
    outline: none;
    border-color: var(--primary-color);
    box-shadow: 0 0 0 3px rgba(255, 90, 0, 0.1);
}

.role-selector {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 24px;
}

.role-option {
    position: relative;
    cursor: pointer;
}

.role-option input[type="radio"] {
    position: absolute;
    opacity: 0;
}

.role-card {
    padding: 16px;
    border: 2px solid #E2E8F0;
    border-radius: 0;
    text-align: center;
    transition: all 0.2s;
    background: #F8FAFC;
}

.role-option input[type="radio"]:checked + .role-card {
    border-color: var(--primary-color);
    background: #F5F0FA;
}

.role-icon {
    font-size: 32px;
    margin-bottom: 8px;
}

.role-name {
    font-weight: 700;
    font-size: 13px;
    color: #334155;
}

.submit-btn {
    width: 100%;
    padding: 14px;
    background: var(--primary-color);
    color: white;
    border: none;
    border-radius: 0;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-family: 'Outfit', sans-serif;
}

.submit-btn:hover {
    background: #e65100;
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(255, 90, 0, 0.3);
}

.error-message {
    background: #FEE2E2;
    border-left: 4px solid #EF4444;
    padding: 12px 16px;
    border-radius: 0;
    margin-bottom: 20px;
}

.error-message ul {
    margin: 0;
    padding-left: 20px;
}

.error-message li {
    color: #991B1B;
    font-size: 14px;
}

.login-link {
    text-align: center;
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid #E2E8F0;
    font-size: 14px;
    color: #64748B;
}

.login-link a {
    color: var(--primary-color);
    font-weight: 600;
    text-decoration: none;
}

.login-link a:hover {
    text-decoration: underline;
}

.password-strength {
    margin-top: 8px;
    font-size: 12px;
    color: #64748B;
}

.strength-bar {
    height: 4px;
    background: #E2E8F0;
    border-radius: 0;
    margin-top: 4px;
    overflow: hidden;
}

.strength-fill {
    height: 100%;
    width: 0%;
    transition: all 0.3s;
    border-radius: 0;
}
</style>

<div class="ibd-register-page">
    <div class="register-container">
        <div class="register-header">
            <div class="register-logo">S</div>
            <h1 class="register-title">Create Your Account</h1>
            <p class="register-subtitle">Join the Merlows community today</p>
        </div>

        <?php if (!empty($errors)): ?>
        <div class="error-message">
            <ul>
                <?php foreach ($errors as $error): ?>
                    <li><?php echo esc_html($error); ?></li>
                <?php endforeach; ?>
            </ul>
        </div>
        <?php endif; ?>

        <form method="POST" action="">
            <?php wp_nonce_field('mlws_register_action', 'mlws_register_nonce'); ?>
            
            <div class="form-group">
                <label class="form-label">I am a:</label>
                <div class="role-selector">
                    <label class="role-option">
                        <input type="radio" name="user_role" value="practitioner" <?php echo (isset($_GET['role']) && $_GET['role'] === 'practitioner') ? 'checked' : ''; ?> required>
                        <div class="role-card">
                            <div class="role-icon">✍️</div>
                            <div class="role-name">Writer</div>
                        </div>
                    </label>
                    <label class="role-option">
                        <input type="radio" name="user_role" value="member" <?php echo (isset($_GET['role']) && in_array($_GET['role'], array('member','patient'), true)) || !isset($_GET['role']) ? 'checked' : ''; ?> required>
                        <div class="role-card">
                            <div class="role-icon">📰</div>
                            <div class="role-name">Reader</div>
                        </div>
                    </label>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label" for="first_name">First Name</label>
                <input type="text" id="first_name" name="first_name" class="form-input" value="<?php echo isset($_POST['first_name']) ? esc_attr($_POST['first_name']) : ''; ?>" required>
            </div>

            <div class="form-group">
                <label class="form-label" for="last_name">Last Name</label>
                <input type="text" id="last_name" name="last_name" class="form-input" value="<?php echo isset($_POST['last_name']) ? esc_attr($_POST['last_name']) : ''; ?>" required>
            </div>

            <div class="form-group">
                <label class="form-label" for="user_email">Email Address</label>
                <input type="email" id="user_email" name="user_email" class="form-input" value="<?php echo isset($_POST['user_email']) ? esc_attr($_POST['user_email']) : ''; ?>" required>
            </div>

            <div class="form-group">
                <label class="form-label" for="user_password">Password</label>
                <input type="password" id="user_password" name="user_password" class="form-input" required minlength="8" onkeyup="checkPasswordStrength(this.value)">
                <div class="password-strength">
                    <span id="strength-text">Minimum 8 characters</span>
                    <div class="strength-bar">
                        <div class="strength-fill" id="strength-fill"></div>
                    </div>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label" for="user_password_confirm">Confirm Password</label>
                <input type="password" id="user_password_confirm" name="user_password_confirm" class="form-input" required minlength="8">
            </div>

            <button type="submit" name="mlws_register_submit" class="submit-btn">Create Account</button>
        </form>

        <div class="login-link">
            Already have an account? <a href="<?php echo wp_login_url(); ?>">Sign In</a>
        </div>
    </div>
</div>

<script>
function checkPasswordStrength(password) {
    const strengthFill = document.getElementById('strength-fill');
    const strengthText = document.getElementById('strength-text');
    
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z\d]/.test(password)) strength++;
    
    const percentage = (strength / 5) * 100;
    strengthFill.style.width = percentage + '%';
    
    if (strength <= 1) {
        strengthFill.style.background = '#EF4444';
        strengthText.textContent = 'Weak password';
    } else if (strength <= 3) {
        strengthFill.style.background = '#F59E0B';
        strengthText.textContent = 'Medium strength';
    } else {
        strengthFill.style.background = '#22C55E';
        strengthText.textContent = 'Strong password';
    }
}
</script>

<?php get_footer(); ?>
