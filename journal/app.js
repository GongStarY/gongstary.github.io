/* KUNG journal — Notion-like notes, GitHub Contents API, MD/HTML storage */
(function () {
  'use strict';

  var CFG_KEY = 'kung-journal-gh';
  var CACHE_KEY = 'kung-journal-cache';
  var CATALOG = '_index.md';
  var THEME_KEY = 'kung-journal-theme';
  var INSERT_BLOCKS = [
    { id: 'p', label: '文本', desc: '用纯文本开始书写。' },
    { id: 'h1', label: '标题 1', desc: '大号章节标题。' },
    { id: 'h2', label: '标题 2', desc: '中号章节标题。' },
    { id: 'h3', label: '标题 3', desc: '小号章节标题。' },
    { id: 'todo', label: '待办清单', desc: '用复选框追踪任务。' },
    { id: 'radio', label: '单选框', desc: '同组选项只能选一项。' },
    { id: 'ul', label: '项目符号列表', desc: '创建一个简单的项目列表。' },
    { id: 'ol', label: '有序列表', desc: '创建一个有编号的列表。' },
    { id: 'toggle', label: '折叠列表', desc: '展开或收起内部内容。' },
    { id: 'code', label: '代码', desc: '捕获代码片段。' },
    { id: 'quote', label: '引用', desc: '捕获引用。' },
    { id: 'callout', label: '标注', desc: '突出显示信息。' },
    { id: 'link', label: '书签', desc: '通过链接保存网页概览。' },
    { id: 'img', label: '图片', desc: '上传或嵌入图片。' },
    { id: 'hr', label: '分割线', desc: '在视觉上分隔内容。' }
  ];
  var THEMES = ['notion', 'parchment', 'eyecare', 'vista', 'scifi'];
  var BLOCKS = [
    { id: 'p', label: '段落', hint: '/text' },
    { id: 'h1', label: '标题 1', hint: '/h1' },
    { id: 'h2', label: '标题 2', hint: '/h2' },
    { id: 'h3', label: '标题 3', hint: '/h3' },
    { id: 'code', label: '代码块', hint: '/code' },
    { id: 'todo', label: '复选框', hint: '/todo' },
    { id: 'radio', label: '单选框', hint: '/radio' },
    { id: 'indent', label: '增加缩进', hint: 'Tab' },
    { id: 'outdent', label: '减少缩进', hint: 'Shift+Tab' },
    { id: 'link', label: '网页链接概览', hint: '/link' },
    { id: 'img', label: '插入图片', hint: '/img' },
    { id: 'quote', label: '引用', hint: '/quote' },
    { id: 'callout', label: '高亮块', hint: '/tip' },
    { id: 'ul', label: '无序列表', hint: '/ul' },
    { id: 'ol', label: '有序列表', hint: '/ol' },
    { id: 'toggle', label: '折叠列表', hint: '/toggle' },
    { id: 'hr', label: '分隔线', hint: '/div' }
  ];

  var state = {
    cfg: loadCfg(),
    notes: {},
    order: [],
    current: null,
    focusId: null,
    dirty: false,
    shas: {}
  };

  var els = {};

  function loadCfg() {
    try {
      return JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }
  function saveCfg() {
    localStorage.setItem(CFG_KEY, JSON.stringify({
      owner: state.cfg.owner || '',
      repo: state.cfg.repo || '',
      branch: state.cfg.branch || '',
      path: state.cfg.path || 'journal/notes',
      token: state.cfg.token || ''
    }));
  }
  function loadCache() {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      state.notes = c.notes || {};
      state.order = c.order || Object.keys(state.notes);
    } catch (e) {
      state.notes = {};
      state.order = [];
    }
  }
  function saveCache() {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ notes: state.notes, order: state.order }));
  }

  function uid(prefix) {
    return (prefix || 'b') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  }
  function nowISO() { return new Date().toISOString(); }
  function blockIndent(b) { return Math.max(0, parseInt(b && b.indent, 10) || 0); }
  function hasKidsAt(blocks, index) {
    var nxt = blocks[index + 1];
    return !!(nxt && blockIndent(nxt) > blockIndent(blocks[index]));
  }
  function isCollapsedAway(blocks, index) {
    var my = blockIndent(blocks[index]);
    for (var i = index - 1; i >= 0; i--) {
      var p = blockIndent(blocks[i]);
    if (p < my) {
      if (blocks[i].type === 'toggle' && blocks[i].collapsed) return true;
      my = p;
    }
    }
    return false;
  }
  function nestMeta(b) {
    var i = blockIndent(b);
    if (!i && !b.collapsed) return null;
    return '<!--i:' + i + (b.collapsed ? ' c' : '') + '-->';
  }
  function nestAttrs(b) {
    return ' data-indent="' + blockIndent(b) + '"' + (b.collapsed ? ' data-collapsed="1"' : '');
  }
  function applyNest(el, b) {
    if (!el || !b) return b;
    var ind = parseInt(el.getAttribute('data-indent') || '0', 10);
    if (!isNaN(ind)) b.indent = ind;
    b.collapsed = el.getAttribute('data-collapsed') === '1';
    return b;
  }
  function blockIcon(id) {
    var icons = {
      p: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 7h14M5 12h10M5 17h12"/></svg>',
      h1: '<svg viewBox="0 0 24 24" fill="currentColor"><text x="3" y="18" font-size="13" font-family="Georgia,serif">H1</text></svg>',
      h2: '<svg viewBox="0 0 24 24" fill="currentColor"><text x="3" y="18" font-size="12" font-family="Georgia,serif">H2</text></svg>',
      h3: '<svg viewBox="0 0 24 24" fill="currentColor"><text x="3" y="18" font-size="11" font-family="Georgia,serif">H3</text></svg>',
      todo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M7 12l3 3 7-7"/></svg>',
      radio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/></svg>',
      ul: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="7" r="1.5"/><rect x="10" y="6" width="10" height="2" rx="1"/><circle cx="6" cy="12" r="1.5"/><rect x="10" y="11" width="10" height="2" rx="1"/><circle cx="6" cy="17" r="1.5"/><rect x="10" y="16" width="10" height="2" rx="1"/></svg>',
      ol: '<svg viewBox="0 0 24 24" fill="currentColor"><text x="3" y="9" font-size="7" font-family="sans-serif">1.</text><rect x="10" y="6" width="10" height="2" rx="1"/><text x="3" y="14.5" font-size="7" font-family="sans-serif">2.</text><rect x="10" y="12" width="10" height="2" rx="1"/><text x="3" y="20" font-size="7" font-family="sans-serif">3.</text><rect x="10" y="18" width="10" height="2" rx="1"/></svg>',
      toggle: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 6l8 6-8 6z"/></svg>',
      code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/></svg>',
      quote: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 11c0-3 2-5 5-5v3c-1.5 0-2 .8-2 2h2v6H6v-6c0-2 .4-3 1-4zm8 0c0-3 2-5 5-5v3c-1.5 0-2 .8-2 2h2v6h-6v-6c0-2 .4-3 1-4z"/></svg>',
      callout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5"/></svg>',
      link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 14l-1.5 1.5a4 4 0 105.5-5.5L12.5 8.5M14 10l1.5-1.5a4 4 0 10-5.5 5.5L11.5 15.5"/></svg>',
      img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M7 17l4-4 3 3 3-4 3 5"/></svg>',
      hr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12h16"/></svg>'
    };
    return icons[id] || icons.p;
  }
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    setTimeout(function () { els.toast.classList.remove('show'); }, 2400);
  }
  function byteLen(s) { return new TextEncoder().encode(s || '').length; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function yamlEsc(s) {
    s = String(s == null ? '' : s);
    if (/[:#\-?{}[\],&*!|>'"%@`]/.test(s) || /\s/.test(s)) return JSON.stringify(s);
    return s;
  }
  function unyaml(s) {
    s = (s || '').trim();
    if ((s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') || (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'")) {
      try { return JSON.parse(s.replace(/^'/, '"').replace(/'$/, '"')); } catch (e) {
        return s.slice(1, -1);
      }
    }
    return s;
  }
  function notesPath() {
    return (state.cfg.path || 'journal/notes').replace(/^\/|\/$/g, '');
  }
  function guessRepo() {
    var host = location.hostname;
    if (host.endsWith('.github.io')) {
      var owner = host.replace('.github.io', '');
      return { owner: owner, repo: owner + '.github.io' };
    }
    return { owner: '', repo: '' };
  }

  function emptyNote() {
    return {
      id: uid('n'),
      title: '',
      author: 'KUNG Hsinyü',
      created: nowISO(),
      updated: nowISO(),
      ext: 'md',
      blocks: [{ id: uid('b'), type: 'p', indent: 0, text: '' }]
    };
  }

  /* ---------------- serialize ---------------- */
  function toMarkdown(note) {
    var lines = [
      '---',
      'id: ' + note.id,
      'author: ' + yamlEsc(note.author || ''),
      'created: ' + (note.created || ''),
      'updated: ' + (note.updated || ''),
      '---',
      '',
      '# ' + (note.title || '无标题'),
      ''
    ];
    (note.blocks || []).forEach(function (b) {
      var meta = nestMeta(b);
      if (meta) lines.push(meta);
      var t = b.text || '';
      switch (b.type) {
        case 'h1': lines.push('# ' + t, ''); break;
        case 'h2': lines.push('## ' + t, ''); break;
        case 'h3': lines.push('### ' + t, ''); break;
        case 'code':
          lines.push('```' + (b.lang || ''), t, '```', '');
          break;
        case 'todo':
          lines.push('- [' + (b.checked ? 'x' : ' ') + '] ' + t);
          break;
        case 'radio':
          lines.push('- (' + (b.checked ? 'x' : ' ') + ') {' + (b.group || 'g1') + '} ' + t);
          break;
        case 'link':
          lines.push(':::link ' + (b.url || ''));
          if (b.title) lines.push('title: ' + b.title);
          if (b.desc) lines.push('desc: ' + b.desc);
          if (b.image) lines.push('image: ' + b.image);
          lines.push(':::', '');
          break;
        case 'img':
          lines.push('![' + (b.alt || '') + '](' + (b.src || '') + ')', '');
          break;
        case 'quote':
          lines.push('> ' + t.replace(/\n/g, '\n> '), '');
          break;
        case 'callout':
          lines.push(':::callout', t, ':::', '');
          break;
        case 'toggle':
          lines.push(':::toggle' + (b.collapsed ? ' c' : ''), t, ':::', '');
          break;
        case 'ul': lines.push('- ' + t); break;
        case 'ol': lines.push('1. ' + t); break;
        case 'hr': lines.push('---', ''); break;
        default:
          lines.push(t, '');
          break;
      }
    });
    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  function toHtmlCompact(note) {
    var parts = ['<article class="kung-note" data-id="' + esc(note.id) + '" data-author="' + esc(note.author) + '" data-created="' + esc(note.created) + '" data-updated="' + esc(note.updated) + '">'];
    parts.push('<h1 data-title="1">' + esc(note.title || '无标题') + '</h1>');
    (note.blocks || []).forEach(function (b) {
      var t = esc(b.text || '');
      var a = nestAttrs(b);
      switch (b.type) {
        case 'h1': parts.push('<h2' + a + '>' + t + '</h2>'); break;
        case 'h2': parts.push('<h3' + a + '>' + t + '</h3>'); break;
        case 'h3': parts.push('<h4' + a + '>' + t + '</h4>'); break;
        case 'code': parts.push('<pre' + a + ' data-lang="' + esc(b.lang || '') + '"><code>' + t + '</code></pre>'); break;
        case 'todo':
          parts.push('<label data-todo' + a + '><input type="checkbox"' + (b.checked ? ' checked' : '') + '>' + t + '</label>');
          break;
        case 'radio':
          parts.push('<label data-radio' + a + ' data-group="' + esc(b.group || 'g1') + '"><input type="radio"' + (b.checked ? ' checked' : '') + '>' + t + '</label>');
          break;
        case 'link':
          parts.push('<a class="link-card" data-link' + a + ' href="' + esc(b.url || '') + '" data-image="' + esc(b.image || '') + '" data-desc="' + esc(b.desc || '') + '">' + esc(b.title || b.url || '') + '</a>');
          break;
        case 'img':
          parts.push('<figure' + a + '><img src="' + esc(b.src || '') + '" alt="' + esc(b.alt || '') + '"><figcaption>' + esc(b.alt || '') + '</figcaption></figure>');
          break;
        case 'quote': parts.push('<blockquote' + a + '>' + t + '</blockquote>'); break;
        case 'callout': parts.push('<aside data-callout' + a + '>' + t + '</aside>'); break;
        case 'toggle': parts.push('<div data-toggle' + a + '>' + t + '</div>'); break;
        case 'ul': parts.push('<ul' + a + '><li>' + t + '</li></ul>'); break;
        case 'ol': parts.push('<ol' + a + '><li>' + t + '</li></ol>'); break;
        case 'hr': parts.push('<hr' + a + '>'); break;
        default:
          parts.push('<p' + a + '>' + t + '</p>');
      }
    });
    parts.push('</article>');
    return parts.join('');
  }

  function toHtmlExport(note) {
    return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>' + esc(note.title) + '</title><style>body{font-family:Segoe UI,Microsoft YaHei,sans-serif;max-width:820px;margin:2rem auto;padding:0 1.2rem;line-height:1.7;color:#122}pre{background:#111827;color:#e5e7eb;padding:1rem;overflow:auto}img{max-width:100%}blockquote{border-left:3px solid #7b5cff;padding-left:1rem;color:#444}.link{display:block;border:1px solid #ddd;padding:1rem;border-radius:8px;text-decoration:none;color:inherit}p[data-indent="1"]{padding-left:1.6rem}p[data-indent="2"]{padding-left:3.2rem}p[data-indent="3"]{padding-left:4.8rem}p[data-indent="4"]{padding-left:6.4rem}</style></head><body>' +
      toHtmlCompact(note).replace(/class="kung-note"/, '') + '</body></html>';
  }

  function chooseStorage(note) {
    var md = toMarkdown(note);
    var html = toHtmlCompact(note);
    if (byteLen(md) <= byteLen(html)) return { ext: 'md', body: md, mdBytes: byteLen(md), htmlBytes: byteLen(html) };
    return { ext: 'html', body: html, mdBytes: byteLen(md), htmlBytes: byteLen(html) };
  }

  /* ---------------- parse ---------------- */
  function parseFront(raw) {
    var meta = {};
    var body = raw;
    if (raw.indexOf('---') === 0) {
      var end = raw.indexOf('\n---', 3);
      if (end !== -1) {
        raw.slice(4, end).split('\n').forEach(function (line) {
          var i = line.indexOf(':');
          if (i > 0) meta[line.slice(0, i).trim()] = unyaml(line.slice(i + 1));
        });
        body = raw.slice(end + 4).replace(/^\s*\n/, '');
      }
    }
    return { meta: meta, body: body };
  }

  function parseMarkdown(raw, fallbackId) {
    var pf = parseFront(raw);
    var note = {
      id: pf.meta.id || fallbackId || uid('n'),
      title: '',
      author: pf.meta.author || '',
      created: pf.meta.created || nowISO(),
      updated: pf.meta.updated || nowISO(),
      ext: 'md',
      blocks: []
    };
    var lines = pf.body.replace(/\r\n/g, '\n').split('\n');
    var i = 0;
    var titleTaken = false;
    var pendingIndent = 0;
    var pendingFold = false;
    function stamp(b) {
      if (b.indent == null) b.indent = pendingIndent;
      else if (pendingIndent) b.indent = pendingIndent;
      if (b.collapsed == null) b.collapsed = pendingFold;
      pendingIndent = 0;
      pendingFold = false;
      note.blocks.push(b);
    }
    function flushP(text, indent) {
      stamp({ id: uid('b'), type: 'p', indent: indent || pendingIndent, text: text });
    }
    while (i < lines.length) {
      var line = lines[i];
      var nest = line.match(/^<!--i:(\d+)( c)?-->$/);
      if (nest) {
        pendingIndent = parseInt(nest[1], 10) || 0;
        pendingFold = !!nest[2];
        i++; continue;
      }
      if (line === ':::callout') {
        var buf = []; i++;
        while (i < lines.length && lines[i] !== ':::') { buf.push(lines[i]); i++; }
        stamp({ id: uid('b'), type: 'callout', text: buf.join('\n') });
        i++; continue;
      }
      if (/^:::toggle/.test(line)) {
        var tbuf = [];
        var tFold = /\sc/.test(line);
        i++;
        while (i < lines.length && lines[i] !== ':::') { tbuf.push(lines[i]); i++; }
        stamp({ id: uid('b'), type: 'toggle', text: tbuf.join('\n'), collapsed: tFold });
        i++; continue;
      }
      if (/^:::link\s+/.test(line)) {
        var link = { id: uid('b'), type: 'link', url: line.replace(/^:::link\s+/, '').trim(), title: '', desc: '', image: '' };
        i++;
        while (i < lines.length && lines[i] !== ':::') {
          if (lines[i].indexOf('title:') === 0) link.title = lines[i].slice(6).trim();
          else if (lines[i].indexOf('desc:') === 0) link.desc = lines[i].slice(5).trim();
          else if (lines[i].indexOf('image:') === 0) link.image = lines[i].slice(6).trim();
          i++;
        }
        stamp(link); i++; continue;
      }
      if (/^```/.test(line)) {
        var lang = line.slice(3).trim();
        var code = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
        stamp({ id: uid('b'), type: 'code', lang: lang, text: code.join('\n') });
        i++; continue;
      }
      var mTodo = line.match(/^- \[([ xX])\] (.*)$/);
      if (mTodo) { stamp({ id: uid('b'), type: 'todo', checked: /x/i.test(mTodo[1]), text: mTodo[2] }); i++; continue; }
      var mRadio = line.match(/^- \(([ xX])\) \{([^}]+)\} (.*)$/);
      if (mRadio) { stamp({ id: uid('b'), type: 'radio', checked: /x/i.test(mRadio[1]), group: mRadio[2], text: mRadio[3] }); i++; continue; }
      var mImg = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
      if (mImg) { stamp({ id: uid('b'), type: 'img', alt: mImg[1], src: mImg[2] }); i++; continue; }
      if (line === '---') { stamp({ id: uid('b'), type: 'hr' }); i++; continue; }
      if (/^> /.test(line)) {
        var q = [line.slice(2)]; i++;
        while (i < lines.length && /^> /.test(lines[i])) { q.push(lines[i].slice(2)); i++; }
        stamp({ id: uid('b'), type: 'quote', text: q.join('\n') }); continue;
      }
      if (/^### /.test(line)) { stamp({ id: uid('b'), type: 'h3', text: line.slice(4) }); i++; continue; }
      if (/^## /.test(line)) { stamp({ id: uid('b'), type: 'h2', text: line.slice(3) }); i++; continue; }
      if (/^# /.test(line)) {
        if (!titleTaken) { note.title = line.slice(2); titleTaken = true; }
        else stamp({ id: uid('b'), type: 'h1', text: line.slice(2) });
        i++; continue;
      }
      if (/^1\. /.test(line)) { stamp({ id: uid('b'), type: 'ol', text: line.slice(3) }); i++; continue; }
      if (/^- /.test(line)) { stamp({ id: uid('b'), type: 'ul', text: line.slice(2) }); i++; continue; }
      if (!line.trim()) { i++; continue; }
      var ind = 0;
      var sp = line.match(/^( +)/);
      if (sp) ind = Math.min(4, Math.floor(sp[1].length / 2));
      flushP(line.replace(/^ +/, ''), ind);
      i++;
    }
    if (!note.blocks.length) note.blocks.push({ id: uid('b'), type: 'p', indent: 0, text: '' });
    return note;
  }

  function parseHtml(raw, fallbackId) {
    var doc = new DOMParser().parseFromString(raw, 'text/html');
    var art = doc.querySelector('article') || doc.body;
    var note = {
      id: art.getAttribute('data-id') || fallbackId || uid('n'),
      author: art.getAttribute('data-author') || '',
      created: art.getAttribute('data-created') || nowISO(),
      updated: art.getAttribute('data-updated') || nowISO(),
      ext: 'html',
      title: '',
      blocks: []
    };
    var kids = art.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      var tag = el.tagName.toLowerCase();
      if (tag === 'h1' && el.getAttribute('data-title')) { note.title = el.textContent; continue; }
      if (tag === 'h1' && !note.title) { note.title = el.textContent; continue; }
      if (tag === 'h2') note.blocks.push(applyNest(el, { id: uid('b'), type: 'h1', text: el.textContent }));
      else if (tag === 'h3') note.blocks.push(applyNest(el, { id: uid('b'), type: 'h2', text: el.textContent }));
      else if (tag === 'h4') note.blocks.push(applyNest(el, { id: uid('b'), type: 'h3', text: el.textContent }));
      else if (tag === 'pre') note.blocks.push(applyNest(el, { id: uid('b'), type: 'code', lang: el.getAttribute('data-lang') || '', text: (el.textContent || '').replace(/\n$/, '') }));
      else if (tag === 'label' && el.hasAttribute('data-todo')) {
        var c = el.querySelector('input');
        note.blocks.push(applyNest(el, { id: uid('b'), type: 'todo', checked: !!(c && c.checked), text: el.textContent }));
      } else if (tag === 'label' && el.hasAttribute('data-radio')) {
        var r = el.querySelector('input');
        note.blocks.push(applyNest(el, { id: uid('b'), type: 'radio', group: el.getAttribute('data-group') || 'g1', checked: !!(r && r.checked), text: el.textContent }));
      } else if (el.hasAttribute('data-link') || (tag === 'a' && el.classList.contains('link-card'))) {
        note.blocks.push(applyNest(el, { id: uid('b'), type: 'link', url: el.getAttribute('href') || '', title: el.textContent, desc: el.getAttribute('data-desc') || '', image: el.getAttribute('data-image') || '' }));
      } else if (tag === 'figure') {
        var im = el.querySelector('img');
        note.blocks.push(applyNest(el, { id: uid('b'), type: 'img', src: im ? im.getAttribute('src') : '', alt: (el.querySelector('figcaption') || im || {}).textContent || (im && im.alt) || '' }));
      } else if (tag === 'blockquote') note.blocks.push(applyNest(el, { id: uid('b'), type: 'quote', text: el.textContent }));
      else if (tag === 'aside') note.blocks.push(applyNest(el, { id: uid('b'), type: 'callout', text: el.textContent }));
      else if (el.hasAttribute('data-toggle') || (tag === 'div' && el.hasAttribute('data-toggle'))) {
        note.blocks.push(applyNest(el, { id: uid('b'), type: 'toggle', text: el.textContent }));
      }
      else if (tag === 'ul') note.blocks.push(applyNest(el, { id: uid('b'), type: 'ul', text: (el.querySelector('li') || el).textContent }));
      else if (tag === 'ol') note.blocks.push(applyNest(el, { id: uid('b'), type: 'ol', text: (el.querySelector('li') || el).textContent }));
      else if (tag === 'hr') note.blocks.push(applyNest(el, { id: uid('b'), type: 'hr' }));
      else if (tag === 'p') note.blocks.push(applyNest(el, { id: uid('b'), type: 'p', text: el.textContent }));
    }
    if (!note.blocks.length) note.blocks.push({ id: uid('b'), type: 'p', indent: 0, text: '' });
    return note;
  }

  function parseNote(raw, name) {
    var id = (name || '').replace(/\.(md|html)$/i, '');
    if (/^\s*</.test(raw) || /\.html$/i.test(name || '')) return parseHtml(raw, id);
    return parseMarkdown(raw, id);
  }

  /* ---------------- GitHub ---------------- */
  function ghHeaders() {
    var h = { Accept: 'application/vnd.github+json' };
    if (state.cfg.token) h.Authorization = 'Bearer ' + state.cfg.token;
    return h;
  }
  function ghUrl(path) {
    return 'https://api.github.com/repos/' + state.cfg.owner + '/' + state.cfg.repo + path;
  }
  function b64enc(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64dec(str) {
    return decodeURIComponent(escape(atob(String(str || '').replace(/\n/g, ''))));
  }
  function blobToB64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var s = String(r.result);
        resolve(s.slice(s.indexOf(',') + 1));
      };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function ensureBranch() {
    if (state.cfg.branch) return Promise.resolve(state.cfg.branch);
    return fetch(ghUrl(''), { headers: ghHeaders() }).then(function (r) {
      if (!r.ok) throw new Error('无法读取仓库，请检查 Owner / Repo / Token');
      return r.json();
    }).then(function (j) {
      state.cfg.branch = j.default_branch || 'main';
      saveCfg();
      return state.cfg.branch;
    });
  }

  function getFile(path) {
    return ensureBranch().then(function (br) {
      return fetch(ghUrl('/contents/' + path + '?ref=' + encodeURIComponent(br)), { headers: ghHeaders() });
    }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('读取失败 ' + r.status);
      return r.json();
    }).then(function (j) {
      if (!j) return null;
      state.shas[path] = j.sha;
      return { path: path, sha: j.sha, text: j.content ? b64dec(j.content) : '', encoding: j.encoding };
    });
  }

  function putFile(path, contentB64, message) {
    return ensureBranch().then(function (br) {
      var body = { message: message, content: contentB64, branch: br };
      if (state.shas[path]) body.sha = state.shas[path];
      return fetch(ghUrl('/contents/' + path), {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
        body: JSON.stringify(body)
      });
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j && j.message) || ('写入失败 ' + r.status));
        if (j.content && j.content.sha) state.shas[path] = j.content.sha;
        return j;
      });
    });
  }

  function deleteFile(path, message) {
    if (!state.shas[path]) return Promise.resolve();
    return ensureBranch().then(function (br) {
      return fetch(ghUrl('/contents/' + path), {
        method: 'DELETE',
        headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
        body: JSON.stringify({ message: message, sha: state.shas[path], branch: br })
      });
    }).then(function (r) {
      if (r.ok || r.status === 404) delete state.shas[path];
    });
  }

  function catalogMarkdown() {
    var lines = ['# journal index', ''];
    state.order.forEach(function (id) {
      var n = state.notes[id];
      if (!n) return;
      lines.push('- ' + n.id + ' | ' + (n.title || '无标题') + ' | ' + (n.author || '') + ' | ' + (n.updated || '') + ' | ' + (n.ext || 'md'));
    });
    return lines.join('\n') + '\n';
  }

  function parseCatalog(text) {
    var items = [];
    String(text || '').split('\n').forEach(function (line) {
      var m = line.match(/^- ([^|]+) \| ([^|]*) \| ([^|]*) \| ([^|]*) \| (\w+)/);
      if (m) items.push({ id: m[1].trim(), title: m[2].trim(), author: m[3].trim(), updated: m[4].trim(), ext: m[5].trim() });
    });
    return items;
  }

  function configured() {
    return !!(state.cfg.owner && state.cfg.repo);
  }

  function pullRemote() {
    if (!configured()) return Promise.resolve();
    setStatus('正在拉取仓库…', '');
    var base = notesPath();
    return getFile(base + '/' + CATALOG).then(function (cat) {
      function settle(jobs) {
        return Promise.all((jobs || []).map(function (p) {
          return p.catch(function () { return null; });
        }));
      }
      if (cat && cat.text) {
        var items = parseCatalog(cat.text);
        state.order = items.map(function (it) { return it.id; });
        return settle(items.map(function (it) {
          var p = base + '/' + it.id + '.' + (it.ext || 'md');
          if (!state.notes[it.id]) {
            state.notes[it.id] = { id: it.id, title: it.title, author: it.author, updated: it.updated, ext: it.ext, blocks: [], created: it.updated };
          }
          return getFile(p).then(function (f) {
            if (!f) return;
            var note = parseNote(f.text, it.id + '.' + it.ext);
            note.ext = it.ext;
            state.notes[note.id] = note;
          });
        }));
      }
      return ensureBranch().then(function (br) {
        return fetch(ghUrl('/contents/' + base + '?ref=' + encodeURIComponent(br)), { headers: ghHeaders() });
      }).then(function (r) {
        if (r.status === 404) return [];
        if (!r.ok) throw new Error('列出目录失败');
        return r.json();
      }).then(function (list) {
        if (!Array.isArray(list)) return [];
        return settle(list.filter(function (f) {
          return f.type === 'file' && /\.(md|html)$/i.test(f.name) && f.name !== CATALOG;
        }).map(function (f) {
          return getFile(base + '/' + f.name).then(function (file) {
            if (!file) return;
            var note = parseNote(file.text, f.name);
            state.notes[note.id] = note;
            if (state.order.indexOf(note.id) < 0) state.order.unshift(note.id);
          });
        }));
      });
    }).then(function () {
      saveCache();
      renderList();
      setStatus(state.cfg.token ? '已连接仓库' : '只读拉取（无 Token）', state.cfg.token ? 'ok' : 'warn');
    }).catch(function (err) {
      setStatus(err.message || '拉取失败', 'warn');
    });
  }

  function setStatus(text, cls) {
    els.status.textContent = text;
    els.status.className = 'nav-status' + (cls ? ' ' + cls : '');
  }

  /* ---------------- images / links ---------------- */
  function compressImage(file) {
    if (file.type === 'image/gif') return Promise.resolve(file);
    if (file.type === 'image/png' && file.size < 180000) return Promise.resolve(file);
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1400, w = img.width, h = img.height;
        if (w > max) { h = Math.round(h * max / w); w = max; }
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        c.toBlob(function (blob) {
          URL.revokeObjectURL(url);
          resolve(blob || file);
        }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片无法读取')); };
      img.src = url;
    });
  }

  function uploadAsset(note, block, blob) {
    var ext = (blob.type && blob.type.split('/')[1]) || 'jpg';
    if (ext === 'jpeg') ext = 'jpg';
    var rel = 'assets/' + note.id + '_' + block.id + '.' + ext;
    var path = notesPath() + '/' + rel;
    return blobToB64(blob).then(function (b64) {
      return putFile(path, b64, 'journal: image ' + rel);
    }).then(function () {
      block.src = rel;
      block.pendingBlob = null;
    });
  }

  function fetchLinkCard(url) {
    return fetch('https://api.microlink.io?url=' + encodeURIComponent(url))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var d = (j && j.data) || {};
        return {
          url: url,
          title: (d.title || url).slice(0, 180),
          desc: (d.description || '').slice(0, 240),
          image: (d.image && d.image.url) || ''
        };
      }).catch(function () {
        return { url: url, title: url, desc: '', image: '' };
      });
  }

  /* ---------------- editor ---------------- */
  function current() {
    return state.current ? state.notes[state.current] : null;
  }
  function markDirty() {
    state.dirty = true;
    var n = current();
    if (n) n.updated = nowISO();
  }
  function collectFromDom() {
    var n = current();
    if (!n) return;
    n.title = els.title.value;
    n.author = els.author.value;
    var next = [];
    els.blocks.querySelectorAll('.block').forEach(function (row) {
      var id = row.getAttribute('data-id');
      var prev = (n.blocks || []).filter(function (b) { return b.id === id; })[0] || { id: id, type: row.getAttribute('data-type') };
      var type = row.getAttribute('data-type');
      var b = { id: id, type: type };
      b.indent = parseInt(row.getAttribute('data-indent') || '0', 10) || 0;
      b.collapsed = row.getAttribute('data-collapsed') === '1';
      if (type === 'code') {
        b.lang = (row.querySelector('.lang') || {}).value || '';
        b.text = (row.querySelector('.code-area') || {}).value || '';
      } else if (type === 'todo' || type === 'radio') {
        var inp = row.querySelector('input[type="checkbox"],input[type="radio"]');
        b.checked = !!(inp && inp.checked);
        b.text = (row.querySelector('.ce') || {}).innerText || '';
        if (type === 'radio') b.group = row.getAttribute('data-group') || 'g1';
      } else if (type === 'link') {
        b.url = row.getAttribute('data-url') || '';
        b.title = row.getAttribute('data-title') || '';
        b.desc = row.getAttribute('data-desc') || '';
        b.image = row.getAttribute('data-image') || '';
      } else if (type === 'img') {
        b.src = row.getAttribute('data-src') || '';
        b.alt = (row.querySelector('.img-cap') || {}).innerText || '';
        b.pendingBlob = prev.pendingBlob || null;
      } else if (type === 'hr') {
        /* no text */
      } else {
        b.text = (row.querySelector('.ce') || {}).innerText || '';
      }
      next.push(b);
    });
    n.blocks = next;
  }

  function targetBlockId(afterId) {
    var n = current();
    if (afterId) return afterId;
    if (state.focusId) return state.focusId;
    return n && n.blocks.length ? n.blocks[n.blocks.length - 1].id : null;
  }

  function changeIndent(id, dir) {
    var n = current();
    if (!n) return;
    collectFromDom();
    var idx = n.blocks.findIndex(function (x) { return x.id === targetBlockId(id); });
    if (idx < 0) idx = n.blocks.length - 1;
    if (idx < 0) return;
    var b = n.blocks[idx];
    var old = blockIndent(b);
    var cap = idx > 0 ? blockIndent(n.blocks[idx - 1]) + 1 : 8;
    var nextLv = dir > 0 ? Math.min(8, old + 1, cap) : Math.max(0, old - 1);
    if (nextLv === old) {
      toast(dir > 0 ? '无法再缩进（先点中这一块）' : '已经是最外层');
      return;
    }
    var delta = nextLv - old;
    b.indent = nextLv;
    for (var i = idx + 1; i < n.blocks.length; i++) {
      if (blockIndent(n.blocks[i]) <= old) break;
      n.blocks[i].indent = Math.max(0, blockIndent(n.blocks[i]) + delta);
    }
    state.focusId = b.id;
    markDirty();
    renderEditor();
  }

  function toggleCollapse(id) {
    var n = current();
    if (!n) return;
    collectFromDom();
    var idx = n.blocks.findIndex(function (x) { return x.id === id; });
    if (idx < 0 || n.blocks[idx].type !== 'toggle') return;
    if (!hasKidsAt(n.blocks, idx)) {
      var child = { id: uid('b'), type: 'p', indent: blockIndent(n.blocks[idx]) + 1, text: '' };
      n.blocks.splice(idx + 1, 0, child);
      n.blocks[idx].collapsed = false;
      state.focusId = child.id;
    } else {
      n.blocks[idx].collapsed = !n.blocks[idx].collapsed;
      state.focusId = id;
    }
    markDirty();
    renderEditor();
  }

  function insertBlock(type, afterId, extra) {
    var n = current();
    if (!n) return;
    collectFromDom();
    if (type === 'indent') { changeIndent(afterId, 1); return; }
    if (type === 'outdent') { changeIndent(afterId, -1); return; }
    var after = n.blocks.filter(function (x) { return x.id === afterId; })[0];
    var inherit = extra && extra.indent != null ? extra.indent : (after ? blockIndent(after) : 0);
    var b;
    if (type === 'h1' || type === 'h2' || type === 'h3') b = { id: uid('b'), type: type, text: '', indent: inherit };
    else if (type === 'code') b = { id: uid('b'), type: 'code', lang: '', text: '', indent: inherit };
    else if (type === 'todo') b = { id: uid('b'), type: 'todo', checked: false, text: '', indent: inherit };
    else if (type === 'radio') b = { id: uid('b'), type: 'radio', group: (extra && extra.group) || uid('g'), checked: false, text: '', indent: inherit };
    else if (type === 'link') b = { id: uid('b'), type: 'link', url: extra && extra.url, title: extra && extra.title, desc: extra && extra.desc, image: extra && extra.image, indent: inherit };
    else if (type === 'img') b = { id: uid('b'), type: 'img', src: extra && extra.src, alt: extra && extra.alt || '', pendingBlob: extra && extra.blob, indent: inherit };
    else if (type === 'quote') b = { id: uid('b'), type: 'quote', text: '', indent: inherit };
    else if (type === 'callout') b = { id: uid('b'), type: 'callout', text: '', indent: inherit };
    else if (type === 'toggle') b = { id: uid('b'), type: 'toggle', text: '', indent: inherit, collapsed: false };
    else if (type === 'ul') b = { id: uid('b'), type: 'ul', text: '', indent: inherit };
    else if (type === 'ol') b = { id: uid('b'), type: 'ol', text: '', indent: inherit };
    else if (type === 'hr') b = { id: uid('b'), type: 'hr', indent: inherit };
    else b = { id: uid('b'), type: 'p', indent: inherit, text: '' };

    var idx = n.blocks.findIndex(function (x) { return x.id === afterId; });
    if (idx < 0) n.blocks.push(b);
    else n.blocks.splice(idx + 1, 0, b);
    if (type === 'radio' && !(extra && extra.skipTwin)) {
      n.blocks.splice((idx < 0 ? n.blocks.length : idx + 2), 0, {
        id: uid('b'), type: 'radio', group: b.group, checked: false, text: '', indent: inherit
      });
    }
    if (type === 'toggle' && !(extra && extra.skipChild)) {
      n.blocks.splice((idx < 0 ? n.blocks.length : idx + 2), 0, {
        id: uid('b'), type: 'p', indent: inherit + 1, text: ''
      });
    }
    state.focusId = b.id;
    markDirty();
    renderEditor();
  }

  function removeBlock(id) {
    var n = current();
    if (!n || n.blocks.length < 2) return;
    n.blocks = n.blocks.filter(function (b) { return b.id !== id; });
    markDirty();
    renderEditor();
  }

  function hideMenus() {
    els.slash.hidden = true;
    els.insert.hidden = true;
  }

  function renderList() {
    var q = (els.search.value || '').toLowerCase();
    els.list.innerHTML = '';
    state.order.forEach(function (id) {
      var n = state.notes[id];
      if (!n) return;
      var hay = ((n.title || '') + ' ' + (n.author || '')).toLowerCase();
      if (q && hay.indexOf(q) < 0) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'note-item' + (id === state.current ? ' active' : '');
      btn.innerHTML = '<div class="t"></div><div class="m"></div>';
      btn.querySelector('.t').textContent = n.title || '无标题';
      btn.querySelector('.m').textContent = (n.author || '') + ' · ' + String(n.updated || '').slice(0, 16).replace('T', ' ') + (n.ext ? ' · ' + n.ext : '');
      btn.addEventListener('click', function () { openNote(id); });
      els.list.appendChild(btn);
    });
  }

  function openNote(id) {
    if (state.current) collectFromDom();
    state.current = id;
    els.empty.hidden = true;
    els.editor.hidden = false;
    renderList();
    renderEditor();
  }

  function newNote() {
    var n = emptyNote();
    state.notes[n.id] = n;
    state.order.unshift(n.id);
    saveCache();
    openNote(n.id);
    markDirty();
  }

  function blockEl(b) {
    var row = document.createElement('div');
    row.className = 'block ' + b.type;
    row.setAttribute('data-id', b.id);
    row.setAttribute('data-type', b.type);
    row.setAttribute('data-indent', String(blockIndent(b)));
    if (b.collapsed) row.setAttribute('data-collapsed', '1');
    if (b.group) row.setAttribute('data-group', b.group);

    var plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'plus';
    plus.title = '添加部件';
    plus.textContent = '+';
    row.appendChild(plus);

    var grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'grip';
    grip.title = '拖动排序';
    grip.innerHTML = '<span class="grip-dots"><i></i><i></i><i></i><i></i><i></i><i></i></span>';
    grip.draggable = true;
    row.appendChild(grip);

    if (b.type === 'code') {
      var wrap = document.createElement('div');
      wrap.className = 'code-wrap';
      wrap.innerHTML = '<div class="code-head"><select class="lang"><option value="">plain</option><option>js</option><option>ts</option><option>py</option><option>html</option><option>css</option><option>json</option><option>bash</option><option>md</option></select></div>';
      var ta = document.createElement('textarea');
      ta.className = 'code-area';
      ta.value = b.text || '';
      ta.placeholder = '代码…';
      wrap.querySelector('.lang').value = b.lang || '';
      wrap.appendChild(ta);
      row.appendChild(wrap);
      autosize(ta);
      ta.addEventListener('input', function () { autosize(ta); markDirty(); });
      wrap.querySelector('.lang').addEventListener('change', markDirty);
    } else if (b.type === 'todo' || b.type === 'radio') {
      var line = document.createElement('div');
      line.className = b.type === 'todo' ? 'check-row' : 'radio-row';
      var inp = document.createElement('input');
      inp.type = b.type === 'todo' ? 'checkbox' : 'radio';
      if (b.type === 'radio') inp.name = 'radio-' + (b.group || 'g1');
      inp.checked = !!b.checked;
      var ce = makeCe(b.text, b.type === 'todo' ? '待办' : '选项');
      line.appendChild(inp);
      line.appendChild(ce);
      row.appendChild(line);
      inp.addEventListener('change', function () {
        if (b.type === 'radio') {
          current().blocks.forEach(function (x) {
            if (x.type === 'radio' && x.group === b.group) x.checked = x.id === b.id && inp.checked;
          });
        }
        markDirty();
      });
    } else if (b.type === 'link') {
      row.setAttribute('data-url', b.url || '');
      row.setAttribute('data-title', b.title || '');
      row.setAttribute('data-desc', b.desc || '');
      row.setAttribute('data-image', b.image || '');
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'link-card';
      var host = '';
      try { host = b.url ? new URL(b.url).hostname : ''; } catch (e) { host = b.url || ''; }
      card.innerHTML = '<div class="info"><div class="host"></div><div class="lt"></div><div class="ld"></div></div>';
      card.querySelector('.host').textContent = host;
      card.querySelector('.lt').textContent = b.title || b.url || '链接';
      card.querySelector('.ld').textContent = b.desc || '';
      if (b.image) {
        var im = document.createElement('img');
        im.src = b.image;
        im.alt = '';
        card.appendChild(im);
      }
      card.addEventListener('click', function () {
        if (b.url) window.open(b.url, '_blank', 'noopener');
      });
      row.appendChild(card);
    } else if (b.type === 'img') {
      row.setAttribute('data-src', b.src || '');
      var box = document.createElement('div');
      box.className = 'img-block';
      var im2 = document.createElement('img');
      if (b.pendingBlob) im2.src = URL.createObjectURL(b.pendingBlob);
      else if (b.src && !/^https?:|^data:|^\//.test(b.src) && configured()) {
        im2.src = 'https://raw.githubusercontent.com/' + state.cfg.owner + '/' + state.cfg.repo + '/' + (state.cfg.branch || 'main') + '/' + notesPath() + '/' + b.src;
      } else im2.src = b.src || '';
      var cap = document.createElement('div');
      cap.className = 'img-cap ce';
      cap.contentEditable = 'true';
      cap.textContent = b.alt || '';
      cap.setAttribute('data-placeholder', '图片说明');
      box.appendChild(im2);
      box.appendChild(cap);
      row.appendChild(box);
    } else if (b.type === 'hr') {
      var hr = document.createElement('div');
      hr.className = 'hr-line';
      row.appendChild(hr);
    } else {
      var ph = { p: '输入 / 唤出命令', quote: '引用', callout: '高亮说明', ul: '列表项', ol: '列表项', h1: '标题 1', h2: '标题 2', h3: '标题 3', toggle: '折叠列表' }[b.type] || '';
      if (b.type === 'toggle') {
        var trow = document.createElement('div');
        trow.className = 'toggle-row';
        var tri = document.createElement('button');
        tri.type = 'button';
        tri.className = 'tri';
        tri.title = '展开 / 折叠';
        tri.setAttribute('aria-expanded', b.collapsed ? 'false' : 'true');
        tri.innerHTML = '<i></i>';
        trow.appendChild(tri);
        trow.appendChild(makeCe(b.text, ph));
        row.appendChild(trow);
      } else {
        row.appendChild(makeCe(b.text, ph));
      }
    }
    return row;
  }

  function makeCe(text, ph) {
    var ce = document.createElement('div');
    ce.className = 'ce';
    ce.contentEditable = 'true';
    ce.setAttribute('data-placeholder', ph || '');
    ce.innerText = text || '';
    return ce;
  }

  function autosize(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.max(72, ta.scrollHeight) + 'px';
  }

  function renderEditor() {
    var n = current();
    if (!n) return;
    els.title.value = n.title || '';
    els.author.value = n.author || '';
    els.blocks.innerHTML = '';
    n.blocks.forEach(function (b, idx) {
      var row = blockEl(b);
      if (isCollapsedAway(n.blocks, idx)) row.classList.add('is-folded');
      els.blocks.appendChild(row);
    });
    bindEditorEvents();
    if (state.focusId) {
      var row = els.blocks.querySelector('[data-id="' + state.focusId + '"]');
      var ce = row && (row.querySelector('.ce') || row.querySelector('.code-area'));
      if (ce) {
        ce.focus();
        if (ce.innerText === '/' ) { /* keep */ }
      }
    }
  }

  function bindEditorEvents() {
    els.blocks.querySelectorAll('.block').forEach(function (row) {
      var id = row.getAttribute('data-id');
      row.addEventListener('mousedown', function () { state.focusId = id; });
      var grip = row.querySelector('.grip');
      var tri = row.querySelector('.tri');
      if (tri) {
        tri.addEventListener('mousedown', function (e) { e.preventDefault(); });
        tri.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          toggleCollapse(id);
        });
      }
      var plus = row.querySelector('.plus');
      if (plus) {
        plus.addEventListener('mousedown', function (e) { e.preventDefault(); });
        plus.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          state.focusId = id;
          openInsertMenu(plus, id);
        });
      }
      grip.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragover', function (e) { e.preventDefault(); });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        var from = e.dataTransfer.getData('text/plain');
        var n = current();
        collectFromDom();
        var arr = n.blocks;
        var i = arr.findIndex(function (b) { return b.id === from; });
        var j = arr.findIndex(function (b) { return b.id === id; });
        if (i < 0 || j < 0 || i === j) return;
        var item = arr.splice(i, 1)[0];
        arr.splice(j, 0, item);
        markDirty();
        renderEditor();
      });

      var ce = row.querySelector('.ce');
      var ta = row.querySelector('.code-area');
      var field = ce || ta;
      if (!field) return;
      field.addEventListener('focus', function () { state.focusId = id; });
      field.addEventListener('input', function () {
        markDirty();
        if (ce && row.getAttribute('data-type') === 'p') maybeSlash(ce, id);
      });
      field.addEventListener('keydown', function (e) {
        var type = row.getAttribute('data-type');
        if (e.key === 'Tab') {
          e.preventDefault();
          changeIndent(id, e.shiftKey ? -1 : 1);
        } else if (e.key === 'Backspace' && !e.repeat) {
          var empty = ce ? !(ce.innerText || '').replace(/\u00a0/g, '').trim() && !(ce.innerText === '/') : !(ta.value || '');
          if (empty && type !== 'img' && type !== 'link') {
            e.preventDefault();
            removeBlock(id);
          }
        } else if (e.key === 'Enter' && !els.slash.hidden) {
          e.preventDefault();
          var pick = els.slash.querySelector('button.active') || els.slash.querySelector('button');
          if (pick) pick.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        } else if (e.key === 'Enter' && !e.shiftKey && type !== 'code' && type !== 'quote' && type !== 'callout') {
          e.preventDefault();
          hideMenus();
          collectFromDom();
          var cur = current().blocks.filter(function (b) { return b.id === id; })[0];
          if (cur && cur.type === 'toggle') insertBlock('p', id, { indent: blockIndent(cur) + 1 });
          else if (cur && cur.type === 'radio') insertBlock('radio', id, { group: cur.group, skipTwin: true });
          else if (cur && (cur.type === 'todo' || cur.type === 'ul' || cur.type === 'ol')) insertBlock(cur.type, id);
          else insertBlock('p', id);
        }
      });
    });
  }

  function openInsertMenu(anchor, id) {
    els.slash.hidden = true;
    els.insert.innerHTML = '';
    var lab = document.createElement('div');
    lab.className = 'lab';
    lab.textContent = '基本块';
    els.insert.appendChild(lab);
    INSERT_BLOCKS.forEach(function (it) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'insert-item';
      btn.innerHTML = '<span class="insert-ico">' + blockIcon(it.id) + '</span><span class="insert-txt"><span class="n"></span><span class="d"></span></span>';
      btn.querySelector('.n').textContent = it.label;
      btn.querySelector('.d').textContent = it.desc || '';
      btn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        addFromPlus(id, it.id);
      });
      els.insert.appendChild(btn);
    });
    var r = anchor.getBoundingClientRect();
    els.insert.style.left = Math.min(r.left, window.innerWidth - 280) + 'px';
    els.insert.style.top = Math.min(r.bottom + 4, window.innerHeight - 80) + 'px';
    els.insert.hidden = false;
  }

  function addFromPlus(id, type) {
    hideMenus();
    if (!current()) newNote();
    var n = current();
    collectFromDom();
    var b = n.blocks.filter(function (x) { return x.id === id; })[0];
    var empty = b && b.type === 'p' && !(b.text || '').trim();
    if (empty && type !== 'indent' && type !== 'outdent') applySlash(id, type);
    else if (type === 'img') pickImage(id);
    else if (type === 'link') promptLink(id);
    else insertBlock(type, id);
  }

  function applyTheme(name) {
    if (THEMES.indexOf(name) < 0) name = 'scifi';
    document.documentElement.setAttribute('data-theme', name);
    try { localStorage.setItem(THEME_KEY, name); } catch (e) {}
    document.querySelectorAll('#theme-list [data-theme]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-theme') === name);
    });
  }

  function maybeSlash(ce, id) {
    var t = (ce.innerText || '').replace(/\n/g, '');
    if (t.charAt(0) !== '/') { els.slash.hidden = true; return; }
    var q = t.slice(1).toLowerCase();
    var items = BLOCKS.filter(function (b) {
      return !q || b.id.indexOf(q) >= 0 || b.label.indexOf(q) >= 0 || b.hint.indexOf(q) >= 0;
    });
    els.slash.innerHTML = '';
    items.forEach(function (it, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = it.label + '<span class="k">' + it.hint + '</span>';
      if (idx === 0) btn.className = 'active';
      btn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        applySlash(id, it.id);
      });
      els.slash.appendChild(btn);
    });
    var r = ce.getBoundingClientRect();
    els.slash.style.left = r.left + 'px';
    els.slash.style.top = (r.bottom + 6) + 'px';
    els.slash.hidden = !items.length;
  }

  function applySlash(id, type) {
    var n = current();
    collectFromDom();
    var b = n.blocks.filter(function (x) { return x.id === id; })[0];
    if (b) b.text = '';
    hideMenus();
    if (type === 'img') pickImage(id);
    else if (type === 'link') promptLink(id);
    else if (type === 'indent' || type === 'outdent') insertBlock(type, id);
    else if (b && type === 'radio') {
      b.type = 'radio';
      b.group = uid('g');
      b.checked = false;
      var idx = n.blocks.findIndex(function (x) { return x.id === id; });
      n.blocks.splice(idx + 1, 0, { id: uid('b'), type: 'radio', group: b.group, checked: false, text: '' });
      state.focusId = id;
      markDirty();
      renderEditor();
    } else if (b && type === 'toggle') {
      b.type = 'toggle';
      b.collapsed = false;
      var tidx = n.blocks.findIndex(function (x) { return x.id === id; });
      n.blocks.splice(tidx + 1, 0, { id: uid('b'), type: 'p', indent: blockIndent(b) + 1, text: '' });
      state.focusId = id;
      markDirty();
      renderEditor();
    } else if (b) {
      b.type = type;
      if (type === 'code') b.lang = '';
      if (type === 'todo') b.checked = false;
      if (type === 'p') b.indent = b.indent || 0;
      state.focusId = id;
      markDirty();
      renderEditor();
    } else insertBlock(type, id);
  }

  function promptLink(afterId) {
    var url = window.prompt('网页链接', 'https://');
    if (!url) return;
    toast('正在抓取链接概览…');
    fetchLinkCard(url).then(function (card) {
      insertBlock('link', afterId, card);
    });
  }

  function pickImage(afterId) {
    els.imgFile.setAttribute('data-after', afterId || '');
    els.imgFile.value = '';
    els.imgFile.click();
  }

  function onImageFile(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var after = els.imgFile.getAttribute('data-after') || state.focusId;
    compressImage(file).then(function (blob) {
      insertBlock('img', after, { blob: blob, alt: file.name.replace(/\.[^.]+$/, '') });
    }).catch(function (err) { toast(err.message || '图片失败'); });
  }

  /* ---------------- save / export ---------------- */
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  function exportMd() {
    var n = current();
    if (!n) return;
    collectFromDom();
    var name = (n.title || n.id).replace(/[\\/:*?"<>|]+/g, '_') + '.md';
    download(name, toMarkdown(n), 'text/markdown;charset=utf-8');
  }
  function exportHtml() {
    var n = current();
    if (!n) return;
    collectFromDom();
    var name = (n.title || n.id).replace(/[\\/:*?"<>|]+/g, '_') + '.html';
    download(name, toHtmlExport(n), 'text/html;charset=utf-8');
  }

  function saveToRepo() {
    var n = current();
    if (!n) { toast('没有打开的日志'); return; }
    if (!configured() || !state.cfg.token) {
      toast('请先在仓库设置中填写 Token');
      openSettings();
      return;
    }
    collectFromDom();
    n.updated = nowISO();
    setStatus('正在保存…', '');
    var chain = Promise.resolve();
    n.blocks.forEach(function (b) {
      if (b.type === 'img' && b.pendingBlob) {
        chain = chain.then(function () { return uploadAsset(n, b, b.pendingBlob); });
      }
    });
    chain.then(function () {
      var pack = chooseStorage(n);
      n.ext = pack.ext;
      var base = notesPath();
      var path = base + '/' + n.id + '.' + pack.ext;
      var other = base + '/' + n.id + '.' + (pack.ext === 'md' ? 'html' : 'md');
      return getFile(path).then(function () {
        return getFile(other);
      }).then(function () {
        return putFile(path, b64enc(pack.body), 'journal: save ' + (n.title || n.id));
      }).then(function () {
        return deleteFile(other, 'journal: drop heavier format');
      }).then(function () {
        if (state.order.indexOf(n.id) < 0) state.order.unshift(n.id);
        saveCache();
        return putFile(base + '/' + CATALOG, b64enc(catalogMarkdown()), 'journal: update catalog');
      }).then(function () {
        state.dirty = false;
        renderList();
        setStatus('已写入 ' + pack.ext + '（md ' + pack.mdBytes + 'B / html ' + pack.htmlBytes + 'B）', 'ok');
        toast('已保存到仓库 · 选用 ' + pack.ext.toUpperCase());
      });
    }).catch(function (err) {
      setStatus(err.message || '保存失败', 'warn');
      toast(err.message || '保存失败');
    });
  }

  function openSettings() {
    els.cfgOwner.value = state.cfg.owner || '';
    els.cfgRepo.value = state.cfg.repo || '';
    els.cfgBranch.value = state.cfg.branch || '';
    els.cfgPath.value = state.cfg.path || 'journal/notes';
    els.cfgToken.value = state.cfg.token || '';
    els.modal.classList.add('show');
  }

  function applySettings() {
    state.cfg.owner = els.cfgOwner.value.trim();
    state.cfg.repo = els.cfgRepo.value.trim();
    state.cfg.branch = els.cfgBranch.value.trim();
    state.cfg.path = els.cfgPath.value.trim() || 'journal/notes';
    state.cfg.token = els.cfgToken.value.trim();
    saveCfg();
    els.modal.classList.remove('show');
    pullRemote();
  }

  /* ---------------- boot ---------------- */
  function boot() {
    els.status = document.getElementById('sync-status');
    els.list = document.getElementById('note-list');
    els.search = document.getElementById('note-search');
    els.empty = document.getElementById('empty-hint');
    els.editor = document.getElementById('editor');
    els.blocks = document.getElementById('blocks');
    els.title = document.getElementById('note-title');
    els.author = document.getElementById('note-author');
    els.toast = document.getElementById('toast');
    els.slash = document.getElementById('slash');
    els.insert = document.getElementById('insert-menu');
    els.modal = document.getElementById('settings-modal');
    els.imgFile = document.getElementById('img-file');
    els.cfgOwner = document.getElementById('cfg-owner');
    els.cfgRepo = document.getElementById('cfg-repo');
    els.cfgBranch = document.getElementById('cfg-branch');
    els.cfgPath = document.getElementById('cfg-path');
    els.cfgToken = document.getElementById('cfg-token');

    loadCache();
    var g = guessRepo();
    if (!state.cfg.owner && g.owner) state.cfg.owner = g.owner;
    if (!state.cfg.repo && g.repo) state.cfg.repo = g.repo;
    if (!state.cfg.path) state.cfg.path = 'journal/notes';

    document.getElementById('btn-new').addEventListener('click', newNote);
    document.getElementById('btn-settings').addEventListener('click', openSettings);
    document.getElementById('cfg-close').addEventListener('click', function () { els.modal.classList.remove('show'); });
    document.getElementById('cfg-save').addEventListener('click', applySettings);
    document.getElementById('btn-save').addEventListener('click', saveToRepo);
    document.getElementById('btn-export-md').addEventListener('click', exportMd);
    document.getElementById('btn-export-html').addEventListener('click', exportHtml);
    document.getElementById('btn-sidebar').addEventListener('click', function () {
      document.getElementById('sidebar').classList.toggle('open');
    });
    var themeList = document.getElementById('theme-list');
    document.getElementById('theme-toggle').addEventListener('click', function (e) {
      e.stopPropagation();
      themeList.hidden = !themeList.hidden;
    });
    themeList.querySelectorAll('[data-theme]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyTheme(btn.getAttribute('data-theme'));
        themeList.hidden = true;
      });
    });
    var savedTheme = 'scifi';
    try { savedTheme = localStorage.getItem(THEME_KEY) || 'scifi'; } catch (e) {}
    applyTheme(savedTheme);
    els.search.addEventListener('input', renderList);
    els.title.addEventListener('input', function () { markDirty(); collectFromDom(); renderList(); });
    els.author.addEventListener('input', markDirty);
    els.imgFile.addEventListener('change', onImageFile);

    document.addEventListener('click', function (e) {
      if (!els.slash.contains(e.target)) els.slash.hidden = true;
      if (!els.insert.contains(e.target) && !(e.target.closest && e.target.closest('.plus'))) els.insert.hidden = true;
      var dock = document.getElementById('theme-dock');
      if (dock && !dock.contains(e.target)) themeList.hidden = true;
    });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveToRepo();
      }
      if (e.key === 'Escape') hideMenus();
    });
    document.getElementById('scroller').addEventListener('paste', function (e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') === 0) {
          e.preventDefault();
          var f = items[i].getAsFile();
          compressImage(f).then(function (blob) {
            if (!current()) newNote();
            insertBlock('img', state.focusId, { blob: blob, alt: '粘贴图片' });
          });
          return;
        }
      }
    });

    renderList();
    if (configured()) {
      pullRemote().then(function () {
        if (!state.current && state.order[0]) openNote(state.order[0]);
      });
    } else {
      setStatus('未配置仓库 · 可先本地写，再填 Token', 'warn');
      if (state.order[0]) openNote(state.order[0]);
    }
  }

  boot();
})();
