/* ============================================================
   KUNG Hsinyü // 个人空间站 — 科幻动效脚本
   - 启动遮罩淡出
   - Canvas 星空粒子网络背景
   - 终端打字机效果
   - 卡片滚动入场
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 1. 启动遮罩 ---------- */
  window.addEventListener('load', function () {
    var boot = document.getElementById('boot-screen');
    if (!boot) return;
    setTimeout(function () {
      boot.classList.add('hide');
      setTimeout(function () { boot.style.display = 'none'; }, 700);
    }, 1900);
  });

  /* ---------- 2. 粒子网络背景 ---------- */
  var canvas = document.getElementById('particle-canvas');
  var ctx = canvas.getContext('2d');
  var particles = [];
  var mouse = { x: null, y: null, r: 140 };
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  var ACCENT = '#00f0ff';
  var ACCENT2 = '#7b5cff';

  function resize() {
    canvas.width = window.innerWidth * DPR;
    canvas.height = window.innerHeight * DPR;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    initParticles();
  }

  function Particle() {
    this.x = Math.random() * window.innerWidth;
    this.y = Math.random() * window.innerHeight;
    this.vx = (Math.random() - 0.5) * 0.35;
    this.vy = (Math.random() - 0.5) * 0.35;
    this.size = Math.random() * 1.6 + 0.6;
    this.baseAlpha = Math.random() * 0.5 + 0.25;
    this.alpha = this.baseAlpha;
    this.color = Math.random() > 0.5 ? ACCENT : ACCENT2;
    this.twinkle = Math.random() * Math.PI * 2;
  }

  Particle.prototype.update = function () {
    this.x += this.vx;
    this.y += this.vy;
    // 边界回弹
    if (this.x < 0 || this.x > window.innerWidth) this.vx *= -1;
    if (this.y < 0 || this.y > window.innerHeight) this.vy *= -1;

    // 鼠标交互：靠近时放大 + 变亮
    if (mouse.x !== null) {
      var dx = this.x - mouse.x;
      var dy = this.y - mouse.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < mouse.r) {
        var force = (mouse.r - dist) / mouse.r;
        this.x += dx / dist * force * 1.5;
        this.y += dy / dist * force * 1.5;
        this.alpha = this.baseAlpha + force * 0.5;
      } else {
        this.alpha += (this.baseAlpha - this.alpha) * 0.05;
      }
    }

    // 闪烁
    this.twinkle += 0.02;
    var tw = (Math.sin(this.twinkle) + 1) * 0.5;
    this.alpha = Math.min(1, this.alpha * (0.7 + tw * 0.3));
  };

  Particle.prototype.draw = function () {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.globalAlpha = this.alpha;
    ctx.shadowBlur = 8;
    ctx.shadowColor = this.color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  };

  function initParticles() {
    particles = [];
    var count = Math.min(110, Math.floor(window.innerWidth * window.innerHeight / 14000));
    for (var i = 0; i < count; i++) particles.push(new Particle());
  }

  function connect() {
    var maxDist = 130;
    for (var a = 0; a < particles.length; a++) {
      for (var b = a + 1; b < particles.length; b++) {
        var dx = particles[a].x - particles[b].x;
        var dy = particles[a].y - particles[b].y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDist) {
          var op = (1 - dist / maxDist) * 0.22;
          ctx.strokeStyle = 'rgba(0,240,255,' + op + ')';
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(particles[a].x, particles[a].y);
          ctx.lineTo(particles[b].x, particles[b].y);
          ctx.stroke();
        }
      }
    }
  }

  function animate() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    var i;
    for (i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw();
    }
    connect();
    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener('mouseout', function () {
    mouse.x = null;
    mouse.y = null;
  });

  // 触摸支持
  window.addEventListener('touchmove', function (e) {
    if (e.touches[0]) {
      mouse.x = e.touches[0].clientX;
      mouse.y = e.touches[0].clientY;
    }
  }, { passive: true });

  resize();
  animate();

  var dnaSlide = { y: 0, dragging: false, moved: false, lastY: 0 };

  /* ---------- 2b. 斜向缓旋 DNA：细径、大螺距、左下角 ---------- */
  (function dnaHelix() {
    var canvas = document.getElementById('dna-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var localDpr = Math.min(window.devicePixelRatio || 1, 2);
    var spin = 0;
    var BASE = {
      A: [0, 240, 255],
      T: [255, 154, 60],
      G: [123, 92, 255],
      C: [255, 229, 102]
    };
    var PAIR = [];
    var i;
    for (i = 0; i < 48; i++) {
      PAIR.push(i % 2 === 0
        ? (i % 4 === 0 ? ['A', 'T'] : ['T', 'A'])
        : (i % 4 === 1 ? ['G', 'C'] : ['C', 'G']));
    }

    function sizeDna() {
      canvas.width = window.innerWidth * localDpr;
      canvas.height = window.innerHeight * localDpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(localDpr, 0, 0, localDpr, 0, 0);
    }
    sizeDna();
    window.addEventListener('resize', sizeDna);

    function rgba(rgb, a) {
      return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')';
    }

    /* 细半径 + 大螺距：侧视双带才容易认成螺旋，而不是一团线圈 */
    var RADIUS = 0.38;
    var PITCH = 0.62;
    var TURNS = 4.2;

    function pt(x, y, z, rot) {
      var c = Math.cos(rot), s = Math.sin(rot);
      var x1 = x * c - z * s;
      var z1 = x * s + z * c;
      var tiltX = 0.38;
      var cy = Math.cos(tiltX), sy = Math.sin(tiltX);
      var y2 = y * cy - z1 * sy;
      var z2 = y * sy + z1 * cy;
      var skew = -0.42;
      var cz = Math.cos(skew), sz = Math.sin(skew);
      var x3 = x1 * cz - y2 * sz;
      var y3 = x1 * sz + y2 * cz;
      var persp = 1 / (1 + z2 * 0.12);
      var W = window.innerWidth, H = window.innerHeight;
      var sc = Math.min(W, H) * 0.28 * persp;
      return {
        x: W * 0.22 + x3 * sc,
        y: H * 0.70 + y3 * sc,
        z: z2,
        p: persp
      };
    }

    function helix(u, phase, r) {
      return pt(r * Math.cos(u + phase), u * PITCH + dnaSlide.y, r * Math.sin(u + phase), spin);
    }

    function depthAlpha(z, base) {
      return Math.max(0.08, base * (0.62 + 0.38 / (1 + Math.abs(z) * 0.35)));
    }

    function draw(t) {
      var W = window.innerWidth, H = window.innerHeight;
      ctx.clearRect(0, 0, W, H);
      if (!reduce) spin = t * 0.00018;
      var steps = 120;
      var rungs = 42;
      var sugarA = [], phosA = [], sugarB = [], phosB = [];
      var i, u, k;
      var uSpan = TURNS * Math.PI * 2;
      for (i = 0; i <= steps; i++) {
        u = (i / steps - 0.5) * uSpan;
        sugarA.push(helix(u, 0, RADIUS * 0.92));
        phosA.push(helix(u, 0.12, RADIUS * 1.08));
        sugarB.push(helix(u, Math.PI, RADIUS * 0.92));
        phosB.push(helix(u, Math.PI + 0.12, RADIUS * 1.08));
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      function ribbon(pts, color, width) {
        ctx.beginPath();
        for (i = 0; i < pts.length; i++) {
          if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
          else ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
      }
      ribbon(sugarA, 'rgba(90,130,150,0.42)', 2.4);
      ribbon(sugarB, 'rgba(70,112,132,0.38)', 2.4);
      ribbon(phosA, 'rgba(52,186,168,0.36)', 1.05);
      ribbon(phosB, 'rgba(46,170,154,0.32)', 1.05);

      function phosphate(p, terminal) {
        var r = (terminal ? 3.4 : 1.7) * p.p;
        var a = depthAlpha(p.z, terminal ? 0.62 : 0.34);
        ctx.fillStyle = rgba([56, 210, 176], a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        if (terminal) {
          ctx.strokeStyle = rgba([180, 255, 230], a * 0.85);
          ctx.lineWidth = 0.8;
          ctx.stroke();
          var j, ang;
          for (j = 0; j < 3; j++) {
            ang = spin * 2 + j * 2.094;
            ctx.beginPath();
            ctx.arc(p.x + Math.cos(ang) * r * 1.4, p.y + Math.sin(ang) * r * 1.4, 1.1 * p.p, 0, Math.PI * 2);
            ctx.fillStyle = rgba([90, 230, 190], a * 0.75);
            ctx.fill();
          }
        }
      }

      phosphate(phosA[0], true);
      phosphate(phosB[0], true);
      phosphate(phosA[phosA.length - 1], true);
      phosphate(phosB[phosB.length - 1], true);
      for (i = 10; i < phosA.length - 10; i += 14) {
        phosphate(phosA[i], false);
        phosphate(phosB[i], false);
      }

      for (k = 0; k < rungs; k++) {
        var idx = Math.round((k + 0.5) / rungs * steps);
        if (idx >= steps) idx = steps - 1;
        u = (idx / steps - 0.5) * uSpan;
        var pair = PAIR[k % PAIR.length];
        var innerA = helix(u, 0, RADIUS * 0.16);
        var innerB = helix(u, Math.PI, RADIUS * 0.16);
        var midA = helix(u, 0, RADIUS * 0.52);
        var midB = helix(u, Math.PI, RADIUS * 0.52);
        var outA = sugarA[idx];
        var outB = sugarB[idx];
        var al = depthAlpha((innerA.z + innerB.z) * 0.5, 0.78);
        var c1 = BASE[pair[0]];
        var c2 = BASE[pair[1]];

        ctx.beginPath();
        ctx.moveTo(outA.x, outA.y);
        ctx.lineTo(innerA.x, innerA.y);
        ctx.strokeStyle = rgba(c1, al * 0.85);
        ctx.lineWidth = 2.1 * outA.p;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(outB.x, outB.y);
        ctx.lineTo(innerB.x, innerB.y);
        ctx.strokeStyle = rgba(c2, al * 0.85);
        ctx.lineWidth = 2.1 * outB.p;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(innerA.x, innerA.y);
        ctx.lineTo(innerB.x, innerB.y);
        ctx.strokeStyle = rgba([200, 220, 230], al * 0.22);
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.fillStyle = rgba(c1, al);
        ctx.beginPath();
        ctx.arc(midA.x, midA.y, 2.8 * midA.p, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba(c2, al);
        ctx.beginPath();
        ctx.arc(midB.x, midB.y, 2.8 * midB.p, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(draw);
    }

    var uiIgnore = 'a, button, input, textarea, select, nav, footer, .card, .qr-frame, .navbar, .btn, label';
    document.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      if (e.target.closest(uiIgnore)) return;
      dnaSlide.dragging = true;
      dnaSlide.moved = false;
      dnaSlide.lastY = e.clientY;
      e.preventDefault();
      document.documentElement.classList.add('dna-dragging');
      var sel = window.getSelection && window.getSelection();
      if (sel && sel.removeAllRanges) sel.removeAllRanges();
    });
    document.addEventListener('pointermove', function (e) {
      if (!dnaSlide.dragging) return;
      var dy = e.clientY - dnaSlide.lastY;
      if (Math.abs(dy) > 4) dnaSlide.moved = true;
      dnaSlide.lastY = e.clientY;
      var sc = Math.min(window.innerWidth, window.innerHeight) * 0.28;
      dnaSlide.y += dy / sc;
      var lim = TURNS * PITCH * 0.62;
      if (dnaSlide.y > lim) dnaSlide.y = lim;
      if (dnaSlide.y < -lim) dnaSlide.y = -lim;
      e.preventDefault();
    }, { passive: false });
    function endDnaDrag() {
      dnaSlide.dragging = false;
      document.documentElement.classList.remove('dna-dragging');
    }
    document.addEventListener('pointerup', endDnaDrag);
    document.addEventListener('pointercancel', endDnaDrag);
    document.addEventListener('selectstart', function (e) {
      if (dnaSlide.dragging) e.preventDefault();
    });

    requestAnimationFrame(draw);
  })();

  /* ---------- 2c. 背景点击：小分子炸开（按酸碱上色，较慢） ---------- */
  (function molBurst() {
    var layer = document.getElementById('mol-burst');
    if (!layer) return;
    var mols = [
      { t: 'H₂O', c: '#f4f7fb', g: '0 0 10px rgba(255,255,255,.55)' },
      { t: 'NH₃', c: '#5ce1ff', g: '0 0 10px rgba(80,210,255,.55)' },
      { t: 'NH₄⁺', c: '#4ad4ff', g: '0 0 10px rgba(60,200,255,.6)' },
      { t: 'OH⁻', c: '#3fd0ff', g: '0 0 10px rgba(50,190,255,.5)' },
      { t: '–COOH', c: '#ffb347', g: '0 0 10px rgba(255,170,60,.55)' },
      { t: '–CHO', c: '#ffc85a', g: '0 0 8px rgba(255,190,80,.45)' },
      { t: 'H⁺', c: '#ff9a3c', g: '0 0 10px rgba(255,140,40,.55)' },
      { t: 'H₃O⁺', c: '#ffaa4d', g: '0 0 10px rgba(255,160,50,.5)' },
      { t: 'CO₂', c: '#ffb86b', g: '0 0 8px rgba(255,170,90,.4)' },
      { t: 'CH₄', c: '#d5dde6', g: '0 0 6px rgba(210,220,230,.35)' },
      { t: 'O₂', c: '#e8eef4', g: '0 0 6px rgba(230,240,250,.35)' },
      { t: 'N₂', c: '#cfd8e2', g: '0 0 6px rgba(200,215,230,.3)' }
    ];
    document.addEventListener('click', function (e) {
      if (dnaSlide.moved) {
        dnaSlide.moved = false;
        return;
      }
      if (e.target.closest('a, button, input, textarea, select, nav, footer, .card, .qr-frame, .navbar, .btn, label')) return;
      var n = 7 + Math.floor(Math.random() * 5);
      var i;
      for (i = 0; i < n; i++) {
        (function () {
          var spec = mols[Math.floor(Math.random() * mols.length)];
          var el = document.createElement('span');
          el.className = 'mol';
          el.textContent = spec.t;
          el.style.color = spec.c;
          el.style.textShadow = spec.g;
          var ang = Math.random() * Math.PI * 2;
          var dist = 70 + Math.random() * 120;
          el.style.left = e.clientX + 'px';
          el.style.top = e.clientY + 'px';
          layer.appendChild(el);
          var dx = Math.cos(ang) * dist;
          var dy = Math.sin(ang) * dist - 20;
          var dur = 1680 + Math.random() * 700;
          el.animate([
            { opacity: 0.96, transform: 'translate(-50%,-50%) scale(0.7)' },
            { opacity: 0.85, transform: 'translate(' + (dx * 0.45) + 'px,' + (dy * 0.45) + 'px) scale(1.05)', offset: 0.4 },
            { opacity: 0, transform: 'translate(' + dx + 'px,' + dy + 'px) scale(1.18)' }
          ], { duration: dur, easing: 'cubic-bezier(.12,.55,.2,1)', fill: 'forwards' });
          setTimeout(function () { el.remove(); }, dur + 80);
        })();
      }
    });
  })();

  /* ---------- 3. 终端打字机 ---------- */
  var typedEl = document.getElementById('typed');
  var phrases = [
    'THINKER · MAKER · GAME DESIGNER',
    '开放网络 · 持续运转 · 中继站'
  ];
  var pi = 0, ci = 0, deleting = false;

  function type() {
    var full = phrases[pi];
    if (!deleting) {
      typedEl.textContent = full.substring(0, ci + 1);
      ci++;
      if (ci === full.length) {
        deleting = true;
        setTimeout(type, 2000);
        return;
      }
    } else {
      typedEl.textContent = full.substring(0, ci - 1);
      ci--;
      if (ci === 0) {
        deleting = false;
        pi = (pi + 1) % phrases.length;
      }
    }
    setTimeout(type, deleting ? 35 : 75);
  }
  if (typedEl) type();

  /* ---------- 4. 卡片滚动入场 ---------- */
  var cards = document.querySelectorAll('.card, .webring-bar, .section-head');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    cards.forEach(function (el, idx) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(30px)';
      el.style.transition = 'opacity .6s ease ' + (idx * 0.08) + 's, transform .6s ease ' + (idx * 0.08) + 's';
      io.observe(el);
    });
  }

  /* ---------- 5. CV 按钮实心斜光（8–15s 随机，便于调试） ---------- */
  (function brandSweep() {
    var btn = document.querySelector('a.nav-brand');
    if (!btn || !btn.querySelector('.brand-sweep')) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    function fire() {
      btn.classList.remove('is-sweeping');
      void btn.offsetWidth;
      btn.classList.add('is-sweeping');
      setTimeout(function () { btn.classList.remove('is-sweeping'); }, 500);
      setTimeout(fire, 8000 + Math.random() * 7000);
    }
    setTimeout(fire, 900);
  })();

  /* ---------- 5b. Ctrl+Alt+点击 CV → 日程台（普通点击仍进简历） ---------- */
  (function brandSecret() {
    var btn = document.querySelector('a.nav-brand');
    if (!btn || !btn.querySelector('.brand-sweep')) return;
    btn.addEventListener('click', function (e) {
      var chord = e.altKey && e.ctrlKey && !e.shiftKey && !e.metaKey;
      if (!chord) return;
      e.preventDefault();
      e.stopPropagation();
      window.location.href = 'planner/index.html';
    });
  })();

  /* ---------- 6. 导航栏滚动收缩 ---------- */
  var navbar = document.querySelector('.navbar');
  var lastScroll = 0;
  window.addEventListener('scroll', function () {
    var cur = window.pageYOffset;
    if (cur > 80) {
      navbar.style.padding = '.6rem 2rem';
    } else {
      navbar.style.padding = '.9rem 2rem';
    }
    lastScroll = cur;
  });

})();
