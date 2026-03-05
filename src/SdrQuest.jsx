
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Target,
  Zap,
  AlertTriangle,
  CheckCircle,
  UserPlus,
  Flame,
  RefreshCw,
  Calendar,
  Briefcase,
  User,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// =====================
// CONFIGURAÇÕES DE METAS
// =====================
const MILESTONES = [
  { percent: 60, target: 42, label: 'Meta Mínima' },   // 21 cada
  { percent: 70, target: 50, label: 'Acelerando' },    // 25 cada
  { percent: 80, target: 58, label: 'Voo Cruzeiro' },  // 29 cada
  { percent: 90, target: 68, label: 'Elite' },         // 34 cada
  { percent: 100, target: 76, label: 'Supernova' },    // 38 cada
];

// Metas individuais (metade das metas da equipe)
const INDIVIDUAL_MILESTONES = MILESTONES.map((m) => ({
  ...m,
  target: Math.round(m.target / 2),
}));

// =====================
// DICAS SPICED
// =====================
const SPICED_TIPS = [
  { letter: 'S', title: 'Situação', text: 'Qual o contexto atual da empresa? Fatos, números e cenário.' },
  { letter: 'P', title: 'Problema (Pain)', text: 'Qual a dor principal que os impede de crescer ou gera custo?' },
  { letter: 'I', title: 'Impacto', text: 'Como esse problema afeta a receita, tempo ou moral da equipe?' },
  { letter: 'C', title: 'Evento Crítico', text: 'Por que eles precisam resolver isso AGORA? Qual o prazo?' },
  { letter: 'D', title: 'Decisão', text: 'Quem assina o cheque? Como é o processo de compra deles?' },
];

// =====================
// STORAGE (POR MÊS) + ÍNDICE
// =====================
const STORAGE_PREFIX = 'sdrquest:month:';     // ex: sdrquest:month:2026-03
const STORAGE_INDEX_KEY = 'sdrquest:months:index'; // lista de months disponíveis

function getMonthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function parseMonthKey(monthKey) {
  const [y, m] = monthKey.split('-').map((x) => Number(x));
  return { y, m };
}

function prevMonthKey(monthKey) {
  const { y, m } = parseMonthKey(monthKey);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return getMonthKey(d);
}

function monthLabelPt(monthKey) {
  const { y, m } = parseMonthKey(monthKey);
  const d = new Date(y, m - 1, 1);
  try {
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(d);
  } catch {
    return monthKey;
  }
}

function defaultMonthState() {
  return {
    juanScore: 0,
    heloisaScore: 0,
    meetingsList: [],
    leads: [],
  };
}

function loadMonthState(monthKey) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${monthKey}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('Could not load month state:', e);
    return null;
  }
}

