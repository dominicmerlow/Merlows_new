<?php
/**
 * Merlows Quiz Modal Template
 */
?>
<div id="ibd-quiz-modal" class="ibd-modal" style="display:none; position:fixed; inset:0; background:rgba(10, 25, 41, 0.95); z-index:10000; overflow-y:auto; padding:20px; align-items:flex-start; justify-content:center;">
    <div class="quiz-container" style="max-width: 800px; width:100%; background: white; border-radius: 0; overflow: hidden; position: relative; margin: 40px auto; animation: slideUp 0.4s ease;">
        <span onclick="closeQuizModal()" style="position:absolute; top:20px; right:20px; font-size:32px; color:white; cursor:pointer; z-index:10001; background:rgba(0,0,0,0.3); width:40px; height:40px; display:flex; align-items:center; justify-content:center; border-radius:0;">&times;</span>
        
        <div class="quiz-header" style="background: #0F172A; color: white; padding: 40px; text-align: center;">
            <h2 id="modal-quiz-title" style="font-family: 'Outfit', sans-serif; font-size: 32px; font-weight: 800; margin: 0 0 10px 0;">Merlows Discovery</h2>
            <p id="modal-quiz-subtitle" style="font-size: 16px; color: #cbd5e1; margin: 0;">Tell us a bit about yourself to personalize your experience.</p>
        </div>
        
        <div class="progress-bar-container" style="height: 8px; background: #e2e8f0; width: 100%;">
            <div class="progress-bar-fill" id="modal-progress-bar" style="height: 100%; background: #9F2B68; width: 0%; transition: width 0.4s ease;"></div>
        </div>

        <form id="modal-health-quiz-form">
            <div id="modal-quiz-steps-container"></div>

            <div class="results-screen" id="modal-results-screen" style="text-align:center; padding:80px 60px; display:none;">
                <h2 style="font-size:36px; font-weight:800; color:#0F172A; margin-bottom:20px; font-family:'Outfit';">Analysis Complete</h2>
                <p style="font-size:18px; color:#64748b; margin-bottom:40px;">Your clinical discovery responses have been updated.</p>
                
                <div class="quiz-cta-box" style="background:#0F172A; padding:40px; border-radius:0; color:white;">
                    <h3 style="font-size:24px; font-weight:700; margin-bottom:16px;">Step 1 Complete!</h3>
                    <p style="color:#94a3b8; font-size:15px; margin-bottom:24px;">Your basic profile is updated. Would you like to add more detailed clinical information for a deeper AI analysis?</p>
                    
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        <button type="button" onclick="openClinicalInfoFromQuiz()" class="btn-primary" style="background:#9F2B68; color:white; border:none; padding:14px 32px; border-radius:0; font-weight:700; font-family:'Outfit'; cursor:pointer; box-shadow:0 10px 20px rgba(255, 90, 0, 0.2);">Add Detailed Clinical Info &rarr;</button>
                        <button type="button" onclick="handleQuizCompletion()" style="background:transparent; color:#cbd5e1; border:1px solid rgba(255,255,255,0.2); padding:10px 32px; border-radius:0; font-weight:600; font-family:'Outfit'; cursor:pointer;">No thanks, view my profile</button>
                    </div>
                </div>
            </div>

            <div class="quiz-footer" id="modal-quiz-footer" style="padding:30px 60px 40px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f5f9; gap:16px;">
                <button type="button" class="btn-quiz modal-prev" id="modal-btn-prev" style="visibility:hidden; background:#f1f5f9; color:#64748b; border:none; padding:14px 24px; border-radius:0; cursor:pointer; font-weight:700;">Previous</button>
                <div style="display:flex; gap:12px;">
                    <button type="button" class="modal-btn-save" id="modal-btn-save" onclick="submitQuiz(true)">Save & Exit</button>
                    <button type="button" class="btn-quiz modal-next" id="modal-btn-next" disabled style="background:#9F2B68; color:white; border:none; padding:14px 32px; border-radius:0; cursor:pointer; font-weight:700; opacity:0.5;">Next Step</button>
                </div>
            </div>
        </form>
    </div>
</div>



<script>
let currentQuizStep = 1;

// Parse existing results
<?php 
$meta = is_user_logged_in() ? get_user_meta(get_current_user_id(), '_mlws_healthcare_quiz_results', true) : array();
if (!is_array($meta)) $meta = array();
?>
let savedData = <?php echo json_encode( empty($meta) ? (object)array() : $meta ); ?>;
const quizResults = {};
// Ensure arrays are parsed correctly if they were saved as comma-separated strings
for (let key in savedData) {
    if (typeof savedData[key] === 'string' && (key === 'condition_type' || key === 'looking_for' || key === 'supplement_types')) {
        quizResults[key] = savedData[key].split(',').map(s => s.trim()).filter(Boolean);
    } else {
        quizResults[key] = savedData[key];
    }
}

