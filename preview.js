(function () {
  "use strict";

  const config = window.SPRITE_CONFIG;
  if (!config) throw new Error("sprite-config.js must be loaded before preview.js");

  const $ = selector => document.querySelector(selector);
  const directionById = new Map(config.directions.map(direction => [direction.id, direction]));
  const directionByVector = new Map(config.directions.map(direction => [`${direction.dx},${direction.dy}`, direction]));
  const modeById = new Map(config.modes.map(mode => [mode.id, mode]));
  const state = { frames: [], available: [], assetSet: config.defaultAssetSet, index: 0, timer: null, loadToken: 0 };
  const fieldState = { unit: "", assets: new Map(), keys: new Set(), pointer: null, x: 0, y: 0, lastTime: 0, frameElapsed: 0, frameIndex: 1, direction: config.defaultDirection, shownSrc: "", loadToken: 0 };

  function safePart(value, fallback) {
    const cleaned = String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
    return cleaned || fallback;
  }

  function currentSet() {
    return {
      unit: safePart($("#unit").value, config.defaultUnit),
      direction: directionById.has($("#direction").value) ? $("#direction").value : config.defaultDirection
    };
  }

  function framePath(unit, direction, frame, assetSet = config.defaultAssetSet) {
    return `${config.basePath}/${unit}/${config.assetSets[assetSet]}/${direction}/${frame}.png`;
  }

  function relativeFramePath(direction, frame, assetSet = config.defaultAssetSet) {
    return `${config.assetSets[assetSet]}/${direction}/${frame}.png`;
  }

  function setImageSize(image, scale) {
    if (!image.naturalWidth) return;
    image.style.width = `${image.naturalWidth * scale}px`;
    image.style.height = `${image.naturalHeight * scale}px`;
  }

  function stop() {
    clearInterval(state.timer);
    state.timer = null;
    $("#play").disabled = false;
    $("#stop").disabled = true;
  }

  function selectedFrameNames() {
    if ($("#mode").value === "custom") return [$("#customA").value, $("#customB").value];
    return modeById.get($("#mode").value).frames;
  }

  function sequence() {
    const availableByName = new Map(state.available.map(frame => [frame.name, frame]));
    return selectedFrameNames().map(name => availableByName.get(name)).filter(Boolean);
  }

  function selectedMissingNames() {
    const availableNames = new Set(state.available.map(frame => frame.name));
    return selectedFrameNames().filter(name => !availableNames.has(name));
  }

  function show(index) {
    const frames = sequence();
    const missing = selectedMissingNames();
    if (!frames.length) {
      $("#animSprite").removeAttribute("src");
      $("#animSprite").hidden = true;
      $("#status").textContent = `Missing: ${missing.map(name => relativeFramePath(currentSet().direction, name, state.assetSet)).join(", ")}`;
      $("#status").classList.add("error");
      return;
    }

    state.index = index % frames.length;
    const frame = frames[state.index];
    $("#animSprite").hidden = false;
    $("#animSprite").src = frame.src;
    const missingLabel = missing.length ? ` | Missing: ${missing.map(name => relativeFramePath(currentSet().direction, name, state.assetSet)).join(", ")}` : "";
    $("#status").textContent = `現在: ${frame.name} | ${frame.src}${missingLabel}`;
    $("#status").classList.toggle("error", missing.length > 0);
  }

  function play() {
    if (state.timer !== null || !sequence().length) return;
    state.timer = setInterval(() => show(state.index + 1), Number($("#speed").value));
    $("#play").disabled = true;
    $("#stop").disabled = false;
  }

  function resetAnimation(resume) {
    stop();
    state.index = 0;
    show(0);
    if (resume && sequence().length) play();
  }

  function fillCustomSelectors() {
    const oldA = $("#customA").value;
    const oldB = $("#customB").value;
    $("#customA").replaceChildren();
    $("#customB").replaceChildren();
    config.frames.forEach((frame, index) => {
      $("#customA").add(new Option(frame, frame));
      $("#customB").add(new Option(frame, frame));
      if (!oldA && index === 0) $("#customA").value = frame;
      if (!oldB && index === 1) $("#customB").value = frame;
    });
    if (config.frames.includes(oldA)) $("#customA").value = oldA;
    if (config.frames.includes(oldB)) $("#customB").value = oldB;
  }

  function addCompareFrame(frame, token, settled) {
    const figure = document.createElement("figure");
    const caption = document.createElement("figcaption");
    const image = new Image();
    caption.textContent = frame.label || frame.name;
    image.className = "sprite still";
    image.alt = frame.name;
    figure.append(caption, image);
    $("#compare").append(figure);

    image.onload = () => {
      if (token !== state.loadToken) return;
      frame.available = true;
      setImageSize(image, Number($("#compareScale").value));
      settled();
    };
    image.onerror = () => {
      if (token !== state.loadToken) return;
      frame.available = false;
      image.remove();
      const missing = document.createElement("div");
      missing.className = "missing";
      missing.textContent = `Missing:\n${relativeFramePath(frame.direction, frame.name, frame.assetSet)}`;
      figure.append(missing);
      settled();
    };
    image.src = frame.src;
  }

  function finishSetLoad() {
    state.available = state.frames.filter(frame => frame.available);
    fillCustomSelectors();
    resetAnimation(false);
  }

  function vectorDirection(dx, dy) {
    return directionByVector.get(`${Math.sign(dx)},${Math.sign(dy)}`) || null;
  }

  function fieldVector() {
    if (fieldState.pointer) return fieldState.pointer;
    const vectors = {
      arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
      arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1]
    };
    let dx = 0;
    let dy = 0;
    fieldState.keys.forEach(key => {
      const vector = vectors[key];
      if (vector) { dx += vector[0]; dy += vector[1]; }
    });
    return { dx: Math.sign(dx), dy: Math.sign(dy) };
  }

  function fieldAsset(direction, frame) {
    const src = fieldState.assets.get(`${direction}/${frame}`);
    return src ? { src, frame, direction } : null;
  }

  function availableWalkFrame(direction, index) {
    const preferred = index === 0 ? "walk_01" : "walk_02";
    const fallback = index === 0 ? "walk_02" : "walk_01";
    return fieldAsset(direction, preferred) || fieldAsset(direction, fallback);
  }

  function renderFieldPosition() {
    $("#fieldSprite").style.left = `${fieldState.x}px`;
    $("#fieldSprite").style.top = `${fieldState.y}px`;
  }

  function resetFieldPosition() {
    const field = $("#field");
    fieldState.x = field.clientWidth / 2;
    fieldState.y = field.clientHeight / 2;
    renderFieldPosition();
  }

  function showFieldFrame(moving, kneeling) {
    const wanted = kneeling ? "kneel_left_01" : (moving && fieldState.frameIndex === 0 ? "walk_01" : "walk_02");
    const asset = kneeling ? fieldAsset(fieldState.direction, wanted) : availableWalkFrame(fieldState.direction, moving ? fieldState.frameIndex : 1);
    if (!asset) {
      $("#fieldSprite").hidden = true;
      $("#fieldStatus").textContent = `Missing: ${relativeFramePath(fieldState.direction, wanted)}`;
      $("#fieldStatus").classList.add("error");
      return false;
    }

    const sprite = $("#fieldSprite");
    sprite.hidden = false;
    sprite.style.transform = "translate(-50%, -50%)";
    if (fieldState.shownSrc !== asset.src) {
      fieldState.shownSrc = asset.src;
      sprite.src = asset.src;
    }
    const stateLabel = kneeling ? "膝立ち" : moving ? "移動中" : "停止";
    $("#fieldStatus").textContent = `${stateLabel}: ${asset.direction}/${asset.frame}.png`;
    $("#fieldStatus").classList.remove("error");
    return true;
  }

  function fieldTick(time) {
    if (!fieldState.lastTime) fieldState.lastTime = time;
    const dt = Math.min(.05, (time - fieldState.lastTime) / 1000);
    fieldState.lastTime = time;
    const vector = fieldVector();
    const moving = vector.dx !== 0 || vector.dy !== 0;
    if (moving) {
      const direction = vectorDirection(vector.dx, vector.dy);
      if (direction && direction.id !== fieldState.direction) {
        fieldState.direction = direction.id;
        fieldState.frameIndex = 0;
        fieldState.frameElapsed = 0;
      }
    }

    const kneeling = fieldState.keys.has("q");
    if (kneeling) {
      fieldState.frameIndex = 0;
      fieldState.frameElapsed = 0;
      showFieldFrame(false, true);
    } else if (moving) {
      if (showFieldFrame(true, false)) {
        const length = Math.hypot(vector.dx, vector.dy);
        const speed = Number($("#fieldMoveSpeed").value);
        fieldState.x += vector.dx / length * speed * dt;
        fieldState.y += vector.dy / length * speed * dt;
        const field = $("#field");
        const half = Number($("#fieldSpriteSize").value) / 2;
        fieldState.x = Math.max(half, Math.min(field.clientWidth - half, fieldState.x));
        fieldState.y = Math.max(half, Math.min(field.clientHeight - half, fieldState.y));
        renderFieldPosition();
        fieldState.frameElapsed += dt * 1000;
        if (fieldState.frameElapsed >= Number($("#fieldFrameMs").value)) {
          fieldState.frameElapsed %= Number($("#fieldFrameMs").value);
          fieldState.frameIndex = 1 - fieldState.frameIndex;
          showFieldFrame(true, false);
        }
      }
    } else {
      fieldState.frameIndex = 1;
      fieldState.frameElapsed = 0;
      showFieldFrame(false, false);
    }
    requestAnimationFrame(fieldTick);
  }

  function summarizeFieldAssets() {
    const missing = [];
    const complete = [];
    config.directions.forEach(direction => {
      const directionMissing = config.frames.filter(frame => !fieldAsset(direction.id, frame));
      if (!directionMissing.length) complete.push(direction.id);
      directionMissing.forEach(frame => missing.push(relativeFramePath(direction.id, frame)));
    });
    const parts = [`Complete: ${complete.join(", ") || "none"}`];
    if (missing.length) parts.push(`Missing: ${missing.join(", ")}`);
    $("#fieldAssets").textContent = parts.join(" | ");
  }

  function finishFieldAssetLoad() {
    summarizeFieldAssets();
    const requested = currentSet().direction;
    const firstAvailable = config.directions.find(direction => availableWalkFrame(direction.id, 1));
    fieldState.direction = availableWalkFrame(requested, 1) ? requested : (firstAvailable ? firstAvailable.id : config.defaultDirection);
    fieldState.frameIndex = 1;
    showFieldFrame(false, false);
  }

  function loadFieldAssets(unit) {
    fieldState.unit = unit;
    fieldState.assets.clear();
    fieldState.shownSrc = "";
    const token = ++fieldState.loadToken;
    let settled = 0;
    const total = config.directions.length * config.frames.length;
    $("#fieldAssets").textContent = `${unit}: 8方向の画像を確認しています…`;

    config.directions.forEach(direction => config.frames.forEach(frame => {
      const key = `${direction.id}/${frame}`;
      const src = framePath(unit, direction.id, frame, config.defaultAssetSet);
      const probe = new Image();
      fieldState.assets.set(key, null);
      const done = available => {
        if (token !== fieldState.loadToken) return;
        fieldState.assets.set(key, available ? src : null);
        settled += 1;
        if (settled === total) finishFieldAssetLoad();
      };
      probe.onload = () => done(true);
      probe.onerror = () => done(false);
      probe.src = src;
    }));
  }

  function buildDirectionControls() {
    config.directions.forEach(direction => {
      $("#direction").add(new Option(`${direction.label} (${direction.id})`, direction.id));
    });
    config.modes.forEach(mode => $("#mode").add(new Option(mode.label, mode.id)));

    const arrows = [["↖", "↑", "↗"], ["←", "■", "→"], ["↙", "↓", "↘"]];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = arrows[dy + 1][dx + 1];
        if (dx === 0 && dy === 0) {
          button.className = "stop-pad";
          button.dataset.stop = "";
          button.title = "停止";
        } else {
          const direction = vectorDirection(dx, dy);
          button.dataset.dx = String(dx);
          button.dataset.dy = String(dy);
          button.title = `${direction.label} (${direction.id})`;
        }
        $("#dpad").append(button);
      }
    }
  }

  function setupFieldControls() {
    resetFieldPosition();
    $("#fieldSprite").style.width = `${$("#fieldSpriteSize").value}px`;
    const movementKeys = new Set(["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d", "q"]);
    document.addEventListener("keydown", event => {
      const key = event.key.toLowerCase();
      if (!movementKeys.has(key) || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
      event.preventDefault();
      fieldState.keys.add(key);
    });
    document.addEventListener("keyup", event => fieldState.keys.delete(event.key.toLowerCase()));
    window.addEventListener("blur", () => { fieldState.keys.clear(); fieldState.pointer = null; });
    document.querySelectorAll("#dpad button[data-dx]").forEach(button => {
      button.addEventListener("pointerdown", event => {
        event.preventDefault();
        fieldState.pointer = { dx: Number(button.dataset.dx), dy: Number(button.dataset.dy) };
      });
    });
    window.addEventListener("pointerup", () => { fieldState.pointer = null; });
    window.addEventListener("pointercancel", () => { fieldState.pointer = null; });
    $("#dpad [data-stop]").onclick = () => { fieldState.keys.clear(); fieldState.pointer = null; };
    $("#fieldReset").onclick = resetFieldPosition;
    $("#fieldGround").onchange = event => { $("#field").dataset.ground = event.target.value; };
    $("#fieldSpriteSize").onchange = event => { $("#fieldSprite").style.width = `${event.target.value}px`; resetFieldPosition(); };
    window.addEventListener("resize", resetFieldPosition);
    requestAnimationFrame(fieldTick);
  }

  function updateUrl(unit, direction) {
    const url = new URL(location.href);
    url.searchParams.set("unit", unit);
    url.searchParams.set("direction", direction);
    try { history.replaceState(null, "", url); }
    catch (error) { console.debug("URL state is unavailable for this local preview.", error); }
  }

  function setCandidateOptions(enabled) {
    Array.from($("#assetView").options).forEach(option => {
      if (option.value !== "accepted") option.disabled = !enabled;
    });
  }

  function renderSet(unit, direction, token, candidateExists) {
    if (token !== state.loadToken) return;
    setCandidateOptions(candidateExists);
    if (!candidateExists && $("#assetView").value !== "accepted") $("#assetView").value = "accepted";
    const view = $("#assetView").value;
    state.assetSet = view === "candidate" ? "candidate" : config.defaultAssetSet;
    state.frames = config.frames.map(name => ({
      name, direction, assetSet: state.assetSet,
      src: framePath(unit, direction, name, state.assetSet), available: false
    }));
    const compareFrames = view === "compare"
      ? config.frames.flatMap(name => [
          { name, label: `${name} / accepted`, direction, assetSet: "accepted", src: framePath(unit, direction, name, "accepted"), available: false },
          { name, label: `${name} / candidate`, direction, assetSet: "candidate", src: framePath(unit, direction, name, "candidate"), available: false }
        ])
      : state.frames;
    if (view === "compare") state.frames = compareFrames.filter(frame => frame.assetSet === "accepted");
    state.available = [];
    state.index = 0;
    $("#compare").replaceChildren();
    const shownPath = view === "compare" ? "accepted ↔ candidate" : config.assetSets[state.assetSet];
    $("#basePath").textContent = `対象: ${config.basePath}/${unit}/${shownPath}/${direction}/`;
    $("#status").textContent = "画像を確認しています…";
    $("#status").classList.remove("error");
    let settled = 0;
    const onSettled = () => {
      settled += 1;
      if (settled === compareFrames.length) finishSetLoad();
    };
    compareFrames.forEach(frame => addCompareFrame(frame, token, onSettled));
  }

  function loadSet() {
    stop();
    const { unit, direction } = currentSet();
    $("#unit").value = unit;
    const token = ++state.loadToken;
    setCandidateOptions(false);
    $("#compare").replaceChildren();
    $("#basePath").textContent = "candidate の有無を確認しています…";
    let settled = 0;
    let candidateExists = false;
    config.frames.forEach(name => {
      const probe = new Image();
      const done = available => {
        if (token !== state.loadToken) return;
        candidateExists ||= available;
        settled += 1;
        if (settled === config.frames.length) renderSet(unit, direction, token, candidateExists);
      };
      probe.onload = () => done(true);
      probe.onerror = () => done(false);
      probe.src = framePath(unit, direction, name, "candidate");
    });
    loadFieldAssets(unit);
    updateUrl(unit, direction);
  }

  function bindControls() {
    $("#loadSet").onclick = loadSet;
    $("#unit").onkeydown = event => { if (event.key === "Enter") loadSet(); };
    $("#direction").onchange = loadSet;
    $("#assetView").onchange = loadSet;
    $("#compareScale").onchange = () => document.querySelectorAll(".still").forEach(image => setImageSize(image, Number($("#compareScale").value)));
    $("#animScale").onchange = () => setImageSize($("#animSprite"), Number($("#animScale").value));
    $("#compareBg").onchange = event => { $("#compareViewer").dataset.bg = event.target.value; };
    $("#animBg").onchange = event => { $("#animViewer").dataset.bg = event.target.value; };
    $("#play").onclick = play;
    $("#stop").onclick = stop;
    $("#speed").onchange = () => { if (state.timer !== null) { stop(); play(); } };
    $("#mode").onchange = () => { const running = state.timer !== null; $("#customControls").hidden = $("#mode").value !== "custom"; resetAnimation(running); };
    $("#customA").onchange = () => resetAnimation(state.timer !== null);
    $("#customB").onchange = () => resetAnimation(state.timer !== null);
    $("#animSprite").onload = () => setImageSize($("#animSprite"), Number($("#animScale").value));
  }

  buildDirectionControls();
  fillCustomSelectors();
  const params = new URLSearchParams(location.search);
  $("#unit").value = safePart(params.get("unit"), config.defaultUnit);
  const requestedDirection = params.get("direction");
  $("#direction").value = directionById.has(requestedDirection) ? requestedDirection : config.defaultDirection;
  bindControls();
  setupFieldControls();
  loadSet();
}());
