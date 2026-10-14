/* =====================================================
   A MASMORRA SOMBRIA — script.js (JavaScript puro)
   -----------------------------------------------------
   1. Estado do jogo + inventário
   2. Navegação com TRAVA (não pula salas)
   3. Sala 1: pistas clicáveis → código numérico
   4. Sala 2: charada com resposta DIGITADA
   5. Sala 3: chave escondida → inventário
   6. Sala 4: porta final só abre COM a chave
   ===================================================== */

// ---------- 1. ESTADO DO JOGO ----------
const estado = {
  salaAtual: 0,              // 0=início | 1-4=salas | 5=vitória
  codigoSecreto: "472",
  pistasEncontradas: {}, // quais pistas da Sala 1 já foram vistas (sem revelar dígitos)
  charadaRevelada: false,
  charadaResolvida: false,
  temChave: false,
  itemSelecionado: null,     // id do item clicado no inventário
  salasLiberadas: [true, false, false, false],
  segundos: 0,
  timerId: null,
  tentativasCodigo: 0,
  tentativasCharada: 0,
  esconderijoChave: "esqueleto" // Sala 3: onde está a chave de ferro
};

// Inventário: lista de { id, nome, icone }
const inventario = [];

// ---------- ELEMENTOS ----------
const ordemTelas = ["tela-inicio", "sala-1", "sala-2", "sala-3", "sala-4", "tela-vitoria"];
const hudTempo = document.getElementById("hud-tempo");
const hudSala = document.getElementById("hud-sala");
const modal = document.getElementById("modal");
const modalTitulo = document.getElementById("modal-titulo");
const modalTexto = document.getElementById("modal-texto");
const toast = document.getElementById("toast");
const btnVoltar = document.getElementById("btn-voltar");
const btnAvancar = document.getElementById("btn-avancar");

// ---------- SONS SIMPLES (WebAudio, sem arquivos) ----------
function beep(tipo) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = tipo === "ok" ? 660 : 180;
    o.type = tipo === "ok" ? "sine" : "sawtooth";
    g.gain.value = 0.08;
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, 220);
  } catch (e) { /* sem áudio, segue o jogo */ }
}

// ---------- MODAL DE INSPEÇÃO ----------
function mostrarModal(titulo, texto) {
  modalTitulo.textContent = titulo;
  modalTexto.innerHTML = texto;
  modal.classList.remove("escondido");
}
function fecharModal() { modal.classList.add("escondido"); }
document.getElementById("modal-fechar").onclick = fecharModal;
document.getElementById("modal-ok").onclick = fecharModal;
modal.onclick = (e) => { if (e.target === modal) fecharModal(); };

// ---------- TOAST: feedback rápido de acerto/erro ----------
let toastTimer = null;
function mostrarToast(texto, tipo) {
  toast.textContent = texto;
  toast.className = "toast " + tipo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("escondido"), 2600);
}

