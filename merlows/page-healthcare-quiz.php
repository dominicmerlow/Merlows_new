<?php
/**
 * Template Name: Healthcare Quiz
 */

// Get saved quiz answers for logged-in users to pre-populate
$saved_quiz = array();
if ( is_user_logged_in() ) {
    $meta = get_user_meta( get_current_user_id(), '_ibdhh_healthcare_quiz_results', true );
    if ( is_array( $meta ) ) {
        $saved_quiz = $meta;
    }
}
$saved_role = isset( $saved_quiz['role'] ) ? $saved_quiz['role'] : '';

get_header();
?>

<style>
:root {
    --primary-color: #9F2B68;
    --navy-dark: #0F172A;
    --navy-blue: #112240;
    --text-slate: #8892b0;
    --text-white: #e6f1ff;
    --bg-light: #f8fafc;
}

.quiz-page-wrapper {
    background: var(--bg-light);
    min-height: 100vh;
    padding: 80px 0;
    font-family: 'Inter', sans-serif;
}

.quiz-container {
    max-width: 800px;
    margin: 0 auto;
    background: white;
    border-radius: 0;
    box-shadow: 0 20px 60px rgba(0,0,0,0.05);
    overflow: hidden;
    position: relative;
    border: 1px solid #e2e8f0;
}

.quiz-header {
    background: var(--navy-dark);
    color: white;
    padding: 40px;
    text-align: center;
}

.quiz-header h1 {
    font-family: 'Outfit', sans-serif;
    font-size: 32px;
    font-weight: 800;
    margin: 0 0 10px 0;
}

.quiz-header p {
    font-size: 16px;
    color: #cbd5e1;
    margin: 0;
}

.progress-bar-container {
    height: 8px;
    background: #e2e8f0;
    width: 100%;
}

