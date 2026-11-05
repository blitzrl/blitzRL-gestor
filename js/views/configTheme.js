import { getDB, mutate } from '../services/storage.js';
import { toast, openModal, closeTopModal } from '../services/ui.js';
import { getDefaultTheme, uid } from '../data/database.js';
import { DEFAULT_THEME, applyTheme, exportTheme, importTheme, themePreviewBg } from '../services/theme.js'; // 🔥 FIX: DEFAULT_THEME importado desde theme.js
import { logChange } from '../services/history.js';

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

export function renderThemeTab(db){
  const theme = db.config.theme?.active || getDefaultTheme();
  const presets = db.config.theme?.presets || [];
  const bg = theme.background || DEFAULT_THEME.background;
  const colors = theme.colors || DEFAULT_THEME.colors;
  const isSolid = bg.type === 'solid';
  const gradientColors = (bg.gradientColors && bg.gradientColors.length >= 2)
    ? bg.gradientColors
    : DEFAULT_THEME.background.gradientColors;
  const angle = (typeof bg.gradientAngle === 'number') ? bg.gradientAngle : 135;

  window.__themeEditingBanner = db.transferBannerBg || '';

  return `
    <div class="card" style="margin-bottom:18px">
      <div class="card-header"><div class="card-title"><span class="dot">◆</span>IDENTIDAD DE MARCA</div></div>

      <div class="row">
        <div class="field">
          <label>Nombre de la liga</label>
          <input class="input" id="themeBrandName" value="${esc(theme.brandName || 'ZENITH')}" placeholder="ZENITH">
        </div>
        <div class="field">
          <label>Motto / Tagline</label>
          <input class="input" id="themeBrandMotto" value="${esc(theme.brandMotto || '')}" placeholder="YOUR LEVEL IS NOT YOUR LIMIT">
        </div>
      </div>

      <div class="field">
        <label>Logo de la liga</label>
        <div class="dropzone" id="themeLogoDrop" style="display:flex;align-items:center;gap:16px;justify-content:flex-start;padding:16px">
          <div id="themeLogoPreview" style="width:72px;height:72px;flex-shrink:0;border-radius:10px;background:var(--bg-elev);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden">
            ${theme.logo
              ? `<img src="${theme.logo}" style="width:100%;height:100%;object-fit:contain;padding:6px">`
              : `<span style="color:var(--muted);font-size:11px;text-align:center;line-height:1.3">SIN<br>LOGO</span>`}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12.5px;color:var(--silver-light);margin-bottom:4px">Sube un logo personalizado</div>
            <div class="field-hint" style="margin:0">PNG cuadrado recomendado (256×256 o mayor). Reemplaza el logo por defecto en el sidebar y topbar.</div>
          </div>
        </div>
        <input type="file" id="themeLogoInput" accept="image/*" hidden>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button type="button" class="btn btn-sm" id="themeLogoUpload">📤 SUBIR LOGO</button>
          <button type="button" class="btn btn-sm btn-danger" id="themeLogoRemove">🗑 QUITAR LOGO</button>
        </div>
      </div>
    </div>

    <!-- BANNER DE FONDO -->
    <div class="card" style="margin-bottom:18px">
      <div class="card-header"><div class="card-title"><span class="dot">◆</span>BANNER DE FICHajes (NOTICIAS)</div></div>
      <p class="field-hint" style="margin-bottom:12px">Esta imagen de fondo se usará al generar automáticamente la noticia de un fichaje.</p>
      
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">
        <div id="themeBannerPreview" style="width:200px;height:80px;flex-shrink:0;border-radius:8px;background:var(--bg-elev);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden">
          ${window.__themeEditingBanner
            ? `<img src="${window.__themeEditingBanner}" style="width:100%;height:100%;object-fit:cover">`
            : `<span style="color:var(--muted);font-size:11px;text-align:center">SIN BANNER</span>`}
        </div>
        <div style="flex:1;min-width:0">
          <input type="file" id="themeBannerInput" accept="image/*" hidden>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn btn-sm" id="themeBannerUpload">📤 SUBIR BANNER</button>
            <button type="button" class="btn btn-sm btn-danger" id="themeBannerRemove">🗑 QUITAR BANNER</button>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:18px">
      <div class="card-header"><div class="card-title"><span class="dot">◆</span>FONDO DE LA APP</div></div>

      <div class="field">
        <label>Tipo de fondo</label>
        <div style="display:flex;gap:16px;flex-wrap:wrap;padding-top:4px">
          <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--silver-light);cursor:pointer">
            <input type="radio" name="themeBgType" value="solid" ${isSolid ? 'checked' : ''}> Color sólido
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--silver-light);cursor:pointer">
            <input type="radio" name="themeBgType" value="gradient" ${!isSolid ? 'checked' : ''}> Degradado lineal
          </label>
        </div>
      </div>

      <div id="themeSolidWrap" style="display:${isSolid ? '' : 'none'}">
        <div class="field">
          <label>Color de fondo</label>
          <div style="display:flex;gap:10px;align-items:center">
            <input type="color" id="themeSolidColor" value="${bg.solidColor || '#050505'}" style="width:60px;height:38px;padding:2px;border-radius:6px;background:var(--bg-elev);border:1px solid var(--border);cursor:pointer">
            <input class="input" id="themeSolidColorHex" value="${bg.solidColor || '#050505'}" style="flex:1;font-family:monospace">
          </div>
        </div>
      </div>

      <div id="themeGradientWrap" style="display:${isSolid ? 'none' : ''}">
        <div class="field">
          <label>Colores del degradado <span style="color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0">(mín. 2, máx. 5)</span></label>
          <div id="themeGradientStops" style="display:flex;flex-direction:column;gap:8px">
            ${gradientColors.map((c, i) => renderGradientStopRow(c, i, gradientColors.length)).join('')}
          </div>
          <button type="button" class="btn btn-sm" id="themeAddStop" style="margin-top:10px" ${gradientColors.length >= 5 ? 'disabled' : ''}>
            + AÑADIR COLOR
          </button>
        </div>

        <div class="field">
          <label>Ángulo del degradado: <span id="themeAngleVal" style="color:var(--accent);font-family:monospace">${angle}°</span></label>
          <input type="range" id="themeAngle" min="0" max="360" value="${angle}" style="width:100%">
        </div>
      </div>

      <div class="field" style="margin-top:8px">
        <label>Preview en vivo</label>
        <div id="themePreviewBg" style="height:90px;border-radius:10px;border:1px solid var(--border-soft);background:${themePreviewBg(theme)}"></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:18px">
      <div class="card-header"><div class="card-title"><span class="dot">◆</span>COLORES DE ACENTO</div></div>
      <div class="row">
        <div class="field">
          <label>Acento principal</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="color" id="themeAccent" value="${colors.accent}" style="width:56px;height:38px;padding:2px;border-radius:6px;background:var(--bg-elev);border:1px solid var(--border);cursor:pointer">
            <input class="input" id="themeAccentHex" value="${colors.accent}" style="flex:1;font-family:monospace">
          </div>
        </div>
        <div class="field">
          <label>Dorado (trofeos/campeón)</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="color" id="themeGold" value="${colors.gold}" style="width:56px;height:38px;padding:2px;border-radius:6px;background:var(--bg-elev);border:1px solid var(--border);cursor:pointer">
            <input class="input" id="themeGoldHex" value="${colors.gold}" style="flex:1;font-family:monospace">
          </div>
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Peligro / Rojo</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="color" id="themeDanger" value="${colors.danger}" style="width:56px;height:38px;padding:2px;border-radius:6px;background:var(--bg-elev);border:1px solid var(--border);cursor:pointer">
            <input class="input" id="themeDangerHex" value="${colors.danger}" style="flex:1;font-family:monospace">
          </div>
        </div>
        <div class="field">
          <label>Éxito / Verde</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="color" id="themeSuccess" value="${colors.success}" style="width:56px;height:38px;padding:2px;border-radius:6px;background:var(--bg-elev);border:1px solid var(--border);cursor:pointer">
            <input class="input" id="themeSuccessHex" value="${colors.success}" style="flex:1;font-family:monospace">
          </div>
        </div>
      </div>
      <div id="themeContrastWarn" style="display:none;margin-top:12px;padding:10px 12px;background:rgba(230,196,118,.08);border:1px solid rgba(230,196,118,.35);border-radius:6px;font-size:12px;color:var(--gold);line-height:1.5">
        ⚠ <b>Contraste bajo detectado.</b> El fondo elegido puede hacer ilegible el texto claro del sistema. Considera usar un fondo más oscuro.
      </div>
    </div>

    <div class="card" style="margin-bottom:18px">
      <div class="card-header"><div class="card-title"><span class="dot">◆</span>ACCIONES</div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" id="themeReset" type="button">↺ RESTAURAR DEFAULT</button>
        <button class="btn btn-primary" id="themeSave" type="button">💾 GUARDAR Y APLICAR</button>
        <button class="btn" id="themeSaveAsPreset" type="button">📌 GUARDAR COMO PRESET</button>
        <button class="btn" id="themeExport" type="button">⬇ EXPORTAR TEMA</button>
        <label class="btn" style="cursor:pointer;position:relative">
          ⬆ IMPORTAR TEMA
          <input type="file" id="themeImport" accept="application/json" hidden style="position:absolute;inset:0;opacity:0;cursor:pointer">
        </label>
      </div>
      <p class="field-hint" style="margin-top:10px">
        Los cambios se aplican en vivo mientras editas (preview local). Pulsa <b style="color:var(--silver-light)">GUARDAR Y APLICAR</b> para persistir y publicar a Supabase.
      </p>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title"><span class="dot">◆</span>PRESETS GUARDADOS</div>
        <span class="card-sub">${presets.length} / 10</span>
      </div>
      ${presets.length === 0
        ? `<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px;border:1px dashed var(--border);border-radius:8px">No hay presets guardados. Usa "GUARDAR COMO PRESET" para crear uno.</div>`
        : `<div style="display:flex;flex-direction:column;gap:10px">
            ${presets.map(p => renderPresetRow(p)).join('')}
          </div>`}
    </div>
  `;
}

function renderGradientStopRow(color, index, total){
  return `
    <div class="theme-stop-row" data-stop-index="${index}" style="display:flex;gap:8px;align-items:center">
      <span style="font-size:11px;color:var(--muted);min-width:22px;text-align:center;font-family:monospace">${index + 1}</span>
      <input type="color" class="theme-stop-color" data-stop-color="${index}" value="${color}" style="width:52px;height:36px;padding:2px;border-radius:6px;background:var(--bg-elev);border:1px solid var(--border);cursor:pointer">
      <input class="input theme-stop-hex" data-stop-hex="${index}" value="${color}" style="flex:1;font-family:monospace">
      ${total > 2 ? `<button type="button" class="btn btn-sm btn-danger" data-stop-remove="${index}" title="Quitar color">✕</button>` : ''}
    </div>
  `;
}

function renderPresetRow(preset){
  return `
    <div style="display:flex;gap:12px;align-items:center;padding:10px 12px;background:var(--bg-elev);border:1px solid var(--border-soft);border-radius:8px">
      <div style="width:44px;height:44px;border-radius:8px;flex-shrink:0;border:1px solid var(--border-soft);background:${themePreviewBg(preset.data)}"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;color:var(--silver-light);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(preset.name)}</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:2px">${preset.createdAt ? new Date(preset.createdAt).toLocaleDateString() : '—'}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-sm" data-preset-apply="${preset.id}" type="button">APLICAR</button>
        <button class="btn btn-sm" data-preset-export="${preset.id}" type="button" title="Exportar">⬇</button>
        <button class="btn btn-sm btn-danger" data-preset-delete="${preset.id}" type="button" title="Eliminar">✕</button>
      </div>
    </div>
  `;
}

function readThemeForm(){
  const val = id => document.getElementById(id)?.value || '';

  const bgType = document.querySelector('input[name="themeBgType"]:checked')?.value || 'gradient';

  const gradientColors = [...document.querySelectorAll('.theme-stop-hex')]
    .map(inp => (inp.value || '').trim().toLowerCase())
    .filter(Boolean);

  const theme = {
    name: 'Custom',
    brandName: val('themeBrandName').trim() || 'ZENITH',
    brandMotto: val('themeBrandMotto').trim(),
    logo: window.__themeEditingLogo !== undefined
      ? window.__themeEditingLogo
      : (document.getElementById('themeLogoPreview')?.querySelector('img')?.src || ''),
    background: {
      type: bgType,
      solidColor: val('themeSolidColorHex').trim().toLowerCase() || '#050505',
      gradientColors: gradientColors.length >= 2 ? gradientColors : DEFAULT_THEME.background.gradientColors.slice(),
      gradientAngle: parseInt(val('themeAngle'), 10) || 135
    },
    colors: {
      accent:  val('themeAccentHex').trim().toLowerCase()  || DEFAULT_THEME.colors.accent,
      gold:    val('themeGoldHex').trim().toLowerCase()    || DEFAULT_THEME.colors.gold,
      danger:  val('themeDangerHex').trim().toLowerCase()  || DEFAULT_THEME.colors.danger,
      success: val('themeSuccessHex').trim().toLowerCase() || DEFAULT_THEME.colors.success
    }
  };
  return theme;
}

function applyThemePreview(){
  try {
    const t = readThemeForm();
    applyTheme(t);
    updateThemeContrastWarn(t);
    const preview = document.getElementById('themePreviewBg');
    if (preview) preview.style.background = themePreviewBg(t);
  } catch(e) {
    console.warn('[THEME] Preview error:', e);
  }
}

function updateThemeContrastWarn(theme){
  const warn = document.getElementById('themeContrastWarn');
  if (!warn) return;
  const bg = theme.background;
  let luminance = 0;
  if (bg.type === 'solid') {
    luminance = hexLuminance(bg.solidColor);
  } else {
    const colors = bg.gradientColors || [];
    if (colors.length) {
      luminance = colors.reduce((a, c) => a + hexLuminance(c), 0) / colors.length;
    }
  }
  warn.style.display = luminance > 0.5 ? '' : 'none';
}

function hexLuminance(hex){
  if (!hex || typeof hex !== 'string') return 0;
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  if (full.length !== 6) return 0;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function bindThemeTab(){
  const db = getDB();
  const currentTheme = db.config.theme?.active || getDefaultTheme();
  window.__themeEditingLogo = currentTheme.logo || '';

  // BANNER
  const bannerInput = document.getElementById('themeBannerInput');
  document.getElementById('themeBannerUpload')?.addEventListener('click', () => bannerInput?.click());
  bannerInput?.addEventListener('change', async () => {
    const f = bannerInput.files[0];
    if (!f) return;
    try {
      const dataUrl = await compressImage(f, 1200, 500);
      window.__themeEditingBanner = dataUrl;
      const preview = document.getElementById('themeBannerPreview');
      if (preview) preview.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover">`;
      toast('Banner cargado. No olvides guardar.', 'success');
    } catch(e) { toast('Error procesando banner', 'error'); }
  });
  document.getElementById('themeBannerRemove')?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.__themeEditingBanner = '';
    const preview = document.getElementById('themeBannerPreview');
    if (preview) preview.innerHTML = `<span style="color:var(--muted);font-size:11px;text-align:center">SIN BANNER</span>`;
    toast('Banner quitado. No olvides guardar.', 'info');
  });

  document.querySelectorAll('input[name="themeBgType"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const type = document.querySelector('input[name="themeBgType"]:checked')?.value;
      const solidWrap = document.getElementById('themeSolidWrap');
      const gradWrap = document.getElementById('themeGradientWrap');
      if (solidWrap) solidWrap.style.display = type === 'solid' ? '' : 'none';
      if (gradWrap) gradWrap.style.display = type === 'gradient' ? '' : 'none';
      applyThemePreview();
    });
  });

  const solidColor = document.getElementById('themeSolidColor');
  const solidHex = document.getElementById('themeSolidColorHex');
  if (solidColor && solidHex) {
    solidColor.addEventListener('input', () => { solidHex.value = solidColor.value; applyThemePreview(); });
    solidHex.addEventListener('input', () => {
      const v = solidHex.value.trim();
      if (/^#[0-9a-f]{6}$/i.test(v)) { solidColor.value = v; applyThemePreview(); }
    });
  }

  bindColorPair('themeAccent', 'themeAccentHex');
  bindColorPair('themeGold', 'themeGoldHex');
  bindColorPair('themeDanger', 'themeDangerHex');
  bindColorPair('themeSuccess', 'themeSuccessHex');

  const angleInp = document.getElementById('themeAngle');
  const angleVal = document.getElementById('themeAngleVal');
  if (angleInp && angleVal) {
    angleInp.addEventListener('input', () => {
      angleVal.textContent = angleInp.value + '°';
      applyThemePreview();
    });
  }

  bindGradientStops();

  document.getElementById('themeAddStop')?.addEventListener('click', () => {
    const list = document.getElementById('themeGradientStops');
    if (!list) return;
    const count = list.querySelectorAll('.theme-stop-row').length;
    if (count >= 5) return;

    const lastColor = list.querySelector('.theme-stop-hex:last-of-type')?.value || '#121316';
    const newIndex = count;
    const div = document.createElement('div');
    div.innerHTML = renderGradientStopRow(lastColor, newIndex, count + 1);
    const row = div.firstElementChild;

    list.querySelectorAll('.theme-stop-row').forEach((r, i) => {
      if (!r.querySelector('[data-stop-remove]')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm btn-danger';
        btn.dataset.stopRemove = i;
        btn.title = 'Quitar color';
        btn.textContent = '✕';
        r.appendChild(btn);
      }
    });

    list.appendChild(row);
    bindGradientStops();

    const btn = document.getElementById('themeAddStop');
    if (list.querySelectorAll('.theme-stop-row').length >= 5 && btn) btn.disabled = true;

    applyThemePreview();
  });

  const logoInput = document.getElementById('themeLogoInput');
  document.getElementById('themeLogoUpload')?.addEventListener('click', () => logoInput?.click());
  document.getElementById('themeLogoDrop')?.addEventListener('click', (e) => {
    if (e.target.closest('#themeLogoUpload') || e.target.closest('#themeLogoRemove')) return;
    logoInput?.click();
  });
  logoInput?.addEventListener('change', async () => {
    const f = logoInput.files[0];
    if (!f) return;
    try {
      const dataUrl = await compressImage(f, 256, 256);
      window.__themeEditingLogo = dataUrl;
      const preview = document.getElementById('themeLogoPreview');
      if (preview) preview.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:contain;padding:6px">`;
      applyThemePreview();
      toast('Logo cargado. No olvides guardar.', 'success');
    } catch(e) {
      toast('Error procesando imagen', 'error');
    }
  });

  document.getElementById('themeLogoRemove')?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.__themeEditingLogo = '';
    const preview = document.getElementById('themeLogoPreview');
    if (preview) preview.innerHTML = `<span style="color:var(--muted);font-size:11px;text-align:center;line-height:1.3">SIN<br>LOGO</span>`;
    applyThemePreview();
    toast('Logo quitado. No olvides guardar.', 'info');
  });

  document.getElementById('themeReset')?.addEventListener('click', () => {
    if (!confirm('¿Restaurar todos los valores por defecto del tema?')) return;
    const def = getDefaultTheme();
    window.__themeEditingLogo = def.logo || '';
    window.__themeEditingBanner = '';
    const db2 = getDB();
    const fake = { ...db2, config: { ...db2.config, theme: { active: def, presets: db2.config.theme?.presets || [] } }, transferBannerBg: '' };
    document.getElementById('configContent').innerHTML = renderThemeTab(fake);
    bindThemeTab();
    applyTheme(def);
    toast('Tema restaurado (sin guardar)', 'info');
  });

  document.getElementById('themeSave')?.addEventListener('click', () => {
    try {
      const t = readThemeForm();
      t.name = 'Custom';

      mutate(d => {
        d.config.theme ||= { active: getDefaultTheme(), presets: [] };
        const prevName = d.config.theme.active?.name;
        d.config.theme.active = t;
        if (prevName && prevName !== 'Zenith Default') t.name = prevName;
        else t.name = 'Custom';
        d.config.theme.active = t;
        
        d.transferBannerBg = window.__themeEditingBanner || '';
      });

      applyTheme(t);
      toast('✅ Tema y banner guardados y aplicados. Se publicarán automáticamente.', 'success');
      logChange('update', 'theme', null, 'Tema y banner actualizados');

      const db2 = getDB();
      document.getElementById('configContent').innerHTML = renderThemeTab(db2);
      bindThemeTab();
    } catch(e) {
      console.error(e);
      toast('Error: ' + e.message, 'error');
    }
  });

  document.getElementById('themeSaveAsPreset')?.addEventListener('click', () => {
    const presets = getDB().config.theme?.presets || [];
    if (presets.length >= 10) {
      return toast('Máximo 10 presets. Elimina alguno primero.', 'error');
    }

    openModal({
      id: 'save-preset-modal',
      title: '💾 GUARDAR COMO PRESET',
      body: `
        <p style="font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:14px">
          Guarda el tema actual como un preset reutilizable. Podrás aplicarlo, exportarlo o eliminarlo cuando quieras.
        </p>
        <div class="field">
          <label>Nombre del preset</label>
          <input class="input" id="presetNameInput" placeholder="Ej: Zenith Halloween" autofocus>
        </div>
      `,
      footer: `
        <button class="btn btn-ghost" data-close>CANCELAR</button>
        <button class="btn btn-primary" id="confirmPresetSave">GUARDAR</button>
      `,
      onMount: root => {
        const input = root.querySelector('#presetNameInput');
        input.focus();
        const save = () => {
          const name = input.value.trim();
          if (!name) return toast('Falta el nombre', 'error');
          try {
            const t = readThemeForm();
            t.name = name;
            mutate(d => {
              d.config.theme ||= { active: getDefaultTheme(), presets: [] };
              d.config.theme.presets.push({
                id: uid('theme'),
                name,
                data: JSON.parse(JSON.stringify(t)),
                createdAt: Date.now()
              });
            });
            closeTopModal();
            toast(`Preset "${name}" guardado`, 'success');
            const db2 = getDB();
            document.getElementById('configContent').innerHTML = renderThemeTab(db2);
            bindThemeTab();
          } catch(e) {
            console.error(e);
            toast('Error: ' + e.message, 'error');
          }
        };
        root.querySelector('#confirmPresetSave').addEventListener('click', save);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
      }
    });
  });

  document.getElementById('themeExport')?.addEventListener('click', () => {
    try {
      const t = readThemeForm();
      t.name = getDB().config.theme?.active?.name || 'Custom';
      exportTheme(t);
      toast('Tema exportado', 'success');
    } catch(e) {
      toast('Error al exportar: ' + e.message, 'error');
    }
  });

  document.getElementById('themeImport')?.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const imported = await importTheme(f);
      window.__themeEditingLogo = imported.logo || '';
      const db2 = getDB();
      const fake = { ...db2, config: { ...db2.config, theme: { active: imported, presets: db2.config.theme?.presets || [] } }, transferBannerBg: window.__themeEditingBanner };
      document.getElementById('configContent').innerHTML = renderThemeTab(fake);
      bindThemeTab();
      applyTheme(imported);
      toast('Tema importado. Pulsa GUARDAR Y APLICAR para persistirlo.', 'success');
    } catch(err) {
      console.error(err);
      toast('Error al importar: ' + err.message, 'error');
    }
    e.target.value = '';
  });

  document.querySelectorAll('[data-preset-apply]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.presetApply;
      const preset = (getDB().config.theme?.presets || []).find(p => p.id === id);
      if (!preset) return;
      window.__themeEditingLogo = preset.data.logo || '';
      const db2 = getDB();
      const fake = { ...db2, config: { ...db2.config, theme: { active: { ...preset.data, name: preset.name }, presets: db2.config.theme?.presets || [] } }, transferBannerBg: window.__themeEditingBanner };
      document.getElementById('configContent').innerHTML = renderThemeTab(fake);
      bindThemeTab();
      applyTheme(preset.data);
      toast(`Preset "${preset.name}" cargado. Pulsa GUARDAR Y APLICAR para persistirlo.`, 'info');
    });
  });

  document.querySelectorAll('[data-preset-export]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.presetExport;
      const preset = (getDB().config.theme?.presets || []).find(p => p.id === id);
      if (!preset) return;
      exportTheme({ ...preset.data, name: preset.name });
      toast(`Preset "${preset.name}" exportado`, 'success');
    });
  });

  document.querySelectorAll('[data-preset-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.presetDelete;
      const preset = (getDB().config.theme?.presets || []).find(p => p.id === id);
      if (!preset) return;
      if (!confirm(`¿Eliminar el preset "${preset.name}"?`)) return;
      try {
        mutate(d => {
          if (!d.config.theme?.presets) return;
          d.config.theme.presets = d.config.theme.presets.filter(p => p.id !== id);
        });
        toast('Preset eliminado', 'success');
        const db2 = getDB();
        document.getElementById('configContent').innerHTML = renderThemeTab(db2);
        bindThemeTab();
      } catch(e) {
        toast('Error: ' + e.message, 'error');
      }
    });
  });
}