// ---------- TELAS / HUD / MAPA ----------
function mostrarTela(id) {
  document.querySelectorAll(".tela").forEach((t) => t.classList.remove("ativa"));
  document.getElementById(id).classList.add("ativa");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function atualizarMapa() {
  document.querySelectorAll(".etapa").forEach((el) => {
    const n = Number(el.dataset.sala);
    el.classList.remove("ativa", "liberada");
    if (n === estado.salaAtual) el.classList.add("ativa");
    else if (estado.salasLiberadas[n - 1]) el.classList.add("liberada");
  });
}
function atualizarHud() {
  const nomes = ["Pronto para entrar?", "Sala 1 de 4 — Código", "Sala 2 de 4 — Enigma", "Sala 3 de 4 — Chave", "Sala 4 de 4 — Fuga", "Livre! 🎉"];
  hudSala.textContent = nomes[estado.salaAtual] || "";
}
function atualizarBotoesNav() {
  btnVoltar.style.visibility = estado.salaAtual <= 1 ? "hidden" : "visible";
  const prox = estado.salaAtual + 1;
  const podeAvancar = prox >= 1 && prox <= 4 && estado.salasLiberadas[prox - 1];
  btnAvancar.style.visibility = podeAvancar ? "visible" : "hidden";
}

// ---------- CRONÔMETRO ----------
function formatarTempo(s) {
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}
function iniciarTimer() {
  if (estado.timerId) return;
  estado.timerId = setInterval(() => {
    estado.segundos++;
    hudTempo.textContent = "⏳ " + formatarTempo(estado.segundos);
  }, 1000);
}

// ---------- 2. NAVEGAÇÃO COM TRAVA ----------
function irParaSala(n) {
  if (n >= 1 && n <= 4 && !estado.salasLiberadas[n - 1]) {
    mostrarModal("⛓️ Sala trancada", "Complete o desafio anterior para libertar esta passagem!");
    mostrarToast("⛓️ Sala trancada! Complete a etapa atual.", "erro");
    beep("erro");
    return;
  }
  estado.salaAtual = n;
  mostrarTela(ordemTelas[n]);
  atualizarMapa(); atualizarHud(); atualizarBotoesNav();
}

// ---------- INVENTÁRIO (adicionar / selecionar / renderizar) ----------
function adicionarItem(id, nome, icone) {
  if (inventario.find((i) => i.id === id)) return;
  inventario.push({ id, nome, icone });
  renderInventario();
}
function renderInventario() {
  const area = document.getElementById("inventario-slots");
  const dica = document.getElementById("inv-dica");
  area.innerHTML = "";
  if (inventario.length === 0) {
    area.innerHTML = '<span class="slot vazio">— vazio —</span>';
    dica.textContent = "Clique num item para selecionar";
    return;
  }
  inventario.forEach((item) => {
    const s = document.createElement("button");
    s.className = "slot item" + (estado.itemSelecionado === item.id ? " selecionado" : "");
    s.textContent = `${item.icone} ${item.nome}`;
    s.title = "Clique para selecionar/usar";
    s.onclick = () => selecionarItem(item.id);
    area.appendChild(s);
  });
  const sel = inventario.find((i) => i.id === estado.itemSelecionado);
  dica.textContent = sel ? `Selecionado: ${sel.icone} ${sel.nome} — clique na porta para usar` : "Clique num item para selecionar";
}
function selecionarItem(id) {
  estado.itemSelecionado = (estado.itemSelecionado === id) ? null : id;
  renderInventario();
  const item = inventario.find((i) => i.id === id);
  if (estado.itemSelecionado) mostrarToast(`🗝️ ${item.nome} selecionada! Vá até a porta.`, "sucesso");
}

// =====================================================
// 3. SALA 1 — O CÓDIGO SECRETO (point and click)
// As pistas contam quantos locais foram investigados,
// mas os DÍGITOS NÃO são mostrados fora do modal e a
// ORDEM dos números nunca é revelada (o jogador testa).
// Código final: 472
// =====================================================
const pistasSala1 = {
  pergaminho: { titulo: "📜 Pergaminho antigo", texto: "Manuscrito trêmulo:<br><em>“Quatro cavaleiros guardam a porta...”</em><br><br>Você encontrou o número <strong>4</strong>! Anote-o... mas em que posição do código ele entra? 🤔", pista: "pergaminho" },
  inscricao:  { titulo: "🧱 Inscrição na parede", texto: "Gravado na pedra:<br><em>“Os 7 selos aprisionam os fracos.”</em><br><br>Você encontrou o número <strong>7</strong>! Anote-o... mas em que posição do código ele entra? 🤔", pista: "inscricao" },
  "tocha-sala": { titulo: "🔥 Tocha", texto: "Atrás da tocha:<br><em>“A dupla da sombra: 2 olhos na escuridão.”</em><br><br>Você encontrou o número <strong>2</strong>! Anote-o... mas em que posição do código ele entra? 🤔", pista: "tocha" },
  palha:      { titulo: "🌾 Palha", texto: "Você revirou a palha... só poeira e um besouro. 🪲<br>Nenhuma pista aqui — tente o pergaminho, a inscrição e a tocha." },
  porta1:     { titulo: "🚪 Porta / Fechadura", texto: "Fechadura de ferro com 3 números.<br>Encontre os 3 números escondidos no cenário e descubra a ordem certa! 🔢" }
};

// Atualiza só o CONTADOR de pistas (nunca os dígitos)
function atualizarContadorPistas() {
  const total = new Set(Object.values(estado.pistasEncontradas)).size;
  document.getElementById("pistas-count").textContent = Math.min(total, 3);
}

document.querySelectorAll("#sala-1 .objeto").forEach((btn) => {
  btn.addEventListener("click", () => {
    const qual = btn.dataset.obj;
    const p = pistasSala1[qual];
    mostrarModal(p.titulo, p.texto);
    if (p.pista) {
      estado.pistasEncontradas[qual] = p.pista;
      atualizarContadorPistas();
      beep("ok");
    }
    btn.classList.add("encontrado");
  });
});

function tentarCodigo() {
  const input = document.getElementById("input-codigo");
  const msg = document.getElementById("msg-codigo");
  estado.tentativasCodigo++;
  if (input.value.trim() === estado.codigoSecreto) {
    msg.textContent = "✅ CLANG! A fechadura cedeu — a porta se abriu!";
    msg.className = "msg sucesso";
    mostrarToast("✅ Código correto! Passagem liberada.", "sucesso");
    beep("ok");
    estado.salasLiberadas[1] = true; // libera Sala 2
    atualizarMapa(); atualizarBotoesNav();
    setTimeout(() => irParaSala(2), 1300);
  } else {
    msg.textContent = "❌ Código incorreto! Examine pergaminho, inscrição e tocha...";
    msg.className = "msg erro";
    mostrarToast("❌ Fechadura emperrada... tente de novo.", "erro");
    beep("erro");
  }
}
document.getElementById("btn-tentar-codigo").addEventListener("click", tentarCodigo);
document.getElementById("input-codigo").addEventListener("keydown", (e) => { if (e.key === "Enter") tentarCodigo(); });

// =====================================================
// 4. SALA 2 — O ENIGMA DO GUARDIÃO (resposta DIGITADA)
// Charada: "Sou alta quando jovem e baixa quando velha" → vela
// =====================================================
const CHARADA = "Sou alta quando sou jovem e baixa quando sou velha. O que eu sou?";
const RESPOSTA = "vela";

document.querySelectorAll("#sala-2 .objeto").forEach((btn) => {
  btn.addEventListener("click", () => {
    const qual = btn.dataset.obj;
    if (qual === "estatua") {
      estado.charadaRevelada = true;
      document.getElementById("texto-charada").innerHTML = `“${CHARADA}”<br><small>— troveja a estátua 🗿</small>`;
      mostrarModal("🗿 O Guardião fala...", `Com voz de pedra, ele diz:<br><br><em>“${CHARADA}”</em><br><br>Digite sua resposta abaixo! ✍️`);
      beep("ok");
    } else if (qual === "placa") {
      mostrarModal("🪦 Placa gasta", "Você limpa o musgo e lê:<br><em>“...a luz que se consome para iluminar...”</em><br>Parece uma dica sobre a charada! 🕯️");
    } else if (qual === "porta2") {
      if (estado.charadaResolvida) irParaSala(3);
      else { mostrarModal("🚪 Passagem selada", "A passagem só se abre para quem <strong>responder a charada</strong>!"); mostrarToast("⛓️ Responda a charada primeiro!", "erro"); beep("erro"); }
    }
    btn.classList.add("encontrado");
  });
});

// Normaliza acentos/maiúsculas para aceitar "Vela", "VELA", "vêla"...
function normalizar(txt) {
  return txt.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function responderCharada() {
  const input = document.getElementById("input-resposta");
  const msg = document.getElementById("msg-pergunta");
  if (!estado.charadaRevelada) {
    msg.textContent = "⚠️ Clique primeiro na estátua para ouvir a charada!";
    msg.className = "msg erro";
    return;
  }
  estado.tentativasCharada++;
  if (normalizar(input.value) === RESPOSTA) {
    msg.textContent = "✅ Correto! A resposta é VELA! A passagem range e se abre...";
    msg.className = "msg sucesso";
    mostrarToast("✅ Enigma resolvido!", "sucesso");
    beep("ok");
    estado.charadaResolvida = true;
    estado.salasLiberadas[2] = true; // libera Sala 3
    atualizarMapa(); atualizarBotoesNav();
    setTimeout(() => irParaSala(3), 1500);
  } else {
    msg.textContent = estado.tentativasCharada >= 2
      ? "❌ Errado! Dica: é algo que ilumina e derrete... 🕯️"
      : "❌ A estátua permanece imóvel... tente de novo!";
    msg.className = "msg erro";
    mostrarToast("❌ Resposta errada...", "erro");
    beep("erro");
  }
}
document.getElementById("btn-responder").addEventListener("click", responderCharada);
document.getElementById("input-resposta").addEventListener("keydown", (e) => { if (e.key === "Enter") responderCharada(); });

// =====================================================
// 5. SALA 3 — A CHAVE PERDIDA (vasculhar + coletar)
// A chave de ferro está no ESQUELETO → vai ao inventário
// =====================================================
const textosEsconderijo = {
  bau: "O baú range... só correntes velhas e teias de aranha! 🕸️",
  barril: "O barril está cheio de água podre. Nada aqui... 🤢",
  caixa: "A caixa está vazia. Alguém já a saqueou. 📦",
  vaso: "Dentro do vaso, só poeira. 🏺",
  estante: "Livros apodrecidos... nenhum compartimento secreto. 📚"
};

document.querySelectorAll("#sala-3 .objeto").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (estado.temChave) { mostrarToast("Você já tem a chave! Avance. 🗝️", "sucesso"); return; }
    const msg = document.getElementById("msg-objeto");
    const local = btn.dataset.esconderijo;

    if (local === estado.esconderijoChave) {
      estado.temChave = true;
      estado.salasLiberadas[3] = true; // libera Sala 4
      adicionarItem("chave-ferro", "Chave de Ferro", "🗝️");
      estado.itemSelecionado = "chave-ferro";
      renderInventario();
      btn.classList.add("encontrado");
      msg.textContent = "🗝️ VOCÊ ACHOU A CHAVE DE FERRO! Ela foi para o inventário!";
      msg.className = "msg sucesso";
      mostrarModal("🗝️ Chave de Ferro encontrada!", "Entre as costelas do esqueleto brilhava uma <strong>Chave de Ferro</strong>!<br>Ela foi guardada no <strong>inventário</strong>. Vá para a <strong>Sala 4</strong>! 🚪");
      mostrarToast("🗝️ Chave de Ferro coletada!", "sucesso");
      beep("ok");
      atualizarMapa(); atualizarBotoesNav();
      setTimeout(() => irParaSala(4), 1900);
    } else {
      msg.textContent = "❌ " + textosEsconderijo[local];
      msg.className = "msg erro";
      mostrarModal("🔎 Nada aqui...", textosEsconderijo[local]);
      beep("erro");
    }
  });
});

