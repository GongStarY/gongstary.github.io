/* KUNG planner — local txt + localStorage. No GitHub write. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     访问控制接口（静态页能做的上限）
     - 浏览器读不到真实公网 IP、也读不到硬件设备码 / MAC / 序列号。
     - IP_ALLOWLIST / DEVICE_ALLOWLIST 需要你自己的后端才能强制执行。
     - 下面 onAccessAttempt 是审核挂钩：可改成 fetch('https://your-api/...')。
     ------------------------------------------------------------------ */
  var ACCESS = {
    storageKey: 'kung-planner-auth',
    sessionKey: 'kung-planner-session',
    trustKey: 'kung-planner-trust',
    auditKey: 'kung-planner-audit',
    presetPassHash: '',
    allowFirstSetup: true,
    ipAllowlist: [],
    deviceAllowlist: [],
    onAccessAttempt: function (record) {
      var log = loadJson(ACCESS.auditKey, []);
      log.unshift(record);
      saveJson(ACCESS.auditKey, log.slice(0, 40));
    }
  };

  var DATA_KEY = 'kung-planner-data';
  var TRACKS = {
    daily: '每日计划',
    weekly: '每周计划',
    monthly: '每月计划',
    quarterly: '每季度计划',
    yearly: '年计划',
    life: '人生计划'
  };

  var state = { track: 'daily', tasks: [], fileHandle: null, collapsed: {}, pick: null };
  var els = {};

  function loadJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function saveJson(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }
  function uid() {
    return 't_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  function todayISO() {
    var d = new Date();
    return isoDate(d);
  }
  function isoDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function startOfToday() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function sha256hex(text) {
    var enc = new TextEncoder().encode(text);
    return crypto.subtle.digest('SHA-256', enc).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  function deviceFingerprint() {
    return [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    ].join('|');
  }

  function probePublicIp() {
    return fetch('https://api.ipify.org?format=json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { return j.ip || ''; })
      .catch(function () { return ''; });
  }

  function needsSetup() {
    if (ACCESS.presetPassHash) return false;
    var auth = loadJson(ACCESS.storageKey, null);
    return ACCESS.allowFirstSetup && (!auth || !auth.hash);
  }

  function isSessionOpen() {
    return sessionStorage.getItem(ACCESS.sessionKey) === '1';
  }

  function isTrustedDevice() {
    var auth = loadJson(ACCESS.storageKey, null);
    var trust = loadJson(ACCESS.trustKey, null);
    return !!(auth && trust && trust.token && auth.trustToken === trust.token);
  }

  function openApp() {
    var gate = document.getElementById('gate');
    gate.style.display = 'none';
    gate.setAttribute('hidden', '');
    gate.setAttribute('aria-hidden', 'true');
    document.getElementById('app').style.display = 'block';
    sessionStorage.setItem(ACCESS.sessionKey, '1');
    renderComposer();
    renderBoard();
    renderAudit();
  }

  function lockApp() {
    sessionStorage.removeItem(ACCESS.sessionKey);
    location.reload();
  }

  function bootGate() {
    els.gateTitle = document.getElementById('gate-title');
    els.gateDesc = document.getElementById('gate-desc');
    els.setup = document.getElementById('setup-fields');
    els.login = document.getElementById('login-fields');
    els.err = document.getElementById('gate-err');
    if (isSessionOpen() || isTrustedDevice()) {
      openApp();
      return;
    }
    if (needsSetup()) {
      els.gateTitle.textContent = '首次设口令';
      els.setup.hidden = false;
      els.login.hidden = true;
    } else {
      els.setup.hidden = true;
      els.login.hidden = false;
    }
    document.getElementById('gate-go').addEventListener('click', submitGate);
  }

  function submitGate() {
    els.err.textContent = '';
    var trust = document.getElementById('trust').checked;
    if (needsSetup()) {
      var a = document.getElementById('pw1').value;
      var b = document.getElementById('pw2').value;
      if (a.length < 6) { els.err.textContent = '口令至少 6 位'; return; }
      if (a !== b) { els.err.textContent = '两次口令不一致'; return; }
      sha256hex(a).then(function (hash) {
        var token = uid();
        saveJson(ACCESS.storageKey, { hash: hash, trustToken: trust ? token : null });
        if (trust) saveJson(ACCESS.trustKey, { token: token });
        logAttempt(true, 'setup');
        openApp();
      });
      return;
    }
    var pw = document.getElementById('pw').value;
    sha256hex(pw).then(function (hash) {
      var auth = loadJson(ACCESS.storageKey, null);
      var expected = ACCESS.presetPassHash || (auth && auth.hash);
      if (hash !== expected) {
        logAttempt(false, 'login');
        els.err.textContent = '口令不正确';
        return;
      }
      if (!auth) auth = { hash: hash, trustToken: null };
      if (trust) {
        var token = uid();
        auth.trustToken = token;
        saveJson(ACCESS.trustKey, { token: token });
      }
      saveJson(ACCESS.storageKey, auth);
      logAttempt(true, 'login');
      openApp();
    });
  }

  function logAttempt(ok, kind) {
    var rec = {
      ok: ok,
      kind: kind,
      at: new Date().toISOString(),
      ua: navigator.userAgent,
      fp: deviceFingerprint(),
      ip: ''
    };
    ACCESS.onAccessAttempt(rec);
    probePublicIp().then(function (ip) {
      if (!ip) return;
      var log = loadJson(ACCESS.auditKey, []);
      if (log[0] && log[0].at === rec.at) log[0].ip = ip;
      saveJson(ACCESS.auditKey, log);
      renderAudit();
    });
  }

  function loadTasks() {
    var data = loadJson(DATA_KEY, { tasks: [] });
    state.tasks = Array.isArray(data.tasks) ? data.tasks : [];
  }
  function persist() {
    saveJson(DATA_KEY, { version: 1, tasks: state.tasks });
    if (state.fileHandle && state.fileHandle.createWritable) {
      serializeTxt().then(function (text) {
        return state.fileHandle.createWritable().then(function (w) {
          return w.write(text).then(function () { return w.close(); });
        });
      }).catch(function () {});
    }
  }

  function serializeTxt() {
    var lines = ['@kung-planner v1', ''];
    Object.keys(TRACKS).forEach(function (track) {
      lines.push('[' + track + ']');
      var items = state.tasks.filter(function (t) { return t.track === track; });
      var buckets = groupKeys(items);
      buckets.forEach(function (bucket) {
        lines.push('# ' + bucket);
        items.filter(function (t) { return t.bucket === bucket; }).forEach(function (t) {
          var mark = t.done ? 'x' : ' ';
          var extra = t.due ? ' | due:' + t.due : '';
          lines.push('- [' + mark + '] ' + (t.title || '') + extra);
          if (t.note) {
            String(t.note).split('\n').forEach(function (n) {
              lines.push('> ' + n);
            });
          }
        });
        lines.push('');
      });
      lines.push('');
    });
    return Promise.resolve(lines.join('\n'));
  }

  function parseTxt(text) {
    var tasks = [];
    var track = 'daily';
    var bucket = todayISO();
    var last = null;
    text.replace(/\r\n/g, '\n').split('\n').forEach(function (raw) {
      var line = raw.trim();
      if (!line || line.indexOf('@kung-planner') === 0) return;
      var sec = line.match(/^\[(\w+)\]$/);
      if (sec && TRACKS[sec[1]]) { track = sec[1]; last = null; return; }
      if (line.charAt(0) === '#') { bucket = line.replace(/^#\s*/, ''); last = null; return; }
      if (line.charAt(0) === '>' && last) {
        last.note = (last.note ? last.note + '\n' : '') + line.replace(/^>\s?/, '');
        return;
      }
      var m = line.match(/^- \[([ xX])\] (.+)$/);
      if (!m) return;
      var title = m[2];
      var due = '';
      var dm = title.match(/\s\|\s*due:(\d{4}-\d{2}-\d{2})\s*$/);
      if (dm) { due = dm[1]; title = title.slice(0, dm.index); }
      last = {
        id: uid(),
        track: track,
        bucket: bucket,
        title: title.trim(),
        note: '',
        due: due,
        done: m[1].toLowerCase() === 'x'
      };
      tasks.push(last);
    });
    return tasks;
  }

  function weekOfMonth(d) {
    var first = new Date(d.getFullYear(), d.getMonth(), 1);
    var offset = first.getDay() === 0 ? 6 : first.getDay() - 1;
    return Math.floor((d.getDate() - 1 + offset) / 7) + 1;
  }
  function quarterOf(d) {
    return Math.floor(d.getMonth() / 3) + 1;
  }

  function defaultBucket(track, d) {
    d = d || new Date();
    if (track === 'daily') return isoDate(d);
    if (track === 'weekly') return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-W' + weekOfMonth(d);
    if (track === 'monthly') return d.getFullYear() + '-' + pad(d.getMonth() + 1);
    if (track === 'quarterly') return d.getFullYear() + '-Q' + quarterOf(d);
    if (track === 'yearly') return String(d.getFullYear());
    return '长期';
  }

  function labelParts(track, bucket) {
    var m;
    if (track === 'daily') {
      m = bucket.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return { outer: m[1] + '年', inner: '（' + Number(m[2]) + '月' + Number(m[3]) + '日）' };
    }
    if (track === 'weekly') {
      m = bucket.match(/^(\d{4})-(\d{2})-W(\d+)$/);
      if (m) return { outer: m[1] + '年', inner: '（' + Number(m[2]) + '月第' + m[3] + '周）' };
    }
    if (track === 'monthly') {
      m = bucket.match(/^(\d{4})-(\d{2})$/);
      if (m) return { outer: m[1] + '年', inner: '（' + Number(m[2]) + '月）' };
    }
    if (track === 'quarterly') {
      m = bucket.match(/^(\d{4})-Q(\d)$/);
      if (m) return { outer: m[1] + '年', inner: '（第' + m[2] + '季度）' };
    }
    if (track === 'yearly') return { outer: '年度', inner: '（' + bucket + '年）' };
    return { outer: '人生', inner: '（' + bucket + '）' };
  }

  function bucketDueDate(track, bucket) {
    var m;
    if (track === 'daily') {
      m = bucket.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    }
    if (track === 'weekly') {
      m = bucket.match(/^(\d{4})-(\d{2})-W(\d+)$/);
      if (m) return new Date(+m[1], +m[2] - 1, Math.min(28, m[3] * 7));
    }
    if (track === 'monthly') {
      m = bucket.match(/^(\d{4})-(\d{2})$/);
      if (m) return new Date(+m[1], +m[2], 0);
    }
    if (track === 'quarterly') {
      m = bucket.match(/^(\d{4})-Q(\d)$/);
      if (m) return new Date(+m[1], m[2] * 3, 0);
    }
    if (track === 'yearly') return new Date(+bucket, 11, 31);
    return null;
  }

  function isOverdue(task) {
    if (task.done) return false;
    var due = task.due ? new Date(task.due + 'T00:00:00') : bucketDueDate(task.track, task.bucket);
    if (!due) return false;
    return due < startOfToday();
  }

  function groupKeys(items) {
    var keys = [];
    items.forEach(function (t) {
      if (keys.indexOf(t.bucket) === -1) keys.push(t.bucket);
    });
    keys.sort().reverse();
    return keys;
  }

  function pickNow() {
    var d = new Date();
    return {
      y: d.getFullYear(),
      m: d.getMonth() + 1,
      d: d.getDate(),
      w: weekOfMonth(d),
      q: quarterOf(d)
    };
  }

  function currentPick() {
    return state.pick || (state.pick = pickNow());
  }

  function rememberPick() {
    var p = currentPick();
    var y = document.getElementById('new-year');
    var m = document.getElementById('new-month');
    var d = document.getElementById('new-day');
    var w = document.getElementById('new-week');
    var q = document.getElementById('new-q');
    if (y) p.y = +y.value;
    if (m) p.m = +m.value;
    if (d) p.d = +d.value;
    if (w) p.w = +w.value;
    if (q) p.q = +q.value;
    state.pick = p;
  }

  function fld(key, inner) {
    return '<label class="fld"><span class="k">' + key + '</span>' + inner + '</label>';
  }

  function renderComposer() {
    var track = state.track;
    var p = currentPick();
    var box = document.getElementById('composer-fields');
    var dateRow = '';
    if (track === 'daily') {
      dateRow = fld('年', yearSelect('new-year', p.y)) +
        fld('月', monthSelect(p.m)) +
        fld('日', daySelect(p.d));
    } else if (track === 'weekly') {
      dateRow = fld('年', yearSelect('new-year', p.y)) +
        fld('月', monthSelect(p.m)) +
        fld('周', weekSelect(p.w));
    } else if (track === 'monthly') {
      dateRow = fld('年', yearSelect('new-year', p.y)) + fld('月', monthSelect(p.m));
    } else if (track === 'quarterly') {
      dateRow = fld('年', yearSelect('new-year', p.y)) + fld('季', quarterSelect(p.q));
    } else if (track === 'yearly') {
      dateRow = fld('年', yearSelect('new-year', p.y));
    } else {
      dateRow = '<input id="new-bucket" type="text" placeholder="阶段名，例如 博士期间" value="长期">';
    }
    box.innerHTML =
      '<div class="row">' + dateRow + '</div>' +
      '<div class="row stack">' +
        '<input id="new-title" type="text" placeholder="任务标题">' +
        '<textarea id="new-note" placeholder="任务细则（可选）"></textarea>' +
      '</div>';
    document.getElementById('track-title').textContent = '// ' + TRACKS[track];
    box.querySelectorAll('select').forEach(function (el) {
      el.addEventListener('change', rememberPick);
    });
  }

  function yearSelect(id, selected) {
    var y = new Date().getFullYear();
    var s = '<select id="' + id + '">';
    for (var i = y - 8; i <= y + 4; i++) {
      s += '<option value="' + i + '"' + (i === selected ? ' selected' : '') + '>' + i + '</option>';
    }
    return s + '</select>';
  }
  function monthSelect(selected) {
    var s = '<select id="new-month">';
    for (var i = 1; i <= 12; i++) {
      s += '<option value="' + i + '"' + (i === selected ? ' selected' : '') + '>' + i + '月</option>';
    }
    return s + '</select>';
  }
  function daySelect(selected) {
    var s = '<select id="new-day">';
    for (var i = 1; i <= 31; i++) {
      s += '<option value="' + i + '"' + (i === selected ? ' selected' : '') + '>' + i + '日</option>';
    }
    return s + '</select>';
  }
  function weekSelect(selected) {
    var s = '<select id="new-week">';
    for (var j = 1; j <= 6; j++) {
      s += '<option value="' + j + '"' + (j === selected ? ' selected' : '') + '>第' + j + '周</option>';
    }
    return s + '</select>';
  }
  function quarterSelect(selected) {
    var s = '<select id="new-q">';
    for (var i = 1; i <= 4; i++) {
      s += '<option value="' + i + '"' + (i === selected ? ' selected' : '') + '>第' + i + '季度</option>';
    }
    return s + '</select>';
  }

  function daysInMonth(y, m) {
    return new Date(y, m, 0).getDate();
  }

  function readNewBucket() {
    rememberPick();
    var track = state.track;
    var p = currentPick();
    if (track === 'daily') {
      var dim = daysInMonth(p.y, p.m);
      var day = Math.min(p.d, dim);
      return p.y + '-' + pad(p.m) + '-' + pad(day);
    }
    if (track === 'weekly') return p.y + '-' + pad(p.m) + '-W' + p.w;
    if (track === 'monthly') return p.y + '-' + pad(p.m);
    if (track === 'quarterly') return p.y + '-Q' + p.q;
    if (track === 'yearly') return String(p.y);
    return (document.getElementById('new-bucket').value || '长期').trim();
  }

  function addTask() {
    var title = (document.getElementById('new-title').value || '').trim();
    if (!title) return;
    var note = (document.getElementById('new-note').value || '').trim();
    state.tasks.push({
      id: uid(),
      track: state.track,
      bucket: readNewBucket(),
      title: title,
      note: note,
      due: '',
      done: false
    });
    document.getElementById('new-title').value = '';
    document.getElementById('new-note').value = '';
    persist();
    renderBoard();
  }

  function renderBoard() {
    var board = document.getElementById('board');
    var items = state.tasks.filter(function (t) { return t.track === state.track; });
    var keys = groupKeys(items);
    if (!keys.length) {
      board.innerHTML = '<div class="empty">还没有任务。用上面的表单新建，或读取本地 txt 备份。</div>';
      return;
    }
    board.innerHTML = keys.map(function (bucket) {
      var list = items.filter(function (t) { return t.bucket === bucket; });
      var doneN = list.filter(function (t) { return t.done; }).length;
      var lateN = list.filter(function (t) { return isOverdue(t); }).length;
      var total = list.length;
      var okPct = total ? (doneN / total) * 100 : 0;
      var latePct = total ? (lateN / total) * 100 : 0;
      var lab = labelParts(state.track, bucket);
      var open = state.collapsed[state.track + ':' + bucket] ? '' : ' open';
      return (
        '<article class="group' + open + '" data-bucket="' + escapeAttr(bucket) + '">' +
          '<button type="button" class="group-head">' +
            '<span class="g-outer">' + escapeHtml(lab.outer) + '</span>' +
            '<span class="g-inner">' + escapeHtml(lab.inner) + '</span>' +
            '<span class="pct">' + Math.round(okPct) + '%</span>' +
          '</button>' +
          '<div class="bar"><span class="ok" style="width:' + okPct + '%"></span>' +
            '<span class="late" style="width:' + latePct + '%"></span></div>' +
          '<div class="group-body">' + list.map(taskRow).join('') + '</div>' +
        '</article>'
      );
    }).join('');
  }

  function taskRow(t) {
    var late = isOverdue(t);
    var note = t.note ? '<div class="note">' + escapeHtml(t.note).replace(/\n/g, '<br>') + '</div>' : '';
    return (
      '<div class="task' + (t.done ? ' done' : '') + (late ? ' overdue' : '') + '" data-id="' + t.id + '">' +
        '<input type="checkbox"' + (t.done ? ' checked' : '') + '>' +
        '<div class="body"><div class="title">' + escapeHtml(t.title) + '</div>' + note + '</div>' +
        (t.due || late ? '<div class="due">' + (t.due ? t.due : '已过期') + '</div>' : '') +
        '<button type="button" class="del" title="删除">✕</button>' +
      '</div>'
    );
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function renderAudit() {
    var box = document.getElementById('audit');
    if (!box) return;
    var log = loadJson(ACCESS.auditKey, []);
    if (!log.length) {
      box.textContent = '审核日志空。纯 HTML 读不到设备码；此处只记录本机口令尝试与可选的出口 IP。';
      return;
    }
    var last = log[0];
    box.textContent = '最近尝试 ' + (last.ok ? '成功' : '失败') + '\n' + last.at +
      (last.ip ? ('\n出口IP ' + last.ip) : '\n出口IP 未知（校园网/无第三方探测）');
  }

  function bindUi() {
    document.querySelectorAll('.track-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        rememberPick();
        state.track = btn.getAttribute('data-track');
        document.querySelectorAll('.track-btn').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        renderComposer();
        renderBoard();
      });
    });
    document.getElementById('btn-add').addEventListener('click', addTask);
    document.getElementById('btn-export').addEventListener('click', function () {
      serializeTxt().then(function (text) {
        var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'kung-planner-' + todayISO() + '.txt';
        a.click();
        URL.revokeObjectURL(a.href);
      });
    });
    document.getElementById('btn-import').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        state.tasks = parseTxt(String(reader.result || ''));
        persist();
        renderBoard();
      };
      reader.readAsText(file, 'utf-8');
      e.target.value = '';
    });
    document.getElementById('btn-lock').addEventListener('click', function () {
      localStorage.removeItem(ACCESS.trustKey);
      lockApp();
    });
    document.getElementById('board').addEventListener('click', function (e) {
      var head = e.target.closest('.group-head');
      if (head) {
        var group = head.parentElement;
        group.classList.toggle('open');
        var key = state.track + ':' + group.getAttribute('data-bucket');
        state.collapsed[key] = !group.classList.contains('open');
        return;
      }
      var row = e.target.closest('.task');
      if (!row) return;
      var id = row.getAttribute('data-id');
      var task = state.tasks.filter(function (t) { return t.id === id; })[0];
      if (!task) return;
      if (e.target.classList.contains('del')) {
        state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
        persist();
        renderBoard();
        return;
      }
      if (e.target.type === 'checkbox') {
        task.done = e.target.checked;
        persist();
        renderBoard();
      }
    });

    if (window.showOpenFilePicker) {
      var bind = document.getElementById('btn-bind');
      bind.hidden = false;
      bind.addEventListener('click', function () {
        window.showOpenFilePicker({
          types: [{ description: 'Planner txt', accept: { 'text/plain': ['.txt'] } }]
        }).then(function (handles) {
          state.fileHandle = handles[0];
          return state.fileHandle.getFile();
        }).then(function (file) {
          return file.text();
        }).then(function (text) {
          if (text && text.trim()) state.tasks = parseTxt(text);
          persist();
          renderBoard();
        }).catch(function () {});
      });
    }
  }

  function particles() {
    var canvas = document.getElementById('particle-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var ps = [];
    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    for (var i = 0; i < 42; i++) {
      ps.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.4 + 0.4
      });
    }
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ps.forEach(function (p) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,240,255,.45)';
        ctx.fill();
      });
      requestAnimationFrame(draw);
    }
    draw();
  }

  loadTasks();
  bootGate();
  bindUi();
  particles();
})();
