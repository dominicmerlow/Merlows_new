<div id="ibd-clinical-info-modal" class="ibd-modal" style="display:none; position:fixed; inset:0; background:rgba(10, 25, 41, 0.95); z-index:10000; overflow-y:auto; padding:20px; align-items:center; justify-content:center;">
    <div class="dash-card" style="max-width: 600px; width:100%; background: white; border-radius: 0; padding: 40px; position:relative; animation: slideUp 0.4s ease;">
        <span onclick="closeClinicalInfoModal()" style="position:absolute; top:20px; right:20px; font-size:24px; color:#64748B; cursor:pointer;">&times;</span>
        
        <h3 class="card-title" style="margin-bottom:24px; font-family:'Outfit'; font-size:24px;">Update Clinical Information</h3>
        <form id="modal-clinical-profile-form">
            <?php wp_nonce_field( 'ibdhh_dashboard_nonce', 'nonce' ); ?>
            <input type="hidden" name="action" value="ibdhh_save_clinical_profile">
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
                <div>
                    <label style="display:block; font-size:12px; font-weight:700; color:#64748B; margin-bottom:6px;">Weight (kg)</label>
                    <input type="text" name="weight" id="modal-weight" placeholder="e.g. 75" style="width:100%; padding:10px; border:1px solid #E2E8F0; border-radius:0;">
                </div>
                <div>
                    <label style="display:block; font-size:12px; font-weight:700; color:#64748B; margin-bottom:6px;">Height (cm)</label>
                    <input type="text" name="height" id="modal-height" placeholder="e.g. 180" style="width:100%; padding:10px; border:1px solid #E2E8F0; border-radius:0;">
                </div>
            </div>

            <div style="margin-bottom: 20px;">
                <label style="display:block; font-size:12px; font-weight:700; color:#64748B; margin-bottom:6px;">Current Medication</label>
                <textarea name="medication" id="modal-medication" rows="2" placeholder="List your current medications..." style="width:100%; padding:10px; border:1px solid #E2E8F0; border-radius:0; font-size:14px; resize:none;"></textarea>
            </div>

            <div style="margin-bottom: 20px;">
                <label style="display:block; font-size:12px; font-weight:700; color:#64748B; margin-bottom:6px;">Supplements</label>
                <textarea name="supplements" id="modal-supplements" rows="2" placeholder="List your supplements (e.g. Vit D, Omegas)..." style="width:100%; padding:10px; border:1px solid #E2E8F0; border-radius:0; font-size:14px; resize:none;"></textarea>
            </div>

            <div style="margin-bottom: 20px;">
                <label style="display:block; font-size:12px; font-weight:700; color:#64748B; margin-bottom:6px;">Digital Health Apps Used</label>
                <textarea name="digital_apps" id="modal-digital_apps" rows="2" placeholder="e.g. MyFitnessPal, Headspace, Oura..." style="width:100%; padding:10px; border:1px solid #E2E8F0; border-radius:0; font-size:14px; resize:none;"></textarea>
            </div>

            <div style="margin-bottom: 20px;">
                <label style="display:block; font-size:12px; font-weight:700; color:#64748B; margin-bottom:6px;">Lifestyle Changes (Diet/Exercise)</label>
                <textarea name="lifestyle_changes" id="modal-lifestyle_changes" rows="2" placeholder="Describe any recent changes..." style="width:100%; padding:10px; border:1px solid #E2E8F0; border-radius:0; font-size:14px; resize:none;"></textarea>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                <div>
                    <label style="display:block; font-size:12px; font-weight:700; color:#64748B; margin-bottom:6px;">Flare-up Frequency</label>
                    <select name="flare_up_freq" id="modal-flare_up_freq" style="width:100%; padding:10px; border:1px solid #E2E8F0; border-radius:0; font-size:14px;">
                        <option value="">Select Option</option>
                        <option value="Never">Never</option>
                        <option value="Rare">Rare (Yearly)</option>
                        <option value="Monthly">Monthly</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Daily">Daily</option>
                    </select>
                </div>
                <div>
                    <label style="display:block; font-size:12px; font-weight:700; color:#64748B; margin-bottom:6px;">Most Recent Flare-up</label>
                    <input type="text" name="last_flare_up" id="modal-last_flare_up" placeholder="e.g. 2 weeks ago" style="width:100%; padding:10px; border:1px solid #E2E8F0; border-radius:0; font-size:14px;">
                </div>
            </div>

            <div style="margin-bottom: 24px;">
                <label style="display:block; font-size:12px; font-weight:700; color:#64748B; margin-bottom:6px;">Blood Pressure</label>
                <input type="text" name="blood_pressure" id="modal-blood_pressure" placeholder="e.g. 120/80" style="width:100%; padding:10px; border:1px solid #E2E8F0; border-radius:0; font-size:14px;">
            </div>

            <button type="submit" style="width:100%; background:#9F2B68; color:white; border:none; padding:12px; border-radius:0; font-weight:700; cursor:pointer;">Update Profile Information</button>
        </form>
    </div>
</div>

<script>
function openClinicalInfoModal() {
    <?php 
    $user_id = get_current_user_id();
    $data = get_user_meta($user_id, '_ibdhh_clinical_profile', true) ?: array();
    ?>
    const data = <?php echo json_encode($data); ?>;
    if(data) {
        if(data.weight) document.getElementById('modal-weight').value = data.weight;
        if(data.height) document.getElementById('modal-height').value = data.height;
        if(data.medication) document.getElementById('modal-medication').value = data.medication;
        if(data.supplements) document.getElementById('modal-supplements').value = data.supplements;
        if(data.digital_apps) document.getElementById('modal-digital_apps').value = data.digital_apps;
        if(data.lifestyle_changes) document.getElementById('modal-lifestyle_changes').value = data.lifestyle_changes;
        if(data.flare_up_freq) document.getElementById('modal-flare_up_freq').value = data.flare_up_freq;
        if(data.last_flare_up) document.getElementById('modal-last_flare_up').value = data.last_flare_up;
        if(data.blood_pressure) document.getElementById('modal-blood_pressure').value = data.blood_pressure;
    }
    document.getElementById('ibd-clinical-info-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}
function closeClinicalInfoModal() {
    document.getElementById('ibd-clinical-info-modal').style.display = 'none';
    document.body.style.overflow = '';
}

jQuery('#modal-clinical-profile-form').on('submit', function(e) {
    e.preventDefault();
    const btn = jQuery(this).find('button');
    btn.prop('disabled', true).text('Updating...');
    jQuery.post('<?php echo admin_url('admin-ajax.php'); ?>', jQuery(this).serialize(), function(res) {
        if(res.success) {
            btn.text('Updated Successfully!').css('background', '#9F2B68');
            setTimeout(() => {
                closeClinicalInfoModal();
                location.reload(); 
            }, 1000);
        } else {
            alert(res.data);
            btn.prop('disabled', false).text('Update Profile Information');
        }
    });
});
</script>
