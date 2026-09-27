'use strict';

// ---------- Настройки ----------
const W = 420;
const H = 720;
const ROAD_LEFT = 60;
const ROAD_RIGHT = 360;
const LANES = 3;
const LANE_W = (ROAD_RIGHT - ROAD_LEFT) / LANES;
const PLAYER_Y = 600;
const MAX_HP = 5;
const SPEED_MIN = 200;
const SPEED_CRUISE = 340;
const SPEED_MAX = 620;
const FIRE_COOLDOWN = 0.18;
const BULLET_SPEED = 750;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ---------- Масштабирование под экран ----------
function resize() {
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = Math.floor(W * scale) + 'px';
  canvas.style.height = Math.floor(H * scale) + 'px';
}
window.addEventListener('resize', resize);
resize();

// ---------- Управление ----------
const keys = { left: false, right: false, up: false, down: false, fire: false };
const KEY_MAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'fire', KeyJ: 'fire',
};

window.addEventListener('keydown', (e) => {
  const k = KEY_MAP[e.code];
  if (k) { keys[k] = true; e.preventDefault(); }
  if (e.code === 'Enter' || e.code === 'Space') onAction();
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
});
window.addEventListener('keyup', (e) => {
  const k = KEY_MAP[e.code];
  if (k) { keys[k] = false; e.preventDefault(); }
});

document.querySelectorAll('#touch button').forEach((btn) => {
  const k = btn.dataset.key;
  const on = (e) => { e.preventDefault(); keys[k] = true; onAction(); };
  const off = (e) => { e.preventDefault(); keys[k] = false; };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointercancel', off);
  btn.addEventListener('pointerleave', off);
});
canvas.addEventListener('pointerdown', () => onAction());

// ---------- Рекорд ----------
function loadBest() {
  try { return Number(localStorage.getItem('roadShooterBest')) || 0; } catch (e) { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem('roadShooterBest', String(v)); } catch (e) { /* ignore */ }
}

// ---------- Состояние игры ----------
let state = 'menu'; // menu | play | pause | over
let best = loadBest();
let game;

function newGame() {
  game = {
    player: { x: laneX(1), w: 38, h: 66, hp: MAX_HP, invuln: 0, spin: 0, cooldown: 0, tilt: 0, rapid: 0 },
    speed: SPEED_CRUISE,
    distance: 0,
    kills: 0,
    score: 0,
    roadOffset: 0,
    objects: [],   // препятствия, враги, бонусы
    bullets: [],   // пули игрока
    enemyBullets: [],
    particles: [],
    spawnTimer: 1,
    displayScore: 0,
    overTime: 0,
    shake: 0,
    time: 0,
  };
}

function laneX(i) { return ROAD_LEFT + LANE_W * (i + 0.5); }
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function onAction() {
  if (state === 'menu' || (state === 'over' && game.overTime > 0.8)) {
    newGame();
    state = 'play';
  } else if (state === 'pause') {
    state = 'play';
  }
}
function togglePause() {
  if (state === 'play') state = 'pause';
  else if (state === 'pause') state = 'play';
}

// ---------- Появление объектов ----------
const ENEMY_COLORS = ['#3b82f6', '#a855f7', '#f59e0b', '#10b981', '#ec4899'];

function difficulty() {
  // растёт от 0 до 1 примерно за 3 км
  return clamp(game.distance / 30000, 0, 1);
}

function laneBusy(lane, top, bottom) {
  const x = laneX(lane);
  return game.objects.some((o) => Math.abs(o.x - x) < LANE_W * 0.6 && o.y > top && o.y < bottom);
}

function solidBlocksNear() {
  // сколько неразрушимых препятствий у верхнего края — чтобы всегда оставался проезд
  return game.objects.filter((o) => o.type === 'block' && o.y < 160).length;
}

