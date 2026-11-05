import { getDB, mutate } from '../services/storage.js';
import { toast } from '../services/ui.js';
import { queueDiscordMessage } from '../services/supabase.js';

function esc(str){
  return String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

export function renderDiscordTab(db){
  const cfg = db.config.discord || { channelId: '', title: 'TRASPASO OFICIAL', color: '#6FA8FF', image: '' };

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
          <label>URL de la Imagen (Opcional)</label>
          <input class="input" id="dcImage" value="${esc(cfg.image || '')}" placeholder="https://...">
        </div>
      </div>

      <div style="margin-top:16px">
        <button class="btn btn-primary" id="saveDiscordBtn">💾 GUARDAR CONFIGURACIÓN</button>
        <button class="btn" id="testDiscordBtn" style="margin-left:8px; border-color:var(--gold); color:var(--gold)">🧪 ENVIAR MENSAJE DE PRUEBA</button>
      </div>
    </div>
  `;
}

export function bindDiscordTab(){
  const colorInp = document.getElementById('dcColor');
  const colorHex = document.getElementById('dcColorHex');
  
  if (colorInp && colorHex) {
    colorInp.addEventListener('input', () => { colorHex.value = colorInp.value; });
    colorHex.addEventListener('input', () => {
      const v = colorHex.value.trim();
      if (/^#[0-9a-f]{6}$/i.test(v)) colorInp.value = v;
    });
  }

  document.getElementById('saveDiscordBtn')?.addEventListener('click', () => {
    try {
      mutate(d => {
        d.config.discord = d.config.discord || {};
        d.config.discord.channelId = document.getElementById('dcChannelId').value.trim();
        d.config.discord.color = document.getElementById('dcColorHex').value.trim();
        d.config.discord.title = document.getElementById('dcTitle').value.trim();
        d.config.discord.image = document.getElementById('dcImage').value.trim();
      });
      toast('✅ Configuración de Discord guardada', 'success');
    } catch(e) {
      toast('Error: ' + e.message, 'error');
    }
  });

  document.getElementById('testDiscordBtn')?.addEventListener('click', async () => {
    const channelId = document.getElementById('dcChannelId').value.trim();
    if (!channelId) return toast('Falta el ID del canal', 'error');

    try {
      const color = document.getElementById('dcColorHex').value.trim();
      const title = document.getElementById('dcTitle').value.trim() || 'PRUEBA DE BOT';
      const image = document.getElementById('dcImage').value.trim();

      const embed = {
        title: title,
        color: parseInt(color.replace('#', ''), 16),
        description: 'Este es un mensaje de prueba enviado desde el Gestor de ZENITH.',
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
