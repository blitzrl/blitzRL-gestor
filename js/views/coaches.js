import { getDB, mutate } from '../services/storage.js';
import { uid } from '../data/database.js';
import { toast, openModal, closeTopModal } from '../services/ui.js';
import { compressImage } from './teams.js';
import { getNationFlag, NATIONS } from '../data/nations.js';

// Helper local para escapar solo donde es necesario (orgName)
function _esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

export function coachesView(){
  const db = getDB();
  const coaches = db.coaches || [];

  return `
    <div class="page-head">
      <h1 class="page-title">STAFF TÉCNICO</h1>
      <button class="btn btn-primary" id="btnNewCoach">+ NUEVO COACH/AUXILIAR</button>
    </div>

    <div class="grid grid-3">
      ${coaches.map(c => coachCard(c, db)).join('') || '<div class="card" style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">No hay coaches registrados.</div>'}
    </div>
  `;
}

function coachCard(c, db) {
  const teamNames = (c.teamIds || []).map(id => db.teams.find(t => t.id === id)?.name).filter(Boolean).join(', ');
  const isPlayer = c.playerId;
  const flag = c.nationalityCode ? getNationFlag(c.nationalityCode) : '';
  const hasGroup = c.orgName && (c.teamIds || []).length > 1;
  
  return `
    <div class="card">
      <div style="display:flex; gap:14px; align-items:center; margin-bottom:14px">
        <div class="team-logo-box-lg" style="border-radius:50%">
          ${c.profilePicture ? `<img src="${c.profilePicture}" class="team-logo-img" style="border-radius:50%">` : '<span class="team-logo-fallback">👤</span>'}
        </div>
        <div style="min-width:0; flex:1;">
          <div style="font-size:16px; font-weight:600; color:var(--silver-light)">${c.name} ${flag}</div>
          <div style="font-size:12px; color:var(--muted); margin-top:2px">${c.roleType === 'coach' ? 'Head Coach' : 'Asistente'}</div>
          ${teamNames ? `<div class="chip chip-accent" style="margin-top:6px;font-size:10px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;">${teamNames}</div>` : `<div class="chip" style="margin-top:6px;font-size:10px;color:var(--gold)">AGENTE LIBRE</div>`}
          ${hasGroup ? `<div class="chip chip-gold" style="margin-top:6px;font-size:10px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;">👥 ${_esc(c.orgName)}</div>` : ''}
        </div>
      </div>
      <div class="divider"></div>
      <div style="font-size:11px; color:var(--muted); margin-bottom:12px">
        ${isPlayer ? '🔗 Licencia vinculada a jugador' : 'Puro Staff'}
      </div>
      <div class="card-actions">
        <button class="btn btn-sm" data-edit-coach="${c.id}">EDITAR</button>
        <button class="btn btn-sm btn-danger" data-del-coach="${c.id}">ELIMINAR</button>
      </div>
    </div>
  `;
}

