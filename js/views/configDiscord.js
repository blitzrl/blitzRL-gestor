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
  const cfg = db.config.discord || {};
  
  // Retrocompatibilidad con los nombres viejos
  const transferChannel = cfg.transferChannelId || cfg.channelId || '';
  const transferColor = cfg.transferColor || cfg.color || '#6FA8FF';
  const transferTitle = cfg.transferTitle || cfg.title || 'TRASPASO OFICIAL';
  const transferImage = cfg.transferImage || cfg.image || '';

  const newsChannel = cfg.newsChannelId || '';
  const newsColor = cfg.newsColor || '#E6C476'; // Dorado por defecto para noticias
  const newsTitle = cfg.newsTitle || 'NOTICIA OFICIAL';

  const testChannel = cfg.testChannelId || '';

  window.__dcTransferImg = transferImage;
  window.__dcTestImg = '';

  return `
    <!-- TARJETA 1: FICHAJES -->
    <div class="card" style="margin-bottom:18px">
      <div class="card-header"><div class="card-title"><span class="dot">◆</span>CONFIGURACIÓN DE FICHAJES</div></div>
      <p class="field-hint" style="margin-bottom:16px">Configura cómo se verán los mensajes automáticos de traspasos en tu servidor.</p>

      <div class="row">
        <div class="field">
          <label>ID del Canal de Fichajes</label>
          <input class="input" id="dcTransferChannel" value="${esc(transferChannel)}" placeholder="Ej: 123456789012345678">
        </div>
        <div class="field">
          <label>Color del Embed (Hex)</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="color" id="dcTransferColor" value="${esc(transferColor)}" style="width:56px;height:38px;padding:2px;border-radius:6px;background:var(--bg-elev);border:1px solid var(--border);cursor:pointer">
            <input class="input" id="dcTransferColorHex" value="${esc(transferColor)}" style="flex:1;font-family:monospace">
          </div>
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label>Título del Embed</label>
          <input class="input" id="dcTransferTitle" value="${esc(transferTitle)}">
        </div>
        <div class="field">
          <label>Imagen de Fondo (Opcional)</label>
          <div style="display:flex; align-items:center; gap:12px; margin-top:4px;">
            <div id="dcTransferImgPreview" class="team-logo-box-lg" style="width:44px; height:44px; border-radius:6px; background:var(--bg-graphite); border:1px dashed var(--border);">
              ${transferImage ? `<img src="${transferImage}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">` : '<span style="font-size:20px;">🖼️</span>'}
            </div>
            <button class="btn btn-sm" type="button" id="dcTransferImgBtn">📤 SUBIR IMAGEN</button>
            <button class="btn btn-sm btn-danger" type="button" id="dcTransferImgRemove" style="${transferImage ? '' : 'display:none;'}">✕</button>
            <input type="file" id="dcTransferImgInput" accept="image/*" hidden>
          </div>
        </div>
      </div>

      <div style="margin-top:16px">
        <button class="btn btn-primary" id="saveDiscordTransferBtn">💾 GUARDAR FICHAJES</button>
      </div>
    </div>

    <!-- TARJETA 2: NOTICIAS -->
    <div class="card" style="margin-bottom:18px; border-left:4px solid var(--gold)">
      <div class="card-header"><div class="card-title" style="color:var(--gold)"><span class="dot" style="color:var(--gold)">◆</span>CONFIGURACIÓN DE NOTICIAS</div></div>
      <p class="field-hint" style="margin-bottom:16px">Configura el canal y el color para las noticias que publiques desde el módulo de Noticias.</p>

      <div class="row">
        <div class="field">
          <label>ID del Canal de Noticias</label>
          <input class="input" id="dcNewsChannel" value="${esc(newsChannel)}" placeholder="Ej: 123456789012345678">
        </div>
        <div class="field">
          <label>Color del Embed (Hex)</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="color" id="dcNewsColor" value="${esc(newsColor)}" style="width:56px;height:38px;padding:2px;border-radius:6px;background:var(--bg-elev);border:1px solid var(--border);cursor:pointer">
            <input class="input" id="dcNewsColorHex" value="${esc(newsColor)}" style="flex:1;font-family:monospace">
          </div>
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label>Título por defecto (Ej: ESPN, TELEVISA)</label>
          <input class="input" id="dcNewsTitle" value="${esc(newsTitle)}">
        </div>
      </div>

      <div style="margin-top:16px">
        <button class="btn btn-primary" id="saveDiscordNewsBtn" style="background:var(--gold); color:#000; border-color:var(--gold)">💾 GUARDAR NOTICIAS</button>
      </div>
    </div>

    <!-- TARJETA 3: PRUEBAS -->
    <div class="card" style="border-left:4px solid #5865F2">
      <div class="card-header"><div class="card-title" style="color:#5865F2"><span class="dot" style="color:#5865F2">◆</span>ENVIAR MENSAJE DE PRUEBA</div></div>
      <p class="field-hint" style="margin-bottom:16px">Envía un mensaje personalizado a un canal privado para probar cómo se ve.</p>

      <div class="field">
        <label>ID del Canal de Pruebas</label>
        <input class="input" id="dcTestChannel" value="${esc(testChannel)}" placeholder="Ej: 123456789012345678">
      </div>

      <div class="row">
        <div class="field">
          <label>Título de la Prueba</label>
          <input class="input" id="dcTestTitle" value="PRUEBA DE CONEXIÓN" placeholder="Ej: ¡Hola Mundo!">
        </div>
        <div class="field">
          <label>Imagen de Prueba (Opcional)</label>
          <div style="display:flex; align-items:center; gap:12px; margin-top:4px;">
            <div id="dcTestImgPreview" class="team-logo-box-lg" style="width:44px; height:44px; border-radius:6px; background:var(--bg-graphite); border:1px dashed var(--border);">
              <span style="font-size:20px;">🖼️</span>
            </div>
            <button class="btn btn-sm" type="button" id="dcTestImgBtn">📤 SUBIR IMAGEN</button>
            <button class="btn btn-sm btn-danger" type="button" id="dcTestImgRemove" style="display:none;">✕</button>
            <input type="file" id="dcTestImgInput" accept="image/*" hidden>
          </div>
        </div>
      </div>

      <div class="field">
        <label>Cuerpo del Mensaje</label>
        <textarea class="textarea" id="dcTestBody" rows="3" placeholder="Pega aquí tu noticia con @menciones y :emojis:">Este es un mensaje de prueba enviado desde el Gestor de ZENITH.</textarea>
      </div>

      <div style="margin-top:16px">
        <button class="btn" id="testDiscordBtn" style="border-color:#5865F2; color:#5865F2">🧪 ENVIAR MENSAJE DE PRUEBA</button>
      </div>
    </div>
  `;
}