function saveMonthState(monthKey, state) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${monthKey}`, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save month state:', e);
  }
}

function getMonthsIndex() {
  try {
    const raw = localStorage.getItem(STORAGE_INDEX_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function setMonthsIndex(list) {
  try {
    localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Could not save months index:', e);
  }
}

function ensureMonthInIndex(monthKey) {
  const idx = getMonthsIndex();
  if (!idx.includes(monthKey)) {
    const next = [monthKey, ...idx].filter((v, i, a) => a.indexOf(v) === i);
    next.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0)); // desc
    setMonthsIndex(next);
    return next;
  }
  return idx;
}

function chooseDefaultHistoryMonth(currentKey, index) {
  const prev = prevMonthKey(currentKey);
  if (index.includes(prev)) return prev;
  const other = index.find((k) => k !== currentKey);
  return other || prev;
}

// =====================
// COMPONENTE PRINCIPAL
// =====================
export default function SdrQuest() {
  // mês atual do placar
  const [monthKeyState, setMonthKeyState] = useState(() => getMonthKey());

  // carrega dados do mês atual apenas na montagem
  const initialSaved = useMemo(() => {
    const mk = getMonthKey();
    const saved = loadMonthState(mk);
    return saved ?? defaultMonthState();
  }, []);

  // índice de meses salvos
  const [monthsIndex, setMonthsIndexState] = useState(() => {
    const idx = getMonthsIndex();
    const current = getMonthKey();
    const hasCurrent = !!loadMonthState(current);
    if (hasCurrent && !idx.includes(current)) return ensureMonthInIndex(current);
    return idx;
  });

  // =====================
  // ESTADOS (MÊS ATUAL)
  // =====================
  const [juanScore, setJuanScore] = useState(initialSaved.juanScore ?? 0);
  const [heloisaScore, setHeloisaScore] = useState(initialSaved.heloisaScore ?? 0);

  const [schedulingPlayer, setSchedulingPlayer] = useState(null);
  const [meetingForm, setMeetingForm] = useState({ date: '', opportunity: '', ae: 'Jânio' });
  const [meetingsList, setMeetingsList] = useState(Array.isArray(initialSaved.meetingsList) ? initialSaved.meetingsList : []);
  const [isMeetingsFeedOpen, setIsMeetingsFeedOpen] = useState(true);

  const [leads, setLeads] = useState(Array.isArray(initialSaved.leads) ? initialSaved.leads : []);
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadSdr, setNewLeadSdr] = useState('juan');

  const [currentTip, setCurrentTip] = useState(0);

  // =====================
  // SALVAR AUTOMATICAMENTE (não perde no F5)
  // =====================
  useEffect(() => {
    saveMonthState(monthKeyState, { juanScore, heloisaScore, meetingsList, leads });
    const idx = ensureMonthInIndex(monthKeyState);
    setMonthsIndexState(idx);
  }, [monthKeyState, juanScore, heloisaScore, meetingsList, leads]);

  // =====================
  // ZERAR AO VIRAR O MÊS (mantém histórico)
  // =====================
  useEffect(() => {
    const interval = setInterval(() => {
      const nowKey = getMonthKey();
      if (nowKey !== monthKeyState) {
        // mudou de mês -> zera placar do mês novo
        setMonthKeyState(nowKey);

        setJuanScore(0);
        setHeloisaScore(0);
        setMeetingsList([]);
        setLeads([]);

        setSchedulingPlayer(null);
        setMeetingForm({ date: '', opportunity: '', ae: 'Jânio' });

        const idx = ensureMonthInIndex(nowKey);
        setMonthsIndexState(idx);

        // reseta histórico padrão
        setHistoryMonthKey(chooseDefaultHistoryMonth(nowKey, idx));

        // reseta referências de celebração (importante)
        lastCelebratedTeamTargetRef.current = 0;
        lastCelebratedJuanTargetRef.current = 0;
        lastCelebratedHeloTargetRef.current = 0;
        celebrationQueueRef.current = [];
        setCelebrationPayload(null);
      }
    }, 60 * 1000); // checa a cada 1 minuto

// =====================
// SYNC AO VIVO (Sheets -> App)
// =====================
useEffect(() => {
  let alive = true;

  const pull = async () => {
    try {
      const resp = await fetch(`/api/state?month=${encodeURIComponent(monthKeyState)}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = await resp.json();
      if (!alive) return;

      if (!resp.ok || !data?.ok) {
        console.warn("Falha no sync:", data);
        return;
      }

      // atualiza estado com o que está no Sheets (fonte da verdade)
      setJuanScore(data.juanScore ?? 0);
      setHeloisaScore(data.heloisaScore ?? 0);
      setMeetingsList(Array.isArray(data.meetingsList) ? data.meetingsList : []);
      setLeads(Array.isArray(data.leads) ? data.leads : []);
    } catch (e) {
      console.warn("Erro no sync:", e);
    }
  };

  pull(); // roda 1x ao abrir
  const id = setInterval(pull, 3000); // a cada 3s

  return () => {
    alive = false;
    clearInterval(id);
  };
}, [monthKeyState]);

    return () => clearInterval(interval);
  }, [monthKeyState]);

  // =====================
  // CÁLCULOS (EQUIPE)
  // =====================
  const totalScore = juanScore + heloisaScore;

  const currentMilestone = useMemo(
    () => [...MILESTONES].reverse().find((m) => totalScore >= m.target),
    [totalScore]
  );

  const nextMilestone = useMemo(
    () => MILESTONES.find((m) => totalScore < m.target) || MILESTONES[MILESTONES.length - 1],
    [totalScore]
  );

  const overallProgress = useMemo(() => {
    const goal = MILESTONES[MILESTONES.length - 1].target;
    return Math.min(100, (totalScore / goal) * 100);
  }, [totalScore]);

  const progressToNext = useMemo(() => {
    const currentTarget = currentMilestone ? currentMilestone.target : 0;
    const nextTarget = nextMilestone ? nextMilestone.target : currentTarget;
    if (nextTarget === currentTarget) return 100;
    const pct = ((totalScore - currentTarget) / (nextTarget - currentTarget)) * 100;
    return Math.min(100, Math.max(0, pct));
  }, [totalScore, currentMilestone, nextMilestone]);

  // =====================
  // CÁLCULOS (INDIVIDUAL)
  // =====================
  const currentJuanMilestone = useMemo(
    () => [...INDIVIDUAL_MILESTONES].reverse().find((m) => juanScore >= m.target),
    [juanScore]
  );
  const currentHeloMilestone = useMemo(
    () => [...INDIVIDUAL_MILESTONES].reverse().find((m) => heloisaScore >= m.target),
    [heloisaScore]
  );

  const nextJuanMilestone = useMemo(
    () => INDIVIDUAL_MILESTONES.find((m) => juanScore < m.target) || INDIVIDUAL_MILESTONES[INDIVIDUAL_MILESTONES.length - 1],
    [juanScore]
  );
  const nextHeloMilestone = useMemo(
    () => INDIVIDUAL_MILESTONES.find((m) => heloisaScore < m.target) || INDIVIDUAL_MILESTONES[INDIVIDUAL_MILESTONES.length - 1],
    [heloisaScore]
  );

  // =====================
  // CELEBRAÇÕES (EQUIPE + INDIVIDUAL) COM FILA
  // =====================
  const [celebrationPayload, setCelebrationPayload] = useState(null); // {scope,title,subtitle}
  const celebrationQueueRef = useRef([]);

  const lastCelebratedTeamTargetRef = useRef(currentMilestone?.target ?? 0);
  const lastCelebratedJuanTargetRef = useRef(currentJuanMilestone?.target ?? 0);
  const lastCelebratedHeloTargetRef = useRef(currentHeloMilestone?.target ?? 0);

  const enqueueCelebration = (payload) => {
    if (!payload) return;
    if (!celebrationPayload) setCelebrationPayload(payload);
    else celebrationQueueRef.current.push(payload);
  };

  // puxa próximo da fila quando fecha
  useEffect(() => {
    if (!celebrationPayload && celebrationQueueRef.current.length > 0) {
      setCelebrationPayload(celebrationQueueRef.current.shift());
    }
  }, [celebrationPayload]);

  // auto-fecha em 5s
  useEffect(() => {
    if (!celebrationPayload) return;
    const t = setTimeout(() => setCelebrationPayload(null), 5000);
    return () => clearTimeout(t);
  }, [celebrationPayload]);

  // equipe: celebra quando passa para um marco maior
  useEffect(() => {
    const newTarget = currentMilestone?.target ?? 0;
    if (newTarget > lastCelebratedTeamTargetRef.current) {
      lastCelebratedTeamTargetRef.current = newTarget;

      enqueueCelebration({
        scope: 'team',
        title: 'META DA EQUIPE ATINGIDA!',
        subtitle: `${currentMilestone.percent}% • ${currentMilestone.label} • ${newTarget} reuniões`,
      });
    }
  }, [currentMilestone?.target]); // eslint-disable-line react-hooks/exhaustive-deps

  // Juan: celebra quando passa para um marco maior
  useEffect(() => {
    const newTarget = currentJuanMilestone?.target ?? 0;
    if (newTarget > lastCelebratedJuanTargetRef.current) {
      lastCelebratedJuanTargetRef.current = newTarget;

      enqueueCelebration({
        scope: 'juan',
        title: 'META INDIVIDUAL ATINGIDA!',
        subtitle: `🧊 Juan • ${currentJuanMilestone.percent}% • ${newTarget} reuniões`,
      });
    }
  }, [currentJuanMilestone?.target]); // eslint-disable-line react-hooks/exhaustive-deps

  // Heloísa: celebra quando passa para um marco maior
  useEffect(() => {
    const newTarget = currentHeloMilestone?.target ?? 0;
    if (newTarget > lastCelebratedHeloTargetRef.current) {
      lastCelebratedHeloTargetRef.current = newTarget;

      enqueueCelebration({
        scope: 'heloisa',
        title: 'META INDIVIDUAL ATINGIDA!',
        subtitle: `🔥 Heloísa • ${currentHeloMilestone.percent}% • ${newTarget} reuniões`,
      });
    }
  }, [currentHeloMilestone?.target]); // eslint-disable-line react-hooks/exhaustive-deps

  // =====================
  // ROTACIONAR DICAS
  // =====================
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTip((prev) => (prev + 1) % SPICED_TIPS.length);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // =====================
  // HISTÓRICO (CARD abaixo do Radar)
  // =====================
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyMonthKey, setHistoryMonthKey] = useState(() =>
    chooseDefaultHistoryMonth(getMonthKey(), getMonthsIndex())
  );

  const historyData = useMemo(() => {
    const data = loadMonthState(historyMonthKey);
    return data ? data : null;
  }, [historyMonthKey, monthsIndex]);

  const historySummary = useMemo(() => {
    if (!historyData) return null;
    const j = Number(historyData.juanScore || 0);
    const h = Number(historyData.heloisaScore || 0);
    const total = j + h;
    const mCount = Array.isArray(historyData.meetingsList) ? historyData.meetingsList.length : 0;
    const lCount = Array.isArray(historyData.leads) ? historyData.leads.length : 0;
    return { total, j, h, mCount, lCount };
  }, [historyData]);

  // =====================
  // FUNÇÕES DE AÇÃO
  // =====================
