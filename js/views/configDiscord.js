import { getDB, mutate } from '../services/storage.js';
import { toast } from '../services/ui.js';
import { queueDiscordMessage } from '../services/supabase.js';

function esc(str){
  return String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

function compressImage(file, maxW, maxH){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const ratio = Math.min(maxW / width, maxH / height, 1);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/webp', 0.85));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function renderDiscordTab(db){
  const cfg = db.config.discord || { channelId: '', title: 'TRASPASO OFICIAL', color: '#6FA8FF', image: '' };

  window.__discordEditingImage = cfg.image || '';
  window.__discordEditingTestImage = '';

  return `
    <div class="card">
      <div class="card-header"><div class="card-title"><span class="dot">◆</span>CONFIGURACIÓN DEL BOT DE DISCORD</div></div>
      <p class="field-hint" style="margin-bottom:16px">Configura cómo se verán los mensajes automáticos de traspasos en tu servidor.</p>

      <div class="row">
        <div class="field">
          <label>ID del Canal de Discord</label>
          <input class="input" id="dcChannelId" value="${esc(cfg.channelId || '')}" placeholder="Ej: 123456789012345678">
          <small class="field-hint">Click derecho en el canal > Copiar ID.</small>
        </div>
        <div class="field">
          <label>Color del Embed (Hex)</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="color" id="dcColor" value="${esc(cfg.color || '#6FA8FF')}" style="width:56px;height:38px;padding:2px;border-radius:6px;background:var(--bg-elev);border:1px solid var(--border);cursor:pointer">
            <input class="input" id="dcColorHex" value="${esc(cfg.color || '#6FA8FF')}" style="flex:1;font-family:monospace">
          </div>
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label>Título del Embed</label>
          <input class="input" id="dcTitle" value="${esc(cfg.title || 'TRASPASO OFICIAL')}">
        </div>
        <div class="field">
          <label>Imagen del Embed (Fondo de Fichajes)</label>
          <div style="display:flex; align-items:center; gap:12px; margin-top:4px;">
            <div id="dcImagePreview" class="team-logo-box-lg" style="width:44px; height:44px; border-radius:6px; background:var(--bg-graphite); border:1px dashed var(--border);">
              ${cfg.image ? `<img src="${cfg.image}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">` : '<span style="font-size:20px;">🖼️</span>'}
            </div>
            <button class="btn btn-sm" type="button" id="dcUploadImageBtn">📤 SUBIR IMAGEN</button>
            <button class="btn btn-sm btn-danger" type="button" id="dcRemoveImageBtn" style="${cfg.image ? '' : 'display:none;'}">✕</button>
            <input type="file" id="dcImageInput" accept="image/*" hidden>
          </div>
          <small class="field-hint">Esta imagen aparecerá en todos los fichajes automáticos.</small>
        </div>
      </div>

      <div style="margin-top:16px">
        <button class="btn btn-primary" id="saveDiscordBtn">💾 GUARDAR CONFIGURACIÓN</button>
      </div>
    </div>

    <!-- 🔥 NUEVO: SECCIÓN DE MENSAJE DE PRUEBA PERSONALIZADO -->
    <div class="card" style="margin-top:18px; border-left:4px solid var(--gold)">
      <div class="card-header"><div class="card-title" style="color:var(--gold)"><span class="dot" style="color:var(--gold)">◆</span>ENVIAR MENSAJE DE PRUEBA</div></div>
      <p class="field-hint" style="margin-bottom:16px">Envía un mensaje personalizado a tu canal de Discord para probar cómo se ve.</p>

      <div class="row">
        <div class="field">
          <label>Título de la Prueba</label>
          <input class="input" id="dcTestTitle" value="PRUEBA DE CONEXIÓN" placeholder="Ej: ¡Hola Mundo!">
        </div>
        <div class="field">
          <label>Imagen de Prueba</label>
          <div style="display:flex; align-items:center; gap:12px; margin-top:4px;">
            <div id="dcTestImagePreview" class="team-logo-box-lg" style="width:44px; height:44px; border-radius:6px; background:var(--bg-graphite); border:1px dashed var(--border);">
              <span style="font-size:20px;">🖼️</span>
            </div>
            <button class="btn btn-sm" type="button" id="dcTestUploadImageBtn">📤 SUBIR IMAGEN</button>
            <button class="btn btn-sm btn-danger" type="button" id="dcTestRemoveImageBtn" style="display:none;">✕</button>
            <input type="file" id="dcTestImageInput" accept="image/*" hidden>
          </div>
        </div>
      </div>

      <div class="field">
        <label>Cuerpo del Mensaje</label>
        <textarea class="textarea" id="dcTestBody" rows="3" placeholder="Escribe aquí el mensaje que quieres probar...">Este es un mensaje de prueba enviado desde el Gestor de ZENITH.</textarea>
      </div>

      <button class="btn" id="testDiscordBtn" style="border-color:var(--gold); color:var(--gold)">🧪 ENVIAR MENSAJE DE PRUEBA</button>
    </div>
  `;
}

export function bindDiscordTab(){
  // ================= COLOR =================
  const colorInp = document.getElementById('dcColor');
  const colorHex = document.getElementById('dcColorHex');
  if (colorInp && colorHex) {
    colorInp.addEventListener('input', () => { colorHex.value = colorInp.value; });
    colorHex.addEventListener('input', () => {
      const v = colorHex.value.trim();
      if (/^#[0-9a-f]{6}$/i.test(v)) colorInp.value = v;
    });
  }

  // ================= IMAGEN DEFAULT =================
  const imgInput = document.getElementById('dcImageInput');
  const uploadBtn = document.getElementById('dcUploadImageBtn');
  const removeBtn = document.getElementById('dcRemoveImageBtn');
  const preview = document.getElementById('dcImagePreview');

  uploadBtn?.addEventListener('click', () => imgInput?.click());
  imgInput?.addEventListener('change', async () => {
    const f = imgInput.files[0];
    if (!f) return;
    try {
      const dataUrl = await compressImage(f, 800, 400);
      window.__discordEditingImage = dataUrl;
      preview.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`;
      removeBtn.style.display = 'inline-block';
    } catch(e) { toast('Error con la imagen', 'error'); }
  });

  removeBtn?.addEventListener('click', () => {
    window.__discordEditingImage = '';
    preview.innerHTML = '<span style="font-size:20px;">🖼️</span>';
    removeBtn.style.display = 'none';
    imgInput.value = '';
  });

  // ================= GUARDAR CONFIGURACIÓN =================
  document.getElementById('saveDiscordBtn')?.addEventListener('click', () => {
    try {
      mutate(d => {
        d.config.discord = d.config.discord || {};
        d.config.discord.channelId = document.getElementById('dcChannelId').value.trim();
        d.config.discord.color = document.getElementById('dcColorHex').value.trim();
        d.config.discord.title = document.getElementById('dcTitle').value.trim();
        d.config.discord.image = window.__discordEditingImage || '';
      });
      toast('✅ Configuración de Discord guardada', 'success');
    } catch(e) {
      toast('Error: ' + e.message, 'error');
    }
  });

  // ================= IMAGEN DE PRUEBA =================
  const testImgInput = document.getElementById('dcTestImageInput');
  const testUploadBtn = document.getElementById('dcTestUploadImageBtn');
  const testRemoveBtn = document.getElementById('dcTestRemoveImageBtn');
  const testPreview = document.getElementById('dcTestImagePreview');

  testUploadBtn?.addEventListener('click', () => testImgInput?.click());
  testImgInput?.addEventListener('change', async () => {
    const f = testImgInput.files[0];
    if (!f) return;
    try {
      const dataUrl = await compressImage(f, 800, 400);
      window.__discordEditingTestImage = dataUrl;
      testPreview.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`;
      testRemoveBtn.style.display = 'inline-block';
    } catch(e) { toast('Error con la imagen', 'error'); }
  });

  testRemoveBtn?.addEventListener('click', () => {
    window.__discordEditingTestImage = '';
    testPreview.innerHTML = '<span style="font-size:20px;">🖼️</span>';
    testRemoveBtn.style.display = 'none';
    testImgInput.value = '';
  });

  // ================= ENVIAR PRUEBA =================
  document.getElementById('testDiscordBtn')?.addEventListener('click', async () => {
    const channelId = document.getElementById('dcChannelId').value.trim();
    if (!channelId) return toast('Falta el ID del canal. Guarda la configuración primero.', 'error');

    try {
      const color = document.getElementById('dcColorHex').value.trim();
      const title = document.getElementById('dcTestTitle').value.trim() || 'PRUEBA DE BOT';
      const body = document.getElementById('dcTestBody').value.trim() || 'Sin cuerpo.';
      const image = window.__discordEditingTestImage || '';

      const embed = {
        title: title,
        color: parseInt(color.replace('#', ''), 16),
        description: body,
        timestamp: new Date().toISOString()
      };
      
      if (image) embed.image = { url: image };

      await queueDiscordMessage({ channelId, embed });
      toast('🧪 Mensaje encolado. Revisa tu Discord en unos segundos.', 'success');
    } catch (e) {
      toast('Error al encolar prueba: ' + e.message, 'error');
    }
  });
}