export function bindDiscordTab(){
  // ================= COLORES =================
  const bindColor = (colorId, hexId) => {
    const c = document.getElementById(colorId);
    const h = document.getElementById(hexId);
    if (c && h) {
      c.addEventListener('input', () => { h.value = c.value; });
      h.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(h.value.trim())) c.value = h.value; });
    }
  };
  bindColor('dcTransferColor', 'dcTransferColorHex');
  bindColor('dcNewsColor', 'dcNewsColorHex');

  // ================= IMAGEN FICHAJES =================
  const trInput = document.getElementById('dcTransferImgInput');
  document.getElementById('dcTransferImgBtn')?.addEventListener('click', () => trInput?.click());
  trInput?.addEventListener('change', async () => {
    if (!trInput.files[0]) return;
    try {
      const dataUrl = await compressImage(trInput.files[0], 800, 400);
      window.__dcTransferImg = dataUrl;
      document.getElementById('dcTransferImgPreview').innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`;
      document.getElementById('dcTransferImgRemove').style.display = 'inline-block';
    } catch(e) { toast('Error con la imagen', 'error'); }
  });
  document.getElementById('dcTransferImgRemove')?.addEventListener('click', () => {
    window.__dcTransferImg = '';
    document.getElementById('dcTransferImgPreview').innerHTML = '<span style="font-size:20px;">🖼️</span>';
    document.getElementById('dcTransferImgRemove').style.display = 'none';
    trInput.value = '';
  });

  // ================= GUARDAR FICHAJES =================
  document.getElementById('saveDiscordTransferBtn')?.addEventListener('click', () => {
    try {
      mutate(d => {
        d.config.discord = d.config.discord || {};
        d.config.discord.transferChannelId = document.getElementById('dcTransferChannel').value.trim();
        d.config.discord.transferColor = document.getElementById('dcTransferColorHex').value.trim();
        d.config.discord.transferTitle = document.getElementById('dcTransferTitle').value.trim();
        d.config.discord.transferImage = window.__dcTransferImg || '';
      });
      toast('✅ Configuración de Fichajes guardada', 'success');
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  });

  // ================= GUARDAR NOTICIAS =================
  document.getElementById('saveDiscordNewsBtn')?.addEventListener('click', () => {
    try {
      mutate(d => {
        d.config.discord = d.config.discord || {};
        d.config.discord.newsChannelId = document.getElementById('dcNewsChannel').value.trim();
        d.config.discord.newsColor = document.getElementById('dcNewsColorHex').value.trim();
        d.config.discord.newsTitle = document.getElementById('dcNewsTitle').value.trim();
      });
      toast('✅ Configuración de Noticias guardada', 'success');
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  });

  // ================= IMAGEN PRUEBA =================
  const testInput = document.getElementById('dcTestImgInput');
  document.getElementById('dcTestImgBtn')?.addEventListener('click', () => testInput?.click());
  testInput?.addEventListener('change', async () => {
    if (!testInput.files[0]) return;
    try {
      const dataUrl = await compressImage(testInput.files[0], 800, 400);
      window.__dcTestImg = dataUrl;
      document.getElementById('dcTestImgPreview').innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`;
      document.getElementById('dcTestImgRemove').style.display = 'inline-block';
    } catch(e) { toast('Error con la imagen', 'error'); }
  });
  document.getElementById('dcTestImgRemove')?.addEventListener('click', () => {
    window.__dcTestImg = '';
    document.getElementById('dcTestImgPreview').innerHTML = '<span style="font-size:20px;">🖼️</span>';
    document.getElementById('dcTestImgRemove').style.display = 'none';
    testInput.value = '';
  });

  // ================= ENVIAR PRUEBA =================
  document.getElementById('testDiscordBtn')?.addEventListener('click', async () => {
    const channelId = document.getElementById('dcTestChannel').value.trim();
    if (!channelId) return toast('Falta el ID del canal de pruebas. Guárdalo primero.', 'error');

    try {
      const title = document.getElementById('dcTestTitle').value.trim() || 'PRUEBA DE BOT';
      const body = document.getElementById('dcTestBody').value.trim() || 'Sin cuerpo.';
      const image = window.__dcTestImg || '';
      
      // Usamos el color de fichajes por defecto para las pruebas
      const db = getDB();
      const color = db.config.discord?.transferColor || '#6FA8FF';

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
