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

  /* ---------- 5. 导航栏滚动收缩 ---------- */
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