// ✅ Envia evento para o Google Sheets via Vercel API
const logEvent = async (payload) => {
  try {
    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch (e) {
    console.warn("Falha ao logar no Sheets:", e);
  }
};

// ✅ mês (YYYY-MM) somente para registro no Sheets
const monthKeyForSheets = monthKeyState;
const normalizeCompany = (s = "") => String(s).trim().replace(/\s+/g, " ");
const makeMeetingId = (opportunity) =>
  `${monthKeyForSheets}:${normalizeCompany(opportunity).toLowerCase()}`;
  const handleScheduleSubmit = (e) => {
  e.preventDefault();
  if (!meetingForm.date || !meetingForm.opportunity) return;

  const opp = normalizeCompany(meetingForm.opportunity);

  const created = {
    ...meetingForm,
    opportunity: opp,
    sdr: schedulingPlayer,
    id: Date.now(),
  };

  // adiciona no topo
  setMeetingsList((prev) => [created, ...prev]);

  // pontua
  if (schedulingPlayer === "juan") setJuanScore((s) => s + 1);
  if (schedulingPlayer === "heloisa") setHeloisaScore((s) => s + 1);

  // ✅ REGISTRA NO SHEETS (cria/atualiza a linha da empresa no mês)
  logEvent({
    tipo: "reuniao",
    status: "",
    meetingId: makeMeetingId(created.opportunity),
    sdr: created.sdr,
    ae: created.ae,
    oportunidade: created.opportunity,
    dataReuniao: created.date,
    noShowCount: "",
    monthKey: monthKeyForSheets,
    observacao: "agendado",
  });

  // reseta form
  setSchedulingPlayer(null);
  setMeetingForm({ date: "", opportunity: "", ae: "Jânio" });
};

  const removeMeeting = (player) => {
  if (player === "juan" && juanScore > 0) {
    setJuanScore((s) => s - 1);

    setMeetingsList((prev) => {
      const index = prev.findIndex((m) => m.sdr === "juan");
      if (index !== -1) {
        const removed = prev[index];

        // ✅ Sheets (deletado): usa chave estável (mês + oportunidade)
        logEvent({
          tipo: "reuniao",
          status: "[deletado]",
          meetingId: makeMeetingId(removed.opportunity),
          sdr: removed.sdr,
          ae: removed.ae,
          oportunidade: removed.opportunity,
          dataReuniao: removed.date,
          noShowCount: "",
          monthKey: monthKeyForSheets,
          observacao: "clicou -1",
        });

        const newList = [...prev];
        newList.splice(index, 1);
        return newList;
      }
      return prev;
    });
  }

  if (player === "heloisa" && heloisaScore > 0) {
    setHeloisaScore((s) => s - 1);

    setMeetingsList((prev) => {
      const index = prev.findIndex((m) => m.sdr === "heloisa");
      if (index !== -1) {
        const removed = prev[index];

        // ✅ Sheets (deletado): usa chave estável (mês + oportunidade)
        logEvent({
          tipo: "reuniao",
          status: "[deletado]",
          meetingId: makeMeetingId(removed.opportunity),
          sdr: removed.sdr,
          ae: removed.ae,
          oportunidade: removed.opportunity,
          dataReuniao: removed.date,
          noShowCount: "",
          monthKey: monthKeyForSheets,
          observacao: "clicou -1",
        });

        const newList = [...prev];
        newList.splice(index, 1);
        return newList;
      }
      return prev;
    });
  }
};

const deleteMeetingById = (id) => {
  setMeetingsList((prev) => {
    const index = prev.findIndex((m) => m.id === id);
    if (index === -1) return prev;

    const removed = prev[index];

    // Ajusta placar
    if (removed.sdr === "juan") setJuanScore((s) => Math.max(0, s - 1));
    if (removed.sdr === "heloisa") setHeloisaScore((s) => Math.max(0, s - 1));

    // ✅ Sheets (deletado): usa chave estável (mês + oportunidade)
    logEvent({
      tipo: "reuniao",
      status: "[deletado]",
      meetingId: makeMeetingId(removed.opportunity),
      sdr: removed.sdr,
      ae: removed.ae,
      oportunidade: removed.opportunity,
      dataReuniao: removed.date,
      noShowCount: "",
      monthKey: monthKeyForSheets,
      observacao: "clicou X (feed)",
    });

    const newList = [...prev];
    newList.splice(index, 1);
    return newList;
  });
};

  const handleAddNoShow = (e) => {
  e.preventDefault();
  if (!newLeadName.trim()) return;

  const existingLeadIndex = leads.findIndex(
    (l) => l.name.toLowerCase() === newLeadName.toLowerCase() && l.sdr === newLeadSdr
  );

  if (existingLeadIndex >= 0) {
    const updatedLeads = [...leads];
    updatedLeads[existingLeadIndex].noShows += 1;
    const newCount = updatedLeads[existingLeadIndex].noShows;

    // ✅ Sheets (no-show): usa chave estável (mês + empresa)
    logEvent({
      tipo: "no-show",
      status: "",
      meetingId: makeMeetingId(updatedLeads[existingLeadIndex].name),
      sdr: updatedLeads[existingLeadIndex].sdr,
      ae: "",
      oportunidade: updatedLeads[existingLeadIndex].name,
      dataReuniao: "",
      noShowCount: newCount,
      monthKey: monthKeyForSheets,
      observacao: `no-show ${newCount}`,
    });

    // 3º no-show: penaliza e remove agendamento
    if (newCount === 3) {
      const penalizedSdr = updatedLeads[existingLeadIndex].sdr;
      const leadName = updatedLeads[existingLeadIndex].name;

      if (penalizedSdr === "juan") setJuanScore((s) => Math.max(0, s - 1));
      else setHeloisaScore((s) => Math.max(0, s - 1));

      setMeetingsList((prev) => {
        let index = prev.findIndex(
          (m) => m.sdr === penalizedSdr && (m.opportunity || "").toLowerCase() === leadName.toLowerCase()
        );
        if (index === -1) index = prev.findIndex((m) => m.sdr === penalizedSdr);

        if (index !== -1) {
          const newList = [...prev];
          newList.splice(index, 1);
          return newList;
        }
        return prev;
      });
    }

    setLeads(updatedLeads);
  } else {
    const newEntry = { id: Date.now(), name: newLeadName, sdr: newLeadSdr, noShows: 1 };

    // ✅ Sheets (no-show 1): estava faltando no seu código
    logEvent({
      tipo: "no-show",
      status: "",
      meetingId: makeMeetingId(newEntry.name),
      sdr: newEntry.sdr,
      ae: "",
      oportunidade: newEntry.name,
      dataReuniao: "",
      noShowCount: 1,
      monthKey: monthKeyForSheets,
      observacao: "no-show 1",
    });

    setLeads([newEntry, ...leads]);
  }

  setNewLeadName("");
};

  const removeLead = (id) => setLeads(leads.filter((l) => l.id !== id));

  const resetCurrentMonth = () => {
    setJuanScore(0);
    setHeloisaScore(0);
    setMeetingsList([]);
    setLeads([]);

    // reseta refs de celebração também
    lastCelebratedTeamTargetRef.current = 0;
    lastCelebratedJuanTargetRef.current = 0;
    lastCelebratedHeloTargetRef.current = 0;
    celebrationQueueRef.current = [];
    setCelebrationPayload(null);
  };

  // =====================
  // RENDER
  // =====================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 md:p-8 overflow-hidden relative selection:bg-cyan-500/30">
      {/* BACKGROUND EFFECTS */}
      <style>
        {`
          @keyframes blob {
            0% { transform: translate(0px, 0px) scale(1); }
            33% { transform: translate(40px, -40px) scale(1.1); }
            66% { transform: translate(-20px, 20px) scale(0.9); }
            100% { transform: translate(0px, 0px) scale(1); }
          }
          .animate-blob { animation: blob 15s infinite alternate ease-in-out; }
          .animation-delay-4000 { animation-delay: 4s; }
        `}
      </style>
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-cyan-600/20 rounded-full blur-[120px] pointer-events-none animate-blob"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none animate-blob animation-delay-4000"></div>

      {/* FOGOS */}
      {celebrationPayload && (
        <FireworksCanvas scope={celebrationPayload.scope} title={celebrationPayload.title} subtitle={celebrationPayload.subtitle} />
      )}

      {/* HEADER */}
      <header className="relative z-10 flex flex-col md:flex-row justify-between items-center mb-8 gap-6">
        <div>
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 flex items-center gap-3">
            <Zap className="text-cyan-400 w-8 h-8" />
            SDR QUEST
          </h1>
          <div className="flex flex-col w-fit">
            <p className="text-slate-400 text-sm mt-1 tracking-widest uppercase">Operação Máquina de Vendas</p>
            <p className="text-slate-500 text-[10px] tracking-widest uppercase text-right mt-0.5 font-bold">Powered by Vittel</p>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Mês ativo: <span className="text-slate-200 font-bold">{monthLabelPt(monthKeyState)}</span>
          </div>
        </div>

        {/* OVERALL PROGRESS */}
        <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 p-4 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.15)] w-full md:w-1/2">
          <div className="flex justify-between items-end mb-2">
            <div>
              <span className="text-2xl font-bold text-white">{totalScore}</span>
              <span className="text-slate-400 text-sm ml-2">/ {MILESTONES[MILESTONES.length - 1].target} Reuniões Totais</span>
            </div>
            <div className="text-right">
              <span className="text-cyan-400 font-mono font-bold text-xl">{currentMilestone ? currentMilestone.percent : 0}%</span>
            </div>
          </div>

          <div className="h-3 bg-slate-800 rounded-full overflow-hidden relative">
            <div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(6,182,212,0.8)]"
              style={{ width: `${overallProgress}%` }}
            ></div>
          </div>

          <div className="flex justify-between mt-2 text-xs font-mono text-slate-500">
            {MILESTONES.map((m, i) => (
              <div key={i} className={`flex flex-col items-center ${totalScore >= m.target ? 'text-cyan-400' : ''}`}>
                <div className={`w-1 h-1 rounded-full mb-1 ${totalScore >= m.target ? 'bg-cyan-400 shadow-[0_0_5px_#22d3ee]' : 'bg-slate-700'}`}></div>
                {m.percent}%
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            <div>
              Próximo marco: <span className="text-slate-200 font-bold">{nextMilestone.percent}%</span> •{' '}
              <span className="text-slate-300">{nextMilestone.label}</span>
            </div>
            <div className="text-slate-500 font-mono">{Math.round(progressToNext)}% até o próximo</div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={resetCurrentMonth}
              className="text-xs text-slate-400 hover:text-white bg-slate-800/50 border border-slate-700/50 px-3 py-2 rounded-lg transition-colors"
              title="Zerar mês atual (não apaga histórico)"
            >
              Resetar mês
            </button>
          </div>
        </div>
      </header>

      {/* MAIN GRID */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* PLAYER 1: JUAN */}
        <PlayerCard
          name="Juan"
          score={juanScore}
          target={nextJuanMilestone.target}
          onAdd={() => setSchedulingPlayer('juan')}
          onRemove={() => removeMeeting('juan')}
          color="cyan"
        />

        {/* SPICED & CENTRAL INFO */}
        <div className="flex flex-col gap-6">
          {/* SPICED WIDGET */}
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl transition-all group-hover:bg-purple-500/20"></div>
            <h3 className="text-slate-400 font-bold tracking-widest text-xs mb-4 flex items-center gap-2 uppercase">
              <Flame className="w-4 h-4 text-orange-500" />
              Framework SPICED
            </h3>

            <div className="min-h-[120px] flex flex-col justify-center transition-all duration-500">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-4xl font-black text-purple-400 font-mono">{SPICED_TIPS[currentTip].letter}</span>
                <span className="text-xl font-bold text-white">{SPICED_TIPS[currentTip].title}</span>
              </div>
              <p className="text-slate-300 text-sm leading-relaxed">{SPICED_TIPS[currentTip].text}</p>
            </div>

            <div className="flex gap-1 mt-4">
              {SPICED_TIPS.map((_, idx) => (
                <div key={idx} className={`h-1 flex-1 rounded-full transition-all duration-500 ${idx === currentTip ? 'bg-purple-500' : 'bg-slate-800'}`} />
              ))}
            </div>
          </div>

          {/* NEXT MILESTONE */}
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-sm text-center">
            <Target className="w-8 h-8 text-cyan-400 mx-auto mb-2 opacity-80" />
            <h4 className="text-slate-400 text-sm">Próximo Alvo (Equipe)</h4>
            <div className="text-2xl font-bold text-white mb-1">
              {nextMilestone.percent}% ({nextMilestone.label})
            </div>
            <div className="text-sm text-slate-500">Faltam {Math.max(0, nextMilestone.target - totalScore)} reuniões no total</div>
          </div>
        </div>

        {/* PLAYER 2: HELOÍSA */}
        <PlayerCard
          name="Heloísa"
          score={heloisaScore}
          target={nextHeloMilestone.target}
          onAdd={() => setSchedulingPlayer('heloisa')}
          onRemove={() => removeMeeting('heloisa')}
          color="purple"
        />

        {/* RECENT MEETINGS FEED */}
        <div className="lg:col-span-3 bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-md transition-all">
          <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => setIsMeetingsFeedOpen(!isMeetingsFeedOpen)}>
            <h3 className="text-xl font-bold text-white flex items-center gap-2 hover:text-cyan-400 transition-colors">
              <CheckCircle className="w-5 h-5 text-green-400" />
              Agendamentos Registrados
            </h3>
            <div className="text-slate-400 hover:text-white transition-colors bg-slate-800/50 p-1.5 rounded-lg">
              {isMeetingsFeedOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </div>

          {isMeetingsFeedOpen && (
            <div className="flex gap-4 overflow-x-auto mt-4 pb-2">
              {meetingsList.length === 0 ? (
                <p className="text-slate-500 italic text-sm">Nenhum agendamento registrado ainda hoje.</p>
              ) : (
                meetingsList.map((meeting) => (
                  <div key={meeting.id} className="min-w-[250px] bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
                    <div className="flex justify-between items-start gap-2">
  <span className="font-bold text-white truncate flex-1" title={meeting.opportunity}>
    {meeting.opportunity}
  </span>

  <div className="flex items-center gap-2">
    <span
      className={`text-xs font-bold px-2 py-1 rounded bg-slate-900 ${
        meeting.sdr === "juan" ? "text-cyan-400" : "text-purple-400"
      }`}
    >
      {meeting.sdr === "juan" ? "Juan" : "Heloísa"}
    </span>

    <button
      type="button"
      onClick={() => deleteMeetingById(meeting.id)}
      className="text-slate-500 hover:text-white transition-colors bg-slate-900/40 border border-slate-700/70 px-2 py-1 rounded"
      title="Remover este agendamento"
    >
      <X className="w-4 h-4" />
    </button>
  </div>
</div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Calendar className="w-3 h-3" /> {meeting.date}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <User className="w-3 h-3" /> AE: {meeting.ae}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* NO-SHOW TRACKER (Full Width Bottom) */}
        <div className="lg:col-span-3 bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                Radar de No-Shows
              </h3>
              <p className="text-slate-400 text-sm">Atenção: 3º reagendamento é a última chance do lead.</p>
            </div>

            <form onSubmit={handleAddNoShow} className="flex w-full md:w-auto gap-2">
              <input
                type="text"
                placeholder="Nome da Empresa / Lead"
                value={newLeadName}
                onChange={(e) => setNewLeadName(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 w-full md:w-64 transition-all"
              />
              <select
                value={newLeadSdr}
                onChange={(e) => setNewLeadSdr(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all cursor-pointer"
              >
                <option value="juan">Juan</option>
                <option value="heloisa">Heloísa</option>
              </select>
              <button
                type="submit"
                className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <UserPlus className="w-4 h-4" />
                Registrar
              </button>
            </form>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {leads.length === 0 ? (
              <div className="col-span-full text-center py-8 text-slate-500 border border-dashed border-slate-700 rounded-xl">
                Nenhum no-show registrado no momento. Excelente trabalho!
              </div>
            ) : (
              leads.map((lead) => (
                <div
                  key={lead.id}
                  className={`p-4 rounded-xl border relative overflow-hidden flex flex-col justify-between transition-all ${
                    lead.noShows >= 3
                      ? 'bg-red-950/30 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                      : lead.noShows === 2
                      ? 'bg-yellow-950/30 border-yellow-500/50'
                      : 'bg-slate-800/50 border-slate-700'
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <h4 className="font-bold text-white truncate pr-4" title={lead.name}>
                      {lead.name}
                    </h4>
                    <button
                      onClick={() => removeLead(lead.id)}
                      className="text-slate-500 hover:text-white transition-colors absolute top-4 right-4"
                      title="Remover da lista"
                    >
                      ×
                    </button>
                  </div>

                  <div className="text-xs text-slate-400 mb-3 flex items-center gap-1">
                    <User className="w-3 h-3" /> SDR:{' '}
                    <span className={lead.sdr === 'juan' ? 'text-cyan-400' : 'text-purple-400'}>
                      {lead.sdr === 'juan' ? 'Juan' : 'Heloísa'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {[1, 2, 3].map((strike) => (
                      <div
                        key={strike}
                        className={`h-2 flex-1 rounded-sm ${
                          strike <= lead.noShows
                            ? strike === 3
                              ? 'bg-red-500 shadow-[0_0_8px_#ef4444]'
                              : strike === 2
                              ? 'bg-yellow-500'
                              : 'bg-slate-400'
                            : 'bg-slate-800'
                        }`}
                      ></div>
                    ))}
                  </div>

                  <div className="mt-3 text-xs font-bold tracking-wider uppercase">
                    {lead.noShows >= 3 ? (
                      <span className="text-red-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> ÚLTIMA CHANCE
                      </span>
                    ) : lead.noShows === 2 ? (
                      <span className="text-yellow-400">Atenção (2/3)</span>
                    ) : (
                      <span className="text-slate-400">1º Furo (1/3)</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* HISTÓRICO (ABAIXO DO RADAR) */}
        <div className="lg:col-span-3 bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-md transition-all">
          <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => setIsHistoryOpen((v) => !v)}>
            <h3 className="text-xl font-bold text-white flex items-center gap-2 hover:text-cyan-400 transition-colors">
              <RefreshCw className="w-5 h-5 text-cyan-400" />
              Histórico (mês anterior e anteriores)
            </h3>
            <div className="text-slate-400 hover:text-white transition-colors bg-slate-800/50 p-1.5 rounded-lg">
              {isHistoryOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </div>

          <div className="mt-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="text-sm text-slate-400">
              O placar zera automaticamente na virada do mês. O histórico fica salvo para consulta.
            </div>

            <div className="flex gap-2 items-center">
              <span className="text-xs text-slate-500">Mês:</span>
              <select
                value={historyMonthKey}
                onChange={(e) => setHistoryMonthKey(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer text-sm"
              >
                {monthsIndex.filter((k) => k !== monthKeyState).length === 0 ? (
                  <option value={prevMonthKey(monthKeyState)}>Sem histórico</option>
                ) : (
                  monthsIndex
                    .filter((k) => k !== monthKeyState)
                    .map((k) => (
                      <option key={k} value={k}>
                        {monthLabelPt(k)}
                      </option>
                    ))
                )}
              </select>
            </div>
          </div>

          {isHistoryOpen && (
            <div className="mt-5">
              {!historyData || !historySummary ? (
                <div className="text-slate-500 italic text-sm border border-dashed border-slate-700 rounded-xl p-4">
                  Sem dados salvos para esse mês ainda.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4">
                      <div className="text-xs text-slate-500">Total</div>
                      <div className="text-2xl font-black text-white">{historySummary.total}</div>
                    </div>
                    <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4">
                      <div className="text-xs text-slate-500">🧊 Juan</div>
                      <div className="text-2xl font-black text-cyan-300">{historySummary.j}</div>
                    </div>
                    <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4">
                      <div className="text-xs text-slate-500">🔥 Heloísa</div>
                      <div className="text-2xl font-black text-purple-300">{historySummary.h}</div>
                    </div>
                    <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4">
                      <div className="text-xs text-slate-500">Registros</div>
                      <div className="text-sm text-slate-300 mt-1">
                        Reuniões: <span className="font-bold text-white">{historySummary.mCount}</span>
                      </div>
                      <div className="text-sm text-slate-300">
                        No-shows: <span className="font-bold text-white">{historySummary.lCount}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-4">
                      <div className="font-bold text-white mb-3 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        Reuniões do mês
                      </div>
                      <div className="space-y-2 max-h-[260px] overflow-auto pr-1">
                        {(historyData.meetingsList || []).length === 0 ? (
                          <div className="text-slate-500 italic text-sm">Sem reuniões registradas.</div>
                        ) : (
                          (historyData.meetingsList || []).map((m) => (
                            <div key={m.id} className="bg-slate-900/40 border border-slate-700 rounded-lg p-3">
                              <div className="flex justify-between items-start gap-3">
                                <div className="min-w-0">
                                  <div className="font-bold text-white truncate" title={m.opportunity}>
                                    {m.opportunity}
                                  </div>
                                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                                    <Calendar className="w-3 h-3" /> {m.date}
                                  </div>
                                  <div className="text-xs text-slate-400 flex items-center gap-2">
                                    <User className="w-3 h-3" /> AE: {m.ae}
                                  </div>
                                </div>
                                <div className={`text-xs font-bold px-2 py-1 rounded bg-slate-950 ${m.sdr === 'juan' ? 'text-cyan-400' : 'text-purple-400'}`}>
                                  {m.sdr === 'juan' ? 'Juan' : 'Heloísa'}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-4">
                      <div className="font-bold text-white mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        No-shows do mês
                      </div>
                      <div className="space-y-2 max-h-[260px] overflow-auto pr-1">
                        {(historyData.leads || []).length === 0 ? (
                          <div className="text-slate-500 italic text-sm">Sem no-shows registrados.</div>
                        ) : (
                          (historyData.leads || []).map((l) => (
                            <div key={l.id} className="bg-slate-900/40 border border-slate-700 rounded-lg p-3">
                              <div className="flex justify-between items-start gap-3">
                                <div className="min-w-0">
                                  <div className="font-bold text-white truncate" title={l.name}>
                                    {l.name}
                                  </div>
                                  <div className="text-xs text-slate-400 mt-1">
                                    SDR:{' '}
                                    <span className={l.sdr === 'juan' ? 'text-cyan-400' : 'text-purple-400'}>
                                      {l.sdr === 'juan' ? 'Juan' : 'Heloísa'}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-xs font-bold px-2 py-1 rounded bg-slate-950 text-slate-200">{l.noShows}/3</div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODAL DE AGENDAMENTO */}
      {schedulingPlayer && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`bg-slate-900 border ${
              schedulingPlayer === 'juan'
                ? 'border-cyan-500/50 shadow-[0_0_30px_rgba(6,182,212,0.2)]'
                : 'border-purple-500/50 shadow-[0_0_30px_rgba(168,85,247,0.2)]'
            } rounded-2xl w-full max-w-md p-6 relative`}
          >
            <button onClick={() => setSchedulingPlayer(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <Calendar className={`w-6 h-6 ${schedulingPlayer === 'juan' ? 'text-cyan-400' : 'text-purple-400'}`} />
              Novo Agendamento
            </h3>

            <form onSubmit={handleScheduleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="text-slate-400 text-sm mb-1 block">Oportunidade (Empresa)</label>
                <div className="relative">
                  <Briefcase className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={meetingForm.opportunity}
                    onChange={(e) => setMeetingForm({ ...meetingForm, opportunity: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-cyan-500 transition-colors"
                    placeholder="Nome da empresa"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 text-sm mb-1 block">Data da Reunião</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="date"
                    required
                    value={meetingForm.date}
                    onChange={(e) => setMeetingForm({ ...meetingForm, date: e.target.value })}
                    onClick={(e) => e.target.showPicker && e.target.showPicker()}
                    className="w-full bg-slate-950 border border-slate-700 text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-sm mb-1 block">Vendedor (AE)</label>
                  <select
                    value={meetingForm.ae}
                    onChange={(e) => setMeetingForm({ ...meetingForm, ae: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer"
                  >
                    <option value="Jânio">Jânio</option>
                    <option value="Grazi">Grazi</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-sm mb-1 block">SDR</label>
                  <input
                    type="text"
                    readOnly
                    value={schedulingPlayer === 'juan' ? 'Juan' : 'Heloísa'}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-500 px-4 py-2 rounded-lg cursor-not-allowed"
                  />
                </div>
              </div>

              <button
                type="submit"
                className={`mt-4 w-full py-3 rounded-xl font-bold text-white flex justify-center items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] ${
                  schedulingPlayer === 'juan' ? 'bg-cyan-500 hover:bg-cyan-400' : 'bg-purple-500 hover:bg-purple-400'
                }`}
              >
                <CheckCircle className="w-5 h-5" />
                Confirmar Agendamento
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================
// PLAYER CARD (sem classes Tailwind dinâmicas)
// =====================
function PlayerCard({ name, score, target, onAdd, onRemove, color }) {
  const isCyan = color === 'cyan';

  const colorClasses = isCyan
    ? {
        text: 'text-cyan-400',
        borderHover: 'hover:border-cyan-500/30',
        btnBg: 'bg-cyan-500 hover:bg-cyan-400',
        shadow: 'shadow-[0_0_20px_rgba(6,182,212,0.3)]',
        stroke: 'stroke-cyan-500',
        glow: '#06b6d4',
      }
    : {
        text: 'text-purple-400',
        borderHover: 'hover:border-purple-500/30',
        btnBg: 'bg-purple-500 hover:bg-purple-400',
        shadow: 'shadow-[0_0_20px_rgba(168,85,247,0.3)]',
        stroke: 'stroke-purple-500',
        glow: '#a855f7',
      };

  const progress = Math.min(100, (score / target) * 100);

  return (
    <div
      className={`bg-slate-900/80 border border-slate-700/50 rounded-3xl p-6 backdrop-blur-md flex flex-col items-center justify-between transition-all duration-300 ${colorClasses.borderHover}`}
    >
      <h2 className={`text-2xl font-black ${colorClasses.text} tracking-wider uppercase mb-6`}>{name}</h2>

      {/* Círculo de Progresso */}
      <div className="relative w-48 h-48 mb-6 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" className="stroke-slate-800" strokeWidth="6" />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            className={`${colorClasses.stroke} transition-all duration-1000 ease-out`}
            strokeWidth="6"
            strokeDasharray="283"
            strokeDashoffset={283 - (283 * progress) / 100}
            style={{ filter: `drop-shadow(0 0 8px ${colorClasses.glow})` }}
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-5xl font-black text-white">{score}</span>
          <span className="text-slate-400 text-xs uppercase mt-1">Reuniões</span>
        </div>
      </div>

      <div className="w-full mb-6 text-center">
        <p className="text-slate-400 text-sm">Próximo Marco Pessoal</p>
        <p className="text-white font-bold">{target} reuniões</p>
      </div>

      <div className="flex gap-3 w-full">
        <button onClick={onRemove} className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-4 rounded-xl transition-colors" title="Remover reunião">
          -1
        </button>
        <button
          onClick={onAdd}
          className={`${colorClasses.btnBg} text-white flex-1 p-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${colorClasses.shadow} hover:scale-105 active:scale-95`}
        >
          <CheckCircle className="w-5 h-5" />
          Agendar!
        </button>
      </div>
    </div>
  );
}

// =====================
// FOGOS (CANVAS) - com mensagem
// =====================
function FireworksCanvas({ scope = 'team', title = 'META ATINGIDA!', subtitle = '' }) {
  const canvasRef = useRef(null);

  const style = useMemo(() => {
    if (scope === 'juan') {
      return {
        border: 'border-cyan-400',
        shadow: 'shadow-[0_0_50px_rgba(6,182,212,0.5)]',
        gradient: 'from-cyan-400 to-cyan-200',
      };
    }
    if (scope === 'heloisa') {
      return {
        border: 'border-purple-400',
        shadow: 'shadow-[0_0_50px_rgba(168,85,247,0.5)]',
        gradient: 'from-purple-400 to-fuchsia-400',
      };
    }
    return {
      border: 'border-cyan-400',
      shadow: 'shadow-[0_0_50px_rgba(6,182,212,0.5)]',
      gradient: 'from-cyan-400 to-purple-500',
    };
  }, [scope]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let particles = [];
    const colors = ['#06b6d4', '#a855f7', '#3b82f6', '#f59e0b', '#ec4899'];

    function createFirework() {
      const x = Math.random() * canvas.width;
      const y = Math.random() * (canvas.height / 2);
      const color = colors[Math.floor(Math.random() * colors.length)];

      for (let i = 0; i < 50; i++) {
        particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * (Math.random() * 10),
          vy: (Math.random() - 0.5) * (Math.random() * 10),
          life: 1,
          color,
          size: Math.random() * 3 + 1,
        });
      }
    }

    let animationId;
    let frameCount = 0;

    function animate() {
      ctx.fillStyle = 'rgba(2, 6, 23, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (frameCount % 15 === 0) createFirework();

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.life -= 0.01;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fill();
        ctx.globalAlpha = 1;

        if (p.life <= 0) particles.splice(i, 1);
      }

      frameCount++;
      animationId = requestAnimationFrame(animate);
    }

    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div className={`relative z-10 bg-slate-900/90 border-2 ${style.border} p-8 rounded-3xl text-center ${style.shadow} animate-bounce`}>
        <h2 className={`text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r ${style.gradient} mb-2`}>{title}</h2>
        <p className="text-white text-lg">{subtitle || 'Excelente trabalho!'}</p>
      </div>
    </div>
  );
}