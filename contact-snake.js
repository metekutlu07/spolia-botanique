(function () {
  const instances = new WeakMap();
  const growthItems = ['💧', '💨'];
  const negativeItems = ['🔥', '☢'];
  const growthEmojiByItem = {
    '💧': '🌿',
    '💨': '🌸'
  };
  const dirs = {
    ArrowUp: { x: 0, y: -1 },
    KeyW: { x: 0, y: -1 },
    ArrowRight: { x: 1, y: 0 },
    KeyD: { x: 1, y: 0 },
    ArrowDown: { x: 0, y: 1 },
    KeyS: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    KeyA: { x: -1, y: 0 }
  };

  function same(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  function keyOf(cell) {
    return `${cell.x},${cell.y}`;
  }

  function makeContactSnake(page) {
    const canvas = page.querySelector('.snake-canvas');
    const obstacleEl = page.querySelector('[data-snake-obstacle]');
    const scoreEl = page.querySelector('[data-snake-score]');
    const hintEl = page.querySelector('.contact-controls-hint');
    const bottomBarEl = page.querySelector('[data-snake-bottom-bar]');
    const gameOverEl = page.querySelector('[data-snake-game-over]');
    const nameInputEl = page.querySelector('[data-snake-name]');
    const scoresEl = page.querySelector('[data-snake-scores]');
    const playAgainEl = page.querySelector('[data-snake-play-again]');
    if (!canvas || !obstacleEl || !scoreEl) return null;

    const ctx = canvas.getContext('2d');
    const scoresKey = 'spoliaContactSnakeScores';
    const pickupSounds = {
      '🔥': new Audio('sounds/fire.mp3'),
      '💨': new Audio('sounds/wind.mp3'),
      '💧': new Audio('sounds/water.mp3'),
      '☢': new Audio('sounds/nuclear.mp3')
    };
    Object.values(pickupSounds).forEach(sound => {
      sound.preload = 'auto';
      sound.volume = 0.75;
    });
    const state = {
      cell: 32,
      cols: 1,
      rows: 1,
      obstacle: { x1: 0, y1: 0, x2: 0, y2: 0 },
      topSafeRows: 0,
      bottomSafeRows: 0,
      snake: [],
      previous: [],
      dir: { x: 1, y: 0 },
      queuedDir: { x: 1, y: 0 },
      items: [],
      particles: [],
      score: 0,
      nextSegmentId: 1,
      lastAddedId: 0,
      stepMs: 125,
      itemTtlMin: 6200,
      itemTtlMax: 11800,
      spawnEvery: 1350,
      maxItems: 6,
      lastStep: performance.now(),
      nextSpawnAt: performance.now() + 600,
      shakeUntil: 0,
      glowUntil: 0,
      raf: 0,
      running: true,
      paused: true,
      hasStarted: false,
      gameOver: false,
      scoreSaved: false,
      emojiYOffset: 3
    };

    function resize() {
      const rect = page.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      state.cols = Math.max(10, Math.floor(rect.width / state.cell));
      state.rows = Math.max(10, Math.floor(rect.height / state.cell));

      const pageRect = page.getBoundingClientRect();
      const obstacleRect = obstacleEl.getBoundingClientRect();
      const navRect = document.querySelector('.top-nav, #main-nav')?.getBoundingClientRect();
      const bottomRect = bottomBarEl?.getBoundingClientRect();
      state.obstacle = {
        x1: Math.max(0, Math.ceil((obstacleRect.left - pageRect.left) / state.cell - 0.5)),
        y1: Math.max(0, Math.ceil((obstacleRect.top - pageRect.top) / state.cell - 0.5)),
        x2: Math.min(state.cols - 1, Math.floor((obstacleRect.right - pageRect.left) / state.cell - 0.5)),
        y2: Math.min(state.rows - 1, Math.floor((obstacleRect.bottom - pageRect.top) / state.cell - 0.5))
      };
      state.topSafeRows = navRect
        ? Math.max(1, Math.ceil((navRect.bottom - pageRect.top) / state.cell))
        : Math.ceil(56 / state.cell);
      state.bottomSafeRows = bottomRect
        ? Math.max(1, Math.ceil((pageRect.bottom - bottomRect.top) / state.cell))
        : 2;

      if (!state.snake.length || state.snake.some(isObstacle)) reset();
      else pruneAndSpawn(performance.now(), true);
    }

    function getScores() {
      try {
        const parsed = JSON.parse(localStorage.getItem(scoresKey) || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    function setScores(scores) {
      localStorage.setItem(scoresKey, JSON.stringify(scores.slice(0, 8)));
    }

    function renderScores() {
      if (!scoresEl) return;
      const scores = getScores();
      scoresEl.innerHTML = '';
      if (!scores.length) {
        const empty = document.createElement('li');
        empty.textContent = 'No scores yet';
        scoresEl.appendChild(empty);
        return;
      }
      scores.forEach(entry => {
        const li = document.createElement('li');
        li.textContent = `${entry.name.toUpperCase()} - ${entry.score}`;
        scoresEl.appendChild(li);
      });
    }

    function saveScore() {
      if (state.scoreSaved || !nameInputEl) return;
      const name = (nameInputEl.value || '').trim();
      const cleanName = name.replace(/[^\w -]/g, '').slice(0, 18).trim();
      if (!cleanName) {
        state.scoreSaved = true;
        return;
      }
      const scores = getScores();
      scores.push({ name: cleanName, score: state.score });
      scores.sort((a, b) => b.score - a.score);
      setScores(scores);
      state.scoreSaved = true;
      renderScores();
    }

    function showGameOver() {
      state.paused = true;
      state.gameOver = true;
      state.scoreSaved = false;
      renderScores();
      if (gameOverEl) gameOverEl.classList.add('visible');
      if (nameInputEl) {
        nameInputEl.value = '';
        requestAnimationFrame(() => nameInputEl.focus());
      }
    }

    function playPickupSound(emoji) {
      const sound = pickupSounds[emoji];
      if (!sound) return;
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }

    function isObstacle(cell) {
      return cell.x >= state.obstacle.x1 &&
        cell.x <= state.obstacle.x2 &&
        cell.y >= state.obstacle.y1 &&
        cell.y <= state.obstacle.y2;
    }

    function wrapped(cell) {
      return {
        x: (cell.x + state.cols) % state.cols,
        y: (cell.y + state.rows) % state.rows
      };
    }

    function segment(cell, emoji = '🌿') {
      const id = state.nextSegmentId;
      state.nextSegmentId += 1;
      state.lastAddedId = id;
      return { id, x: cell.x, y: cell.y, emoji };
    }

    function isSpawnBlocked(cell) {
      return isObstacle(cell) ||
        cell.y < state.topSafeRows ||
        cell.y >= state.rows - state.bottomSafeRows;
    }

    function findStart() {
      const candidates = [
        { x: 3, y: Math.floor(state.rows / 2) },
        { x: state.cols - 4, y: Math.floor(state.rows / 2) },
        { x: Math.floor(state.cols / 2), y: 3 },
        { x: Math.floor(state.cols / 2), y: state.rows - 4 }
      ];
      return candidates.find(cell => !isObstacle(cell)) || { x: 1, y: 1 };
    }

    function reset() {
      state.gameOver = false;
      state.scoreSaved = false;
      state.score = 0;
      state.nextSegmentId = 1;
      state.lastAddedId = 0;
      state.dir = { x: 1, y: 0 };
      state.queuedDir = { x: 1, y: 0 };
      const start = findStart();
      state.snake = [
        segment(start),
        segment(wrapped({ x: start.x - 1, y: start.y })),
        segment(wrapped({ x: start.x - 2, y: start.y }))
      ].filter(cell => !isObstacle(cell));
      state.lastAddedId = state.snake[state.snake.length - 1]?.id || 0;
      state.previous = state.snake.map(cell => ({ ...cell }));
      state.items = [];
      state.particles = [];
      state.shakeUntil = 0;
      state.glowUntil = 0;
      state.nextSpawnAt = performance.now() + 600;
      scoreEl.textContent = `GROWTH: ${state.score}`;
      spawnItem(performance.now(), 'growth');
      spawnItem(performance.now(), 'negative');
    }

    function randomItemTtl() {
      return state.itemTtlMin + Math.random() * (state.itemTtlMax - state.itemTtlMin);
    }

    function spawnItem(now = performance.now(), preferredKind = null) {
      if (state.items.length >= state.maxItems) return;
      const occupied = new Set([...state.snake.map(keyOf), ...state.items.map(keyOf)]);
      const free = [];
      for (let y = 0; y < state.rows; y += 1) {
        for (let x = 0; x < state.cols; x += 1) {
          const cell = { x, y };
          if (!isSpawnBlocked(cell) && !occupied.has(keyOf(cell))) free.push(cell);
        }
      }
      if (!free.length) return;
      const cell = free[Math.floor(Math.random() * free.length)];
      const pool = preferredKind === 'growth'
        ? growthItems
        : preferredKind === 'negative'
          ? negativeItems
          : Math.random() < 0.62
            ? growthItems
            : negativeItems;
      state.items.push({
        ...cell,
        emoji: pool[Math.floor(Math.random() * pool.length)],
        expiresAt: now + randomItemTtl()
      });
    }

    function addSparkles(cell, now) {
      for (let i = 0; i < 7; i += 1) {
        state.particles.push({
          x: (cell.x + 0.5) * state.cell + (Math.random() - 0.5) * 12,
          y: (cell.y + 0.5) * state.cell + state.emojiYOffset + (Math.random() - 0.5) * 8,
          drift: (Math.random() - 0.5) * 18,
          rise: 18 + Math.random() * 22,
          emoji: '✨',
          start: now,
          duration: 620 + Math.random() * 360
        });
      }
    }

    function pruneAndSpawn(now, force = false) {
      state.items = state.items.filter(item => item.expiresAt > now);
      if (force) {
        if (!state.items.some(item => growthItems.includes(item.emoji))) spawnItem(now, 'growth');
        if (!state.items.some(item => negativeItems.includes(item.emoji))) spawnItem(now, 'negative');
      }
      if (now < state.nextSpawnAt) return;
      spawnItem(now);
      if (!state.items.some(item => growthItems.includes(item.emoji))) spawnItem(now, 'growth');
      state.nextSpawnAt = now + state.spawnEvery;
    }

    function canTurn(next) {
      return !(next.x === -state.dir.x && next.y === -state.dir.y);
    }

    function onKeyDown(event) {
      if (event.target === nameInputEl) {
        if (event.key === 'Enter') saveScore();
        return;
      }
      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        if (state.gameOver) return;
        state.hasStarted = true;
        state.paused = !state.paused;
        if (hintEl) hintEl.classList.add('hidden');
        state.lastStep = performance.now();
        state.nextSpawnAt = performance.now() + 300;
        return;
      }
      const next = dirs[event.code] || dirs[event.key];
      if (state.gameOver) return;
      if (!next || !canTurn(next)) return;
      event.preventDefault();
      state.queuedDir = next;
    }

    function step(now) {
      pruneAndSpawn(now);
      state.previous = state.snake.map(cell => ({ ...cell }));
      state.dir = state.queuedDir;
      const head = state.snake[0];
      const nextHead = wrapped({ x: head.x + state.dir.x, y: head.y + state.dir.y });

      if (isObstacle(nextHead) || state.snake.some(cell => same(cell, nextHead))) {
        showGameOver();
        state.lastStep = now;
        return;
      }

      const itemIndex = state.items.findIndex(item => same(nextHead, item));
      const ate = itemIndex >= 0 ? state.items[itemIndex] : null;
      if (ate) state.items.splice(itemIndex, 1);
      if (ate) playPickupSound(ate.emoji);

      if (ate && growthItems.includes(ate.emoji)) {
        state.snake.unshift(segment(nextHead, growthEmojiByItem[ate.emoji] || '🌿'));
        addSparkles(nextHead, now);
        state.score += 1;
        scoreEl.textContent = `GROWTH: ${state.score}`;
      } else {
        for (let i = state.snake.length - 1; i > 0; i -= 1) {
          state.snake[i].x = state.snake[i - 1].x;
          state.snake[i].y = state.snake[i - 1].y;
        }
        state.snake[0].x = nextHead.x;
        state.snake[0].y = nextHead.y;
        if (ate && ate.emoji === '🔥') {
          state.shakeUntil = now + 280;
          state.snake.pop();
          if (!state.snake.some(cell => cell.id === state.lastAddedId)) {
            state.lastAddedId = Math.max(...state.snake.map(cell => cell.id));
          }
          state.score -= 1;
          scoreEl.textContent = `GROWTH: ${state.score}`;
          if (state.snake.length < 3) {
            showGameOver();
          } else {
            pruneAndSpawn(now, true);
          }
        } else if (ate && ate.emoji === '☢') {
          const newest = state.snake.find(cell => cell.id === state.lastAddedId) || state.snake[state.snake.length - 1];
          newest.emoji = '🥀';
          state.glowUntil = now + 980;
          state.score -= 1;
          scoreEl.textContent = `GROWTH: ${state.score}`;
          pruneAndSpawn(now, true);
        }
      }
      state.lastStep = now;
    }

    function draw(now) {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(73, 220, 164, 0.13)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= state.cols; x += 1) {
        const px = x * state.cell + 0.5;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
        ctx.stroke();
      }
      for (let y = 0; y <= state.rows; y += 1) {
        const py = y * state.cell + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
        ctx.stroke();
      }

      state.items.forEach(item => {
        ctx.font = `${Math.round(state.cell * 0.72)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = Math.max(0.25, Math.min(1, (item.expiresAt - now) / 1200));
        ctx.fillText(item.emoji, (item.x + 0.5) * state.cell, (item.y + 0.5) * state.cell + state.emojiYOffset);
        ctx.globalAlpha = 1;
      });

      const shakeActive = now < state.shakeUntil;
      const glowActive = now < state.glowUntil;
      const shakeX = shakeActive ? (Math.random() - 0.5) * 4 : 0;
      const shakeY = shakeActive ? (Math.random() - 0.5) * 3 : 0;

      ctx.font = `${Math.round(state.cell * 0.76)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (glowActive) {
        const remaining = Math.max(0, (state.glowUntil - now) / 980);
        const flicker = 0.55 + Math.random() * 0.45;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        state.snake.forEach(cell => {
          const cx = (cell.x + 0.5) * state.cell + shakeX;
          const cy = (cell.y + 0.5) * state.cell + state.emojiYOffset + shakeY;
          const gradient = ctx.createRadialGradient(cx, cy, 2, cx, cy, state.cell * 0.78);
          gradient.addColorStop(0, `rgba(73, 255, 164, ${0.62 * flicker * remaining})`);
          gradient.addColorStop(0.55, `rgba(73, 220, 164, ${0.3 * flicker * remaining})`);
          gradient.addColorStop(1, 'rgba(73, 220, 164, 0)');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(cx, cy, state.cell * 0.82, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
        ctx.shadowColor = `rgba(73, 255, 164, ${0.95 * flicker})`;
        ctx.shadowBlur = 18 + Math.random() * 16;
      }
      state.snake.forEach(cell => {
        ctx.fillText(cell.emoji, (cell.x + 0.5) * state.cell + shakeX, (cell.y + 0.5) * state.cell + state.emojiYOffset + shakeY);
      });
      ctx.shadowBlur = 0;

      state.particles = state.particles.filter(particle => now - particle.start < particle.duration);
      ctx.font = `${Math.round(state.cell * 1.5)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.shadowColor = 'rgba(255, 255, 255, 0.82)';
      ctx.shadowBlur = 8;
      state.particles.forEach(particle => {
        const age = now - particle.start;
        const t = age / particle.duration;
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.fillText(
          particle.emoji,
          particle.x + particle.drift * t,
          particle.y - particle.rise * t
        );
      });
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    function loop(now) {
      if (!state.running) return;
      if (!state.paused) {
        pruneAndSpawn(now);
        while (now - state.lastStep >= state.stepMs) step(now);
      }
      draw(now);
      state.raf = requestAnimationFrame(loop);
    }

    function destroy() {
      state.running = false;
      cancelAnimationFrame(state.raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', resize);
      if (playAgainEl) playAgainEl.removeEventListener('click', playAgain);
      instances.delete(page);
    }

    function playAgain() {
      saveScore();
      if (gameOverEl) gameOverEl.classList.remove('visible');
      reset();
      state.hasStarted = true;
      state.paused = false;
      if (hintEl) hintEl.classList.add('hidden');
      state.lastStep = performance.now();
      state.nextSpawnAt = performance.now() + 300;
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', resize);
    if (playAgainEl) playAgainEl.addEventListener('click', playAgain);
    resize();
    renderScores();
    state.raf = requestAnimationFrame(loop);

    return { destroy };
  }

  function init(root = document) {
    root.querySelectorAll('#page-contact').forEach(page => {
      if (!instances.has(page)) instances.set(page, makeContactSnake(page));
    });
  }

  function destroy(root = document) {
    root.querySelectorAll('#page-contact').forEach(page => {
      const instance = instances.get(page);
      if (instance) instance.destroy();
    });
  }

  window.SpoliaContactSnake = { init, destroy };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(document), { once: true });
  } else {
    init(document);
  }
})();
