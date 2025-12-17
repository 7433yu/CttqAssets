// table-render.js — 修正版，包含 legend 交互过滤（单击切换）
(function () {
    const API = '/api/assets';
    const COL_KEYS = ['neo', 'first', 'second', 'third'];

    function escapeHtml(s) { if (s == null) return ''; return String(s); }

    function createAssetPill(asset) {
        const pill = document.createElement('div');
        pill.className = asset.modality ? `asset ${asset.modality}` : 'asset';
        pill.setAttribute('tabindex', '0');
        if (asset.name) pill.setAttribute('data-title', asset.name + (asset.sub ? ' ' + asset.sub : ''));
        if (asset.phase) pill.setAttribute('data-phase', String(asset.phase));
        if (asset.desc) pill.setAttribute('data-desc', asset.desc);

        const nameSpan = document.createElement('span'); nameSpan.className = 'name'; nameSpan.textContent = asset.name || ''; pill.appendChild(nameSpan);
        if (asset.sub) { const subSpan = document.createElement('span'); subSpan.className = 'sub'; subSpan.textContent = asset.sub; pill.appendChild(subSpan); }

        const badge = document.createElement('span');
        let badgeClass = 'badge', badgeText = '';
        if (asset.phase === 'appr' || asset.phase === 'approval') { badgeClass += ' appr'; badgeText = '✓'; }
        else if (asset.phase === 'pcc') { badgeClass += ' pcc'; badgeText = 'P'; }
        else if (asset.phase) { badgeClass += ` phase-${asset.phase}`; badgeText = String(asset.phase); }
        badge.className = badgeClass; badge.textContent = badgeText; pill.appendChild(badge);

        pill.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pill.click(); } });
        return pill;
    }

    function renderAssetsIntoCell(td, assets) {
        if (!td) return;
        td.innerHTML = '';
        if (!assets || assets.length === 0) return;
        const wrapper = document.createElement('div'); wrapper.className = 'assets-container';
        assets.forEach(a => wrapper.appendChild(createAssetPill(a)));
        td.appendChild(wrapper);
    }

    function buildSingleRow(group) {
        const tr = document.createElement('tr');
        tr.classList.add('group-top', 'group-bottom'); // singleRow == both top & bottom (solid lines)
        const leftTd = document.createElement('td');
        leftTd.className = 'left-label group-main';
        leftTd.colSpan = 2;
        const lines = [];
        if (group.title) lines.push(escapeHtml(group.title));
        if (group.subtitle) lines.push(`<span style="font-weight:500;">${escapeHtml(group.subtitle)}</span>`);
        if (group.est) lines.push(`<span style="font-weight:600; margin-top:6px; display:block">${escapeHtml(group.est)}</span>`);
        leftTd.innerHTML = lines.join('<br>');
        tr.appendChild(leftTd);
        for (let i = 0; i < COL_KEYS.length; i++) tr.appendChild(document.createElement('td'));
        return tr;
    }

    function buildMultiRows(group) {
        const subtypeRows = group.subtypeRows || [];
        const rowCount = Math.max(1, subtypeRows.length);
        const trs = [];
        for (let i = 0; i < rowCount; i++) {
            const tr = document.createElement('tr');
            tr.classList.add('subrow');
            if (rowCount === 1) tr.classList.add('group-top', 'group-bottom');
            else if (i === 0) tr.classList.add('group-top');
            else if (i === rowCount - 1) tr.classList.add('group-bottom');
            else tr.classList.add('subrow-middle');
            trs.push(tr);
        }

        const leftMain = document.createElement('td');
        leftMain.className = 'left-label group-main';
        leftMain.rowSpan = rowCount;
        const lines = [];
        if (group.title) lines.push(escapeHtml(group.title));
        if (group.subtitle) lines.push(`<div style="font-weight:500;">${escapeHtml(group.subtitle)}</div>`);
        if (group.est) lines.push(`<div style="font-weight:600; margin-top:6px;">${escapeHtml(group.est)}</div>`);
        leftMain.innerHTML = lines.join('');
        trs[0].appendChild(leftMain);

        for (let i = 0; i < rowCount; i++) {
            const sub = subtypeRows[i] || { subtype: '', columns: {} };
            const tdSubtype = document.createElement('td');
            tdSubtype.className = 'left-label dashed';
            tdSubtype.innerHTML = escapeHtml(sub.subtype || '');
            trs[i].appendChild(tdSubtype);
            for (let k = 0; k < COL_KEYS.length; k++) trs[i].appendChild(document.createElement('td'));
        }
        return trs;
    }

    // ========== legend filter logic ==========
    // parse legend item text -> filter key
    function inferFilterKeyFromText(txt) {
        if (!txt) return null;
        const s = txt.trim().toLowerCase();
        if (s.includes('approval')) return 'appr';
        if (s.includes('pcc')) return 'pcc';
        if (s.includes('phase 1') || s.includes('phase1') || s.includes('phase Ⅰ')) return '1';
        if (s.includes('phase 2') || s.includes('phase2') || s.includes('phase Ⅱ')) return '2';
        if (s.includes('phase 3') || s.includes('phase3') || s.includes('phase Ⅲ')) return '3';
        if (s.includes('biological') || s.includes('biolog')) return 'bio';
        if (s.includes('chemical') || s.includes('chem')) return 'chem';
        // fallback: use trimmed token
        return s.replace(/\s+/g, '-');
    }

    let currentFilter = null; // active filter key or null

    function applyFilter(key) {
        currentFilter = key;
        const assets = Array.from(document.querySelectorAll('.assets-container .asset'));
        assets.forEach(a => {
            const phase = (a.getAttribute('data-phase') || '').trim();
            const modality = Array.from(a.classList).includes('bio') ? 'bio' : (Array.from(a.classList).includes('chem') ? 'chem' : '');
            let match = false;
            if (key === 'bio' || key === 'chem') {
                match = modality === key;
            } else {
                match = phase === key;
            }
            a.style.display = match ? '' : 'none';
        });
        // hide empty containers
        document.querySelectorAll('.assets-container').forEach(w => {
            const vis = w.querySelectorAll('.asset').length && w.querySelectorAll('.asset:not([style*="display: none"])').length;
            w.style.display = vis ? '' : 'none';
        });
    }

    function clearFilter() {
        currentFilter = null;
        document.querySelectorAll('.assets-container .asset').forEach(a => a.style.display = '');
        document.querySelectorAll('.assets-container').forEach(w => w.style.display = '');
    }

    function setupLegendHandlers() {
        const legendItems = Array.from(document.querySelectorAll('.legend .item'));
        if (!legendItems.length) return;
        legendItems.forEach(item => {
            item.style.cursor = 'pointer';
            const key = inferFilterKeyFromText(item.textContent || item.innerText || '');
            item.dataset.filterKey = key || '';
            item.addEventListener('click', () => {
                const isActive = item.classList.contains('active');
                // clear all
                legendItems.forEach(li => li.classList.remove('active'));
                if (!isActive) {
                    item.classList.add('active');
                    applyFilter(key);
                } else {
                    clearFilter();
                }
            });
        });
    }

    // ========== main render ==========
    async function loadAndRender() {
        const table = document.querySelector('.ct-table'); if (!table) { console.warn('table-render: 找不到 .ct-table'); return; }
        const tbody = table.querySelector('tbody'); if (!tbody) { console.warn('table-render: 找不到 tbody'); return; }
        let data;
        try { const resp = await fetch(API, { credentials: 'same-origin' }); if (!resp.ok) throw new Error('HTTP ' + resp.status); data = await resp.json(); }
        catch (e) { console.error('table-render: 获取数据失败', e); return; }
        if (!data || !Array.isArray(data.groups)) { console.warn('table-render: 数据格式错误或 groups 缺失', data); return; }

        tbody.innerHTML = '';

        for (const group of data.groups) {
            if (!group.type || group.type === 'singleRow') {
                const tr = buildSingleRow(group);
                tbody.appendChild(tr);
                const row = tbody.rows[tbody.rows.length - 1];
                for (let ci = 0; ci < COL_KEYS.length; ci++) {
                    const targetCell = row.cells[1 + ci];
                    renderAssetsIntoCell(targetCell, (group.columns && group.columns[COL_KEYS[ci]]) || []);
                }
            } else if (group.type === 'multiRow') {
                const trs = buildMultiRows(group);
                trs.forEach(t => tbody.appendChild(t));
                const subtypeRows = group.subtypeRows || [];
                const startRowIndex = tbody.rows.length - trs.length;

                for (let i = 0; i < trs.length; i++) {
                    const row = tbody.rows[startRowIndex + i];
                    const cells = Array.from(row.children);
                    let subtypeIndex = cells.findIndex(c => c.classList && c.classList.contains('left-label') && c.classList.contains('dashed'));
                    if (subtypeIndex === -1) {
                        subtypeIndex = cells.findIndex(c => c.classList && c.classList.contains('left-label') && !c.classList.contains('group-main'));
                    }
                    if (subtypeIndex === -1) subtypeIndex = 0;
                    for (let ci = 0; ci < COL_KEYS.length; ci++) {
                        const colKey = COL_KEYS[ci];
                        const targetCell = cells[subtypeIndex + 1 + ci];
                        const assets = (subtypeRows[i] && subtypeRows[i].columns && subtypeRows[i].columns[colKey]) || [];
                        renderAssetsIntoCell(targetCell, assets);
                    }
                }
            } else {
                console.warn('table-render: 未知 group.type', group.type, group.id);
            }
        }

        // after rendering, (re)setup legend handlers so they bind to DOM
        setupLegendHandlers();

        const pop = document.getElementById('asset-popover');
        if (pop) {
            if (window.__tableRenderBound) {
                try { document.body.removeEventListener('click', window.__tableRenderBound); } catch (e) { }
                window.__tableRenderBound = null;
            }
            const handler = function (ev) {
                const a = ev.target.closest && ev.target.closest('.asset');
                if (!a) return;
                if (typeof window.showPopover === 'function') {
                    try { window.showPopover(a); return; } catch (e) { }
                }
                const t = pop.querySelector('#pop-title'), m = pop.querySelector('#pop-meta'), d = pop.querySelector('#pop-desc');
                if (t) t.textContent = a.getAttribute('data-title') || a.textContent;
                if (m) { const ph = a.getAttribute('data-phase') || ''; m.textContent = ph === 'appr' ? 'Approval' : ph; }
                if (d) d.textContent = a.getAttribute('data-desc') || '';
                pop.classList.add('visible'); pop.setAttribute('aria-hidden', 'false'); pop._currentTarget = a;
                const rect = a.getBoundingClientRect(); pop.style.left = Math.max(8, rect.left + window.scrollX) + 'px'; pop.style.top = (rect.bottom + window.scrollY + 8) + 'px';
            };
            document.body.addEventListener('click', handler, false); window.__tableRenderBound = handler;
        }
        console.info('table-render: 渲染完成（groups:', data.groups.length, '）');
    }

    window.tableRenderReload = loadAndRender;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadAndRender); else loadAndRender();
})();