// =====================================================
// 6. SALA 4 — A FUGA (usar a chave do inventário)
// REGRA: sem chave = sem fuga. Sem pular salas.
// =====================================================
function tentarFuga() {
  const msg = document.getElementById("msg-final");
  const porta = document.getElementById("porta-final");

  if (!estado.temChave) {
    msg.textContent = "❌ A porta está selada! Você precisa da Chave de Ferro da Sala 3.";
    msg.className = "msg erro";
    mostrarModal("🔒 Porta selada", "A grande porta exige a <strong>Chave de Ferro</strong>.<br>Volte à <strong>Sala 3</strong>! 🗝️");
    mostrarToast("🔒 Sem a chave, não há fuga!", "erro");
    beep("erro");
    return;
  }
  if (estado.itemSelecionado !== "chave-ferro") {
    msg.textContent = "⚠️ Selecione a 🗝️ Chave de Ferro no inventário e clique na porta!";
    msg.className = "msg erro";
    mostrarToast("⚠️ Selecione a chave no inventário!", "erro");
    beep("erro");
    return;
  }
  // SUCESSO: abre a porta e vence
  porta.innerHTML = "🔓 PORTA ABERTA — FUJA!<span class='sub'>a luz invade a masmorra...</span>";
  porta.classList.add("aberta");
  msg.textContent = "✅ A chave girou... a grande porta está se abrindo!";
  msg.className = "msg sucesso";
  mostrarToast("🏆 VOCÊ ESCAPOU!", "sucesso");
  beep("ok");
  clearInterval(estado.timerId);

  document.getElementById("tempo-final").textContent = "⏳ Tempo de fuga: " + formatarTempo(estado.segundos);
  document.getElementById("resumo-final").textContent =
    `Tentativas no código: ${estado.tentativasCodigo} • Tentativas na charada: ${estado.tentativasCharada} • Chave coletada • Sem trapaças`;

  setTimeout(() => {
    estado.salaAtual = 5;
    mostrarTela("tela-vitoria");
    atualizarMapa(); atualizarHud();
    btnVoltar.style.visibility = "hidden";
    btnAvancar.style.visibility = "hidden";
  }, 1600);
}
document.getElementById("porta-final").addEventListener("click", tentarFuga);
document.getElementById("btn-usar-chave").addEventListener("click", tentarFuga);

// ---------- INÍCIO / NAVEGAÇÃO / REINÍCIO ----------
document.getElementById("btn-iniciar").addEventListener("click", () => {
  iniciarTimer();
  irParaSala(1);
  mostrarToast("🔎 Clique nos objetos para investigar!", "sucesso");
});
btnVoltar.addEventListener("click", () => { if (estado.salaAtual > 1) irParaSala(estado.salaAtual - 1); });
btnAvancar.addEventListener("click", () => { if (estado.salaAtual < 4) irParaSala(estado.salaAtual + 1); });
function reiniciar() { location.reload(); }
document.getElementById("btn-reiniciar").addEventListener("click", reiniciar);
document.getElementById("btn-reiniciar-topo").addEventListener("click", reiniciar);
document.getElementById("btn-jogar-novamente").addEventListener("click", reiniciar);

// ---------- ESTADO INICIAL ----------
mostrarTela("tela-inicio");
atualizarMapa(); atualizarHud(); atualizarBotoesNav();
renderInventario();
