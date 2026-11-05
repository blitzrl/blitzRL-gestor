import { getDB, mutate } from '../services/storage.js';
import { toast, openModal, closeTopModal } from '../services/ui.js';
import { uid } from '../data/database.js';
import { logChange } from '../services/history.js';
import { state } from '../state.js';

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

export const AITournamentWizard = {
  state: {
    step: 1,
    mode: 'image',
    imageFile: null,
    textContent: '',
    actionType: 'append',
    teams: [],
    corrections: [],
    warnings: [],
    logosPool: [],
    targetDivisionId: null
  },

  _pasteHandler: null,

  open() {
    this.state = {
      step: 1,
      mode: 'image',
      imageFile: null,
      textContent: '',
      actionType: 'append',
      teams: [],
      corrections: [],
      warnings: [],
      logosPool: [],
      targetDivisionId: state.divisionId || getDB().divisions[0]?.id
    };

    openModal({
      id: 'ai-tournament-wizard',
      title: '🎲 GENERAR TORNEO CON IA',
      wide: true,
      body: `<div id="aiWizardBody"></div>`,
      footer: `<div id="aiWizardFooter" style="display:flex;justify-content:space-between;width:100%"></div>`,
      onMount: (root) => {
        this.root = root;
        this.render();
      },
      onClose: () => {
        this._cleanup();
      }
    });
  },

  _cleanup() {
    if (this._pasteHandler) {
      document.removeEventListener('paste', this._pasteHandler);
      this._pasteHandler = null;
    }
  },

  render() {
    const body = this.root.querySelector('#aiWizardBody');
    const footer = this.root.querySelector('#aiWizardFooter');
    
    body.innerHTML = `
      <div class="ai-wizard-steps">
        <div class="ai-wizard-step ${this.state.step === 1 ? 'active' : this.state.step > 1 ? 'done' : ''}">1. Entrada</div>
        <div class="ai-wizard-step ${this.state.step === 2 ? 'active' : this.state.step > 2 ? 'done' : ''}">2. Equipos</div>
        <div class="ai-wizard-step ${this.state.step === 3 ? 'active' : this.state.step > 3 ? 'done' : ''}">3. Escudos</div>
        <div class="ai-wizard-step ${this.state.step === 4 ? 'active' : this.state.step > 4 ? 'done' : ''}">4. Confirmar</div>
        <div class="ai-wizard-step ${this.state.step === 5 ? 'active' : ''}">5. Clasificación</div>
      </div>
      <div id="aiWizardStepContent"></div>
    `;

    const content = this.root.querySelector('#aiWizardStepContent');

    if (this.state.step === 1) {
      this.renderStep1(content, footer);
    } else if (this.state.step === 2) {
      this.renderStep2(content, footer);
    } else if (this.state.step === 3) {
      this.renderStep3(content, footer);
    } else if (this.state.step === 4) {
      this.renderStep4(content, footer);
    } else if (this.state.step === 5) {
      this.renderStep5(content, footer);
    }
  },

  renderStep1(content, footer) {
    const div = getDB().divisions.find(d => d.id === this.state.targetDivisionId);
    
    content.innerHTML = `
      <p style="font-size:13px;color:var(--silver);margin-bottom:16px;">
        La IA extraerá los equipos de la imagen o texto y los creará en la división <b>${esc(div?.name || 'activa')}</b>.
      </p>

      <div class="ai-tabs">
        <button class="ai-tab ${this.state.mode === 'image' ? 'active' : ''}" id="tabModeImage">🖼 Captura de Imagen</button>
        <button class="ai-tab ${this.state.mode === 'text' ? 'active' : ''}" id="tabModeText">📝 Texto o TXT</button>
      </div>

      <div id="modeImageWrap" style="display:${this.state.mode === 'image' ? '' : 'none'}">
        <div class="ai-dropzone-large" id="dropImageZone">
          <div style="font-size:32px;margin-bottom:10px;">📸</div>
          <div style="font-size:14px;font-weight:600;color:var(--silver-light);margin-bottom:4px;">Arrastra una captura aquí o haz click</div>
          <div style="font-size:12px;">También puedes pegar con <kbd style="background:var(--bg-elev);padding:2px 6px;border-radius:4px;border:1px solid var(--border)">Ctrl + V</kbd></div>
        </div>
        <input type="file" id="fileImageInput" accept="image/*" hidden>
        ${this.state.imageFile ? `<div style="margin-top:10px;font-size:12px;color:var(--success)">✅ Imagen cargada: ${esc(this.state.imageFile.name)}</div>` : ''}
      </div>

      <div id="modeTextWrap" style="display:${this.state.mode === 'text' ? '' : 'none'}">
        <div class="field">
          <label>Pega la lista de equipos (uno por línea, o separados por comas)</label>
          <textarea class="textarea" id="textInput" rows="8" placeholder="Tigres&#10;América&#10;Cruz Azul&#10;...">${esc(this.state.textContent)}</textarea>
        </div>
        <div class="ai-dropzone-large" id="dropTxtZone" style="padding:20px;margin-top:10px;">
          <div style="font-size:12px;">O arrastra un archivo <b>.txt</b> aquí</div>
        </div>
        <input type="file" id="fileTxtInput" accept=".txt" hidden>
      </div>

      <div class="field" style="margin-top:20px;">
        <label>¿Qué hacer con los equipos existentes?</label>
        <div style="display:flex;gap:16px;margin-top:6px;">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--silver-light);cursor:pointer;">
            <input type="radio" name="wizAction" value="append" ${this.state.actionType === 'append' ? 'checked' : ''}> Añadir a los actuales
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--silver-light);cursor:pointer;">
            <input type="radio" name="wizAction" value="replace" ${this.state.actionType === 'replace' ? 'checked' : ''}> Reemplazar todos
          </label>
        </div>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-ghost" data-close>CANCELAR</button>
      <button class="btn btn-primary" id="btnAnalyzeStep1">ANALIZAR →</button>
    `;

    const tabImg = content.querySelector('#tabModeImage');
    const tabTxt = content.querySelector('#tabModeText');
    if (tabImg) tabImg.addEventListener('click', () => { this.state.mode = 'image'; this.render(); });
    if (tabTxt) tabTxt.addEventListener('click', () => { this.state.mode = 'text'; this.render(); });

    content.querySelectorAll('input[name="wizAction"]').forEach(r => {
      r.addEventListener('change', (e) => { this.state.actionType = e.target.value; });
    });

    if (this.state.mode === 'image') {
      const dropImage = content.querySelector('#dropImageZone');
      const fileImage = content.querySelector('#fileImageInput');
      
      if (dropImage && fileImage) {
        dropImage.addEventListener('click', () => fileImage.click());
        dropImage.addEventListener('dragover', (e) => {
          e.preventDefault();
          dropImage.classList.add('dragover');
        });
        dropImage.addEventListener('dragleave', () => {
          dropImage.classList.remove('dragover');
        });
        dropImage.addEventListener('drop', (e) => {
          e.preventDefault();
          dropImage.classList.remove('dragover');
          const f = e.dataTransfer.files[0];
          if (f && f.type.startsWith('image/')) {
            this.state.imageFile = f;
            this.render();
          } else {
            toast('El archivo no es una imagen válida', 'error');
          }
        });

        fileImage.addEventListener('change', () => {
          if (fileImage.files[0]) { this.state.imageFile = fileImage.files[0]; this.render(); }
        });
      }

      this._cleanup();
      this._pasteHandler = (e) => {
        if (this.state.mode !== 'image') return;
        const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items || [];
        for (let item of items) {
          if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile();
            this.state.imageFile = new File([blob], "pasted_image.png", { type: blob.type });
            this.render();
            toast('Imagen pegada desde el portapapeles', 'success');
            e.preventDefault();
            return;
          }
        }
      };
      document.addEventListener('paste', this._pasteHandler);
    }

    if (this.state.mode === 'text') {
      const textArea = content.querySelector('#textInput');
      if (textArea) {
        textArea.addEventListener('input', () => { this.state.textContent = textArea.value; });
      }

      const dropTxt = content.querySelector('#dropTxtZone');
      const fileTxt = content.querySelector('#fileTxtInput');
      
      if (dropTxt && fileTxt) {
        dropTxt.addEventListener('click', () => fileTxt.click());
        dropTxt.addEventListener('dragover', e => { e.preventDefault(); dropTxt.classList.add('dragover'); });
        dropTxt.addEventListener('dragleave', () => { dropTxt.classList.remove('dragover'); });
        dropTxt.addEventListener('drop', e => {
          e.preventDefault();
          dropTxt.classList.remove('dragover');
          const f = e.dataTransfer.files[0];
          if (f) {
            const reader = new FileReader();
            reader.onload = ev => { this.state.textContent = ev.target.result; this.render(); };
            reader.readAsText(f);
          }
        });
        fileTxt.addEventListener('change', () => {
          if (fileTxt.files[0]) {
            const reader = new FileReader();
            reader.onload = ev => { this.state.textContent = ev.target.result; this.render(); };
            reader.readAsText(fileTxt.files[0]);
          }
        });
      }
    }

    const btnAnalyze = footer.querySelector('#btnAnalyzeStep1');
    if (btnAnalyze) {
      btnAnalyze.addEventListener('click', async () => {
        if (this.state.mode === 'image' && !this.state.imageFile) return toast('Sube o pega una imagen primero', 'error');
        if (this.state.mode === 'text' && !this.state.textContent.trim()) return toast('Escribe o pega el texto primero', 'error');
        
        btnAnalyze.disabled = true;
        btnAnalyze.textContent = 'ANALIZANDO...';

        try {
          let res;
          const { AIService } = await import('../services/aiService.js');
          if (this.state.mode === 'image') {
            res = await AIService.generateTeamsFromImage(this.state.imageFile);
          } else {
            res = await AIService.generateTeamsFromText(this.state.textContent);
          }

          if (!res.teams || !Array.isArray(res.teams)) throw new Error('La IA no devolvió una lista de equipos válida.');

          this.state.teams = res.teams.map((t, i) => {
            let tag = t.tag || '';
            if (!tag) {
              tag = t.name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '');
              if (tag.length < 3) tag = t.name.substring(0, 4).toUpperCase().replace(/[^A-Z]/g, '');
            }
            return {
              tempId: `tmp_${i}_${Date.now()}`,
              name: t.name,
              originalName: t.originalName || '',
              tag: tag,
              coach: t.coach || '',
              logo: '',
              filename: '',
              assignedLogoIndex: null
            };
          });

          this.state.corrections = res.corrections || [];
          this.state.warnings = res.warnings || [];
          this.state.step = 2;
          this._cleanup();
          this.render();
        } catch (e) {
          console.error(e);
          toast('Error: ' + e.message, 'error');
          btnAnalyze.disabled = false;
          btnAnalyze.textContent = 'ANALIZAR →';
        }
      });
    }
  },

  renderStep2(content, footer) {
    const teams = this.state.teams;
    if (teams.length === 0) {
      toast('No se detectaron equipos. Revisa la entrada.', 'error');
      this.state.step = 1;
      return this.render();
    }

    let warningsHtml = '';
    if (this.state.warnings.length > 0) {
      warningsHtml = `<div class="ia-warnings" style="margin-bottom:14px;">${this.state.warnings.map(w => `<div class="ia-warning-item">⚠ ${esc(w)}</div>`).join('')}</div>`;
    }

    let correctionsHtml = '';
    if (this.state.corrections.length > 0) {
      correctionsHtml = `
        <div style="background:rgba(111,168,255,.06);border:1px solid rgba(111,168,255,.2);border-radius:8px;padding:12px;margin-bottom:16px;">
          <div style="font-size:11px;letter-spacing:.1em;color:var(--accent);font-weight:600;margin-bottom:8px;">📝 CORRECCIONES ORTOGRÁFICAS</div>
          ${this.state.corrections.map((c, i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--silver);margin-bottom:4px;">
              <span>"${esc(c.from)}" → "${esc(c.to)}"</span>
              <button class="btn btn-sm" data-revert-correction="${i}" style="padding:2px 6px;font-size:10px;">↺</button>
            </div>
          `).join('')}
        </div>
      `;
    }

    const overLimit = teams.length > 50;

    content.innerHTML = `
      ${overLimit ? `<div class="ia-warning-item" style="margin-bottom:14px;color:var(--danger);background:rgba(226,92,92,.1);border-color:rgba(226,92,92,.3);">⚠ La IA detectó ${teams.length} equipos (límite recomendado: 50). Puedes continuar, pero revisa si es correcto.</div>` : ''}
      ${warningsHtml}
      ${correctionsHtml}
      
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">Revisa y edita los datos antes de continuar:</div>
      
      <div class="table-wrap" style="max-height:400px;overflow-y:auto;border:1px solid var(--border-soft);border-radius:8px;">
        <table class="ztable">
          <thead>
            <tr>
              <th>#</th>
              <th>NOMBRE</th>
              <th>TAG</th>
              <th>COACH</th>
            </tr>
          </thead>
          <tbody>
            ${teams.map((t, i) => `
              <tr>
                <td>${i + 1}</td>
                <td><input class="input" style="padding:4px 8px;font-size:12px;" data-team-name="${t.tempId}" value="${esc(t.name)}"></td>
                <td><input class="input" style="padding:4px 8px;font-size:12px;width:60px;text-transform:uppercase;" data-team-tag="${t.tempId}" value="${esc(t.tag)}" maxlength="4"></td>
                <td><input class="input" style="padding:4px 8px;font-size:12px;" data-team-coach="${t.tempId}" value="${esc(t.coach)}"></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-ghost" id="btnBackStep2">← ATRÁS</button>
      <button class="btn btn-primary" id="btnNextStep2">SIGUIENTE: ESCUDOS →</button>
    `;

    content.querySelectorAll('[data-revert-correction]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.dataset.revertCorrection;
        const c = this.state.corrections[idx];
        const t = this.state.teams.find(x => x.name === c.to);
        if (t) t.name = c.from;
        this.state.corrections.splice(idx, 1);
        this.render();
      });
    });

    content.querySelectorAll('[data-team-name]').forEach(inp => {
      inp.addEventListener('input', e => {
        const t = this.state.teams.find(x => x.tempId === inp.dataset.teamName);
        if (t) t.name = e.target.value;
      });
    });
    content.querySelectorAll('[data-team-tag]').forEach(inp => {
      inp.addEventListener('input', e => {
        const t = this.state.teams.find(x => x.tempId === inp.dataset.teamTag);
        if (t) t.tag = e.target.value.toUpperCase();
      });
    });
    content.querySelectorAll('[data-team-coach]').forEach(inp => {
      inp.addEventListener('input', e => {
        const t = this.state.teams.find(x => x.tempId === inp.dataset.teamCoach);
        if (t) t.coach = e.target.value;
      });
    });

    footer.querySelector('#btnBackStep2')?.addEventListener('click', () => {
      this.state.step = 1;
      this.render();
    });

    footer.querySelector('#btnNextStep2')?.addEventListener('click', () => {
      if (this.state.teams.some(t => !t.name.trim())) {
        return toast('Todos los equipos deben tener un nombre', 'error');
      }
      this.state.step = 3;
      this.render();
    });
  },

  renderStep3(content, footer) {
    const teams = this.state.teams;
    const logos = this.state.logosPool;
    const unassignedLogos = logos.filter(l => !l.assignedTo);

    content.innerHTML = `
      <p style="font-size:13px;color:var(--silver);margin-bottom:16px;">
        Sube todos los escudos a la vez. La IA intentará asignarlos automáticamente. Luego puedes arrastrar los que queden sueltos a su equipo.
      </p>

      <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;">
        <button class="btn" id="btnUploadLogos">📤 SUBIR ESCUDOS (${logos.length} subidos)</button>
        <button class="btn btn-primary" id="btnAssignAILogos" ${logos.length === 0 ? 'disabled' : ''}>🤖 ASIGNAR CON IA</button>
      </div>

      <div id="aiAssignStatus" style="font-size:12px;color:var(--accent);margin-bottom:16px;display:none;">
        ⏳ Asignando escudos con IA...
      </div>

      <div style="display:flex;gap:20px;">
        <div style="flex:2;min-width:0;">
          <div class="reporter-subhead">EQUIPOS DETECTADOS</div>
          <div style="max-height:300px;overflow-y:auto;padding-right:4px;">
            ${teams.map(t => {
              const assignedLogo = logos.find(l => l.assignedTo === t.tempId);
              const isDoubt = t.assignedLogoIndex !== null && !assignedLogo;
              return `
                <div class="ai-team-logo-row" data-team-drop="${t.tempId}">
                  <div class="ai-team-logo-drop ${assignedLogo ? 'filled' : ''}" data-drop-target="${t.tempId}">
                    ${assignedLogo ? `<img src="data:${assignedLogo.type};base64,${assignedLogo.base64}">` : '<span>Soltar</span>'}
                  </div>
                  <div class="ai-team-logo-info">
                    <div class="ai-team-logo-name">${esc(t.name)}</div>
                    <div class="ai-team-logo-status ${assignedLogo ? 'ok' : isDoubt ? 'warn' : ''}">
                      ${assignedLogo ? '✅ Asignado' : isDoubt ? '⚠ Dudoso' : '— Sin escudo'}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div style="flex:1;min-width:0;">
          <div class="reporter-subhead">SIN ASIGNAR (${unassignedLogos.length})</div>
          <div class="ai-logos-grid">
            ${unassignedLogos.map(l => `
              <div class="ai-logo-item" draggable="true" data-logo-idx="${l.index}" title="${esc(l.filename)}">
                <img src="data:${l.type};base64,${l.base64}">
              </div>
            `).join('') || '<div style="grid-column:1/-1;text-align:center;font-size:11px;color:var(--muted);padding:10px;">Sube escudos para verlos aquí</div>'}
          </div>
        </div>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-ghost" id="btnBackStep3">← ATRÁS</button>
      <button class="btn btn-primary" id="btnNextStep3">SIGUIENTE: CONFIRMAR →</button>
    `;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = 'image/*';
    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!f.type.startsWith('image/')) continue;
        try {
          const b64 = await compressImage(f, 256, 256);
          const rawB64 = b64.split(',')[1];
          this.state.logosPool.push({
            index: this.state.logosPool.length,
            base64: rawB64,
            type: f.type,
            filename: f.name,
            assignedTo: null
          });
        } catch(err) { console.error('Error compressing logo', err); }
      }
      this.render();
    });
    content.querySelector('#btnUploadLogos')?.addEventListener('click', () => fileInput.click());

    content.querySelector('#btnAssignAILogos')?.addEventListener('click', async () => {
      if (this.state.logosPool.length === 0) return;
      
      const btn = content.querySelector('#btnAssignAILogos');
      const status = content.querySelector('#aiAssignStatus');
      if (btn) btn.disabled = true;
      if (status) status.style.display = 'block';

      try {
        const { AIService } = await import('../services/aiService.js');
        const res = await AIService.assignLogosToTeams(
          this.state.teams.map(t => ({ name: t.name, tag: t.tag })),
          this.state.logosPool
        );

        this.state.teams.forEach(t => { t.assignedLogoIndex = null; t.logo = ''; });
        this.state.logosPool.forEach(l => { l.assignedTo = null; });

        res.assignments.forEach(a => {
          if (a.teamName) {
            const t = this.state.teams.find(x => x.name === a.teamName);
            if (t) {
              t.assignedLogoIndex = a.logoIndex;
              this.state.logosPool[a.logoIndex].assignedTo = t.tempId;
            }
          }
        });

        this.render();
        toast('Asignación completada. Revisa los resultados.', 'success');
      } catch(e) {
        console.error(e);
        toast('Error al asignar: ' + e.message, 'error');
      } finally {
        if (btn) btn.disabled = false;
        if (status) status.style.display = 'none';
      }
    });

    let draggedLogoIdx = null;
    content.querySelectorAll('.ai-logo-item[draggable="true"]').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        draggedLogoIdx = +el.dataset.logoIdx;
        e.dataTransfer.effectAllowed = 'move';
      });
    });

    content.querySelectorAll('.ai-team-logo-drop').forEach(el => {
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.classList.add('dragover');
      });
      el.addEventListener('dragleave', () => el.classList.remove('dragover'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('dragover');
        if (draggedLogoIdx === null) return;
        
        const teamId = el.dataset.dropTarget;
        const logo = this.state.logosPool[draggedLogoIdx];
        
        this.state.logosPool.forEach(l => { if (l.assignedTo === teamId) l.assignedTo = null; });
        
        logo.assignedTo = teamId;
        this.render();
        draggedLogoIdx = null;
      });
    });

    footer.querySelector('#btnBackStep3')?.addEventListener('click', () => {
      this.state.step = 2;
      this.render();
    });

    footer.querySelector('#btnNextStep3')?.addEventListener('click', () => {
      this.state.step = 4;
      this.render();
    });
  },

  renderStep4(content, footer) {
    const teams = this.state.teams;
    const total = teams.length;
    const withLogo = teams.filter(t => this.state.logosPool.some(l => l.assignedTo === t.tempId)).length;
    const withoutLogo = total - withLogo;
    
    const divId = this.state.targetDivisionId;
    const db = getDB();
    const div = db.divisions.find(d => d.id === divId);
    const existingCount = db.teams.filter(t => t.divisionId === divId).length;
    const isReplace = this.state.actionType === 'replace';

    content.innerHTML = `
      <div style="text-align:center;padding:10px 0 20px;">
        <div style="font-size:48px;margin-bottom:12px;">📋</div>
        <h3 style="font-size:18px;color:var(--silver-light);margin-bottom:8px;">RESUMEN DEL TORNEO</h3>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
        <div class="kpi"><div class="kpi-val">${total}</div><div class="kpi-lab">EQUIPOS A CREAR</div></div>
        <div class="kpi"><div class="kpi-val">${withLogo}</div><div class="kpi-lab">CON ESCUDO</div></div>
        <div class="kpi"><div class="kpi-val">${withoutLogo}</div><div class="kpi-lab">SIN ESCUDO</div></div>
        <div class="kpi"><div class="kpi-val">${div?.name || '?'}</div><div class="kpi-lab">DIVISIÓN DESTINO</div></div>
      </div>

      ${isReplace && existingCount > 0 ? `
        <div class="ia-warning-item" style="color:var(--danger);background:rgba(226,92,92,.1);border-color:rgba(226,92,92,.3);margin-bottom:16px;">
          ⚠ <b>MODO REEMPLAZAR:</b> Se borrarán los ${existingCount} equipos actuales de esta división. Esta acción no se puede deshacer.
        </div>
      ` : ''}

      ${withoutLogo > 0 ? `
        <div style="background:var(--bg-graphite);border:1px solid var(--border-soft);border-radius:8px;padding:12px;margin-bottom:16px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:6px;">Estos equipos se crearán sin escudo:</div>
          <div style="font-size:12px;color:var(--silver);">${teams.filter(t => !this.state.logosPool.some(l => l.assignedTo === t.tempId)).map(t => esc(t.name)).join(', ')}</div>
        </div>
      ` : ''}

      <p style="font-size:12px;color:var(--muted);text-align:center;">Al confirmar, los equipos se crearán y se publicarán automáticamente.</p>
    `;

    footer.innerHTML = `
      <button class="btn btn-ghost" id="btnBackStep4">← ATRÁS</button>
      <button class="btn btn-primary" id="btnCreateStep4" style="${isReplace ? 'background:var(--danger);border-color:var(--danger);' : ''}">
        ${isReplace ? 'REEMPLAZAR Y CREAR' : 'CREAR EQUIPOS'}
      </button>
    `;

    footer.querySelector('#btnBackStep4')?.addEventListener('click', () => {
      this.state.step = 3;
      this.render();
    });

    footer.querySelector('#btnCreateStep4')?.addEventListener('click', () => {
      try {
        const btn = footer.querySelector('#btnCreateStep4');
        if (btn) { btn.disabled = true; btn.textContent = 'CREANDO...'; }

        mutate(d => {
          const div = d.divisions.find(x => x.id === this.state.targetDivisionId);
          if (!div) throw new Error('División no encontrada');
          const seasonId = d.seasons.find(s => s.active)?.id || d.seasons[0]?.id;

          if (isReplace) {
            d.teams = d.teams.filter(t => t.divisionId !== this.state.targetDivisionId);
          }

          this.state.teams.forEach(t => {
            const assignedLogo = this.state.logosPool.find(l => l.assignedTo === t.tempId);
            let logoDataUrl = '';
            if (assignedLogo) {
              logoDataUrl = `data:${assignedLogo.type};base64,${assignedLogo.base64}`;
            }

            d.teams.push({
              id: uid('team'),
              name: t.name,
              tag: t.tag,
              logo: logoDataUrl,
              coach: t.coach,
              divisionId: this.state.targetDivisionId,
              seasonId: seasonId,
              roster: [],
              trophies: [],
              money: 100000 
            });
          });
        });

        logChange('create', 'teams', null, `Generación IA: ${total} equipos creados en ${div?.name || '?'}`);
        toast(`✅ ${total} equipos creados exitosamente`, 'success');
        
        this.state.step = 5;
        this.render();

      } catch(e) {
        console.error(e);
        toast('Error al crear equipos: ' + e.message, 'error');
        const btn = footer.querySelector('#btnCreateStep4');
        if (btn) { btn.disabled = false; btn.textContent = isReplace ? 'REEMPLAZAR Y CREAR' : 'CREAR EQUIPOS'; }
      }
    });
  },

  renderStep5(content, footer) {
    const divId = this.state.targetDivisionId;
    const db = getDB();
    const div = db.divisions.find(d => d.id === divId);
    const totalTeams = db.teams.filter(t => t.divisionId === divId).length;

    content.innerHTML = `
      <div style="text-align:center;padding:10px 0 20px;">
        <div style="font-size:48px;margin-bottom:12px;">🎉</div>
        <h3 style="font-size:18px;color:var(--success);margin-bottom:8px;">¡EQUIPOS CREADOS!</h3>
        <p style="font-size:13px;color:var(--silver);margin-bottom:20px;">¿Quieres configurar los slots de clasificación ahora?</p>
      </div>

      <div style="background:var(--bg-graphite);border:1px solid var(--border-soft);border-radius:8px;padding:16px;max-width:400px;margin:0 auto;">
        <div class="field">
          <label>PLAY-OFFS (puestos 1 al N)</label>
          <input class="input" type="number" id="cfgPlayoffs" value="${div.config.playoffSpots || 0}" min="0" max="${totalTeams}">
        </div>
        <div class="field">
          <label>PLAY-IN (puestos siguientes)</label>
          <input class="input" type="number" id="cfgPlayin" value="${div.config.playInSpots || 0}" min="0" max="${totalTeams}">
        </div>
        <div class="field">
          <label>DESCENSO (últimos N puestos)</label>
          <input class="input" type="number" id="cfgRelegation" value="${div.config.relegation?.spots || 0}" min="0" max="${totalTeams}">
        </div>
        <div class="field">
          <label>ASCENSO (primeros N de la división inferior)</label>
          <input class="input" type="number" id="cfgPromotion" value="${div.config.promotion?.spots || 0}" min="0" max="${totalTeams}">
        </div>
        <div id="cfgSumWarn" style="font-size:12px;color:var(--danger);margin-top:10px;display:none;">
          ⚠ La suma de slots supera el total de equipos (${totalTeams}).
        </div>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-ghost" id="btnSkipStep5">AHORA NO</button>
      <button class="btn btn-primary" id="btnSaveStep5">APLICAR CLASIFICACIÓN</button>
    `;

    const inputs = ['cfgPlayoffs', 'cfgPlayin', 'cfgRelegation', 'cfgPromotion'].map(id => content.querySelector('#'+id));
    const warn = content.querySelector('#cfgSumWarn');
    
    const checkSum = () => {
      const sum = inputs.reduce((a, i) => a + (parseInt(i.value) || 0), 0);
      if (warn) warn.style.display = sum > totalTeams ? 'block' : 'none';
    };
    inputs.forEach(i => i && i.addEventListener('input', checkSum));
    checkSum();

    footer.querySelector('#btnSkipStep5')?.addEventListener('click', () => {
      closeTopModal();
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    footer.querySelector('#btnSaveStep5')?.addEventListener('click', () => {
      try {
        const po = parseInt(content.querySelector('#cfgPlayoffs').value) || 0;
        const pi = parseInt(content.querySelector('#cfgPlayin').value) || 0;
        const re = parseInt(content.querySelector('#cfgRelegation').value) || 0;
        const pr = parseInt(content.querySelector('#cfgPromotion').value) || 0;

        mutate(d => {
          const division = d.divisions.find(x => x.id === divId);
          if (!division) return;

          const zones = [];
          let curr = 1;

          if (po > 0) { zones.push({ from: curr, to: curr + po - 1, type: 'playoff', color: '#4ade80' }); curr += po; }
          if (pi > 0) { zones.push({ from: curr, to: curr + pi - 1, type: 'playin', color: '#6FA8FF' }); curr += pi; }
          
          const relStart = totalTeams - re + 1;
          if (re > 0 && relStart > curr) {
            zones.push({ from: relStart, to: totalTeams, type: 'relegation', color: '#f87171' });
          }
          
          if (pr > 0) {
             zones.push({ from: 1, to: pr, type: 'promotion', color: '#facc15' });
          }

          const finalZones = [];
          let currentPos = 1;
          zones.sort((a,b) => a.from - b.from).forEach(z => {
             if (z.from > currentPos) {
                finalZones.push({ from: currentPos, to: z.from - 1, type: 'none', color: 'transparent' });
             }
             finalZones.push(z);
             currentPos = z.to + 1;
          });
          if (currentPos <= totalTeams) {
             finalZones.push({ from: currentPos, to: totalTeams, type: 'none', color: 'transparent' });
          }

          division.config.zones = { hasTop1Highlight: true, zones: finalZones };
          division.config.playoffSpots = po;
          division.config.playInSpots = pi;
          division.config.relegation = { ...division.config.relegation, enabled: re > 0, spots: re };
          division.config.promotion = { ...division.config.promotion, enabled: pr > 0, spots: pr };
        });

        toast('Clasificación aplicada', 'success');
        closeTopModal();
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (e) {
        console.error(e);
        toast('Error: ' + e.message, 'error');
      }
    });
  }
};