function spawn() {
  const d = difficulty();
  const lane = randInt(0, LANES - 1);
  if (laneBusy(lane, -260, 120)) return;

  const x = laneX(lane);
  const r = Math.random();

  if (r < 0.38 + d * 0.12) {
    // вражеская машина
    game.objects.push({
      type: 'enemy', x, y: -80, w: 38, h: 66,
      targetX: x,
      hp: Math.random() < 0.25 + d * 0.3 ? 3 : 2,
      maxHp: 0,
      carSpeed: rand(150, 240),
      color: ENEMY_COLORS[randInt(0, ENEMY_COLORS.length - 1)],
      shootTimer: rand(1.2, 2.5),
      shooter: Math.random() < 0.35 + d * 0.4,
      laneTimer: rand(1.5, 3.5),
      flash: 0,
    });
    const e = game.objects[game.objects.length - 1];
    e.maxHp = e.hp;
  } else if (r < 0.6) {
    game.objects.push({ type: 'cone', x: x + rand(-20, 20), y: -30, w: 24, h: 26, hp: 1 });
  } else if (r < 0.78) {
    if (solidBlocksNear() >= 1) return;
    game.objects.push({ type: 'block', x, y: -30, w: 80, h: 28 });
  } else if (r < 0.92) {
    game.objects.push({ type: 'oil', x: x + rand(-15, 15), y: -40, w: 50, h: 36 });
  } else if (r < 0.97) {
    game.objects.push({ type: 'repair', x, y: -30, w: 28, h: 28 });
  } else {
    game.objects.push({ type: 'ammo', x, y: -30, w: 28, h: 28 });
  }
}

// ---------- Эффекты ----------
function explode(x, y, color, count = 24) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(60, 280);
    game.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(0.4, 0.9), max: 0.9, size: rand(2, 5),
      color: Math.random() < 0.5 ? color : (Math.random() < 0.5 ? '#ffb020' : '#ff5a1f'),
    });
  }
  game.shake = Math.max(game.shake, 0.25);
}

function sparks(x, y) {
  for (let i = 0; i < 6; i++) {
    game.particles.push({
      x, y, vx: rand(-120, 120), vy: rand(-160, 40),
      life: 0.25, max: 0.25, size: 2, color: '#ffe680',
    });
  }
}

function hitPlayer(dmg = 1) {
  const p = game.player;
  if (p.invuln > 0) return;
  p.hp -= dmg;
  p.invuln = 1.2;
  game.shake = 0.35;
  game.speed = Math.max(SPEED_MIN, game.speed * 0.7);
  if (p.hp <= 0) {
    explode(p.x, PLAYER_Y, '#ef4444', 60);
    endGame();
  }
}

function endGame() {
  state = 'over';
  game.overTime = 0;
  game.displayScore = game.score + Math.floor(game.distance / 10);
  if (game.displayScore > best) { best = game.displayScore; saveBest(best); }
}

// ---------- Обновление ----------
function overlap(a, ay, b, by, shrink = 0.8) {
  return Math.abs(a.x - b.x) * 2 < (a.w + b.w) * shrink &&
         Math.abs(ay - by) * 2 < (a.h + b.h) * shrink;
}