function bindColorPair(colorId, hexId){
  const colorInp = document.getElementById(colorId);
  const hexInp = document.getElementById(hexId);
  if (!colorInp || !hexInp) return;
  colorInp.addEventListener('input', () => {
    hexInp.value = colorInp.value;
    applyThemePreview();
  });
  hexInp.addEventListener('input', () => {
    const v = hexInp.value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(v)) {
      colorInp.value = v;
      applyThemePreview();
    }
  });
}

function bindGradientStops(){
  document.querySelectorAll('.theme-stop-color').forEach(inp => {
    if (inp.dataset.bound === '1') return;
    inp.dataset.bound = '1';
    inp.addEventListener('input', () => {
      const idx = inp.dataset.stopColor;
      const hex = document.querySelector(`.theme-stop-hex[data-stop-hex="${idx}"]`);
      if (hex) hex.value = inp.value;
      applyThemePreview();
    });
  });
  document.querySelectorAll('.theme-stop-hex').forEach(inp => {
    if (inp.dataset.bound === '1') return;
    inp.dataset.bound = '1';
    inp.addEventListener('input', () => {
      const v = inp.value.trim().toLowerCase();
      if (/^#[0-9a-f]{6}$/.test(v)) {
        const idx = inp.dataset.stopHex;
        const c = document.querySelector(`.theme-stop-color[data-stop-color="${idx}"]`);
        if (c) c.value = v;
      }
      applyThemePreview();
    });
  });
  document.querySelectorAll('[data-stop-remove]').forEach(btn => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const list = document.getElementById('themeGradientStops');
      const rows = list.querySelectorAll('.theme-stop-row');
      if (rows.length <= 2) return;
      const idx = +btn.dataset.stopRemove;
      rows[idx]?.remove();
      list.querySelectorAll('.theme-stop-row').forEach((row, i) => {
        row.dataset.stopIndex = i;
        const c = row.querySelector('.theme-stop-color');
        const h = row.querySelector('.theme-stop-hex');
        if (c) c.dataset.stopColor = i;
        if (h) h.dataset.stopHex = i;
        const rm = row.querySelector('[data-stop-remove]');
        if (rm) rm.dataset.stopRemove = i;
      });
      const addBtn = document.getElementById('themeAddStop');
      if (addBtn) addBtn.disabled = list.querySelectorAll('.theme-stop-row').length >= 5;
      applyThemePreview();
    });
  });
}