.progress-bar-fill {
    height: 100%;
    background: var(--primary-color);
    width: 0%;
    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.quiz-step {
    padding: 60px;
    display: none;
    animation: fadeIn 0.5s ease;
}

.quiz-step.active {
    display: block;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

.question-label {
    display: block;
    font-size: 24px;
    font-weight: 700;
    color: var(--navy-dark);
    margin-bottom: 30px;
    font-family: 'Outfit', sans-serif;
}

.options-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
}

.option-item {
    padding: 20px 24px;
    border: 2px solid #e2e8f0;
    border-radius: 0;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 15px;
    position: relative;
    background: white;
}

.option-item:hover {
    border-color: #cbd5e1;
    background: #f8fafc;
}

.option-item.selected {
    border-color: var(--primary-color);
    background: #F5F0FA;
    box-shadow: 0 4px 12px rgba(255, 90, 0, 0.1);
}

.option-radio {
    width: 20px;
    height: 20px;
    border: 2px solid #cbd5e1;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}

.option-checkbox {
    width: 20px;
    height: 20px;
    border: 2px solid #cbd5e1;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}

.option-item.selected .option-radio {
    border-color: var(--primary-color);
}

.option-item.selected .option-radio::after {
    content: '';
    width: 10px;
    height: 10px;
    background: var(--primary-color);
    border-radius: 50%;
}

.option-item.selected .option-checkbox {
    border-color: var(--primary-color);
    background: var(--primary-color);
}
.option-item.selected .option-checkbox::after {
    content: '✓';
    color: white;
    font-size: 14px;
    font-weight: bold;
}

.option-text {
    font-size: 16px;
    font-weight: 600;
    color: #334155;
}

.quiz-footer {
    padding: 30px 60px 50px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid #f1f5f9;
}

.btn-quiz {
    padding: 14px 32px;
    border-radius: 0;
    font-weight: 700;
    font-family: 'Outfit', sans-serif;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    font-size: 15px;
}

.btn-prev {
    background: #f1f5f9;
    color: #64748b;
}

.btn-prev:hover {
    background: #e2e8f0;
}

.btn-next {
    background: var(--primary-color);
    color: white;
    box-shadow: 0 10px 20px rgba(255, 90, 0, 0.2);
}

.btn-next:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 24px rgba(255, 90, 0, 0.3);
}

.btn-next:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
}

.input-field {
    width: 100%;
    padding: 16px 20px;
    border: 2px solid #e2e8f0;
    border-radius: 0;
    font-size: 16px;
    outline: none;
    transition: all 0.2s;
    margin-bottom: 10px;
}

.input-field:focus {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 4px rgba(255, 90, 0, 0.05);
}

.grid-cols-2 {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
}

/* Results State */
.results-screen {
    text-align: center;
    padding: 80px 60px;
    display: none;
}

.results-screen h2 {
    font-size: 36px;
    font-weight: 800;
    color: var(--navy-dark);
    margin-bottom: 20px;
    font-family: 'Outfit', sans-serif;
}

.results-screen p {
    font-size: 18px;
    color: #64748b;
    margin-bottom: 40px;
}

.register-cta {
    background: var(--navy-dark);
    padding: 40px;
    border-radius: 0;
    color: white;
}

.register-cta h3 {
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 16px;
}

.register-cta p {
    color: #94a3b8;
    font-size: 15px;
    margin-bottom: 24px;
}

</style>

<div class="quiz-page-wrapper">
    <div class="quiz-container">
        <div class="quiz-header">
            <h1>IBD Health Hub Discovery</h1>
            <p>Tell us a bit about yourself to personalize your experience.</p>
        </div>
        
        <div class="progress-bar-container">
            <div class="progress-bar-fill" id="progress-bar"></div>
        </div>

        <form id="health-quiz-form">
            <!-- Step 1: Age -->
            <div class="quiz-step active" data-step="1">
                <label class="question-label">What is your age?</label>
                <div class="options-grid grid-cols-2">
                    <label class="option-item"><input type="radio" name="age" value="Under 18" style="display:none;"><div class="option-radio"></div><span class="option-text">Under 18</span></label>
                    <label class="option-item"><input type="radio" name="age" value="18-24" style="display:none;"><div class="option-radio"></div><span class="option-text">18-24</span></label>
                    <label class="option-item"><input type="radio" name="age" value="25-34" style="display:none;"><div class="option-radio"></div><span class="option-text">25-34</span></label>
                    <label class="option-item"><input type="radio" name="age" value="35-44" style="display:none;"><div class="option-radio"></div><span class="option-text">35-44</span></label>
                    <label class="option-item"><input type="radio" name="age" value="45-54" style="display:none;"><div class="option-radio"></div><span class="option-text">45-54</span></label>
                    <label class="option-item"><input type="radio" name="age" value="55-64" style="display:none;"><div class="option-radio"></div><span class="option-text">55-64</span></label>
                    <label class="option-item"><input type="radio" name="age" value="65+" style="display:none;"><div class="option-radio"></div><span class="option-text">65+</span></label>
                </div>
            </div>

            <!-- Step 2: Gender -->
            <div class="quiz-step" data-step="2">
                <label class="question-label">What is your gender?</label>
                <div class="options-grid">
                    <label class="option-item"><input type="radio" name="gender" value="Male" style="display:none;"><div class="option-radio"></div><span class="option-text">Male</span></label>
                    <label class="option-item"><input type="radio" name="gender" value="Female" style="display:none;"><div class="option-radio"></div><span class="option-text">Female</span></label>
                    <label class="option-item"><input type="radio" name="gender" value="Prefer not to say" style="display:none;"><div class="option-radio"></div><span class="option-text">Prefer not to say</span></label>
                </div>
            </div>

            <!-- Step 3: Gastro Condition -->
            <div class="quiz-step" data-step="3">
                <label class="question-label">Do you currently have a gastrointestinal condition?</label>
                <div class="options-grid">
                    <label class="option-item"><input type="radio" name="gastro_condition" value="Diagnosed" style="display:none;"><div class="option-radio"></div><span class="option-text">Diagnosed</span></label>
                    <label class="option-item"><input type="radio" name="gastro_condition" value="Symptoms but no diagnosis" style="display:none;"><div class="option-radio"></div><span class="option-text">Symptoms but no diagnosis</span></label>
                    <label class="option-item"><input type="radio" name="gastro_condition" value="No known disease or symptoms" style="display:none;"><div class="option-radio"></div><span class="option-text">No known disease or symptoms</span></label>
                </div>
            </div>

            <!-- Step 4: Specific Condition -->
            <div class="quiz-step" data-step="4">
                <label class="question-label">If applicable, which condition are you most concerned with? (Select all that apply)</label>
                <div class="options-grid">
                    <label class="option-item"><input type="checkbox" name="condition_type[]" value="Crohn's" style="display:none;"><div class="option-checkbox"></div><span class="option-text">Crohn's</span></label>
                    <label class="option-item"><input type="checkbox" name="condition_type[]" value="UC" style="display:none;"><div class="option-checkbox"></div><span class="option-text">UC</span></label>
                    <label class="option-item"><input type="checkbox" name="condition_type[]" value="IBS" style="display:none;"><div class="option-checkbox"></div><span class="option-text">IBS</span></label>
                    <label class="option-item"><input type="checkbox" name="condition_type[]" value="General gut health / wellness" style="display:none;"><div class="option-checkbox"></div><span class="option-text">General gut health / wellness</span></label>
                    <label class="option-item"><input type="checkbox" name="condition_type[]" value="Other" class="toggle-dep" data-target="#condition-other-text" style="display:none;"><div class="option-checkbox"></div><span class="option-text">Other</span></label>
                </div>
                <div id="condition-other-text" class="dep-container" style="display:none; margin-top:15px;">
                    <input type="text" name="condition_type_other" class="input-field dep-input" placeholder="Please specify your condition...">
                </div>
            </div>

            <!-- Step 5: Looking For -->
            <div class="quiz-step" data-step="5">
                <label class="question-label">What are you primarily looking for today? (Select all that apply)</label>
                <div class="options-grid">
                    <label class="option-item"><input type="checkbox" name="looking_for[]" value="Research" style="display:none;"><div class="option-checkbox"></div><span class="option-text">Research</span></label>
                    <label class="option-item"><input type="checkbox" name="looking_for[]" value="Education" style="display:none;"><div class="option-checkbox"></div><span class="option-text">Education</span></label>
                    <label class="option-item"><input type="checkbox" name="looking_for[]" value="Health Tools" style="display:none;"><div class="option-checkbox"></div><span class="option-text">Health Tools</span></label>
                    <label class="option-item"><input type="checkbox" name="looking_for[]" value="Community Support" style="display:none;"><div class="option-checkbox"></div><span class="option-text">Community Support</span></label>
                    <label class="option-item"><input type="checkbox" name="looking_for[]" value="Specialist Nutrition" style="display:none;"><div class="option-checkbox"></div><span class="option-text">Specialist Nutrition</span></label>
                    <label class="option-item"><input type="checkbox" name="looking_for[]" value="Other" class="toggle-dep" data-target="#looking-other-text" style="display:none;"><div class="option-checkbox"></div><span class="option-text">Other</span></label>
                </div>
                <div id="looking-other-text" class="dep-container" style="display:none; margin-top:15px;">
                    <input type="text" name="looking_for_other" class="input-field dep-input" placeholder="Please specify...">
                </div>
            </div>

            <!-- Step 6: Duration -->
            <div class="quiz-step" data-step="6">
                <label class="question-label">How long have you been interested in gastrointestinal health?</label>
                <div class="options-grid">
                    <label class="option-item"><input type="radio" name="duration" value="Recently" style="display:none;"><div class="option-radio"></div><span class="option-text">Recently (less than 6 months)</span></label>
                    <label class="option-item"><input type="radio" name="duration" value="1-3 Years" style="display:none;"><div class="option-radio"></div><span class="option-text">1-3 Years</span></label>
                    <label class="option-item"><input type="radio" name="duration" value="3+ Years" style="display:none;"><div class="option-radio"></div><span class="option-text">3+ Years / Long-term</span></label>
                </div>
            </div>

            <!-- Step 7: Specialist status -->
            <div class="quiz-step" data-step="7">
                <label class="question-label">Are you currently seeing a specialist for your health goals?</label>
                <div class="options-grid grid-cols-2">
                    <label class="option-item"><input type="radio" name="seeing_specialist" value="Yes" class="toggle-dep" data-target="#specialist-text" style="display:none;"><div class="option-radio"></div><span class="option-text">Yes</span></label>
                    <label class="option-item"><input type="radio" name="seeing_specialist" value="No" class="toggle-dep-hide" data-group="specialist" style="display:none;"><div class="option-radio"></div><span class="option-text">No</span></label>
                </div>
                <div id="specialist-text" class="dep-container" style="display:none; margin-top:15px;" data-group="specialist">
                    <label style="font-size:14px; font-weight:600; margin-bottom:8px; display:block;">What type of specialist are you seeing (e.g., Family Doctor, Specialist Doctor, Nutritionist)?</label>
                    <input type="text" name="specialist_type" class="input-field dep-input" placeholder="Specify specialist...">
                </div>
            </div>

            <!-- Step 8: Prescribed Medication -->
            <div class="quiz-step" data-step="8">
                <label class="question-label">Do you currently use prescribed medication?</label>
                <div class="options-grid grid-cols-2">
                    <label class="option-item"><input type="radio" name="use_medication" value="Yes" class="toggle-dep" data-target="#medication-text" style="display:none;"><div class="option-radio"></div><span class="option-text">Yes</span></label>
                    <label class="option-item"><input type="radio" name="use_medication" value="No" class="toggle-dep-hide" data-group="medication" style="display:none;"><div class="option-radio"></div><span class="option-text">No</span></label>
                </div>
                <div id="medication-text" class="dep-container" style="display:none; margin-top:15px;" data-group="medication">
                    <label style="font-size:14px; font-weight:600; margin-bottom:8px; display:block;">Please specify the medication(s):</label>
                    <input type="text" name="medication_details" class="input-field dep-input" placeholder="List medications...">
                </div>
            </div>

            <!-- Step 9: Food Supplements -->
            <div class="quiz-step" data-step="9">
                <label class="question-label">Do you currently use food supplements?</label>
                <div class="options-grid grid-cols-2">
                    <label class="option-item"><input type="radio" name="use_supplements" value="Yes" class="toggle-dep" data-target="#supplements-options" style="display:none;"><div class="option-radio"></div><span class="option-text">Yes</span></label>
                    <label class="option-item"><input type="radio" name="use_supplements" value="No" class="toggle-dep-hide" data-group="supplements" style="display:none;"><div class="option-radio"></div><span class="option-text">No</span></label>
                </div>
                <div id="supplements-options" class="dep-container" style="display:none; margin-top:20px;" data-group="supplements">
                    <label style="font-size:14px; font-weight:600; margin-bottom:12px; display:block;">Please select the supplements you use:</label>
                    <div class="options-grid" style="grid-template-columns: 1fr 1fr;">
                        <label class="option-item"><input type="checkbox" name="supplement_types[]" value="Omega 3" style="display:none;"><div class="option-checkbox"></div><span class="option-text">Omega 3</span></label>
                        <label class="option-item"><input type="checkbox" name="supplement_types[]" value="Vitamin D" style="display:none;"><div class="option-checkbox"></div><span class="option-text">Vitamin D</span></label>
                        <label class="option-item"><input type="checkbox" name="supplement_types[]" value="Probiotics" style="display:none;"><div class="option-checkbox"></div><span class="option-text">Probiotics</span></label>
                        <label class="option-item"><input type="checkbox" name="supplement_types[]" value="Iron" style="display:none;"><div class="option-checkbox"></div><span class="option-text">Iron</span></label>
                        <label class="option-item"><input type="checkbox" name="supplement_types[]" value="Zinc" style="display:none;"><div class="option-checkbox"></div><span class="option-text">Zinc</span></label>
                        <label class="option-item"><input type="checkbox" name="supplement_types[]" value="Curcumin" style="display:none;"><div class="option-checkbox"></div><span class="option-text">Curcumin</span></label>
                        <label class="option-item"><input type="checkbox" name="supplement_types[]" value="Butrayte" style="display:none;"><div class="option-checkbox"></div><span class="option-text">Butrayte</span></label>
                        <label class="option-item"><input type="checkbox" name="supplement_types[]" value="Other" class="toggle-dep" data-target="#supp-other-text" style="display:none;"><div class="option-checkbox"></div><span class="option-text">Other</span></label>
                    </div>
                    <div id="supp-other-text" class="dep-container" style="display:none; margin-top:10px;">
                        <input type="text" name="supplement_other" class="input-field dep-input" placeholder="Specify other...">
                    </div>
                </div>
            </div>
            
            <div class="results-screen" id="results-screen">
                <h2>Analysis Complete</h2>
                <p>Based on your profile, we've unlocked a personalized clinical path and AI discovery suite for you.</p>
                
                <div class="register-cta">
                    <?php if ( is_user_logged_in() ) : ?>
                        <h3>Your Profile Has Been Updated</h3>
                        <p>Your discovery quiz responses have been saved to your clinical profile.</p>
                        <a href="<?php echo home_url('/dashboard/?tab=clinical-profile'); ?>" class="btn-quiz btn-next" style="display: inline-block; text-decoration: none;">View Your Answers</a>
                    <?php else : ?>
                        <h3>Join the IBD Health Hub Community</h3>
                        <p>Register for free today to access all the IBD Health Hub tools, clinical trackers, and your personalized dashboard.</p>
                        <a href="<?php echo home_url('/register/'); ?>" class="btn-quiz btn-next" style="display: inline-block; text-decoration: none;">Create Free Account</a>
                    <?php endif; ?>
                </div>
            </div>

            <div class="quiz-footer" id="quiz-footer">
                <button type="button" class="btn-quiz btn-prev" id="btn-prev" style="visibility:hidden;">Previous</button>
                <button type="button" class="btn-quiz btn-next" id="btn-next" disabled>Next Step</button>
            </div>
        </form>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    const steps = document.querySelectorAll('.quiz-step');
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    const progressBar = document.getElementById('progress-bar');
    const footer = document.getElementById('quiz-footer');
    const results = document.getElementById('results-screen');
    const quizForm = document.getElementById('health-quiz-form');
    
    let currentStep = 1;

    function updateProgress() {
        const percent = ((currentStep - 1) / (steps.length)) * 100;
        progressBar.style.width = percent + '%';
    }

    function showStep(stepNum) {
        steps.forEach(s => s.classList.remove('active'));
        document.querySelector(`.quiz-step[data-step="${stepNum}"]`).classList.add('active');
        
        prevBtn.style.visibility = stepNum === 1 ? 'hidden' : 'visible';
        
        checkSelection();
        updateProgress();
    }

    function checkSelection() {
        const activeStep = document.querySelector('.quiz-step.active');
        const checkedInputs = activeStep.querySelectorAll('input:checked');
        
        let isValid = false;
        
        // Need at least one selection
        if (checkedInputs.length > 0) {
            isValid = true;
            
            // Check dependent inputs (if they are visible, they must be filled)
            const visibleDeps = activeStep.querySelectorAll('.dep-container[style*="display: block"], .dep-container[style*="display: block;"], .dep-container:not([style*="display: none"])');
            visibleDeps.forEach(dep => {
                const textInput = dep.querySelector('.dep-input:not([type="checkbox"]):not([type="radio"])');
                if (textInput && textInput.value.trim() === '') {
                    isValid = false;
                }
                
                // If the dependent block contains checkboxes, at least one must be checked
                const nestedCheckboxes = dep.querySelectorAll('input[type="checkbox"]');
                if (nestedCheckboxes.length > 0) {
                    const checkedNested = dep.querySelectorAll('input[type="checkbox"]:checked');
                    if (checkedNested.length === 0) isValid = false;
                }
            });
        }
        
        nextBtn.disabled = !isValid;
    }

    // Add click events to option items
    document.querySelectorAll('.option-item').forEach(item => {
        item.addEventListener('click', function(e) {
            // Prevent double firing
            if (e.target.tagName === 'INPUT') return;
            
            const input = this.querySelector('input');
            const isRadio = input.type === 'radio';
            
            if (isRadio) {
                input.checked = true;
                this.parentElement.querySelectorAll('.option-item').forEach(i => {
                    if(i.querySelector('input[type="radio"]')) i.classList.remove('selected');
                });
                this.classList.add('selected');
            } else {
                input.checked = !input.checked;
                this.classList.toggle('selected');
            }
            
            // Handle dependent visibility
            if (input.classList.contains('toggle-dep')) {
                if (isRadio) {
                    const group = input.name;
                    document.querySelectorAll(`.dep-container[data-group="${group}"]`).forEach(el => {
                        el.style.display = 'none';
                        // clear inputs
                        el.querySelectorAll('input[type="text"]').forEach(i => i.value = '');
                        el.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = false);
                        el.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                    });
                }
                const targetId = input.getAttribute('data-target');
                const target = document.querySelector(targetId);
                if (target) {
                    target.style.display = input.checked ? 'block' : 'none';
                    if (!input.checked) {
                        target.querySelectorAll('input[type="text"]').forEach(i => i.value = '');
                    }
                }
            } else if (input.classList.contains('toggle-dep-hide')) {
                const group = input.getAttribute('data-group');
                document.querySelectorAll(`.dep-container[data-group="${group}"]`).forEach(el => {
                    el.style.display = 'none';
                    el.querySelectorAll('input[type="text"]').forEach(i => i.value = '');
                    el.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = false);
                    el.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                });
            }
            
            checkSelection();
        });
    });
    
    // Add input events to text fields to validate dynamically
    document.querySelectorAll('.dep-input').forEach(input => {
        input.addEventListener('input', checkSelection);
    });

    nextBtn.addEventListener('click', function() {
        if (currentStep < steps.length) {
            currentStep++;
            showStep(currentStep);
        } else {
            // End of quiz - Format Answers and Save if logged in
            <?php if(is_user_logged_in()): ?>
            const resultsData = {};
            const formData = new FormData(quizForm);
            
            for (let [key, value] of formData.entries()) {
                let cleanKey = key.replace('[]', '');
                if (resultsData[cleanKey]) {
                    if (Array.isArray(resultsData[cleanKey])) {
                        resultsData[cleanKey].push(value);
                    } else {
                        resultsData[cleanKey] = [resultsData[cleanKey], value];
                    }
                } else {
                    resultsData[cleanKey] = value;
                }
            }
            
            // convert array to comma separated strings
            for (let k in resultsData) {
                if (Array.isArray(resultsData[k])) {
                    resultsData[k] = resultsData[k].join(', ');
                }
            }
            
            jQuery.post('<?php echo admin_url('admin-ajax.php'); ?>', {
                action: 'ibdhh_save_quiz_results',
                quiz_data: resultsData,
                nonce: '<?php echo wp_create_nonce("ibdhh_quiz_nonce"); ?>'
            }, function(res) {
                console.log('Quiz saved', res);
            });
            <?php endif; ?>

            progressBar.style.width = '100%';
            steps.forEach(s => s.classList.remove('active'));
            footer.style.display = 'none';
            results.style.display = 'block';
        }
    });

    prevBtn.addEventListener('click', function() {
        if (currentStep > 1) {
            currentStep--;
            showStep(currentStep);
        }
    });
});
</script>

<?php get_footer(); ?>