function update(dt) {
  const g = game;
  const p = g.player;
  g.time += dt;

  // скорость
  if (keys.up) g.speed += 260 * dt;
  else if (keys.down) g.speed -= 420 * dt;
  else g.speed += (SPEED_CRUISE - g.speed) * Math.min(1, dt * 0.8);
  g.speed = clamp(g.speed, SPEED_MIN, SPEED_MAX);

  // руление (на масле машину заносит)
  let steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (p.spin > 0) {
    p.spin -= dt;
    steer = Math.sin(g.time * 18) * 1.2;
  }
  const steerSpeed = 250 + g.speed * 0.25;
  p.x += steer * steerSpeed * dt;
  p.tilt += (steer * 0.18 - p.tilt) * Math.min(1, dt * 10);

  // съезд на обочину — удар о бордюр
  const minX = ROAD_LEFT + p.w / 2;
  const maxX = ROAD_RIGHT - p.w / 2;
  if (p.x < minX || p.x > maxX) {
    p.x = clamp(p.x, minX, maxX);
    g.speed = Math.max(SPEED_MIN, g.speed - 500 * dt);
    if (Math.random() < 0.3) sparks(p.x + (p.x <= minX ? -p.w / 2 : p.w / 2), PLAYER_Y);
  }

  if (p.invuln > 0) p.invuln -= dt;

  // стрельба
  p.cooldown -= dt;
  if (keys.fire && p.cooldown <= 0) {
    p.cooldown = p.rapid > 0 ? FIRE_COOLDOWN / 2.5 : FIRE_COOLDOWN;
    g.bullets.push({ x: p.x - 9, y: PLAYER_Y - p.h / 2, w: 4, h: 12 });
    g.bullets.push({ x: p.x + 9, y: PLAYER_Y - p.h / 2, w: 4, h: 12 });
  }
  if (p.rapid > 0) p.rapid -= dt;

  // прокрутка
  const scroll = g.speed * dt;
  g.distance += scroll;
  g.roadOffset = (g.roadOffset + scroll) % 160;

  // появление
  g.spawnTimer -= dt;
  if (g.spawnTimer <= 0) {
    spawn();
    const d = difficulty();
    g.spawnTimer = rand(0.45, 0.95) * (1 - d * 0.45) * (SPEED_CRUISE / g.speed);
  }

  // объекты
  for (const o of g.objects) {
    if (o.type === 'enemy') {
      o.y += (g.speed - o.carSpeed) * dt;
      o.laneTimer -= dt;
      if (o.laneTimer <= 0) {
        o.laneTimer = rand(1.5, 3.5);
        const lane = clamp(Math.round((o.x - ROAD_LEFT) / LANE_W - 0.5) + randInt(-1, 1), 0, LANES - 1);
        o.targetX = laneX(lane);
      }
      o.x += (o.targetX - o.x) * Math.min(1, dt * 2.5);
      if (o.flash > 0) o.flash -= dt;
      if (o.shooter && o.y > 0 && o.y < PLAYER_Y - 120) {
        o.shootTimer -= dt;
        if (o.shootTimer <= 0) {
          o.shootTimer = rand(1.3, 2.6) * (1 - difficulty() * 0.4);
          g.enemyBullets.push({ x: o.x, y: o.y + o.h / 2, w: 6, h: 10, vy: 380 + g.speed * 0.3 });
        }
      }
    } else {
      o.y += scroll;
    }

    // столкновение с игроком
    if (!o.dead && overlap(o, o.y, p, PLAYER_Y)) {
      if (o.type === 'repair') {
        p.hp = Math.min(MAX_HP, p.hp + 1);
        o.dead = true;
        g.score += 50;
      } else if (o.type === 'ammo') {
        p.rapid = 6;
        o.dead = true;
        g.score += 50;
      } else if (o.type === 'oil') {
        if (p.spin <= 0 && p.invuln <= 0) p.spin = 0.9;
      } else if (o.type === 'cone') {
        o.dead = true;
        sparks(o.x, o.y);
        hitPlayer(1);
      } else if (o.type === 'block') {
        hitPlayer(2);
        if (state === 'play') {
          // отталкиваем игрока в сторону
          p.x += p.x < o.x ? -30 : 30;
        }
      } else if (o.type === 'enemy') {
        o.dead = true;
        explode(o.x, o.y, o.color);
        hitPlayer(1);
      }
    }
  }

  // пули игрока
  for (const b of g.bullets) {
    b.y -= BULLET_SPEED * dt;
    for (const o of g.objects) {
      if (o.dead || b.dead) continue;
      if (o.type !== 'enemy' && o.type !== 'cone' && o.type !== 'block') continue;
      if (overlap(b, b.y, o, o.y, 1)) {
        b.dead = true;
        sparks(b.x, b.y);
        if (o.type === 'block') continue; // бетонный блок не пробить
        o.hp -= 1;
        o.flash = 0.08;
        if (o.hp <= 0) {
          o.dead = true;
          if (o.type === 'enemy') {
            g.kills++;
            g.score += 100 * o.maxHp;
            explode(o.x, o.y, o.color);
          } else {
            g.score += 10;
            explode(o.x, o.y, '#ff8c1a', 8);
          }
        }
      }
    }
  }

  // пули врагов
  for (const b of g.enemyBullets) {
    b.y += b.vy * dt;
    if (!b.dead && overlap(b, b.y, p, PLAYER_Y, 0.9)) {
      b.dead = true;
      sparks(b.x, b.y);
      hitPlayer(1);
    }
  }

  // частицы
  for (const pt of g.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt + scroll * 0.5;
    pt.vx *= 0.96;
    pt.vy *= 0.96;
    pt.life -= dt;
  }

  g.objects = g.objects.filter((o) => !o.dead && o.y < H + 120 && o.y > -400);
  g.bullets = g.bullets.filter((b) => !b.dead && b.y > -20);
  g.enemyBullets = g.enemyBullets.filter((b) => !b.dead && b.y < H + 20);
  g.particles = g.particles.filter((pt) => pt.life > 0);

  if (g.shake > 0) g.shake -= dt;
  if (state === 'play') g.displayScore = g.score + Math.floor(g.distance / 10);
}