const quizStepsContent = [
    { title: "What is your age?", field: "age", type: "radio", layout: 'grid', opts: ['Under 18', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'] },
    { title: "What is your gender?", field: "gender", type: "radio", opts: ['Male', 'Female', 'Prefer not to say'] },
    { title: "Do you currently have a gastrointestinal condition?", field: "gastro_condition", type: "radio", opts: ['Diagnosed', 'Symptoms but no diagnosis', 'No known disease or symptoms'] },
    { title: "Which condition are you most concerned with? (Select all that apply)", field: "condition_type", type: "checkbox", opts: ["Crohn's", "UC", "IBS", "General gut health / wellness", {v: "Other", textInput: true, txtField: "condition_type_other"}] },
    { title: "What are you primarily looking for today? (Select all that apply)", field: "looking_for", type: "checkbox", opts: ["Research", "Education", "Health Tools", "Community Support", "Specialist Nutrition", {v: "Other", textInput: true, txtField: "looking_for_other"}] },
    { title: "How long have you been interested in gastrointestinal health?", field: "duration", type: "radio", opts: [{v: "Recently", t: "Recently (less than 6 months)"}, {v: "1-3 Years", t: "1-3 Years"}, {v: "3+ Years", t: "3+ Years / Long-term"}] },
    { title: "Are you currently seeing a specialist for your health goals?", field: "seeing_specialist", type: "radio", layout: 'grid', opts: [{v: "Yes", textInput: true, txtField: "specialist_type", textLabel: "What type of specialist?"}, "No"] },
    { title: "Do you currently use prescribed medication?", field: "use_medication", type: "radio", layout: 'grid', opts: [{v: "Yes", textInput: true, txtField: "medication_details", textLabel: "Please specify:"}, "No"] },
    { title: "Do you currently use food supplements?", field: "use_supplements", type: "radio", layout: 'grid', opts: [{v: "Yes", depField: "supplement_types", depCheckboxes: ["Omega 3", "Vitamin D", "Probiotics", "Iron", "Zinc", "Curcumin", "Butrayte", {v:"Other", textInput:true, txtField:"supplement_other"}]}, "No"] }
];
const totalQuizSteps = quizStepsContent.length;

let isSingleEditMode = false;

function openQuizModal(startStep = 1, singleEdit = false) {
    isSingleEditMode = singleEdit;
    document.getElementById('ibd-quiz-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    document.getElementById('modal-quiz-steps-container').style.display = 'block';
    document.getElementById('modal-quiz-footer').style.display = 'flex';
    document.getElementById('modal-results-screen').style.display = 'none';

    currentQuizStep = startStep;
    renderQuizStep(currentQuizStep);
}

function closeQuizModal() {
    document.getElementById('ibd-quiz-modal').style.display = 'none';
    document.body.style.overflow = '';
}

function renderQuizStep(num) {
    const data = quizStepsContent[num-1];
    const container = document.getElementById('modal-quiz-steps-container');
    
    document.getElementById('modal-progress-bar').style.width = ((num-1) / totalQuizSteps * 100) + '%';
    
    let optionsHtml = '';
    const isMulti = data.type === 'checkbox';
    
    // Ensure array exists for checkboxes
    if (isMulti && !quizResults[data.field]) quizResults[data.field] = [];
    
    data.opts.forEach((opt, idx) => {
        const val = typeof opt === 'object' ? opt.v : opt;
        const txt = typeof opt === 'object' && opt.t ? opt.t : val;
        
        let isSelected = false;
        if (isMulti) {
            isSelected = quizResults[data.field].includes(val);
        } else {
            isSelected = quizResults[data.field] === val;
        }
        
        const typeStr = isMulti ? 'checkbox' : 'radio';
        const shapeStr = isMulti ? '4px' : '50%';
        
        // Option HTML
        optionsHtml += `
            <label class="modal-option-item ${isSelected ? 'selected' : ''}" style="padding:16px 20px; border:2px solid ${isSelected?'#9F2B68':'#e2e8f0'}; display:flex; align-items:center; gap:12px; cursor:pointer; user-select:none; background:${isSelected?'#F5F0FA':'white'};" onclick="handleOptionClick(this, ${num-1}, ${idx})">
                <input type="${typeStr}" name="${data.field}" value="${val}" ${isSelected ? 'checked' : ''} style="display:none;">
                <div style="width:20px; height:20px; border:2px solid ${isSelected?'#9F2B68':'#cbd5e1'}; border-radius:${shapeStr}; display:flex; align-items:center; justify-content:center; background:${isSelected?'#9F2B68':'transparent'};">
                    ${isSelected ? (isMulti ? '<span style="color:white;font-size:12px;">✓</span>' : '<div style="width:10px;height:10px;background:white;border-radius:50%;"></div>') : ''}
                </div>
                <span style="font-size:15px; font-weight:600; color:#334155;">${txt}</span>
            </label>
        `;
        
        // Dependent Text Input
        if (typeof opt === 'object' && opt.textInput) {
            const txtVal = quizResults[opt.txtField] || '';
            const displayStr = isSelected ? 'block' : 'none';
            optionsHtml += `
                <div id="dep-text-${data.field}-${val}" style="display:${displayStr}; grid-column:1/-1; margin:-4px 0 16px;">
                    ${opt.textLabel ? `<label style="display:block; font-size:13px; font-weight:600; margin-bottom:8px;">${opt.textLabel}</label>` : ''}
                    <input type="text" value="${txtVal}" oninput="quizResults['${opt.txtField}'] = this.value; checkModalValidity();" placeholder="Please specify..." style="width:100%; padding:12px; border:2px solid #e2e8f0; border-radius:0;">
                </div>
            `;
        }
        
        // Dependent Checkboxes (e.g. Supplements -> Yes -> lists)
        if (typeof opt === 'object' && opt.depCheckboxes) {
            const depField = opt.depField;
            if (!quizResults[depField]) quizResults[depField] = [];
            
            let depHtml = '';
            opt.depCheckboxes.forEach((depOpt, dIdx) => {
                const dVal = typeof depOpt === 'object' ? depOpt.v : depOpt;
                const dTxt = dVal;
                const dSelected = quizResults[depField].includes(dVal);
                
                depHtml += `
                    <label class="modal-option-item ${dSelected ? 'selected' : ''}" style="padding:12px 16px; border:2px solid ${dSelected?'#9F2B68':'#e2e8f0'}; display:flex; align-items:center; gap:12px; cursor:pointer; background:${dSelected?'#F5F0FA':'white'};">
                        <input type="checkbox" value="${dVal}" ${dSelected ? 'checked' : ''} style="display:none;" onchange="handleDepCheckboxChange(this, '${depField}', ${dIdx})">
                        <div style="width:18px; height:18px; border:2px solid ${dSelected?'#9F2B68':'#cbd5e1'}; border-radius:4px; display:flex; align-items:center; justify-content:center; background:${dSelected?'#9F2B68':'transparent'};">
                            ${dSelected ? '<span style="color:white;font-size:10px;">✓</span>' : ''}
                        </div>
                        <span style="font-size:14px; font-weight:600; color:#334155;">${dTxt}</span>
                    </label>
                `;
                
                if (typeof depOpt === 'object' && depOpt.textInput) {
                    const dTxtVal = quizResults[depOpt.txtField] || '';
                    const dDisplayStr = dSelected ? 'block' : 'none';
                    depHtml += `
                        <div id="dep-text-${depField}-${dVal}" style="display:${dDisplayStr}; grid-column:1/-1; margin:-4px 0 12px;">
                            <input type="text" value="${dTxtVal}" oninput="quizResults['${depOpt.txtField}'] = this.value; checkModalValidity();" placeholder="Specify other..." style="width:100%; padding:10px; border:2px solid #e2e8f0; border-radius:0;">
                        </div>
                    `;
                }
            });
            
            const displayStr = isSelected ? 'grid' : 'none';
            optionsHtml += `
                <div id="dep-check-${data.field}-${val}" style="display:${displayStr}; grid-template-columns:1fr 1fr; gap:10px; grid-column:1/-1; margin:8px 0 16px; padding:16px; background:#f8fafc; border:1px solid #e2e8f0;">
                    <label style="grid-column:1/-1; font-size:13px; font-weight:700; margin-bottom:4px;">Select all that apply:</label>
                    ${depHtml}
                </div>
            `;
        }
    });

    container.innerHTML = `
        <div class="quiz-step active" style="padding:40px 60px;">
            <label style="display:block; font-size:24px; font-weight:700; color:#0F172A; margin-bottom:30px; font-family:'Outfit';">${data.title}</label>
            <div style="display:${data.layout === 'grid' ? 'grid' : 'flex'}; grid-template-columns:1fr 1fr; flex-direction:column; gap:12px;">
                ${optionsHtml}
            </div>
        </div>
    `;

    document.getElementById('modal-btn-prev').style.visibility = num === 1 ? 'hidden' : 'visible';
    document.getElementById('modal-btn-next').innerText = (num === totalQuizSteps) ? 'Finish' : 'Next Step';
    document.getElementById('modal-btn-save').style.display = isSingleEditMode ? 'block' : 'none';
    
    checkModalValidity();
}

function handleOptionClick(el, stepIdx, optIdx) {
    const data = quizStepsContent[stepIdx];
    const isMulti = data.type === 'checkbox';
    const opt = data.opts[optIdx];
    const val = typeof opt === 'object' ? opt.v : opt;
    
    if (isMulti) {
        // Toggle array
        const i = quizResults[data.field].indexOf(val);
        if (i > -1) quizResults[data.field].splice(i, 1);
        else quizResults[data.field].push(val);
    } else {
        quizResults[data.field] = val;
    }
    
    renderQuizStep(stepIdx + 1); // re-render to update UI and dependencies
}

// Global function to attach to dynamic html
window.handleDepCheckboxChange = function(inputEl, depField, optIdx) {
    // Requires finding the parent data to know what to update.
    // The easiest way is directly re-rendering the current step after modifying quizResults.
    const val = inputEl.value;
    if (!quizResults[depField]) quizResults[depField] = [];
    
    const i = quizResults[depField].indexOf(val);
    if (inputEl.checked && i === -1) quizResults[depField].push(val);
    else if (!inputEl.checked && i > -1) quizResults[depField].splice(i, 1);
    
    renderQuizStep(currentQuizStep);
}

function checkModalValidity() {
    const data = quizStepsContent[currentQuizStep - 1];
    let isValid = false;
    
    const val = quizResults[data.field];
    
    if (data.type === 'checkbox') {
        isValid = Array.isArray(val) && val.length > 0;
    } else {
        isValid = !!val;
    }
    
    // Check required text fields
    if (isValid) {
        data.opts.forEach(opt => {
            if (typeof opt === 'object') {
                const optVal = opt.v;
                const isSelected = data.type === 'checkbox' ? val.includes(optVal) : val === optVal;
                
                if (isSelected && opt.textInput) {
                    if (!quizResults[opt.txtField] || quizResults[opt.txtField].trim() === '') {
                        isValid = false;
                    }
                }
                
                // Nested depCheckboxes validation could go here...
                if (isSelected && opt.depCheckboxes) {
                    const depVal = quizResults[opt.depField];
                    if (!Array.isArray(depVal) || depVal.length === 0) isValid = false;
                    else {
                        opt.depCheckboxes.forEach(dOpt => {
                            if (typeof dOpt === 'object' && dOpt.textInput && depVal.includes(dOpt.v)) {
                                if (!quizResults[dOpt.txtField] || quizResults[dOpt.txtField].trim() === '') {
                                    isValid = false;
                                }
                            }
                        });
                    }
                }
            }
        });
    }

    const nextBtn = document.getElementById('modal-btn-next');
    nextBtn.disabled = !isValid;
    nextBtn.style.opacity = isValid ? '1' : '0.5';
}

document.getElementById('modal-btn-next').addEventListener('click', () => {
    if(currentQuizStep < totalQuizSteps) {
        currentQuizStep++;
        renderQuizStep(currentQuizStep);
    } else {
        submitQuiz();
    }
});

document.getElementById('modal-btn-prev').addEventListener('click', () => {
    if(currentQuizStep > 1) {
        currentQuizStep--;
        renderQuizStep(currentQuizStep);
    }
});

function submitQuiz(quickSave = false) {
    if (quickSave) {
        closeQuizModal();
    } else {
        document.getElementById('modal-progress-bar').style.width = '100%';
        document.getElementById('modal-quiz-steps-container').style.display = 'none';
        document.getElementById('modal-quiz-footer').style.display = 'none';
        document.getElementById('modal-results-screen').style.display = 'block';
    }

    <?php if(is_user_logged_in()): ?>
    // stringify arrays to match how the standalone quiz formats its data
    const payload = {};
    for (let k in quizResults) {
        if (Array.isArray(quizResults[k])) {
            payload[k] = quizResults[k].join(', ');
        } else {
            payload[k] = quizResults[k];
        }
    }
    
    jQuery.ajax({
        url: '<?php echo admin_url('admin-ajax.php'); ?>',
        type: 'POST',
        data: {
            action: 'mlws_save_quiz_results',
            quiz_data: payload,
            nonce: '<?php echo wp_create_nonce("mlws_quiz_nonce"); ?>'
        },
        success: function(res) {
            if(quickSave) location.reload();
        }
    });
    <?php endif; ?>
}

function handleQuizCompletion() {
    <?php if(!is_user_logged_in()): ?>
        closeQuizModal();
        if (typeof openGuestModal === 'function') openGuestModal();
    <?php else: ?>
        window.location.href = '<?php echo home_url('/dashboard/?tab=clinical-profile'); ?>';
    <?php endif; ?>
}

function openClinicalInfoFromQuiz() {
    closeQuizModal();
    if (typeof openClinicalInfoModal === 'function') {
        openClinicalInfoModal();
    }
}
</script>