export function bindCoachesEvents(){
  document.getElementById('btnNewCoach')?.addEventListener('click', () => openCoachForm());

  document.querySelectorAll('[data-edit-coach]').forEach(b => {
    b.addEventListener('click', () => openCoachForm(b.dataset.editCoach));
  });

  document.querySelectorAll('[data-del-coach]').forEach(b => {
    b.addEventListener('click', () => {
      if (!confirm('¿Eliminar este perfil de coach?')) return;
      mutate(d => { d.coaches = d.coaches.filter(x => x.id !== b.dataset.delCoach); });
      toast('Coach eliminado', 'success');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  });
}

function openCoachForm(coachId = null) {
  const db = getDB();
  const coach = coachId ? db.coaches.find(c => c.id === coachId) : null;
  
  const state = {
    profilePicture: coach?.profilePicture || '',
    name: coach?.name || '',
    roleType: coach?.roleType || 'coach',
    teamIds: coach?.teamIds ? JSON.parse(JSON.stringify(coach.teamIds)) : [],
    orgName: coach?.orgName || '',
    playerId: coach?.playerId || '',
    nationalityCode: coach?.nationalityCode || '',
    rlTracker: coach?.rlTracker || '',
    discordId: coach?.discordId || '',
    socials: coach?.socials || { twitter: '', twitch: '', youtube: '', instagram: '' },
    customLinks: coach?.customLinks ? JSON.parse(JSON.stringify(coach.customLinks)) : []
  };

  openModal({
    id: 'coach-form-' + (coachId || 'new'),
    title: coach ? 'EDITAR COACH' : 'NUEVO COACH',
    wide: true,
    body: `
      <div class="row">
        <div class="field" style="align-items:center">
          <div class="player-photo-frame" id="cPhotoDrop" style="cursor:pointer; width:100px; height:100px;">
            ${state.profilePicture ? `<img src="${state.profilePicture}" class="player-photo-img">` : '<div class="player-photo-placeholder">FOTO</div>'}
          </div>
          <input type="file" id="cPhotoInput" accept="image/*" hidden>
          <button class="btn btn-sm" id="cPhotoBtn" type="button" style="margin-top:8px">SUBIR FOTO</button>
        </div>
        <div style="flex:1">
          <div class="row">
            <div class="field"><label>Nombre</label><input class="input" id="cName" value="${state.name}"></div>
            <div class="field"><label>Rol</label>
              <select class="select" id="cRole">
                <option value="coach" ${state.roleType === 'coach' ? 'selected' : ''}>Head Coach</option>
                <option value="assistant" ${state.roleType === 'assistant' ? 'selected' : ''}>Asistente</option>
              </select>
            </div>
          </div>
          <div class="row">
            <div class="field">
              <label>Vincular a Jugador (Opcional)</label>
              <select class="select" id="cPlayer">
                <option value="">— No es jugador —</option>
                ${db.players.map(p => `<option value="${p.id}" ${state.playerId === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Nacionalidad</label>
              <select class="select" id="cNation">
                <option value="">— Sin especificar —</option>
                ${NATIONS.map(n => `<option value="${n.code}" ${state.nationalityCode === n.code ? 'selected' : ''}>${n.flag} ${n.name}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      </div>
      
      <div class="divider"></div>
      
      <div class="field">
        <label>Equipos a su mando</label>
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:8px; background:var(--bg-graphite); padding:12px; border-radius:8px; border:1px solid var(--border-soft); max-height:180px; overflow-y:auto;">
          ${db.teams.map(t => `
            <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; min-width:0;">
              <input type="checkbox" class="chk-coach-team" value="${t.id}" ${state.teamIds.includes(t.id) ? 'checked' : ''}>
              <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${t.name}</span>
            </label>
          `).join('')}
        </div>
        <small class="field-hint">Puedes asignarle múltiples equipos.</small>
      </div>

      <div class="field" id="cOrgNameWrap" style="display:none;">
        <label>Nombre del Grupo (Opcional)</label>
        <input class="input" id="cOrgName" value="${_esc(state.orgName)}" placeholder="Ej: Grupo Jalisco" maxlength="60">
        <small class="field-hint">Aparecerá en la cabecera del Portal del Coach. Solo aplica si dirige 2 o más equipos.</small>
      </div>

      <div class="row">
        <div class="field"><label>RL Tracker</label><input class="input" id="cTracker" value="${state.rlTracker}"></div>
        <div class="field"><label>ID de Discord</label><input class="input" id="cDiscordId" value="${state.discordId}" placeholder="Ej: usuario#1234"></div>
      </div>
      
      <div class="row-3">
        <div class="field"><label>Twitter</label><input class="input" id="cTwitter" value="${state.socials.twitter}"></div>
        <div class="field"><label>Twitch</label><input class="input" id="cTwitch" value="${state.socials.twitch}"></div>
        <div class="field"><label>YouTube</label><input class="input" id="cYoutube" value="${state.socials.youtube}"></div>
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" data-close>CANCELAR</button>
      <button class="btn btn-primary" id="saveCoach">GUARDAR</button>
    `,
    onMount: (root) => {
      const photoDrop = root.querySelector('#cPhotoDrop');
      const photoInput = root.querySelector('#cPhotoInput');
      const photoBtn = root.querySelector('#cPhotoBtn');
      photoBtn.addEventListener('click', () => photoInput.click());
      photoDrop.addEventListener('click', () => photoInput.click());
      
      photoInput.addEventListener('change', async () => {
        const f = photoInput.files[0];
        if (!f) return;
        try {
          const res = await compressImage(f, 256, 256);
          state.profilePicture = res;
          photoDrop.innerHTML = `<img src="${res}" class="player-photo-img">`;
        } catch (e) { toast('Error con la foto', 'error'); }
      });

      // 🔥 FASE D: Toggle dinámico del campo "Nombre del Grupo"
      const orgNameWrap = root.querySelector('#cOrgNameWrap');
      const orgNameInput = root.querySelector('#cOrgName');

      function updateOrgNameVisibility() {
        const checked = root.querySelectorAll('.chk-coach-team:checked').length;
        if (checked >= 2) {
          orgNameWrap.style.display = '';
        } else {
          orgNameWrap.style.display = 'none';
          if (orgNameInput) orgNameInput.value = '';
        }
      }

      root.querySelectorAll('.chk-coach-team').forEach(cb => {
        cb.addEventListener('change', updateOrgNameVisibility);
      });
      // Ejecutar al abrir (por si el coach ya tenía equipo seleccionado)
      updateOrgNameVisibility();

      root.querySelector('#cPlayer').addEventListener('change', (e) => {
        const pid = e.target.value;
        if (pid) {
          const p = db.players.find(x => x.id === pid);
          if (p) {
            root.querySelector('#cName').value = p.name;
            root.querySelector('#cNation').value = p.nationalityCode || '';
            root.querySelector('#cTracker').value = p.rlTracker || '';
            if (p.profilePicture) {
               state.profilePicture = p.profilePicture;
               photoDrop.innerHTML = `<img src="${p.profilePicture}" class="player-photo-img">`;
            }
          }
        }
      });

      root.querySelector('#saveCoach').addEventListener('click', () => {
        const name = root.querySelector('#cName').value.trim();
        if (!name) return toast('El nombre es obligatorio', 'error');

        const selectedTeams = Array.from(root.querySelectorAll('.chk-coach-team:checked')).map(cb => cb.value);
        // 🔥 FASE D: Solo guardar orgName si tiene 2+ equipos (evita basura)
        const orgName = selectedTeams.length >= 2 ? (orgNameInput.value.trim() || '') : '';

        const payload = {
          id: coachId || uid('ch'),
          name,
          roleType: root.querySelector('#cRole').value,
          teamIds: selectedTeams,
          orgName, // 🔥 NUEVO
          playerId: root.querySelector('#cPlayer').value || null,
          nationalityCode: root.querySelector('#cNation').value,
          rlTracker: root.querySelector('#cTracker').value,
          discordId: root.querySelector('#cDiscordId').value,
          socials: {
            twitter: root.querySelector('#cTwitter').value,
            twitch: root.querySelector('#cTwitch').value,
            youtube: root.querySelector('#cYoutube').value,
            instagram: state.socials.instagram || ''
          },
          profilePicture: state.profilePicture,
          customLinks: state.customLinks,
          history: coach?.history || [],
          trophies: coach?.trophies || []
        };

        mutate(d => {
          if (coachId) {
            const idx = d.coaches.findIndex(x => x.id === coachId);
            d.coaches[idx] = payload;
          } else {
            d.coaches.push(payload);
          }

          // 🔥 Sincronizar nombres en los equipos
          d.teams.forEach(t => {
            if (selectedTeams.includes(t.id)) {
              if (payload.roleType === 'coach') t.coach = payload.name;
              if (payload.roleType === 'assistant') t.assistant = payload.name;
            } else {
              if (payload.roleType === 'coach' && t.coach === payload.name) t.coach = '';
              if (payload.roleType === 'assistant' && t.assistant === payload.name) t.assistant = '';
            }
          });
        });

        toast('Coach guardado', 'success');
        closeTopModal();
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
    }
  });
}

export function showCoachProfile(coachId) {
  const db = getDB();
  const c = db.coaches.find(x => x.id === coachId);
  if (!c) return;

  const teamNames = (c.teamIds || []).map(id => db.teams.find(t => t.id === id)?.name).filter(Boolean).join(', ');
  const flag = c.nationalityCode ? getNationFlag(c.nationalityCode) : '';
  const hasGroup = c.orgName && (c.teamIds || []).length > 1;

  openModal({
    id: 'coach-profile-' + coachId,
    title: 'PERFIL DE COACH',
    body: `
      <div style="display:flex; gap:20px; align-items:center; margin-bottom:20px; flex-wrap:wrap;">
        <div class="team-logo-box-xl" style="border-radius:50%">
          ${c.profilePicture ? `<img src="${c.profilePicture}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : '👤'}
        </div>
        <div style="min-width:0; flex:1;">
          <h2 style="font-family:var(--font-display); font-size:24px; color:var(--silver-light); margin:0; word-break:break-word;">${c.name} ${flag}</h2>
          <div style="color:var(--accent); font-weight:600; margin-top:4px">${c.roleType === 'coach' ? 'Head Coach' : 'Asistente'}</div>
          ${hasGroup ? `<div style="color:var(--gold); font-size:13px; margin-top:6px; font-weight:600; word-break:break-word;">👥 ${_esc(c.orgName)}</div>` : ''}
          <div style="color:var(--muted); font-size:12px; margin-top:4px; word-break:break-word;">${teamNames || 'Agente Libre'}</div>
        </div>
      </div>
      
      <div class="divider"></div>
      <div class="grid grid-2">
        <div>
          <div class="section-minihead">REDES SOCIALES</div>
          <div style="display:flex; flex-direction:column; gap:6px; font-size:12px; word-break:break-word;">
            ${c.discordId ? `<div><b>Discord:</b> ${c.discordId}</div>` : ''}
            ${c.socials?.twitter ? `<div><b>Twitter:</b> ${c.socials.twitter}</div>` : ''}
            ${c.socials?.twitch ? `<div><b>Twitch:</b> ${c.socials.twitch}</div>` : ''}
            ${c.socials?.youtube ? `<div><b>YouTube:</b> ${c.socials.youtube}</div>` : ''}
          </div>
        </div>
        <div>
          <div class="section-minihead">TRACKER</div>
          ${c.rlTracker ? `<a href="${c.rlTracker}" target="_blank" style="color:var(--accent); font-size:12px">Ver RL Tracker ↗</a>` : '<div style="color:var(--muted); font-size:12px">No registrado</div>'}
        </div>
      </div>
    `,
    footer: `<button class="btn btn-ghost" data-close>CERRAR</button>`
  });
}