// ---------- Отрисовка ----------
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRoad(treeOffset) {
  const offset = treeOffset % 80;
  // трава
  ctx.fillStyle = '#2f7d32';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2a6f2d';
  for (let y = -80 + offset; y < H; y += 80) {
    ctx.fillRect(0, y, ROAD_LEFT - 12, 40);
    ctx.fillRect(ROAD_RIGHT + 12, y + 40, W - ROAD_RIGHT - 12, 40);
  }
  // деревья по краям
  for (let y = -160 + treeOffset; y < H + 40; y += 160) {
    drawTree(24, y);
    drawTree(W - 24, y + 80);
  }
  // бордюры
  for (let y = -80 + offset; y < H; y += 40) {
    const red = Math.round((y - offset) / 40) % 2 === 0;
    ctx.fillStyle = red ? '#d62828' : '#f1f1f1';
    ctx.fillRect(ROAD_LEFT - 12, y, 12, 40);
    ctx.fillRect(ROAD_RIGHT, y, 12, 40);
  }
  // асфальт
  ctx.fillStyle = '#3a3a3f';
  ctx.fillRect(ROAD_LEFT, 0, ROAD_RIGHT - ROAD_LEFT, H);
  // разметка
  ctx.fillStyle = '#e8e8e8';
  for (let i = 1; i < LANES; i++) {
    const x = ROAD_LEFT + LANE_W * i - 3;
    for (let y = -80 + offset; y < H; y += 80) ctx.fillRect(x, y, 6, 44);
  }
}

