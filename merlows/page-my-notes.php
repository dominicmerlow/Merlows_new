<?php
/**
 * Template Name: My Notes Editor
 */

if ( ! is_user_logged_in() ) {
    auth_redirect();
}

$note_id = isset($_GET['id']) ? sanitize_text_field($_GET['id']) : '';
$user_id = get_current_user_id();

$title = '';
$content = '';

if ( $note_id ) {
    $saved_notes = get_user_meta( $user_id, '_mlws_user_notes', true ) ?: array();
    foreach($saved_notes as $n) {
        if ( $n['id'] === $note_id ) {
            $title = $n['title'];
            $content = $n['content'];
            break;
        }
    }
}
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo( 'charset' ); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>My Notes - Merlows Hub</title>
    <?php wp_head(); ?>
    <style>
        body { margin: 0; background: #f8fafc; font-family: 'Inter', sans-serif; height: 100vh; display: flex; flex-direction: column; }
        .notes-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; background: white; border-bottom: 1px solid #e2e8f0; }
        .notes-editor-container { flex: 1; display: flex; flex-direction: column; max-width: 800px; margin: 0 auto; width: 100%; padding: 40px 20px; }
        .note-title-input { font-size: 24px; font-weight: 700; border: none; outline: none; width: 100%; margin-bottom: 20px; background: transparent; font-family: 'Outfit', sans-serif; color: #0f172a; }
        .toolbar { display: flex; gap: 8px; margin-bottom: 16px; padding: 8px; background: white; border-radius: 0; border: 1px solid #e2e8f0; }
        .toolbar button { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 0; color: #64748b; }
        .toolbar button:hover { background: #f1f5f9; color: #0f172a; }
        .editor-content { flex: 1; background: white; border-radius: 0; padding: 32px; border: 1px solid #e2e8f0; outline: none; overflow-y: auto; font-size: 16px; line-height: 1.6; color: #334155; min-height: 400px; }
        .btn-save { background: #1B4F8A; color: white; border: none; padding: 10px 20px; border-radius: 0; font-weight: 600; cursor: pointer; transition: background 0.2s; }
        .btn-save:hover { background: #e04f00; }
        .btn-pdf { background: #fff; color: #64748b; border: 1px solid #e2e8f0; padding: 10px 16px; border-radius: 0; font-weight: 600; cursor: pointer; margin-right: 8px; transition: all 0.2s; display: flex; align-items: center; gap: 6px; }
        .btn-pdf:hover { background: #f8fafc; color: #0f172a; border-color: #cbd5e1; }
        .status-msg { margin-right: 16px; font-size: 13px; color: #1B4F8A; opacity: 0; transition: opacity 0.3s; }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
</head>
<body>

<div class="notes-header">
    <div style="display: flex; align-items: center; gap: 12px;">
        <a href="/dashboard/" style="text-decoration: none; color: #64748b; font-weight: 600;">&larr; Dashboard</a>
        <span style="color: #cbd5e1;">|</span>
        <span style="font-weight: 600; color: #0f172a;">Notes Editor</span>
    </div>
    <div style="display: flex; align-items: center;">
        <span id="save-status" class="status-msg">Saved!</span>
        <button class="btn-pdf" onclick="downloadPDF()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            PDF
        </button>
        <button class="btn-save" onclick="saveNote()">Save Note</button>
    </div>
</div>

<div class="notes-editor-container">
    <input type="text" id="note-title" class="note-title-input" placeholder="Untitled Note" value="<?php echo esc_attr($title); ?>">
    
    <div class="toolbar">
        <button onclick="document.execCommand('undo',false,null)" title="Undo">↩️</button>
        <button onclick="document.execCommand('redo',false,null)" title="Redo">↪️</button>
        <div style="width: 1px; background: #e2e8f0; margin: 0 4px;"></div>
        <button onclick="document.execCommand('bold',false,null)" title="Bold"><strong>B</strong></button>
        <button onclick="document.execCommand('italic',false,null)" title="Italic"><em>I</em></button>
        <button onclick="document.execCommand('underline',false,null)" title="Underline"><u>U</u></button>
        <div style="width: 1px; background: #e2e8f0; margin: 0 4px;"></div>
        <button onclick="document.execCommand('fontSize',false,'5')" title="Large Text">A+</button>
        <button onclick="document.execCommand('fontSize',false,'3')" title="Normal Text">A</button>
        <div style="width: 1px; background: #e2e8f0; margin: 0 4px;"></div>
        <button onclick="document.execCommand('insertUnorderedList',false,null)" title="Bullet List">• List</button>
        <button onclick="document.execCommand('insertOrderedList',false,null)" title="Numbered List">1. List</button>
        <div style="width: 1px; background: #e2e8f0; margin: 0 4px;"></div>
        <button onclick="document.execCommand('justifyLeft',false,null)" title="Align Left">Left</button>
        <button onclick="document.execCommand('justifyCenter',false,null)" title="Align Center">Center</button>
        <div style="width: 1px; background: #e2e8f0; margin: 0 4px;"></div>
        <button onclick="document.execCommand('backColor',false,'#fef3c7')" title="Highlight">🖊️</button>
    </div>

    <div id="note-content" class="editor-content" contenteditable="true" placeholder="Start typing..."><?php echo wp_kses_post($content); ?></div>
</div>

<script>
var noteId = '<?php echo esc_js($note_id); ?>';

function saveNote() {
    var title = document.getElementById('note-title').value;
    var content = document.getElementById('note-content').innerHTML;
    var btn = document.querySelector('.btn-save');
    var status = document.getElementById('save-status');
    
    btn.textContent = 'Saving...';
    btn.disabled = true;

    var data = {
        action: 'mlws_save_note',
        id: noteId,
        title: title,
        content: content,
        nonce: '<?php echo wp_create_nonce("mlws_save_note_nonce"); ?>'
    };

    jQuery.post('<?php echo admin_url('admin-ajax.php'); ?>', data, function(res) {
        btn.textContent = 'Save Note';
        btn.disabled = false;
        
        if (res.success) {
            status.style.opacity = '1';
            setTimeout(function() { status.style.opacity = '0'; }, 3000);
            if (!noteId && res.data.id) {
                noteId = res.data.id;
                // Update URL without reload
                var newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?id=' + noteId;
                window.history.pushState({path:newUrl},'',newUrl);
            }
        } else {
            alert('Error saving note.');
        }
    });
}

function downloadPDF() {
    const title = document.getElementById('note-title').value || 'My Note';
    const content = document.getElementById('note-content').innerHTML;
    const date = new Date().toLocaleDateString();
    
    // Create a temporary element for PDF generation
    const element = document.createElement('div');
    element.innerHTML = `
        <div style="padding: 40px; font-family: Helvetica, Arial, sans-serif; color: #334155;">
            <div style="border-bottom: 2px solid #1B4F8A; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end;">
                <div>
                   <div style="font-size: 24px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: 1px;">IBD Research Centre Note</div>
                   <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Merlows • IBD Research Centre</div>
                </div>
                <div style="text-align: right; font-size: 11px; color: #94a3b8;">
                    <div>User: <?php echo esc_js(wp_get_current_user()->display_name); ?></div>
                    <div>Downloaded: ${date}</div>
                </div>
            </div>
            
            <h1 style="color: #0f172a; margin-bottom: 24px; font-size: 28px; font-weight: 700;">${title}</h1>
            
            <div style="font-size: 14px; line-height: 1.8;">
                ${content}
            </div>
            
            <div style="margin-top: 60px; font-size: 10px; color: #cbd5e1; border-top: 1px solid #e2e8f0; padding-top: 12px; text-align: center;">
                Generated from Merlows Hub Dashboard. Private & Confidential.
            </div>
        </div>
    `;

    const opt = {
        margin:       0.5,
        filename:     title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
}

// Auto-save every 30 seconds
setInterval(function() {
    if (document.getElementById('note-title').value && document.getElementById('note-content').innerHTML) {
        // Only autosave if there's content
        // saveNote(); // Optional: enable auto-save
    }
}, 30000);
</script>

<?php wp_footer(); ?>
</body>
</html>