function drawTree(x, y) {
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.arc(x + 4, y + 4, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1b5e20';
  ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#388e3c';
  ctx.beginPath(); ctx.arc(x - 4, y - 4, 9, 0, Math.PI * 2); ctx.fill();
}

function drawCar(x, y, w, h, color, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  if (opts.tilt) ctx.rotate(opts.tilt);
  if (opts.flip) ctx.rotate(Math.PI);
  // тень
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  roundRect(-w / 2 + 4, -h / 2 + 5, w, h, 9); ctx.fill();
  // колёса
  ctx.fillStyle = '#111';
  const wx = w / 2 + 2, wh = 14;
  ctx.fillRect(-wx, -h / 2 + 8, 6, wh);
  ctx.fillRect(wx - 6, -h / 2 + 8, 6, wh);
  ctx.fillRect(-wx, h / 2 - 8 - wh, 6, wh);
  ctx.fillRect(wx - 6, h / 2 - 8 - wh, 6, wh);
  // кузов
  ctx.fillStyle = opts.flash ? '#fff' : color;
  roundRect(-w / 2, -h / 2, w, h, 9); ctx.fill();
  // полоса
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.fillRect(-4, -h / 2 + 2, 8, h - 4);
  // стекла
  ctx.fillStyle = '#1e293b';
  roundRect(-w / 2 + 5, -h / 2 + 14, w - 10, 13, 4); ctx.fill();
  roundRect(-w / 2 + 6, h / 2 - 20, w - 12, 9, 3); ctx.fill();
  // фары
  ctx.fillStyle = '#fff6b0';
  ctx.fillRect(-w / 2 + 4, -h / 2 + 1, 7, 4);
  ctx.fillRect(w / 2 - 11, -h / 2 + 1, 7, 4);
  ctx.fillStyle = '#ff3b3b';
  ctx.fillRect(-w / 2 + 4, h / 2 - 4, 7, 3);
  ctx.fillRect(w / 2 - 11, h / 2 - 4, 7, 3);
  // пушки
  if (opts.guns) {
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(-11, -h / 2 - 6, 4, 10);
    ctx.fillRect(7, -h / 2 - 6, 4, 10);
  }
  ctx.restore();
}

function drawObject(o) {
  switch (o.type) {
    case 'enemy': {
      // враги едут в ту же сторону, пушка у стрелков смотрит назад
      drawCar(o.x, o.y, o.w, o.h, o.color, { flash: o.flash > 0 });
      if (o.shooter) {
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(o.x - 3, o.y + o.h / 2 - 4, 6, 12);
      }
      if (o.maxHp > 1) {
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(o.x - 18, o.y - o.h / 2 - 10, 36, 5);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(o.x - 18, o.y - o.h / 2 - 10, 36 * (o.hp / o.maxHp), 5);
      }
      break;
    }
    case 'cone': {
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.arc(o.x + 3, o.y + 4, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff7a00';
      ctx.beginPath(); ctx.arc(o.x, o.y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(o.x, o.y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff7a00';
      ctx.beginPath(); ctx.arc(o.x, o.y, 4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'block': {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(o.x - o.w / 2 + 4, o.y - o.h / 2 + 5, o.w, o.h);
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
      ctx.fillStyle = '#facc15';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        const sx = o.x - o.w / 2 + i * 20;
        ctx.moveTo(sx, o.y - o.h / 2);
        ctx.lineTo(sx + 10, o.y - o.h / 2);
        ctx.lineTo(sx + 20, o.y + o.h / 2);
        ctx.lineTo(sx + 10, o.y + o.h / 2);
        ctx.fill();
      }
      break;
    }
    case 'oil': {
      ctx.fillStyle = 'rgba(10,10,15,.85)';
      ctx.beginPath(); ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(o.x + 16, o.y + 10, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(120,80,200,.35)';
      ctx.beginPath(); ctx.ellipse(o.x - 6, o.y - 5, 10, 5, 0.3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'repair':
    case 'ammo': {
      const pulse = 1 + Math.sin(game.time * 6) * 0.08;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = o.type === 'repair' ? '#22c55e' : '#3b82f6';
      roundRect(-14, -14, 28, 28, 6); ctx.fill();
      ctx.fillStyle = '#fff';
      if (o.type === 'repair') {
        ctx.fillRect(-3, -9, 6, 18);
        ctx.fillRect(-9, -3, 18, 6);
      } else {
        ctx.font = 'bold 18px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚡', 0, 1);
      }
      ctx.restore();
      break;
    }
  }
}

function drawHUD() {
  const g = game;
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(0, 0, W, 44);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Очки: ' + g.displayScore, 10, 22);
  ctx.textAlign = 'center';
  ctx.fillText(Math.round(g.speed / 3) + ' км/ч', W / 2, 22);
  // здоровье
  ctx.textAlign = 'right';
  for (let i = 0; i < MAX_HP; i++) {
    ctx.fillStyle = i < g.player.hp ? '#ef4444' : '#555';
    ctx.fillRect(W - 12 - (MAX_HP - i) * 18, 14, 14, 16);
  }
  ctx.font = '12px system-ui';
  ctx.fillStyle = '#ddd';
  ctx.textAlign = 'left';
  ctx.fillText('Сбито: ' + g.kills, 10, 58);
  if (g.player.rapid > 0) {
    ctx.fillStyle = '#60a5fa';
    ctx.fillText('⚡ Скорострельность ' + g.player.rapid.toFixed(1) + 'с', 10, 74);
  }
}

function drawOverlay(title, lines) {
  ctx.fillStyle = 'rgba(0,0,0,.65)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 36px system-ui';
  ctx.fillText(title, W / 2, H / 2 - 110);
  ctx.font = '17px system-ui';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 50 + i * 28));
}

function render() {
  ctx.save();
  if (game && game.shake > 0) {
    ctx.translate(rand(-5, 5) * game.shake * 3, rand(-5, 5) * game.shake * 3);
  }
  drawRoad(game ? game.roadOffset : (performance.now() / 5) % 160);

  if (game) {
    const g = game;
    // сначала плоские объекты (масло), потом всё остальное
    g.objects.filter((o) => o.type === 'oil').forEach(drawObject);
    g.objects.filter((o) => o.type !== 'oil').forEach(drawObject);

    ctx.fillStyle = '#fde047';
    for (const b of g.bullets) ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
    ctx.fillStyle = '#f87171';
    for (const b of g.enemyBullets) {
      ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill();
    }

    const p = g.player;
    const blink = p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0;
    if (state !== 'over' && !blink) {
      const tilt = p.spin > 0 ? Math.sin(g.time * 18) * 0.5 : p.tilt;
      drawCar(p.x, PLAYER_Y, p.w, p.h, '#dc2626', { tilt, guns: true });
    }

    for (const pt of g.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
    drawHUD();
  }
  ctx.restore();

  const touch = matchMedia('(pointer: coarse)').matches;
  if (state === 'menu') {
    drawOverlay('Дорожный Стрелок', [
      'Объезжай препятствия и сбивай',
      'вражеские машины!',
      '',
      touch ? '◀ ▶ — руль, ▲ — газ, 🔥 — огонь' : '← → / A D — руль',
      touch ? '' : '↑ ↓ / W S — газ и тормоз',
      touch ? '' : 'Пробел — огонь, P — пауза',
      '',
      '🟩 ремкомплект   🟦 скорострельность',
      '',
      touch ? 'Коснитесь, чтобы начать' : 'Нажмите Enter, чтобы начать',
      best ? 'Рекорд: ' + best : '',
    ]);
  } else if (state === 'pause') {
    drawOverlay('Пауза', [touch ? 'Коснитесь, чтобы продолжить' : 'P — продолжить']);
  } else if (state === 'over') {
    drawOverlay('Авария!', [
      'Очки: ' + game.displayScore,
      'Сбито машин: ' + game.kills,
      'Проехано: ' + (game.distance / 6000).toFixed(2) + ' км',
      'Рекорд: ' + best,
      '',
      touch ? 'Коснитесь, чтобы начать заново' : 'Enter — заново',
    ]);
  }
}

// ---------- Игровой цикл ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state === 'play') update(dt);
  else if (state === 'over' && game) {
    // частицы взрыва догорают после аварии
    for (const pt of game.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; }
    game.particles = game.particles.filter((pt) => pt.life > 0);
    if (game.shake > 0) game.shake -= dt;
    game.overTime += dt;
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
